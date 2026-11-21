import assert from 'node:assert/strict';import vm from 'node:vm';import{readFile}from'node:fs/promises';import{due,normalizeGarage,settleWorkshopOrder}from'../src/logic.js';
const data={bikes:[{id:'b',name:'Rad',km:100}],orders:[],plans:[{id:'future',bikeId:'b',title:'Zukunft',nextDate:'2099-01-01'},{id:'past',bikeId:'b',title:'Überfällig',nextDate:'2000-01-01'},{id:'km',bikeId:'b',title:'Kilometer',nextKm:150},{id:'km-past',bikeId:'b',title:'Kilometer überfällig',nextKm:99}]};
const c=vm.createContext({data,structuredClone,uid:()=>crypto.randomUUID(),document:{addEventListener(){}},bike:id=>data.bikes.find(b=>b.id===id),esc:String,status:p=>due(p,data.bikes[0],'2026-11-16'),sortedPlans:()=>data.plans,heading:t=>'<h1>'+t+'</h1>',empty:t=>t,select:()=>'',date:String,number:String,recordRoute:(_,id)=>'#plan/'+id,orderLink:o=>'#order/'+o.id});vm.runInContext(await readFile('src/service-wizards.js','utf8'),c);const run=s=>vm.runInContext(s,c);
let html=run('servicePage()');assert.match(html,/Serviceintervalle/);assert.match(html,/Zukunft/);assert.match(html,/Kilometer/);assert.doesNotMatch(html,/data-id="past"|data-id="km-past"/);assert.ok(html.indexOf('data-service-filter')<html.indexOf('class="panel"'));
run("serviceDueFilter='due'");html=run('servicePage()');assert.match(html,/data-id="past"/);assert.match(html,/data-id="km-past"/);assert.doesNotMatch(html,/data-id="future"|data-id="km"/);run("serviceBikeFilter='missing'");assert.match(run('servicePage()'),/Keine überfälligen/);
assert.match(run('serviceRow(data.plans[0])'),/Wartung planen/);
run('openServiceWizard=w=>globalThis.captured=w');run("startOrderWizard('future')");assert.equal(c.captured.order.bikeId,'b');assert.equal(c.captured.order.type,'service');assert.equal(c.captured.order.title,'');assert.equal(c.captured.order.maintenancePlanning,true);assert.equal(c.captured.step.operation,'');assert.match(run("orderWizardTitle({page:2,index:1,order:{maintenancePlanning:true}})"),/Arbeitsschritt 2 - Welches Bauteil soll gewechselt \/ gewartet werden/);
const g=normalizeGarage({bikes:[{id:'b',name:'Rad',km:100,components:[{id:'chain',category:'Antrieb',name:'Kette',installedKm:0}]}],plans:[],history:[],documents:[],orders:[{id:'o',bikeId:'b',title:'Nur prüfen',steps:[{id:'s',title:'Kette prüfen',operation:'maintenance',componentKey:'chain',done:false}],parts:[],replacementKeys:[],guideIds:[]}]});const done=settleWorkshopOrder(g,'o','complete',[],'2026-11-16','',[],100);assert.deepEqual(done.bikes[0].components,g.bikes[0].components);assert.equal(done.inventory.length,0);
console.log('PASS 1.3.2: date/km filter isolation, filter placement/empty state, renamed planning action, fixed prefill and empty title, task numbering, pure-maintenance completion preserves fitted components.');

// #129: legacy linked records, cancelled/completed maintenance and independent Service
// orders must appear in exactly one list without rewriting any stored record.
const records=[
 {id:'m',title:'Intervallwartung',maintenancePlanning:true,planId:'future',bikeId:'b',steps:[],parts:[]},
 {id:'legacy',title:'Alte Intervallwartung',planId:'deleted-plan',bikeId:'b',completedAt:'2026-01-01',steps:[],parts:[]},
 {id:'cancelled',title:'Abgebrochene Wartung',planId:'future',cancelledAt:'2026-01-01',bikeId:'b',steps:[],parts:[]},
 {id:'individual',title:'Freier Serviceauftrag',type:'service',bikeId:'b',steps:[],parts:[]},
 {id:'repair',title:'Freier Reparaturauftrag',type:'repair',externalBike:'Gastrad',steps:[],parts:[]}
];
records[0].planOccurrence=run('serviceOccurrence(data.plans[0])');data.orders=records;const snapshot=JSON.stringify(records);
const views=vm.createContext({data,bike:id=>data.bikes.find(b=>b.id===id),esc:String,date:String,recordRoute:(_,id)=>'#order/'+id,heading:(a,b,c)=>a+b+c,empty:(a,b)=>a+b,document:{querySelector:()=>null,addEventListener(){}}});
vm.runInContext(await readFile('src/orders.js','utf8'),views);
const htmlFor=expr=>vm.runInContext(expr,views);
const individual=htmlFor('ordersPage()'),maintenance=htmlFor('maintenancePage()');
for(const o of records){assert.equal(individual.includes(o.title),!o.planId&&!o.maintenancePlanning);assert.equal(maintenance.includes(o.title),!!(o.planId||o.maintenancePlanning));}
assert.equal(JSON.stringify(records),snapshot);
assert.match(htmlFor("orderDashboard('missing')"),/Auftrag nicht gefunden/);
assert.match(run('serviceRow(data.plans[0])'),/Wartung anzeigen/);
run('startOrderWizard()');assert.equal(c.captured.order.planId,'');assert.equal(c.captured.order.maintenancePlanning,false);
data.orders=[];assert.match(htmlFor('ordersPage()'),/Noch keine Aufträge/);assert.match(htmlFor('maintenancePage()'),/Noch keine Wartungen/);
console.log('PASS #129: independent Service/repair orders, legacy/cancelled/completed interval maintenance, disjoint lists, preserved records, independent creation and missing-record fallback.');
