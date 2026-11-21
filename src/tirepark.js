// Individual tire profiles share the existing mounted components and warehouse journal.
let tireParkEnabled=true,tireParkState={rows:[],version:-1,loading:false,error:'',attempted:-1},tireParkFilter='all',tireParkSearch='';
const tireLabel=t=>[t.manufacturer,t.model].filter(Boolean).join(' · ')||'Reifen '+t.id.slice(-6);
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
 const q=tireParkSearch.trim().toLocaleLowerCase('de');const rows=tireParkState.rows.filter(t=>(tireParkFilter==='all'||t.status===tireParkFilter)&&[t.manufacturer,t.model,tireDimensions(t),t.width,t.diameter,t.mount?.bikeName,t.location].join(' ').toLocaleLowerCase('de').includes(q));
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
 const fields=[['Hersteller',t.manufacturer],['Typ / Modell',t.model],['Baujahr',t.manufactureYear],['Einsatzzweck',t.purpose],['Profil',t.tread],['Tubeless gefahren',t.tubeless===null?'Nicht angegeben':t.tubeless?'Ja':'Nein'],['Dimensionen',tireDimensions(t)],['Gesamtlaufleistung',tireMileageLabel(t)],['Status',t.status==='mounted'?'Montiert':t.available?'Eingelagert':'Archiviert / nicht verfügbar'],['Lagerort',t.mount?'Am Fahrrad':t.location]];
 return `<div class="actions tire-detail-actions"><button class="primary" data-action="tire-edit" data-id="${esc(t.id)}">Steckbrief bearbeiten</button>${t.mount?`<button class="secondary" data-action="tire-change" data-id="${esc(t.mount.bikeId)}">Reifen wechseln</button>`:t.available?'<p class="help">Einbauen: Öffne das Zielfahrrad und wähle „Reifen wechseln“.</p>':''}${t.isNew?'<span class="badge tire-new">Neu</span>':''}</div><div class="panel tire-detail">${t.photo?`<a href="/api/files/${esc(t.photo)}" data-document-preview="${esc(tireLabel(t))}"><img width="640" height="400" class="tire-photo" src="/api/files/${esc(t.photo)}" alt="${esc(tireLabel(t))}"></a>`:''}<h2>${esc(tireLabel(t))}</h2><dl class="tire-facts">${fields.map(([key,value])=>`<div><dt>${key}</dt><dd>${esc(value||'Nicht angegeben')}</dd></div>`).join('')}</dl><small class="mono">Reifen-ID: ${esc(t.id)}</small></div>${partner?`<section class="panel"><h2>Reifenpaar</h2><p>Dieses Exemplar: ${esc(tireRole(t.pairRole))}</p><a class="secondary" href="${recordRoute('tire',partner.id)}">${esc(tireRole(partner.pairRole))} · ${esc(tireLabel(partner))} · ${esc(tireMileageLabel(partner))} ↗</a><p class="help">Jeder Reifen behält seinen eigenen Steckbrief und seine eigene Montagehistorie.</p></section>`:''}<section class="panel"><h2>Montagehistorie · alle Fahrräder</h2>${tireMountHistory(t)}</section>`;
}
async function tireParkPost(body,operationId){
 const result=await api('tirepark',{method:'POST',body:JSON.stringify({...body,operationId,version})});tireParkState.attempted=-1;tireParkState.version=-1;await load();return result;
}
function tireDimensions(t){return t.dimensions||t.dimensionLabel||([t.dimensionSize??t.diameter,t.width].filter(Boolean).join(' × '));}
function tireDimensionInputs(t){const m=String(t.dimensionLabel||'').match(/^\s*([^x×]+?)\s*[x×]\s*(.+?)\s*$/i);return [t.dimensionSize??m?.[1]??t.diameter??'',t.width||m?.[2]||''];}
function tireProfileFields(t,{id,sources=[],partner,sourceId='',sourcePosition='',currentProfile}={}){return `<p class="help">Alle Stammdaten und das Foto sind optional. Ein neues Exemplar wird mit genau einem Stück im Lager erfasst. Bereits vorhandenen Bestand kannst du stattdessen übernehmen.</p><div class="form-grid">${input('manufacturer','Hersteller',t.manufacturer,'text','maxlength="200"')}${input('model','Typ / Modell',t.model,'text','maxlength="200"')}${input('manufactureYear','Baujahr',t.manufactureYear,'text','maxlength="4" inputmode="numeric"')}${input('purpose','Einsatzzweck',t.purpose,'text','maxlength="500"')}${input('tread','Profil',t.tread,'text','maxlength="500"')}${select('tubeless','Tubeless gefahren',[['','Nicht angegeben'],['yes','Ja'],['no','Nein']],t.tubeless===null?'':t.tubeless?'yes':'no')}<fieldset class="tire-dimensions"><legend>Dimensionen</legend><div class="tire-dimension-inputs"><input name="dimensionSize" aria-label="Dimension links" maxlength="80" placeholder="700" value="${esc(tireDimensionInputs(t)[0])}" data-original="${esc(tireDimensionInputs(t)[0])}"><span aria-hidden="true">×</span><input name="width" aria-label="Dimension rechts / Breite" maxlength="80" placeholder="45" value="${esc(tireDimensionInputs(t)[1])}" data-original="${esc(tireDimensionInputs(t)[1])}"></div>${t.dimensionSize==null&&t.dimensionLabel?`<small>Bisherige Angabe: ${esc(t.dimensionLabel)}. Ohne Änderung bleibt sie erhalten.</small>`:''}<input type="hidden" name="unit" value="${esc(t.unit||'mm')}"></fieldset>${select('usageState','Vorgeschichte',[['unknown','Nicht bekannt'],...(t.everMounted?[]:[['new','Neu, noch nie montiert']]),['used','Bereits gebraucht']],t.usageState)}${input('initialMileage','Laufleistung vor der dokumentierten Historie (km)',t.initialMileage,'number',`min="0" step="0.1" ${currentProfile?'readonly':''}`)}${input('location','Lagerort',t.location,'text','maxlength="300"')}${select('partnerId','Als Paar mit',[['','Kein Reifenpaar'],...tireParkState.rows.filter(o=>o.id!==id).map(o=>[o.id,tireLabel(o)])],partner?.id||'')}${select('pairRole','Rolle innerhalb des Paars',[['front','Vorderreifen'],['rear','Hinterreifen']],t.pairRole||'front')}${!id?select('stockSource','Vorhandenen Bestand übernehmen (optional)',[['','Neues Exemplar erfassen'],...sources.map(({s,p},i)=>[String(i),s.manufacturer+' · '+s.name+' · '+p.location+' · '+amount(p.quantity)+' Stück'])],sourceId?String(sources.findIndex(x=>x.s.id===sourceId&&x.p.id===sourcePosition)):''):''}</div><fieldset class="supply-fieldset"><legend>Ein Reifenfoto (optional)</legend>${t.photo?`<img width="320" height="200" class="tire-photo" src="/api/files/${esc(t.photo)}" alt="Aktuelles Reifenfoto"><label><input type="checkbox" name="removePhoto"> Foto entfernen</label>`:''}<label>Foto hochladen / ersetzen<input type="file" name="articlePhoto" accept="image/*"></label><label>Mit Kamera aufnehmen<input type="file" name="cameraPhoto" accept="image/*" capture="environment"></label></fieldset>`; }
function readTireProfile(f,t,form){
 const p=Object.fromEntries(['manufacturer','model','manufactureYear','purpose','tread','unit','usageState','pairRole','dimensionSize','width'].map(k=>[k,String(f.get(k)||'').trim()]));
 p.tubeless=f.get('tubeless')===''?null:f.get('tubeless')==='yes';p.initialMileage=f.get('initialMileage')===''?null:Number(f.get('initialMileage'));
 p.dimensionsEdited=['dimensionSize','width'].some(k=>form.elements[k].value!==form.elements[k].dataset.original);
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
async function quickTireChange(bikeId){
 const b=bike(bikeId);if(!b||b.archived)return toast('Bitte ein aktives Fahrrad wählen.');
 if(!await refreshTirePark(true))return toast('Reifen konnten nicht geladen werden. Bitte erneut versuchen.');
 const rows=tireParkState.rows,operationId=uid();
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
