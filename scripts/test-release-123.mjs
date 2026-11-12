import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {componentCategories,componentMileage,normalizeGarage,normalizeStock,addStockPosition,stockMovement,quantity,stockValue,plannedOrderComponents} from '../src/logic.js';
const data=normalizeGarage({bikes:[{id:'b',name:'Testbike',type:'Privat',km:1200,components:[]}],plans:[],history:[],documents:[],computers:[{id:'gps',manufacturer:'Hersteller',model:'Modell',serial:'SERIAL',software:'SECRET-FIRMWARE',purchaseDate:'2020-01-01',price:999,infos:'PRIVATE-INFO'}]});
const context=vm.createContext({data,document:{addEventListener(){},getElementById(){return null;}},location:{hash:'#configuration'},componentCategories,componentMileage,stockValue,plannedOrderComponents,supplyUnits:['Stück'],
 esc:value=>String(value??''),uid:()=> 'id',input:(name,label)=>`<label>${label}<input name="${name}"></label>`,select:(name,label)=>`<label>${label}<select name="${name}"></select></label>`,notesInput:()=>'',
 documentPicker:()=> 'EXISTING-DOCUMENT-PICKER',receiptEditor:()=> 'INVOICE-EDITOR',directDocumentEditor:()=> 'PRODUCT-DATASHEETS',number:String,money:String,date:String,heading:title=>title,empty:()=> 'EMPTY',receiptLinks:()=> '',safeShopLink:()=>'',
 URL,console});
for(const file of ['equipment','inventory','strava'])vm.runInContext(await readFile(new URL('../src/'+file+'.js',import.meta.url),'utf8'),context);
const run=code=>vm.runInContext(code,context);
const fields=run('stockEditorFields(newStockItem())');
assert.match(fields,/Artikelname/);assert.match(fields,/PRODUCT-DATASHEETS/);
assert.doesNotMatch(fields,/Erster Bestand|BIKE24-Produktlink|INVOICE-EDITOR|EXISTING-DOCUMENT-PICKER/);
const cards=run('computersPage()');assert.match(cards,/Hersteller/);assert.match(cards,/SERIAL/);assert.match(cards,/#computer\/gps/);
assert.doesNotMatch(cards,/SECRET-FIRMWARE|PRIVATE-INFO|999|2020-01-01/);
assert.equal(run("canonicalBikeType('  CYCLOCROSS  ')"),'Cyclocross');
assert.equal(run("canonicalBikeType(' Neuer Typ ')"),'Neuer Typ');
assert.match(run('bikeTypeInput("Privat")'),/bike-types/);
assert.match(run('bikeExtraEditor({year:2019,modelYear:2020})'), /Baujahr/);
const typePicker=run('bikeTypeInput()');
assert.match(typePicker,/<select name="type"[^>]*required>/);
assert.match(typePicker,/<option value="" selected disabled>Bitte Fahrradtyp auswählen/);
assert.doesNotMatch(typePicker,/<option value="Gravelbike" selected/);
assert.match(run('bikeTypeInput("Cyclocross")'),/<option value="Cyclocross" selected>/);
context.typeValues=new Map([['type','__custom__'],['customBikeType',' Mein neuer Typ ']]);
assert.equal(run('readBikeType(typeValues)'),'Mein neuer Typ');
context.typeValues=new Map([['type','Rennrad']]);assert.equal(run('readBikeType(typeValues)'),'Rennrad');
context.typeValues=new Map([['type','']]);assert.equal(run('readBikeType(typeValues)'),'');
let onTypeChange;const typeChoice={value:'',addEventListener:(_,fn)=>onTypeChange=fn},customType={},customLabel={};
context.typeForm={elements:{namedItem:name=>name==='type'?typeChoice:customType},querySelector:()=>customLabel};
run('bindBikeType(typeForm)');assert.equal(customLabel.hidden,true);assert.equal(customType.disabled,true);
typeChoice.value='__custom__';onTypeChange();assert.equal(customLabel.hidden,false);assert.equal(customType.required,true);
typeChoice.value='Rennrad';onTypeChange();assert.equal(customLabel.hidden,true);assert.equal(customType.required,false);

assert.match(run('planMileageText(data.bikes[0])'),/1200 km/);assert.equal(run('planMileageText(null)'),'');
// Keep account-specific event handlers when the parent view is rebuilt.
const children=new Map();const panel={onclick:'stale',set innerHTML(value){this.html=value;for(const id of [1,2])if(value.includes(`data-strava-account="${id}"`))children.set(id,{isConnected:true,querySelector:()=>null});},querySelector(selector){if(selector==='[data-add-strava]')return null;if(selector==='.strava-setup-form')return null;return children.get(Number(selector.match(/\d+/)?.[0]));}};
context.panel=panel;context.status={configured:true,accounts:[{account:1,name:'Anna',connected:true,maps:{},gear:{},pending:[],worker:0},{account:2,name:'Ben',connected:true,maps:{},gear:{},pending:[],worker:0}]};
run('renderStrava(panel,status)');assert.equal(panel.onclick,null);assert.equal(children.size,2);
assert.ok(children.get(1).innerHTML.includes('Anna'));assert.ok(children.get(2).innerHTML.includes('Ben'));
console.log('PASS 1.2.3 UI: article-only form, datasheets, compact GPS cards, custom types, service mileage and separate Strava account panels.');
// Navigation/save coordination is tested separately from the DOM renderer.
const listeners=new Map(),timers=new Map();let timerId=0,reloads=0;
const modal={open:false},app={hidden:false},sync={textContent:''};let dirty=false;
const location={hash:'#inventory',reload(){reloads++;}};
const nav=vm.createContext({location,history:{replaceState(_a,_b,hash){location.hash=hash;}},window:{addEventListener(name,fn){listeners.set(name,fn);}},document:{addEventListener(){},querySelectorAll(){return dirty?[{dataset:{dirty:'true'}}]:[];}},
 $:selector=>selector==='#app'?app:selector==='#modal'?modal:selector==='#sync'?sync:null,
 sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),busy:false,confirm:()=>false,console});
const client=await readFile(new URL('../src/client.js',import.meta.url),'utf8');
vm.runInContext(client.slice(client.indexOf('let renderedHash='),client.indexOf('async function load(')),nav);
vm.runInContext('scheduleReload();scheduleReload(false);',nav);
assert.equal(timers.size,1);for(const fn of timers.values())fn();timers.clear();assert.equal(reloads,1,'A save followed by navigation must cause one reload');
vm.runInContext('reloadPending=false;',nav);dirty=true;location.hash='#parking';listeners.get('hashchange')();assert.equal(location.hash,'#inventory');assert.equal(timers.size,0,'Declining unsaved changes must retain the current view');
let blocked=false;listeners.get('beforeunload')({preventDefault(){blocked=true;}});assert.ok(blocked);
dirty=false;location.hash='#parking';listeners.get('hashchange')();assert.equal(timers.size,1);
console.log('PASS 1.2.3 reload: one full reload after save/navigation, no startup loop, declined dirty navigation retained and unload protection.');

// #82: removing the editable label must preserve the existing ledger and receipts.
const stock=normalizeStock({id:'location-test',name:'Testteil',category:'Antrieb',kind:'Original',unit:'Stück',manufacturer:'Test',articleNumber:'1',minStock:0,quantity:2,unitPrice:null,purchaseDate:'',location:'Regal A',invoices:[{fileId:'a'.repeat(32),name:'Beleg.pdf',size:100}]});
stock.positions[0].label='Alte interne Positionsbezeichnung';data.inventory=[stock];
const oldPosition=structuredClone(stock.positions[0]),oldJournal=structuredClone(stock.movements);
let modalBody,submitPosition;
Object.assign(context,{stockItem:id=>data.inventory.find(item=>item.id===id),amount:String,quantity,today:()=> '2026-11-08',
 modal:(_title,body,submit)=>{modalBody=body;submitPosition=submit;},$:()=>({}),lockEditor:()=>()=>{},readReceipts:async(_form,existing)=>existing,
 mutate:async change=>{change();return true;},closeModal(){},toast(){}});
run("editStockPosition('location-test',data.inventory[0].positions[0].id)");
assert.ok(modalBody.indexOf('name="location"')<modalBody.indexOf('name="packageType"'));
assert.equal((modalBody.match(/name="location"/g)||[]).length,1);
assert.doesNotMatch(modalBody,/Bezeichnung der Lagerposition|name="label"/);
const positionFields=new Map(Object.entries({location:'Schrank B',packageType:'Einzelbestand',packageSize:'1',unitPrice:'',purchaseDate:'',supplierId:'',supplier:'',notes:''}));
await submitPosition({get:key=>positionFields.get(key)??null});
assert.equal(data.inventory[0].positions[0].location,'Schrank B');
assert.equal(data.inventory[0].positions[0].label,oldPosition.label);
assert.equal(data.inventory[0].positions[0].quantity,oldPosition.quantity);
assert.deepEqual(data.inventory[0].positions[0].invoices,oldPosition.invoices);
assert.deepEqual(data.inventory[0].movements,oldJournal);
let card=run('stockCard(data.inventory[0])');assert.match(card,/<strong>Schrank B<\/strong>/);assert.doesNotMatch(card,/Alte interne Positionsbezeichnung/);
data.inventory[0].positions[0].location='';card=run('stockCard(data.inventory[0])');assert.match(card,/<strong>Lagerort offen<\/strong>/);assert.doesNotMatch(card,/Alte interne Positionsbezeichnung/);
console.log('PASS #82: location first and unique, no label field, display/fallback and unchanged quantities, receipts and journal.');

context.addStockPosition=addStockPosition;
run("editStockPosition('location-test')");
positionFields.set('location','架'.repeat(300));positionFields.set('count','1');
await submitPosition({get:key=>positionFields.get(key)??null});
assert.equal(data.inventory[0].positions.at(-1).label,'Lagerbestand');
assert.equal(data.inventory[0].positions.at(-1).location,'架'.repeat(300));
console.log('PASS #82: long Unicode locations do not become constrained internal position labels.');

// #83: filter only the view; the underlying positions and ledger remain intact.
const emptyPosition=addStockPosition(data.inventory[0],{label:'Leere Position',quantity:0,unitPrice:null,packageType:'Einzelbestand',packageSize:1,purchaseDate:'',location:'Leeres Regal',supplierId:'',supplier:'',notes:'',invoices:[]});
let beforeRender=JSON.stringify(data.inventory[0]);
card=run('stockCard(data.inventory[0])');
assert.match(card,/Lagerpositionen \(2\)/);assert.doesNotMatch(card,/Leeres Regal/);assert.equal(JSON.stringify(data.inventory[0]),beforeRender);
for(const position of data.inventory[0].positions)if(position.quantity>0)stockMovement(data.inventory[0],position,-position.quantity,'adjustment',{reason:'Testinventur'});
beforeRender=JSON.stringify(data.inventory[0]);card=run('stockCard(data.inventory[0])');
assert.match(card,/Lagerpositionen \(0\)/);assert.match(card,/Kein Bestand vorhanden/);assert.doesNotMatch(card,/data-action="stock-position-edit"/);assert.equal(JSON.stringify(data.inventory[0]),beforeRender);
stockMovement(data.inventory[0],emptyPosition,0.5,'adjustment',{reason:'Testkorrektur'});
card=run('stockCard(data.inventory[0])');assert.match(card,/Lagerpositionen \(1\)/);assert.match(card,/<strong>Leeres Regal<\/strong>/);
assert.equal(data.inventory[0].positions.length,3);assert.equal(data.inventory[0].positions[0].invoices[0].name,'Beleg.pdf');
console.log('PASS #83: mixed/empty positions, visible counts, fractional restock and preserved receipts, positions and ledger.');

assert.match(run('inventoryPage()'),/1 Lagerpositionen/);
