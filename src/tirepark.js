// Individual tire profiles share the existing mounted components and warehouse journal.
let tireParkEnabled=true,tireParkState={rows:[],version:-1,loading:false,error:'',attempted:-1},tireParkFilter='all',tireParkSearch='';
const tireLabel=t=>[t.manufacturer,t.type,t.model].filter(Boolean).join(' · ')||'Reifen '+t.id.slice(-6);
const tireKm=value=>value===null||value===undefined?'Unbekannt':number(value)+' km';
const tireRole=role=>({front:'Vorderreifen',rear:'Hinterreifen'}[role]||'');
function tireMileageLabel(t){return t.totalMileage===null?tireKm(t.knownMileage)+' dokumentiert · Vorgeschichte unvollständig':tireKm(t.totalMileage);}
let tireParkRefreshPromise=null;
function refreshTirePark(force=false){
 if(!tireParkEnabled)return Promise.resolve(false);
 if(tireParkRefreshPromise)return tireParkRefreshPromise;
 if(!force&&tireParkState.attempted===version)return Promise.resolve(!tireParkState.error);
 tireParkState.loading=true;tireParkState.attempted=version;tireParkState.error='';
 tireParkRefreshPromise=(async()=>{
  try{const result=await api('tirepark');if(!Array.isArray(result.tires))throw Error('Ungültige Reifenübersicht.');tireParkState.rows=result.tires;tireParkState.version=result.version;tireParkState.attempted=result.version;if(result.version!==version)await load();return true;}
  catch(e){garageRuntime.log(e,'tirepark');tireParkState.error=e.message;return false;}
  finally{tireParkState.loading=false;tireParkRefreshPromise=null;if(['tirepark','tire','bike'].includes(location.hash.slice(1).split('/')[0]))render();}
 })();return tireParkRefreshPromise;
}
function tireParkPage(id){
 if(!tireParkEnabled)return heading('Reifenpark','Dieser Bereich ist für diese Instanz deaktiviert.');
 const body=tireParkState.error?`<div class="notice" role="alert">${esc(tireParkState.error)} <button class="secondary" data-action="tire-retry">Erneut versuchen</button></div>`:tireParkState.version<0?'<div class="panel" role="status">Reifen werden geladen …</div>':id?tireDetail(tireParkState.rows.find(t=>encodeURIComponent(t.id)===id)):tireParkResults();
 return (id?'<a class="back" href="#tirepark">← Reifenpark</a>':'')+heading(id?'Reifen-Steckbrief':'Reifenpark','Alle deine Reifen. Eine Geschichte für jedes Exemplar.',id?'':'<button class="primary" data-action="tire-new">＋ Reifen anlegen</button>')+(!id?`<div class="filters tire-filters">${[['all','Alle'],['mounted','Montiert'],['stored','Eingelagert']].map(([key,label])=>`<button class="chip ${tireParkFilter===key?'active':''}" aria-pressed="${tireParkFilter===key}" data-action="tire-filter" data-id="${key}">${label}</button>`).join('')}<input type="search" id="tire-search" class="search" aria-label="Reifen suchen" placeholder="Hersteller, Modell oder Dimension suchen" value="${esc(tireParkSearch)}"></div>`:'')+'<div id="tire-results">'+body+'</div>';
}
function tireParkResults(){
 const q=tireParkSearch.trim().toLocaleLowerCase('de');const rows=tireParkState.rows.filter(t=>(tireParkFilter==='all'||t.status===tireParkFilter)&&[t.manufacturer,t.type,t.model,tireDimensions(t),t.width,t.diameter,t.mount?.bikeName,t.location].join(' ').toLocaleLowerCase('de').includes(q));
 const unassigned=tireParkFilter==='mounted'?'':data.inventory.filter(s=>s.category==='Reifen'&&s.unit==='Stück'&&[s.manufacturer,s.name].join(' ').toLocaleLowerCase('de').includes(q)).flatMap(s=>s.positions.filter(p=>p.quantity>=1&&!p.tire).map(p=>`<div class="notice"><strong>${esc(s.manufacturer+' · '+s.name)}</strong> · ${amount(p.quantity)} Stück ohne Einzelzuordnung · ${esc(p.location||'Lagerort offen')} <button class="secondary" data-action="tire-adopt" data-id="${esc(s.id)}" data-position-id="${esc(p.id)}">Einzelreifen aus Bestand erfassen</button><p class="help">Die vorhandene Menge wird umgebucht, nicht verdoppelt. Vorgeschichte zunächst unbekannt.</p></div>`)).join('');
 return unassigned+(rows.length?'<div class="tire-grid">'+rows.map(tireCard).join('')+'</div>':empty(tireParkState.rows.length?'Keine passenden Reifen.':'Dein Reifenpark startet hier.',tireParkState.rows.length?'Passe Filter oder Suche an.':'Lege einen Reifen an. Bereits verbaute und einzeln eingelagerte Reifen werden automatisch angezeigt.'));
}
function tireCard(t){return `<a class="panel tire-card" href="${recordRoute('tire',t.id)}">${t.photo?`<img class="tire-photo" width="480" height="280" src="/api/files/${esc(t.photo)}" alt="${esc(tireLabel(t))}" loading="lazy">`:'<div class="tire-placeholder" aria-hidden="true">◉</div>'}<div class="section-title"><span class="badge">${t.status==='mounted'?'Montiert':t.status==='stored'?'Eingelagert':'Archiviert / nicht verfügbar'}</span>${t.isNew?'<span class="badge tire-new">Neu</span>':''}</div><h2>${esc(tireLabel(t))}</h2><p>${esc(tireDimensions(t)||'Dimensionen nicht angegeben')}</p><strong>${esc(tireMileageLabel(t))}</strong><p>${esc(t.mount?t.mount.bikeName+' · '+t.mount.position:t.location||'Lagerort nicht angegeben')}</p>${t.pairId?`<small>Reifenpaar · ${esc(tireRole(t.pairRole))}</small>`:''}<span class="tire-open">Steckbrief öffnen ↗</span></a>`;}
function tireMountHistory(t){
 const periods=[...(t.mount?[{...t.mount,current:true}]:[]),...t.history.slice().reverse()];
 return periods.length?`<ol class="tire-timeline">${periods.map(h=>`<li><h3>${data.bikes.some(b=>b.id===h.bikeId)?`<a href="${recordRoute('bike',h.bikeId)}">${esc(h.bikeName)}</a>`:esc(h.bikeName)} ${h.current?'<span class="badge">Noch montiert</span>':''}</h3><p>${esc(h.position||'Position nicht dokumentiert')}</p><dl class="tire-facts"><div><dt>Angebaut am</dt><dd>${date(h.installedDate)} · ${tireKm(h.installedKm)}</dd></div><div><dt>${h.current?'Aktueller Stand':'Abgebaut am'}</dt><dd>${h.current?tireKm(h.currentKm):date(h.removedDate)+' · '+tireKm(h.removedKm)}</dd></div><div><dt>In dieser Montage gefahren</dt><dd>${tireKm(h.mileage)}</dd></div></dl></li>`).join('')}</ol>`:'<p class="help">Noch keine Montage dokumentiert. Eine unbekannte Vorgeschichte bleibt als unbekannt gekennzeichnet.</p>';
}
function tireDetail(t){
 if(!t)return empty('Reifen nicht gefunden.','Öffne einen vorhandenen Reifen im Reifenpark.');
 const partner=t.pairId?tireParkState.rows.find(o=>o.id!==t.id&&o.pairId===t.pairId):null;
 const fields=[['Hersteller',t.manufacturer],['Typ',t.type],['Modell',t.model],['Einsatzzweck',t.purpose],['Tubeless gefahren',t.tubeless===null?'Nicht angegeben':t.tubeless?'Ja':'Nein'],['Größenbezeichnung',tireDimensions(t)],['Laufleistung vor der dokumentierten Historie',tireKm(t.initialMileage)],['Gesamtlaufleistung',tireMileageLabel(t)],['Status',t.status==='mounted'?'Montiert':t.available?'Eingelagert':'Archiviert / nicht verfügbar'],['Lagerort',t.mount?'Am Fahrrad':t.location]];
 return `<div class="actions tire-detail-actions"><button class="primary" data-action="tire-edit" data-id="${esc(t.id)}">Steckbrief bearbeiten</button>${t.mount?`<button class="secondary" data-action="tire-change" data-id="${esc(t.mount.bikeId)}">Reifen wechseln</button>`:t.available?'<p class="help">Einbauen: Öffne das Zielfahrrad und wähle „Reifen wechseln“.</p>':''}${t.isNew?'<span class="badge tire-new">Neu</span>':''}</div><div class="panel tire-detail">${t.photo?`<a href="/api/files/${esc(t.photo)}" data-document-preview="${esc(tireLabel(t))}"><img width="640" height="400" class="tire-photo" src="/api/files/${esc(t.photo)}" alt="${esc(tireLabel(t))}"></a>`:''}<h2>${esc(tireLabel(t))}</h2><dl class="tire-facts">${fields.map(([key,value])=>`<div><dt>${key}</dt><dd>${esc(value||'Nicht angegeben')}</dd></div>`).join('')}</dl><small class="mono">Reifen-ID: ${esc(t.id)}</small></div>${partner?`<section class="panel"><h2>Reifenpaar</h2><p>Dieses Exemplar: ${esc(tireRole(t.pairRole))}</p><a class="secondary" href="${recordRoute('tire',partner.id)}">${esc(tireRole(partner.pairRole))} · ${esc(tireLabel(partner))} · ${esc(tireMileageLabel(partner))} ↗</a><p class="help">Jeder Reifen behält seinen eigenen Steckbrief und seine eigene Montagehistorie.</p></section>`:''}<section class="panel"><h2>Montagehistorie · alle Fahrräder</h2>${tireMountHistory(t)}</section>`;
}
async function tireParkPost(body,operationId){
 const result=await api('tirepark',{method:'POST',body:JSON.stringify({...body,operationId,version})});tireParkState.attempted=-1;tireParkState.version=-1;await load();return result;
}
function tireDimensions(t){return typeof t.dimensions==='string'?t.dimensions:t.dimensionLabel||([t.dimensionSize??t.diameter,t.width].filter(Boolean).join(' × '));}
function tireProfileFields(t,{id,sources=[],partner,sourceId='',sourcePosition='',currentProfile}={}){return `<p class="help">Alle Stammdaten und das Foto sind optional.</p><div class="form-grid">${input('manufacturer','Hersteller',t.manufacturer,'text','maxlength="200"')}${input('type','Typ',t.type,'text','maxlength="200"')}${input('model','Modell',t.model,'text','maxlength="200"')}${input('purpose','Einsatzzweck',t.purpose,'text','maxlength="500"')}${select('tubeless','Tubeless gefahren',[['','Nicht angegeben'],['yes','Ja'],['no','Nein']],t.tubeless==null?'':t.tubeless?'yes':'no')}${input('dimensionLabel','Größenbezeichnung',tireDimensions(t),'text','maxlength="200" placeholder="700 × 45"')}${input('initialMileage','Laufleistung vor der dokumentierten Historie (km)',t.initialMileage,'number',`min="0" step="0.1" ${currentProfile?'readonly':''}`)}${input('location','Lagerort',t.location,'text','maxlength="300"')}${select('partnerId','Als Paar mit',[['','Kein Reifenpaar'],...tireParkState.rows.filter(o=>o.id!==id).map(o=>[o.id,tireLabel(o)])],partner?.id||'')}${select('pairRole','Rolle innerhalb des Paars',[['front','Vorderreifen'],['rear','Hinterreifen']],t.pairRole||'front')}<input type="hidden" name="stockSource" value="${sourceId?String(sources.findIndex(x=>x.s.id===sourceId&&x.p.id===sourcePosition)):''}"></div><fieldset class="supply-fieldset"><legend>Ein Reifenfoto (optional)</legend>${t.photo?`<img width="320" height="200" class="tire-photo" src="/api/files/${esc(t.photo)}" alt="Aktuelles Reifenfoto"><label><input type="checkbox" name="removePhoto"> Foto entfernen</label>`:''}<label>Foto hochladen / ersetzen<input type="file" name="articlePhoto" accept="image/*"></label><label>Mit Kamera aufnehmen<input type="file" name="cameraPhoto" accept="image/*" capture="environment"></label></fieldset>`; }
function readTireProfile(f,t,form){
 const p=Object.fromEntries(['manufacturer','type','model','purpose','pairRole','dimensionLabel'].map(k=>[k,String(f.get(k)||'').trim()]));
 p.tubeless=f.get('tubeless')===''?null:f.get('tubeless')==='yes';p.initialMileage=f.get('initialMileage')===''?null:Number(f.get('initialMileage'));
 // Removed form fields remain in existing records; blank prior mileage is unknown, not proof of a new tire.
 p.usageState=t.usageState||'unknown';
 return p;
}
async function editTireProfile(id,sourceId='',sourcePosition=''){
 if(!await refreshTirePark(true))return toast('Reifen konnten nicht geladen werden. Bitte erneut versuchen.');
 const sourceItem=sourceId?stockItem(sourceId):null;
 const t=tireParkState.rows.find(t=>t.id===id)||{manufacturer:sourceItem?.manufacturer||'',model:sourceItem?.name||'',usageState:'unknown',initialMileage:null,unit:'mm',tubeless:null};
 if(id&&!t.id)return toast('Dieser Reifen ist nicht mehr vorhanden.');
 const partner=t.pairId?tireParkState.rows.find(o=>o.id!==id&&o.pairId===t.pairId):null;
 const sources=data.inventory.flatMap(s=>s.category==='Reifen'&&s.unit==='Stück'?s.positions.filter(p=>p.quantity>=1&&!p.tire).map(p=>({s,p})):[]);
 const currentProfile=(data.tireProfiles||[]).find(p=>p.id===id);const operationId=uid();let photo=t.photo||null,photoUploaded=false;
 modal(id?'Reifen-Steckbrief bearbeiten':'Reifen anlegen',tireProfileFields(t,{id,sources,partner,sourceId,sourcePosition,currentProfile}),async f=>{
  const profile=readTireProfile(f,t,$('#editor'));
  const album=f.get('articlePhoto'),camera=f.get('cameraPhoto');if(album?.size&&camera?.size)throw Error('Bitte genau ein Reifenfoto auswählen.');
  const unlock=lockEditor($('#editor'));try{if(!photoUploaded){photo=await readImage(f,album?.size?album:camera,f.has('removePhoto')?null:photo);photoUploaded=true;}profile.photo=photo;const source=f.get('stockSource')===''?null:sources[Number(f.get('stockSource'))];
   const result=await tireParkPost({action:'save',id:id||'',profile,partnerId:String(f.get('partnerId')||''),location:String(f.get('location')||''),inventoryId:source?.s.id||'',positionId:source?.p.id||''},operationId);closeModal();location.hash=recordRoute('tire',result.id);render();scheduleReload(true);toast('Reifen gespeichert.');
  }finally{unlock();}
 });
}
const tirePositionKnown=t=>['Vorderreifen','Hinterreifen'].includes(t.mount?.position);
function tirePositionFields(rows,bikeId){
 const mounted=rows.filter(t=>t.mount?.bikeId===bikeId),unknown=mounted.filter(t=>!tirePositionKnown(t));
 const free=['Vorderreifen','Hinterreifen'].filter(slot=>!mounted.some(t=>t.mount.position===slot));
 return {unknown,free,html:`<p class="notice">Ein verbauter Reifen ist noch keiner eindeutigen Position zugeordnet. Bitte wähle, wo er montiert ist. Die Laufleistung und Montagehistorie bleiben erhalten.</p><div class="form-grid">${select('tireId','Verbaute Reifen',unknown.map(t=>[t.id,tireLabel(t)]),unknown[0]?.id||'')}${select('position','Montageposition',[['','Bitte auswählen'],...free.map(slot=>[slot,slot])],'')}</div>`};
}
function assignTirePosition(bikeId,rows){
 const {unknown,free,html}=tirePositionFields(rows,bikeId);if(!unknown.length)return;
 if(!free.length)return toast('Alle Montagepositionen sind belegt. Bitte die zusätzlich erfassten Reifen im Fahrrad prüfen.');
 const operationId=uid();modal('Montageposition zuordnen',html,async f=>{
  if(!f.get('position'))throw Error('Bitte Vorderreifen oder Hinterreifen auswählen.');
  const unlock=lockEditor($('#editor'));try{await tireParkPost({action:'assignPosition',bikeId,id:String(f.get('tireId')||''),position:String(f.get('position'))},operationId);closeModal();await quickTireChange(bikeId);}finally{unlock();}
 });$('#editor [type=submit]').textContent='Position speichern und weiter';
}
async function quickTireChange(bikeId){
 const b=bike(bikeId);if(!b||b.archived)return toast('Bitte ein aktives Fahrrad wählen.');
 if(!await refreshTirePark(true))return toast('Reifen konnten nicht geladen werden. Bitte erneut versuchen.');
 const rows=tireParkState.rows,operationId=uid();
 if(rows.some(t=>t.mount?.bikeId===bikeId&&!tirePositionKnown(t)))return assignTirePosition(bikeId,rows);
 modal('Reifen wechseln · '+b.name,`<p class="help">Kein Werkstattauftrag nötig. Ausbau, Einlagerung und Einbau werden zusammen gespeichert.</p><p><strong>${esc(b.name)} · ${number(b.km)} km</strong></p><div class="form-grid">${select('position','Position',[['Vorderreifen','Vorderreifen'],['Hinterreifen','Hinterreifen']],'Vorderreifen')}<div data-tire-out class="notice"></div>${select('incomingId','Welcher Reifen soll drauf?',[['','Nur ausbauen / einlagern'],...rows.filter(t=>t.available).map(t=>[t.id,tireLabel(t)+(t.isNew?' · Neu':'')+' · '+tireMileageLabel(t)])],'')}${input('date','Wechseldatum',today(),'date',`required max="${today()}"`)}${input('location','Lagerort für den ausgebauten Reifen (optional)','','text','maxlength="300"')}</div>${rows.some(t=>t.available)?'':'<p class="help">Kein unmontierter Reifen verfügbar. Lege zuerst einen Reifen im Reifenpark an, wenn du einen einbauen möchtest.</p>'}`,async f=>{
  const position=f.get('position');const outgoing=rows.find(t=>t.mount?.bikeId===bikeId&&t.mount.position===position);
  const unlock=lockEditor($('#editor'));try{await tireParkPost({action:'swap',bikeId,position,outgoingId:outgoing?.id||'',incomingId:String(f.get('incomingId')||''),date:f.get('date'),location:String(f.get('location')||'')},operationId);closeModal();location.hash=recordRoute('bike',bikeId);render();scheduleReload(true);toast('Reifenwechsel dokumentiert.');}finally{unlock();}
 });
 const form=$('#editor'),update=()=>{const t=rows.find(t=>t.mount?.bikeId===bikeId&&t.mount.position===form.elements.position.value);form.querySelector('[data-tire-out]').textContent=t?'Kommt runter: '+tireLabel(t)+' · '+tireKm(t.mount.mileage)+' seit Einbau':'An dieser Position ist kein Reifen montiert.';};form.elements.position.onchange=update;update();$('#editor [type=submit]').textContent='Jetzt Reifenwechsel speichern';
}
function bikeTirePark(b){
 if(!tireParkEnabled)return '';
 const rows=tireParkState.rows.filter(t=>t.mount?.bikeId===b.id);
 return `<section class="panel"><div class="section-title"><h2>Reifenpark</h2>${b.archived?'':`<button class="primary" data-action="tire-change" data-id="${esc(b.id)}">Reifen wechseln</button>`}</div>${rows.length?rows.map(t=>`<p><a href="${recordRoute('tire',t.id)}">${esc(t.mount.position)} · ${esc(tireLabel(t))} ↗</a><br><small>${esc(tireMileageLabel(t))} gesamt · ${tireKm(t.mount.mileage)} seit Einbau</small></p>`).join(''):'<p class="help">Reifen-Steckbriefe und Montagehistorie findest du im Reifenpark.</p>'}<a class="secondary" href="#tirepark">Alle Reifen ansehen</a></section>`;
}
document.addEventListener('click',async e=>{const el=e.target.closest('[data-action]');if(!el)return;try{if(el.dataset.action==='tire-new')await editTireProfile();if(el.dataset.action==='tire-adopt')await editTireProfile(null,el.dataset.id,el.dataset.positionId);if(el.dataset.action==='tire-edit')await editTireProfile(el.dataset.id);if(el.dataset.action==='tire-change')await quickTireChange(el.dataset.id);if(el.dataset.action==='tire-retry')await refreshTirePark(true);if(el.dataset.action==='tire-filter'){tireParkFilter=el.dataset.id;render();}}catch(error){garageRuntime.log(error,'tirepark');toast(error.message);}});
document.addEventListener('input',e=>{if(e.target.id==='tire-search'){tireParkSearch=e.target.value;$('#tire-results').innerHTML=tireParkResults();}});

async function addBikeTire(bikeId,mode='existing'){
 const b=bike(bikeId);if(!b||b.archived)return toast('Bitte zuerst ein aktives Fahrrad speichern.');
 if(!await refreshTirePark(true))return toast('Reifen konnten nicht geladen werden. Bitte erneut versuchen.');
 const sources=data.inventory.flatMap(s=>s.category==='Reifen'&&s.unit==='Stück'?s.positions.filter(p=>p.quantity>=1&&!p.tire).map(p=>({s,p})):[]);
 const rows=tireParkState.rows,available=rows.filter(t=>t.available),operationId=uid();let page=1,photo=null,photoUploaded=false;
 if(rows.some(t=>t.mount?.bikeId===bikeId&&!tirePositionKnown(t)))return assignTirePosition(bikeId,rows);
 const t={manufacturer:'',model:'',usageState:'unknown',initialMileage:null,unit:'mm',tubeless:null};
 modal('Reifen zum Fahrrad hinzufügen',`<p><strong>${esc(b.name)} · ${number(b.km)} km</strong></p><section data-tire-step="1"><h3>Position und Herkunft auswählen</h3><div class="form-grid">${select('position','Position',[['Vorderreifen','Vorderreifen'],['Hinterreifen','Hinterreifen']],b.components.some(c=>componentCategory(c)==='Reifen'&&c.name==='Vorderreifen')?'Hinterreifen':'Vorderreifen')}${select('sourceMode','Reifen',[['existing','Aus Reifenpark hinzufügen'],['new','Neuen Reifen anlegen']],mode)}${input('date','Einbaudatum',today(),'date',`required max="${today()}"`)}</div><p class="help">Nur freie Montagepositionen. Für einen Austausch verwende „Reifen wechseln“.</p></section><section data-tire-step="2" hidden><h3 data-tire-step-title></h3><div data-existing-tire>${select('incomingId','Reifen aus dem Reifenpark',[['','Bitte Reifen auswählen'],...available.map(t=>[t.id,tireLabel(t)+' · '+(tireDimensions(t)||'Dimension offen')+(t.isNew?' · Neu':'')])],'')}<p class="help">Es werden ausschließlich verfügbare, nicht montierte Reifen angeboten.</p></div><div data-new-tire>${tireProfileFields(t,{sources})}</div></section>`,async f=>{
  const position=f.get('position');
  if(bike(bikeId).components.some(c=>componentCategory(c)==='Reifen'&&c.name===position))throw Error('An dieser Position ist bereits ein Reifen montiert. Bitte „Reifen wechseln“ verwenden.');
  if(page===1){page=2;draw();return;}
  const unlock=lockEditor($('#editor'));try{
   if(f.get('sourceMode')==='existing'){
    if(!available.some(t=>t.id===f.get('incomingId')))throw Error('Bitte einen verfügbaren Reifen auswählen.');
    await tireParkPost({action:'swap',bikeId,position,outgoingId:'',incomingId:f.get('incomingId'),date:f.get('date'),location:''},operationId);
   }else{
    const profile=readTireProfile(f,t,$('#editor'));const album=f.get('articlePhoto'),camera=f.get('cameraPhoto');if(album?.size&&camera?.size)throw Error('Bitte genau ein Reifenfoto auswählen.');
    if(!photoUploaded){photo=await readImage(f,album?.size?album:camera,null);photoUploaded=true;}profile.photo=photo;
    const source=f.get('stockSource')===''?null:sources[Number(f.get('stockSource'))];
    await tireParkPost({action:'saveMount',inventoryId:source?.s.id||'',positionId:source?.p.id||'',profile,partnerId:String(f.get('partnerId')||''),location:String(f.get('location')||''),bikeId,position,date:f.get('date')},operationId);
   }
   closeModal();location.hash=recordRoute('bike',bikeId);render();scheduleReload(true);toast('Reifen am Fahrrad und im Reifenpark gespeichert.');
  }finally{unlock();}
 });
 const form=$('#editor'),submit=form.querySelector('[type=submit]'),back=document.createElement('button');back.type='button';back.className='secondary';back.textContent='Zurück';back.onclick=()=>{page=1;draw();};submit.before(back);
 function draw(){form.querySelector('[data-tire-step="1"]').hidden=page!==1;form.querySelector('[data-tire-step="2"]').hidden=page!==2;const create=form.elements.sourceMode.value==='new';form.querySelector('[data-existing-tire]').hidden=create;form.querySelector('[data-new-tire]').hidden=!create;form.querySelector('[data-tire-step-title]').textContent=create?'Neuen Reifen anlegen':'Reifen aus dem Reifenpark auswählen';back.hidden=page===1;submit.textContent=page===1?'Weiter':'Jetzt Reifen hinzufügen';$('#formError').textContent='';}
 draw();
}
document.addEventListener('click',async e=>{const el=e.target.closest('[data-action="bike-tire-add"]');if(!el)return;try{if(el.closest('#editor')&&$('#editor').addTire)await $('#editor').addTire(el.dataset.mode||'existing');else await addBikeTire(el.dataset.id,el.dataset.mode||'existing');}catch(error){garageRuntime.log(error,'tirepark');toast(error.message);}});

function restoreBikeTireWizard(){
 let intent;try{intent=JSON.parse(sessionStorage.getItem('garageTireWizard'));sessionStorage.removeItem('garageTireWizard');}catch{return;}
 if(!intent||Date.now()-intent.time>120000||!bike(intent.bikeId)||location.hash!==recordRoute('bike',intent.bikeId))return;
 queueMicrotask(()=>addBikeTire(intent.bikeId,intent.mode==='new'?'new':'existing').catch(error=>{garageRuntime.log(error,'tirepark');toast(error.message);}));
}

function bicycleTireRows(b,records=tireParkState.rows,day=today()){
 const cutoff=addMonths(day,-12),result=[];
 for(const [i,c] of (b.components||[]).entries())if(componentCategory(c)==='Reifen'){
  const t=records.find(t=>t.mount?.bikeId===b.id&&(t.id===c.tireId||t.mount.componentKey===installedComponentKey(c,i)));
  result.push({id:t?.id||c.id,position:c.name,pair:!!t?.pairId,manufacturer:t?.manufacturer||c.manufacturer,model:t?.model||c.model,dimensions:t?tireDimensions(t):c.tireDimensions||[c.tireWidth,c.tireUnit].filter(Boolean).join(' '),installedDate:c.installedDate,currentKm:t?.mount?.mileage??componentMileage(c,b,data.history).km,totalKm:t?t.totalMileage:tireLifetime(c,b,data.history),removedDate:'',removedMileage:null,current:true});
 }
 for(const t of records){let total=t.initialMileage??(t.isNew?0:null);
  for(const h of t.history){total=total===null||h.mileage===null?null:Math.round((total+h.mileage)*10)/10;
   if(h.bikeId!==b.id||!h.removedDate||h.removedDate<cutoff||h.removedDate>day)continue;
   result.push({id:t.id,position:h.position,pair:!!t.pairId,manufacturer:t.manufacturer,model:t.model,dimensions:tireDimensions(t),installedDate:h.installedDate,currentKm:null,totalKm:total,removedDate:h.removedDate,removedMileage:h.mileage,current:false});
  }
 }
 return result.sort((a,b)=>Number(b.current)-Number(a.current)||(a.current?a.position.localeCompare(b.position):b.removedDate.localeCompare(a.removedDate)));
}
function bicycleTireTable(b){
 const rows=bicycleTireRows(b),columns=['Position / Paar','Hersteller','Modell','Dimensionen','Einbaudatum','Kilometerstand aktuell','Gesamtlaufleistung','Ausbaudatum','Laufleistung beim Ausbau'];
 return (tireParkState.error?`<p role="alert">Die Reifenhistorie konnte nicht geladen werden. <button data-action="tire-retry">Erneut versuchen</button></p>`:'')+`<div class="tire-table-wrap" role="region" aria-label="Reifen und Montagehistorie" tabindex="0"><table class="tire-factsheet-table"><thead><tr>${columns.map(c=>`<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr class="${r.current?'mounted-tire':'past-tire'}"><th scope="row">${r.pair?'Paar · ':''}${esc(r.position||'Position offen')}<small>${r.current?'Aktuell verbaut':'Historie'}</small></th><td>${esc(r.manufacturer||'–')}</td><td>${esc(r.model||'–')}</td><td>${esc(r.dimensions||'–')}</td><td>${date(r.installedDate)}</td><td title="Laufleistung seit diesem Einbau">${r.current?tireKm(r.currentKm):'–'}</td><td>${tireKm(r.totalKm)}</td><td class="${r.current?'not-applicable':''}" ${r.current?'aria-label="Noch montiert"':''}>${r.current?'':date(r.removedDate)}</td><td class="${r.current?'not-applicable':''}" ${r.current?'aria-label="Noch montiert"':''}>${r.current?'':tireKm(r.removedMileage)}</td></tr>`).join('')||`<tr><td colspan="9">${tireParkState.loading?'Reifen werden geladen …':'Keine verbauten Reifen oder Ausbauten in den letzten zwölf Monaten.'}</td></tr>`}</tbody></table></div>`;
}
function bicycleServiceIntervals(b){
 const candidates=data.plans.filter(p=>p.bikeId===b.id&&!p.completed);
 const readings=(b.readings||[]).filter(r=>validISODate(r.date)&&Number.isFinite(Number(r.km))).sort((a,b)=>a.date.localeCompare(b.date));
 let rate=null;for(let i=readings.length-2;i>=0;i--){const last=readings.at(-1),days=(Date.parse(last.date)-Date.parse(readings[i].date))/86400000,distance=last.km-readings[i].km;if(days>0&&distance>0){rate=distance/days;break;}}
 const ranked=candidates.map(p=>{const d=due(p,b,today()),eta=Math.min(d.days??Infinity,d.km===null?Infinity:d.km<=0?0:rate?d.km/rate:Infinity);return {p,d,eta,urgency:Math.min(d.days===null?Infinity:d.days/30,d.km===null?Infinity:d.km/200)};});
 ranked.sort((a,b)=>Number(b.d.status==='overdue')-Number(a.d.status==='overdue')||(Number.isFinite(a.eta)&&Number.isFinite(b.eta)?a.eta-b.eta:a.urgency-b.urgency)||a.p.title.localeCompare(b.p.title));
 if(!ranked.length)return '<div class="panel">Kein Serviceintervall für dieses Fahrrad geplant.</div>';
 return ranked.map(({p,d})=>`<div class="panel next-bike-service"><h3><a href="${recordRoute('plan',p.id)}">${esc(p.title)}</a></h3><button class="secondary" data-service-document="${esc(p.id)}">Service dokumentieren</button>${d.status==='overdue'?'<span class="badge overdue">Fällig / überfällig</span>':''}<p>${[d.km===null?'':d.km<=0?`${number(Math.abs(d.km))} km ${d.km===0?'bis zur Fälligkeit':'überfällig'}`:`Noch ${number(d.km)} km · bei ${number(p.nextKm)} km`,d.days===null?'':`Fällig am ${date(p.nextDate)}${d.days<0?' · überfällig':''}`].filter(Boolean).join('<br>')}</p>${d.km!==null&&d.days!==null?'<small>Es gilt die zuerst erreichte Grenze.</small>':''}</div>`).join('');
}

function serviceDocumentationEntries(){
 return [...data.history,...data.orders.filter(o=>o.serviceDocumentation&&o.completedAt&&!data.history.some(h=>h.orderId===o.id)).map(o=>({id:'documented:'+o.id,orderId:o.id,bikeId:o.bikeId,title:o.title,date:o.completedAt,km:o.completedKm,cost:0,contactId:'',workshop:'Selbst',part:o.parts.map(p=>p.name).join(', '),notes:o.description,attachments:o.attachments||[],materials:[]}))];
}
function saveServiceDocumentation(garage,planId,occurrence,description,entryId,day,km){
 const p=garage.plans.find(p=>p.id===planId),b=garage.bikes.find(b=>b.id===p?.bikeId);
 if(garage.history.some(h=>h.id===entryId))return;
 if(!p||p.completed||!b||JSON.stringify([p.id,p.nextDate||'',p.nextKm??null])!==occurrence)throw Error('Das Serviceintervall wurde geändert. Bitte neu öffnen.');
 if(!description.trim()||description.length>10000)throw Error('Bitte beschreibe die durchgeführte Arbeit.');
 garage.history.push({id:entryId,bikeId:b.id,title:p.title,date:day,km,cost:0,contactId:'',workshop:'Selbst',part:'',partSerial:'',notes:description.trim(),attachments:[],materials:[],servicePlanId:p.id,serviceOccurrence:occurrence,partsExchanged:false});
 if(p.months||p.intervalKm)Object.assign(p,completePlan(p,day,km));else p.completed=true;
}
function documentService(planId){
 const p=data.plans.find(p=>p.id===planId),b=bike(p?.bikeId);if(!p||p.completed||!b||b.archived)return toast('Bitte ein aktives Serviceintervall auswählen.');
 const occurrence=serviceOccurrence(p),entryId=uid(),draft={description:'',exchange:'',componentKey:''};let step=0;
 const show=()=>{
  modal('Service dokumentieren',`<p><strong>${esc(b.name)} · ${esc(p.title)}</strong></p><p class="help">${date(today())} · ${number(b.km)} km</p>${step===0?'<label>Was habe ich durchgeführt?<textarea name="description" maxlength="10000" required>'+esc(draft.description)+'</textarea></label>':select('exchange','Teile ausgetauscht?',[['','Bitte auswählen'],['no','Nein'],['yes','Ja']],draft.exchange)+`<div data-doc-parts ${draft.exchange==='yes'?'':'hidden'}>${select('removedComponent','Ausgebautes / ersetztes Bauteil',[['','Bitte Bauteil auswählen'],...(b.components||[]).map((c,i)=>[installedComponentKey(c,i),[c.name,c.manufacturer,c.model].filter(Boolean).join(' · ')])],draft.componentKey)}<p class="help">Danach erfasst du das Ersatzteil und bestätigst den Austausch im bestehenden Wartungsablauf. Erst beim Abschluss werden Bauteile und Lager geändert.</p></div>`}${step?'<button type="button" class="secondary" data-doc-back>Zurück</button>':''}`,async f=>{
   if(step===0){draft.description=String(f.get('description')||'').trim();if(!draft.description)throw Error('Bitte beschreibe die durchgeführte Arbeit.');step=1;show();return;}
   draft.exchange=String(f.get('exchange')||'');draft.componentKey=String(f.get('removedComponent')||'');if(!draft.exchange)throw Error('Bitte Ja oder Nein auswählen.');
   const existing=plannedWorkshop(p);if(existing){closeModal();location.hash=orderLink(existing);toast('Für diesen Service besteht bereits eine Wartung. Bitte dort den Abschluss dokumentieren.');return;}
   if(draft.exchange==='no'){
    if(await mutate(()=>saveServiceDocumentation(data,p.id,occurrence,draft.description,entryId,today(),bike(b.id).km))){closeModal();toast('Service im Servicebuch dokumentiert.');}return;
   }
   const selected=plannedOrderComponents(b).find(r=>r.key===draft.componentKey);if(!selected)throw Error('Bitte ein aktuell verbautes Bauteil auswählen.');
   const stepId=uid(),o={id:uid(),maintenancePlanning:true,serviceDocumentation:true,type:'service',bikeId:b.id,externalBike:'',title:p.title,description:draft.description,steps:[{id:stepId,title:draft.description.slice(0,200),operation:'exchange',category:componentCategory(selected.component),componentKey:selected.key,done:false,guideIds:[]}],parts:[],guideIds:[],attachments:[],replacementKeys:[selected.key],componentCategories:[],planId:p.id,planOccurrence:occurrence,planSnapshot:structuredClone(p),plannedDate:today(),wizardVersion:2};
   closeModal();editOrder(null,p.id,stepId,null,{order:o});
  });
  const form=$('#editor'),button=form.querySelector('[type=submit]');
  if(step===0)button.textContent='Weiter';else{
   const update=()=>{draft.exchange=form.elements.exchange.value;form.querySelector('[data-doc-parts]').hidden=draft.exchange!=='yes';form.elements.removedComponent.required=draft.exchange==='yes';button.textContent=draft.exchange==='yes'?'Teileaustausch erfassen':'Service speichern';};form.elements.exchange.onchange=update;update();form.querySelector('[data-doc-back]').onclick=()=>{draft.exchange=form.elements.exchange.value;draft.componentKey=form.elements.removedComponent.value;step=0;show();};
  }
 };
 show();
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-service-document]');if(button)try{documentService(button.dataset.serviceDocument);}catch(error){garageRuntime.log(error,'service-documentation');toast(error.message);}});
