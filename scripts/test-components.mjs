import assert from 'node:assert/strict';
import {componentCategories,componentCategory,componentMileage,installationKm,validISODate,hasPurchaseFields,upsertComponent,knownComponentCategory} from '../src/logic.js';

const bike={id:'gravel',km:3210.5,kmDate:'2026-11-01',readings:[{date:'2026-09-01',km:1000},{date:'2026-10-01',km:2000}]};
assert.equal(componentMileage({installedDate:'2026-09-01',installedKm:1000},bike).km,2210.5);
assert.equal(componentMileage({installedDate:'2026-09-01'},bike).km,2210.5);
assert.equal(componentMileage({installedKm:0},bike).km,3210.5);
assert.equal(componentMileage({installedKm:3210.5},bike).km,0);
assert.equal(componentMileage({installedDate:'2020-01-01'},bike).km,null,'Do not invent mileage from elapsed time');
assert.equal(componentMileage({installedKm:5000},bike).reason,'odometer','Flag a corrected/reset odometer');
assert.equal(installationKm(bike,'2026-09-15'),null,'Do not interpolate without recorded mileage');
assert.equal(installationKm(bike,'2026-11-01'),3210.5);
assert.equal(installationKm(bike,'2026-09-01',[{bikeId:'other',date:'2026-09-01',km:4000}]),1000);
assert.equal(installationKm(bike,'2026-09-01',[{bikeId:'gravel',date:'2026-09-01',km:1200}]),null,'Ask for the installation reading when same-day readings differ');
assert.equal(installationKm(bike,'2026-09-01',[{bikeId:'gravel',date:'2026-09-01',km:1000}]),1000);
assert.equal(componentMileage({installedKm:950,installedDate:'2026-09-01'},bike).baseline,950,'An explicit reading takes precedence');
assert.equal(validISODate('2026-02-30'),false);
assert.equal(validISODate('2028-02-29'),true);
for(const [category,names] of Object.entries(componentCategories()))for(const name of names)assert.equal(componentCategory({name}),category);
assert.equal(componentCategory({name:'Schalt-/ Bremshebel'}),'Bremsen');
assert.equal(componentCategory({name:'Bremsbeläge'}),'Bremsen');
assert.equal(componentCategory({name:'Kette'}),'Antrieb','Legacy parts still display in the appropriate category');
assert.equal(componentCategory({name:'Rahmen'}),'Zubehör');
assert.equal(componentCategory({name:'Freie Bezeichnung',category:'Cockpit'}),'Cockpit');
assert.equal(componentCategory({name:'Eigenteil',category:'toString'}),'Zubehör');
console.log('PASS: component categories, legacy parts, installation mileage, zero/decimal mileage, ambiguous readings, odometer reset and leap dates.');

assert.deepEqual(componentCategories().Räder,['Vorderrad','Hinterrad']);
assert.deepEqual(componentCategories().Cockpit,['Vorbau','Lenker']);
assert.deepEqual(componentCategories().Sattel,['Sattel','Sattelstütze']);
assert.deepEqual(componentCategories().Licht,['Vorderlicht','Rücklicht']);
for(const [name,category] of [['Laufrad','Räder'],['Scheinwerfer','Licht'],['Dynamo','Licht'],['Lenkerband','Cockpit']])assert.equal(componentCategory({name}),category);
console.log('PASS: front/rear wheels, requested cockpit/saddle/light types and legacy category compatibility.');

for(const name of ['Bremsscheibe','Bremsklotz','Kette','Kassette','Kurbel','Zahnkranz','Innenlager','Bremsbelag','Bremsscheibe vorne'])assert.equal(hasPurchaseFields({name}),true,name);
for(const name of ['Vorderrad','Lenker','Kettenblatt unbekannt',''])assert.equal(hasPurchaseFields({name}),false,name);
assert.equal(componentCategory({name:'Zahnkranz'}),'Antrieb');
assert.equal(componentCategory({name:'Kurbel'}),'Antrieb');
console.log('PASS: purchase details for requested replacement parts and drivetrain classification.');

const originalParts=[{id:'chain',name:'Kette',originalPartNumber:'0001',price:34.95},{id:'pads',name:'Bremsklotz',price:19.99}];
const changed=upsertComponent(originalParts,{id:'chain',name:'Kette',price:32.95});
assert.equal(changed.length,2);
assert.equal(changed[0].originalPartNumber,'0001');
assert.deepEqual(changed[1],originalParts[1]);
assert.equal(originalParts[0].price,34.95);
const added=upsertComponent(changed,{id:'cassette',name:'Kassette'});
assert.equal(upsertComponent(added,{id:'cassette',name:'Kassette',price:59.99}).length,3,'Repeated partial saves must not duplicate a part');
const legacy=upsertComponent([{name:'Kette',serial:'legacy'}],{id:'new-id',name:'Kette',price:0},'0');
assert.equal(legacy.length,1);
assert.equal(legacy[0].serial,'legacy');
assert.equal(upsertComponent(originalParts,{id:'new-part',name:'Kurbel'},'0').length,3,'A new part must not replace an unrelated saved part');
console.log('PASS: partial component saves preserve other parts, legacy fields, zero prices and prevent duplicates.');

assert.equal(knownComponentCategory(' Kette '),'Antrieb');
assert.equal(knownComponentCategory('ZAHNKRANZ'),'Antrieb');
assert.equal(knownComponentCategory('Freie Bezeichnung'),null);

// Inventory mutations are prepared together; rejected consumption cannot partially debit stock.
const {quantity,purchaseNeeds,consumeSupplies,receivePurchase}=await import('../src/logic.js');
const supplies={inventory:[{id:'oil',name:'Kettenöl',quantity:0.5,minStock:0.5,unit:'Liter',unitPrice:20}],shopping:[{id:'oil-plan',name:'Kettenöl',source:'stock',inventoryId:'oil',status:'purchased',quantity:0.2,usedQuantity:0,unit:'Liter',unitPrice:20}]};
assert.equal(purchaseNeeds(supplies).length,1,'Inclusive minimum-stock threshold');
assert.equal(quantity(0.1+0.2),0.3);
assert.throws(()=>quantity(-1));assert.throws(()=>quantity(0.0001));assert.throws(()=>quantity(Infinity));
const consumed=consumeSupplies(supplies,[{shoppingId:'oil-plan',quantity:0.1}]);
assert.equal(consumed.inventory[0].quantity,0.4);assert.equal(consumed.shopping[0].usedQuantity,0.1);assert.equal(consumed.materials[0].name,'Kettenöl');assert.equal(supplies.inventory[0].quantity,0.5);
assert.throws(()=>consumeSupplies(supplies,[{shoppingId:'oil-plan',quantity:0.6}]));
assert.throws(()=>consumeSupplies(supplies,[{shoppingId:'oil-plan',quantity:0.2},{inventoryId:'oil',quantity:0.4}]),/Bestand/);
assert.equal(supplies.inventory[0].quantity,0.5,'Failure leaves the input garage untouched');
assert.throws(()=>consumeSupplies(supplies,[{inventoryId:'oil',quantity:0.1},{inventoryId:'oil',quantity:0.1}]),/mehrfach/);
const bought={...supplies,shopping:[{id:'new-oil',name:'Kettenöl',source:'online',inventoryId:'oil',status:'purchased',quantity:1,usedQuantity:0.1,unit:'Liter'}]};
assert.equal(purchaseNeeds(bought).length,0,'Do not ask to buy stock already on the purchase list');
const direct=consumeSupplies(bought,[{shoppingId:'new-oil',quantity:0.1}]);assert.equal(direct.inventory[0].quantity,0.5,'Unstocked purchased parts do not debit inventory');
const received=receivePurchase(bought,'new-oil','oil','2026-11-01');assert.equal(received.inventory[0].quantity,1.4,'Only the unconsumed purchase quantity is received');
assert.throws(()=>receivePurchase(received,'new-oil','oil','2026-11-01'));
assert.equal(consumeSupplies(received,[{shoppingId:'new-oil',quantity:0.2}]).inventory[0].quantity,1.2);
assert.throws(()=>receivePurchase({...bought,inventory:[{...bought.inventory[0],unit:'Stück'}]},'new-oil','oil','2026-11-01'),/Einheit/);
const unbought={...bought,shopping:[{...bought.shopping[0],status:'needed'}]};
assert.throws(()=>consumeSupplies(unbought,[{shoppingId:'new-oil',quantity:0.1}]),/noch nicht gekauft/);
assert.equal(purchaseNeeds(unbought).length,1,'Restock and linked shopping do not duplicate the same demand');
console.log('PASS: fractional stock, inclusive minimums, aggregate consumption, atomic failure, planned/purchased materials, receiving once, units and shopping deduplication.');

await import('./test-inventory.mjs');
