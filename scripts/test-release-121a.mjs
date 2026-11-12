import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {completeWorkshopOrder,plannedOrderComponents,componentCategory,componentCategories,stockValue} from '../src/logic.js';
const b={id:'b',km:2500,components:[{id:'chain',name:'Kette',manufacturer:'Shimano',installedKm:1000,installedDate:'2026-01-01'},{name:'Vorderrad',category:'Räder'}]};
const g={bikes:[b],history:[],orders:[{id:'o',bikeId:'b',componentCategories:['Antrieb'],replacementKeys:['chain']}]};
assert.equal(plannedOrderComponents(b,['Antrieb']).length,1);
assert.equal(plannedOrderComponents(b,['Antrieb','Räder']).length,2);
assert.equal(plannedOrderComponents(b,['none']).length,2);
const completed=completeWorkshopOrder(g,'o',['chain'],'2026-11-05',2700);
assert.equal(g.bikes[0].components.length,2);
assert.equal(completed.bikes[0].components.length,1);
assert.equal(completed.bikes[0].componentArchive[0].mileage,1700);
completed.bikes[0].km=9000;
assert.equal(completed.bikes[0].componentArchive[0].mileage,1700);
assert.throws(()=>completeWorkshopOrder(completed,'o',[],'2026-11-05',9000));
assert.throws(()=>completeWorkshopOrder(g,'o',['legacy:1'],'2026-11-05',2700));
assert.throws(()=>completeWorkshopOrder(g,'o',['chain'],'2026-11-05',2400));
const legacy=structuredClone(g);legacy.orders[0].componentCategories=['none'];legacy.orders[0].replacementKeys=['legacy:1'];
assert.equal(completeWorkshopOrder(legacy,'o',['legacy:1'],'2026-11-05',2500).bikes[0].componentArchive[0].mileage,null);
const context=vm.createContext({
 data:{inventory:[{id:'a',name:'Kette',category:'Antrieb',manufacturer:'Shimano',articleNumber:'CN-1',quantity:2,unit:'Stück',minStock:1,positions:[{quantity:2,location:'Regal A'}]},{id:'b',name:'Belag',category:'Bremsen',manufacturer:'SRAM',articleNumber:'PAD-1',quantity:0,unit:'Paar',minStock:1,positions:[]}]},
 document:{addEventListener(){},getElementById(){}},esc:v=>String(v??''),number:String,stockValue,
 input:(name,label)=>`<label>${label}<input name="${name}"></label>`,select:(name,label)=>`<select name="${name}">${label}</select>`,componentCategory,componentCategories,
 FormData,URL,upload:async()=>({id:'new-image',type:'image/png'})
});
vm.runInContext(await readFile(new URL('../src/inventory.js',import.meta.url),'utf8'),context);
const run=code=>vm.runInContext(code,context);
assert.match(run('inventoryResults()'),/Hersteller/);assert.match(run('inventoryResults()'),/CN-1/);
run("inventoryCategory='Bremsen'");assert.doesNotMatch(run('inventoryResults()'),/CN-1/);
run("inventoryCategory='all';inventoryColumns.manufacturer='shim';inventoryColumns.quantity='>= 2'");assert.match(run('inventoryResults()'),/CN-1/);assert.doesNotMatch(run('inventoryResults()'),/PAD-1/);
run("inventoryColumns.quantity='> 2'");assert.match(run('inventoryResults()'),/Keine Lagerartikel/);
assert.match(run('inventoryCategoryButtons()'),/Alle Kategorien/);
vm.runInContext(await readFile(new URL('../src/equipment.js',import.meta.url),'utf8'),context);
assert.doesNotMatch(run('bikeExtraEditor({})'),/insuranceDocumentId/);
assert.match(run('bikeExtraEditor({})'),/name="leasingPurchased"/);
assert.doesNotMatch(run("extraComponentEditor({name:'Kette'})"),/Werkzeug/);
const form={dataset:{photoMode:'keep'},elements:{photo:{files:[]},bikeCameraPhoto:{files:[]}}};context.form=form;
assert.equal(await run("readBikePhoto(form,'old-image')"),'old-image');
form.dataset.photoMode='remove';assert.equal(await run("readBikePhoto(form,'old-image')"),null);
form.elements.photo.files=[{size:100}];assert.equal(await run("readBikePhoto(form,'old-image')"),'new-image');
form.elements.bikeCameraPhoto.files=[{size:100}];await assert.rejects(run("readBikePhoto(form,'old-image')"));
console.log('PASS: category/column filters, planned and frozen component lifecycle, legacy/unknown mileage, simplified editor fields and single-photo replacement.');
