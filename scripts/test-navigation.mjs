import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const metadata=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const nodes=new Map(['#main','#nav','#crumb','#requestError'].map(id=>[id,{innerHTML:'',textContent:'',removeAttribute(){}}]));
const handlers=new Map();
let updates=0;
const location={hash:'#info'};
const context=vm.createContext({
 location,data:{bikes:[],preferences:{}},username:'Test',
 $:id=>nodes.get(id),esc:v=>String(v??'').replaceAll('<','&lt;'),
 heading:(title,subtitle)=>`<h1>${title}</h1><p>${subtitle}</p>`,
 document:{activeElement:null,documentElement:{dataset:{}},addEventListener:(name,fn)=>handlers.set(name,fn)},
 notify(){},updatePanel:()=>'<div id="updatePanel"></div>',refreshUpdates(){updates++;},
 dashboard(){},bikesPage(){},archivePage(){},servicePage(){},historyPage(){},computersPage(){},inventoryPage(){},
 maintenancePage(){},toolsPage(){},documentsPage(){},addressBook(){},refreshStrava(){},refreshSecurityStatus(){},refreshSystemStatus(){}
});
for(const file of ['navigation','administration']){
 let source=await readFile(new URL('../src/'+file+'.js',import.meta.url),'utf8');
 source=source.replace('/*APP_RELEASE*/{}',JSON.stringify({version:metadata.version,name:metadata.releaseName,development:true}));
 vm.runInContext(source,context);
}
const run=code=>vm.runInContext(code,context);
run('renderPage()');
assert.ok(nodes.get('#main').innerHTML.includes(metadata.version));
assert.ok(nodes.get('#main').innerHTML.includes(metadata.releaseName));
assert.match(nodes.get('#nav').innerHTML,/class="module-label"[^>]*>[\s\S]*Meine Fahrräder/);
assert.match(nodes.get('#nav').innerHTML,/href="#bikes"[^>]*class="module-link/);
assert.match(nodes.get('#nav').innerHTML,/href="#info" aria-current="page"/);
assert.doesNotMatch(nodes.get('#nav').innerHTML,/href="#updates"/);
assert.equal(updates,0,'Opening Info must not start an update check');
for(const tab of ['releases','manual','update','unknown']){
 location.hash='#info/'+tab;run('renderPage()');
 assert.match(nodes.get('#main').innerHTML,new RegExp('id="info-tab-'+(tab==='unknown'?'info':tab)+'"[^>]*aria-selected="true"'));
}
assert.equal(updates,1);
location.hash='#updates';run('renderPage()');
assert.equal(updates,2,'Old update bookmark must continue to work');
assert.equal(nodes.get('#crumb').textContent,'Verwaltung / Info');
assert.match(nodes.get('#main').innerHTML,/id="updatePanel"/);
const manual=run('garageManual()');
assert.match(manual,/Schnellstart: Dein erstes Fahrrad/);
assert.match(manual,/Fahrrad hinzufügen/);
assert.match(manual,/Bauteil speichern/);
for(const section of ['quickstart','bikes','mileage','service','orders','stock','documents','contacts','equipment','settings'])assert.match(manual,new RegExp('id="manual-'+section+'"'));
let prevented=false;
handlers.get('keydown')({key:'ArrowLeft',target:{closest:()=>({id:'info-tab-info'})},preventDefault(){prevented=true;}});
assert.equal(location.hash,'info/update');
assert.ok(prevented);
handlers.get('keydown')({key:'Home',target:{closest:()=>({id:'info-tab-update'})},preventDefault(){}});
assert.equal(location.hash,'info/info');
console.log('PASS: Info routes, legacy update bookmark, update isolation, manual navigation and keyboard tabs.');

context.passwordStatus={daysRemaining:31};
assert.doesNotMatch(run('passwordExpiryNotice()'),/role="alert"/);
context.passwordStatus={daysRemaining:30};
assert.match(run('passwordExpiryNotice()'),/role="alert"/);
assert.match(run('passwordExpiryNotice()'),/30 Tagen/);
context.passwordStatus={daysRemaining:0};
assert.match(run('passwordExpiryNotice()'),/0 Tagen/);
context.passwordStatus={daysRemaining:null};
assert.doesNotMatch(run('passwordExpiryNotice()'),/role="alert"/);
console.log('PASS: password warning at 30-day boundary and expiry; no warning for unknown age.');

assert.match(run('whatsNewNotice()'),/Neues in dieser Version!/);
const currentNotes=run('releaseNotes(true)');
assert.ok(currentNotes.includes(metadata.version));assert.ok(currentNotes.includes(metadata.releaseName));assert.doesNotMatch(currentNotes,/Für diese Version sind noch keine Neuerungen hinterlegt/);
assert.doesNotMatch(currentNotes,/1\.2\.2\.a/);
assert.equal((run('releaseNotes()').match(/<h2>1\.2\.4/g)||[]).length,1);
console.log('PASS: dashboard release notice, current-version-only notes, matching metadata and no duplicate current release.');
