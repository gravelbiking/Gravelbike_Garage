import assert from 'node:assert/strict';import vm from 'node:vm';import{readFile}from'node:fs/promises';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const c=vm.createContext({document:{addEventListener(){}},data:{bikes:[{id:'bike',name:'Rad'}],inventory:[]},esc,recordRoute:(kind,id)=>'#'+kind+'/'+encodeURIComponent(id),number:String,date:v=>v||'–',heading:t=>'<h1>'+t+'</h1>',empty:(a,b)=>a+b});vm.runInContext(await readFile('src/tirepark.js','utf8'),c);const run=s=>vm.runInContext(s,c);
c.t={id:'t',manufacturer:'<script>',model:'Modell',unit:'mm',dimensionLabel:'40-622',status:'stored',available:true,isNew:true,totalMileage:0,knownMileage:0,history:[],mount:null,stock:{available:true},location:'Regal'};
assert.match(run('tireCard(t)'),/tire-new/);assert.doesNotMatch(run('tireCard(t)'),/<script>/);assert.match(run('tireCard(t)'),/&lt;script&gt;/);assert.match(run('tireMileageLabel(t)'),/0 km/);c.t.totalMileage=null;assert.match(run('tireMileageLabel(t)'),/unvollständig/);
c.t.history=[{bikeId:'bike',bikeName:'Damals',position:'Vorderreifen',installedDate:'2026-01-01',installedKm:100,removedDate:'2026-02-01',removedKm:200,mileage:100}];c.t.mount={bikeId:'bike',bikeName:'Heute',position:'Hinterreifen',installedDate:'2026-03-01',installedKm:1000,currentKm:1200,mileage:200};let html=run('tireMountHistory(t)');assert.ok(html.indexOf('Heute')<html.indexOf('Damals'));for(const value of ['100 km','200 km','1000 km','1200 km','Noch montiert'])assert.ok(html.includes(value));
run('tireParkState={rows:[t],version:1,error:"",attempted:1,loading:false};tireParkFilter="mounted"');c.t.status='mounted';assert.match(run('tireParkResults()'),/Steckbrief öffnen/);run('tireParkFilter="stored"');assert.match(run('tireParkResults()'),/Keine passenden/);run('tireParkState.error="Fehler"');assert.match(run('tireParkPage()'),/Erneut versuchen/);run('tireParkState.error="";tireParkState.version=-1');assert.match(run('tireParkPage()'),/werden geladen/);
console.log('PASS 1.3.3 UI contracts: escaped optional profiles, Neu badge, unknown/zero mileage, current-first full mounting history, filter empty state, loading and retry.');

// The shared bicycle/park form exposes only the requested editable profile fields.
c.input=(name,label,value)=>`<label>${label}<input name="${name}" value="${esc(value)}"></label>`;
c.select=(name,label,options,value)=>`<label>${label}<select name="${name}">${options.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`;
c.t.type='Faltreifen';c.t.dimensionSize='700';c.t.width='45';c.t.dimensions='700 × 45';
html=run('tireProfileFields(t,{id:t.id,currentProfile:{}})');
for(const name of ['manufacturer','type','model','purpose','tubeless','dimensionLabel','initialMileage','location','partnerId','pairRole','articlePhoto','cameraPhoto'])assert.ok(html.includes('name="'+name+'"'),name);
for(const name of ['manufactureYear','tread','usageState','dimensionSize','width','diameter'])assert.ok(!html.includes('name="'+name+'"'),name);
assert.match(html,/Größenbezeichnung/);assert.match(html,/700 × 45/);
assert.doesNotMatch(run('tireDetail(t)'),/<dt>(Baujahr|Profil|Vorgeschichte)<\/dt>/);
c.f=new Map([['manufacturer','Test'],['type','Faltreifen'],['model','Modell'],['dimensionLabel','28 x 1.75'],['tubeless','no'],['initialMileage','12.5']]);
const profile=run('readTireProfile(f,t,{})');assert.equal(profile.type,'Faltreifen');assert.equal(profile.dimensionLabel,'28 x 1.75');assert.equal(profile.tubeless,false);assert.equal(profile.initialMileage,12.5);assert.ok(!('tread' in profile));assert.ok(!('manufactureYear' in profile));
console.log('PASS simplified tire profile: shared fields, single size input, distinct type/model, hidden legacy fields and safe payload.');

c.rows=[{id:'legacy',model:'Contirunner',mount:{bikeId:'b',position:'Reifen'}},{id:'known',model:'Known',mount:{bikeId:'b',position:'Hinterreifen'}}];
assert.equal(run('tirePositionKnown(rows[0])'),false);assert.equal(run('tirePositionKnown(rows[1])'),true);
const positions=run('tirePositionFields(rows,"b")');assert.equal(positions.unknown.length,1);assert.deepEqual(Array.from(positions.free),['Vorderreifen']);assert.match(positions.html,/Bitte auswählen/);assert.match(positions.html,/Contirunner/);assert.doesNotMatch(positions.html,/>Hinterreifen</);
console.log('PASS legacy tire position UI: unknown tire is visible, no default assumption and only free slots offered.');
