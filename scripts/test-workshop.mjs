import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {normalizeGarage,quantity,plannedOrderComponents,completeWorkshopOrder,settleWorkshopOrder,componentCategories} from '../src/logic.js';

const id='1'.repeat(32);
const documentRecord={id:'manual',fileId:id,name:'nexus.pdf',size:4096,title:'Nexus',category:'Technik'};
const file={fileId:id,name:'nexus.pdf',size:4096};
const garage=normalizeGarage({
 bikes:[{id:'my-bike',name:'Gravelbike'}],plans:[{id:'plan',title:'Nabe warten',bikeId:'my-bike',guideIds:['guide'],attachments:[]}],
 history:[],documents:[],unassignedDocuments:[documentRecord],guides:[{id:'guide',title:'Kette prüfen',documents:[documentRecord]},{id:'guide-2',title:'Kette wechseln',documents:[]}],
 inventory:[],orders:[],shopping:[],contacts:[]
});
garage.inventory=[{id:'chain',name:'Kette',unit:'Stück',quantity:1,positions:[{id:'a',quantity:1,location:'Regal A',invoices:[]}]}];
let nextId=0;
let editor;
const events=new Map(),location={hash:''};
const field={value:'',closest:()=>({}),addEventListener(){}};
const context=vm.createContext({
 data:garage,location,quantity,FormData,plannedOrderComponents,completeWorkshopOrder,settleWorkshopOrder,componentCategories,structuredClone,
 esc:v=>String(v??''),number:String,date:v=>v||'–',bike:id=>garage.bikes.find(b=>b.id===id),
 uid:()=>String(++nextId),activeBikes:()=>garage.bikes,
 heading:title=>title,input:(_name,label)=>label,select:(_name,label)=>label,empty:title=>title,
 modal:(_title,html,submit)=>{editor={html,submit};},closeModal(){},toast(){},
 $:()=>({elements:{bikeId:field,externalBike:field,type:field}}),
 mutate:async fn=>{fn();return true;},
 upload:()=>{throw Error('Verknüpfen darf die Datei nicht erneut hochladen.');},
 document:{addEventListener:(name,fn)=>{const previous=events.get(name);events.set(name,async e=>{if(previous)await previous(e);await fn(e);});},querySelector:()=>null,querySelectorAll:()=>[]}
});
for(const name of ['supplies','inventory','documents','orders']){
 const source=await readFile(new URL('../src/'+name+'.js',import.meta.url),'utf8');
 vm.runInContext(source,context);
}
const run=code=>vm.runInContext(code,context);
const form=(values)=>{
 const f=new FormData();
 for(const [key,value] of Object.entries(values))for(const item of [].concat(value))f.append(key,item);
 return f;
};
context.selection=form({existingDocument:[id,id]});
const links=await run('readReceipts(selection)');
assert.equal(links.length,1);
assert.equal(links[0].fileId,id);
assert.match(run('documentPicker(data.unassignedDocuments)'),/disabled[\s\S]*Bereits verknüpft/);
assert.match(run('documentPicker()'),/Nach Dokumentname suchen/);
garage.plans[0].attachments=links;
garage.inventory[0].invoices=[file];
assert.match(run('documentResults()'),/#plan\/plan/);
assert.match(run('documentResults()'),/#stock\/chain/);
context.unlink=form({removeInvoice:id});
garage.plans[0].attachments=await run('readReceipts(unlink,data.plans[0].attachments)');
assert.equal(garage.plans[0].attachments.length,0);
assert.equal(garage.inventory[0].invoices[0].fileId,id);
assert.equal(garage.unassignedDocuments[0].fileId,id);

const order={
 id:'work-order',type:'repair',bikeId:'',externalBike:'Freundesrad',title:'Reparatur',description:'Älterer Auftrag',
 steps:[{id:'work-a',title:'Kette prüfen',done:false,guideIds:['guide']},
  {id:'work-b',title:'Kette wechseln',done:false,guideIds:[]}],
 parts:[{id:'part-a',stepId:'work-a',inventoryId:'chain',positionId:'a',name:'Kette',unit:'Stück',quantity:1,available:true},
  {id:'part-b',stepId:'work-b',inventoryId:'chain',positionId:'a',name:'Kette',unit:'Stück',quantity:1,available:true}],
 replacementKeys:[]
};
garage.orders.push(order);
garage.inventory[0]={...garage.inventory[0],manufacturer:'Shimano',articleNumber:'CN-01',quantity:4,movements:[],
 positions:[{id:'a',quantity:4,location:'Regal A',label:'A',invoices:[]}]};
assert.match(run('orderDashboard("work-order")'),/Shimano Kette[\s\S]*CN-01[\s\S]*Regal A/);
assert.match(run('orderDashboard("work-order")'),/data-document-preview="nexus.pdf"/);
assert.doesNotMatch(run('orderDashboard("work-order")'),/Fahrrad öffnen/);
const paused=settleWorkshopOrder(garage,order.id,'pause',['part-b'],'2026-11-06','Teil fehlt');
assert.equal(paused.inventory[0].quantity,3);
assert.equal(paused.orders[0].parts[1].available,false);
assert.equal(paused.inventory[0].movements[0].orderPartId,'part-a');
assert.throws(()=>settleWorkshopOrder(paused,order.id,'pause',[],'2026-11-06',''));
const resumed=settleWorkshopOrder(paused,order.id,'resume',[],'2026-11-06','');
resumed.orders[0].parts[1].available=true;
const finished=settleWorkshopOrder(resumed,order.id,'complete',[],'2026-11-06','');
assert.equal(finished.inventory[0].quantity,2);
assert.equal(finished.inventory[0].movements.length,2);
assert.throws(()=>settleWorkshopOrder(finished,order.id,'complete',[],'2026-11-06',''));
const cancelled=settleWorkshopOrder(garage,order.id,'cancel',['part-b'],'2026-11-06','Auftrag entfällt');
assert.equal(cancelled.inventory[0].quantity,3);
assert.equal(cancelled.inventory[0].movements[0].orderPartId,'part-b');
assert.throws(()=>settleWorkshopOrder(cancelled,order.id,'resume',[],'2026-11-06',''));
assert.equal(garage.inventory[0].quantity,4);
garage.inventory[0].positions[0].quantity=1;
assert.throws(()=>settleWorkshopOrder(garage,order.id,'complete',[],'2026-11-06',''),/verfügbare Menge/);
assert.equal(garage.inventory[0].positions[0].quantity,1);
console.log('PASS: document links, workshop rendering, pause/resume, completion, cancellation, and atomic insufficient-stock rejection.');

// A replacement is a new physical component; do not copy old serial/specification data.
const replacementGarage=normalizeGarage({bikes:[{id:'replacement-bike',name:'Test',km:2400,components:[{id:'old-chain',name:'Kette',category:'Antrieb',manufacturer:'Old',model:'Old model',serial:'OLD',installedKm:400,installedDate:'2026-01-01'}]}],history:[],inventory:[{id:'replacement-chain',name:'CN-M8100',manufacturer:'Shimano',articleNumber:'ICNM8100126Q',unit:'Stück',quantity:2,unitPrice:30}],orders:[{id:'replacement-order',bikeId:'replacement-bike',title:'Kette wechseln',replacementKeys:['old-chain'],steps:[],parts:[{id:'new-chain',inventoryId:'replacement-chain',name:'CN-M8100',quantity:1,unit:'Stück',available:true}]}]});
const replace=(g,choices=[{partId:'new-chain',replacedKey:'old-chain'}])=>settleWorkshopOrder(g,'replacement-order','complete',[],'2026-11-08','',['old-chain'],2500,{},choices);
const replaced=replace(replacementGarage),newChain=replaced.bikes[0].components[0];
assert.equal(newChain.manufacturer,'Shimano');assert.equal(newChain.model,'CN-M8100');assert.equal(newChain.serial,'');assert.equal(newChain.installedKm,2500);assert.equal(newChain.installedDate,'2026-11-08');
assert.equal(newChain.originalPartNumber,'ICNM8100126Q');assert.equal(replaced.bikes[0].componentArchive[0].mileage,2100);assert.equal(replaced.inventory[0].quantity,1);
assert.deepEqual(replaced.orders[0].installations[0].component,newChain);
assert.equal(replacementGarage.bikes[0].components[0].id,'old-chain');
assert.throws(()=>replace(replacementGarage,[{partId:'missing',replacedKey:'old-chain'}]));
assert.throws(()=>replace(replacementGarage,[{partId:'new-chain',replacedKey:'missing'}]));
assert.throws(()=>replace(replacementGarage,[{partId:'new-chain',replacedKey:'old-chain'},{partId:'new-chain',replacedKey:'old-chain'}]));
assert.throws(()=>replace(replaced));
assert.equal(replace(replacementGarage,[]).bikes[0].components.length,0,'Unassigned consumables must not become components');
console.log('PASS: replacement component, immutable installation snapshot, dated mileage, stock debit, old component archive, invalid mappings and duplicate completion.');
