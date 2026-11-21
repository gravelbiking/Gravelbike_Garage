import assert from 'node:assert/strict';import vm from 'node:vm';import{readFile}from'node:fs/promises';
const data={orders:[],bikes:[{id:'b',name:'Rad'}]};const c=vm.createContext({data,document:{addEventListener(){}},bike:id=>data.bikes.find(b=>b.id===id),esc:String,status:()=>({status:'ok'}),date:String,number:String,recordRoute:(_,id)=>'#plan/'+id,orderLink:o=>'#order/'+o.id});
vm.runInContext(await readFile('src/service-wizards.js','utf8'),c);const run=x=>vm.runInContext(x,c);
c.plan={id:'p',bikeId:'b',title:'Kette',nextDate:'2026-12-01',nextKm:null,performer:'self'};
assert.equal(run('plannedWorkshop(plan)'),undefined);
assert.match(run('serviceRow(plan)'),/Wartung planen/);assert.doesNotMatch(run('serviceRow(plan)'),/Erledigen|Material planen/);
data.orders.push({id:'old',planId:'p',planOccurrence:'["p","2025-12-01",null]',completedAt:'2025-12-01'});assert.equal(run('plannedWorkshop(plan)'),undefined);
data.orders.push({id:'new',planId:'p',planOccurrence:run('serviceOccurrence(plan)')});assert.equal(run('plannedWorkshop(plan).id'),'new');assert.doesNotMatch(run('serviceRow(plan)'),/Wartung planen/);assert.match(run('serviceRow(plan)'),/Wartung geplant: Ja/);
data.orders[1].cancelledAt='2026-11-10';assert.match(run('serviceRow(plan)'),/Wartung planen/);
console.log('PASS 1.2.4: occurrence-specific planning, previous/completed/cancelled jobs, visible status and streamlined actions.');

// Issue #95: a single task spans category, spare-part and quantity screens.
for(const page of [2,3,4]){
 assert.equal(run(`orderWizardTitle({page:${page},index:0,step:{title:'Bremsbelag wechseln'}})`),'Arbeitsschritt 1'+(page===2?' - Welches Bauteil soll raus?':page===3?' - Welches Bauteil soll rein?':''));
 assert.equal(run(`orderWizardTitle({page:${page},index:1,step:{title:'Kette wechseln'}})`),'Arbeitsschritt 2'+(page===2?' - Welches Bauteil soll raus?':page===3?' - Welches Bauteil soll rein?':''));
}
for(const page of [0,1,5,6,7,8,10,11,12])assert.doesNotMatch(run(`orderWizardTitle({page:${page},index:0,step:{title:'Bremsbelag wechseln'}})`),/Schritt \d/);
console.log('PASS #95: task numbering remains stable across screens; global and article screens have no page-step numbering.');
