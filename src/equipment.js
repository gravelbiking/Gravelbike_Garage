// Personal equipment and the additional bicycle specification fields.
function toolFields(t={},prefix='') {
 return [['name','Bezeichnung / Werkzeugtyp'],['manufacturer','Hersteller'],['model','Modell'],['articleNumber','Artikelnummer'],['dimensions','Ausführung / Maße'],['compatibility','Kompatibilität'],['notes','Weitere Angaben']].map(([key,label])=>input(prefix+key,label,t[key],'text',`${key==='name'?'required ':''}maxlength="500"`)).join('');
}
function toolValues(f,prefix='') {return Object.fromEntries(['name','manufacturer','model','articleNumber','dimensions','compatibility','notes'].map(k=>[k,String(f.get(prefix+k)||'').trim()]));}
function toolsPage(){return heading('Werkzeug','Deine Werkzeuge und die Bauteile, für die du sie brauchst.',`<button class="primary" data-action="tool-new">＋ Werkzeug anlegen</button>`)+`<div class="supply-grid">${data.tools.length?data.tools.map(t=>`<article class="panel stock-card"><div class="eyebrow">${esc(t.manufacturer||'Werkzeug')}</div><h2>${esc(t.name)}</h2><dl class="supply-facts">${[['Modell',t.model],['Artikelnummer',t.articleNumber],['Ausführung / Maße',t.dimensions],['Kompatibilität',t.compatibility]].map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v||'–')}</dd></div>`).join('')}</dl>${t.notes?`<p>${esc(t.notes)}</p>`:''}<p class="help">Verwendet bei: ${data.bikes.flatMap(b=>b.components.filter(c=>c.toolIds?.includes(t.id)).map(c=>esc(b.name)+' · '+esc(c.name))).join(', ')||'Noch keinem Bauteil zugeordnet'}</p><div class="supply-actions"><button class="secondary" data-action="tool-edit" data-id="${esc(t.id)}">Bearbeiten</button><button class="small-button stock-low" data-action="tool-delete" data-id="${esc(t.id)}">Löschen</button></div></article>`).join(''):empty('Das passende Werkzeug am richtigen Bauteil.','Lege zum Beispiel einen Kurbelabzieher mit Gewindemaß und passendem Kurbelsystem an.')}</div>`;}
function editTool(id){const t=data.tools.find(x=>x.id===id)||{id:uid()};modal(id?'Werkzeug bearbeiten':'Werkzeug anlegen',`<div class="form-grid">${toolFields(t)}</div>`,async f=>{const entry={...t,...toolValues(f)};if(!entry.name)throw Error('Bitte das Werkzeug benennen.');if(await mutate(()=>{if(id)data.tools=data.tools.map(x=>x.id===id?entry:x);else data.tools.push(entry);})){closeModal();toast('Werkzeug gespeichert.');}});}
function deleteEquipment(collection,id){const item=data[collection].find(x=>x.id===id);if(!item)return;if(collection==='tools'&&data.bikes.some(b=>b.components.some(c=>c.toolIds?.includes(id))))return toast('Dieses Werkzeug ist noch Bauteilen zugeordnet. Entferne zuerst die Zuordnungen.');modal(collection==='tools'?'Werkzeug löschen?':'Radcomputer löschen?',`<p>${esc(item.name||[item.manufacturer,item.model].join(' '))} wirklich löschen?</p>`,async()=>{if(await mutate(()=>data[collection]=data[collection].filter(x=>x.id!==id))){closeModal();if(collection==='computers')location.hash='computers';toast('Eintrag gelöscht.');}});$('#editor [type="submit"]').textContent='Löschen';$('#editor [type="submit"]').className='danger';}
function componentToolEditor(c){return `<fieldset class="supply-fieldset component-tools"><legend>Zugeordnetes Werkzeug</legend><div class="tool-choices">${toolChoices(c.toolIds||[])}</div><details><summary>Neues Werkzeug anlegen und zuordnen</summary><div class="form-grid">${toolFields({},'newTool_').replaceAll('required ','')}</div><button type="button" class="secondary" data-action="component-tool-create">Werkzeug anlegen & zuordnen</button></details></fieldset>`;}
function toolChoices(ids){return data.tools.length?data.tools.map(t=>`<label class="document-choice"><input type="checkbox" name="componentToolIds" value="${esc(t.id)}" ${ids.includes(t.id)?'checked':''}> ${esc(t.name)} · ${esc([t.manufacturer,t.model,t.dimensions].filter(Boolean).join(' · '))}</label>`).join(''):'<p class="help">Noch kein Werkzeug angelegt.</p>';}
async function quickComponentTool(row){const f=new FormData();for(const el of row.querySelectorAll('[name^="newTool_"]'))f.set(el.name,el.value);const entry={id:uid(),...toolValues(f,'newTool_')};if(!entry.name)throw Error('Bitte das neue Werkzeug benennen.');const ids=[...row.querySelectorAll('[name="componentToolIds"]:checked')].map(e=>e.value);if(await mutate(()=>data.tools.push(entry))){row.querySelector('.tool-choices').innerHTML=toolChoices([...ids,entry.id]);for(const el of row.querySelectorAll('[name^="newTool_"]'))el.value='';row.querySelector('.component-state').textContent='Zuordnung noch nicht gespeichert';toast('Werkzeug angelegt. Speichere jetzt das Bauteil für die Zuordnung.');}}
function componentToolsView(c){return (c.toolIds||[]).map(id=>data.tools.find(t=>t.id===id)).filter(Boolean).map(t=>`<div><small>Werkzeug: ${esc(t.name)}</small><span>${esc([t.manufacturer,t.model,t.dimensions,t.compatibility].filter(Boolean).join(' · ')||'–')}</span></div>`).join('');}
const computerFields=[['manufacturer','Hersteller'],['model','Modell'],['serial','Seriennummer'],['software','Firmware'],['infos','Infos']];
function computersPage(){
 return heading('Radcomputer','Deine Geräte im Überblick.',`<button class="primary" data-action="computer-new">＋ Radcomputer anlegen</button>`,'DEINE NAVIGARAGE')+`<div class="supply-grid">${data.computers.map(c=>`<a class="panel stock-card computer-card" href="#computer/${encodeURIComponent(c.id)}"><div class="eyebrow">${esc(c.manufacturer)}</div><h2>${esc(c.model)}</h2>${c.photo?`<img width="640" height="400" class="stock-photo" src="/api/files/${esc(c.photo)}" alt="${esc(c.model)}">`:'<div class="computer-placeholder" aria-label="Kein Foto">GPS</div>'}<p>Seriennummer · ${esc(c.serial||'–')}</p></a>`).join('')||empty('Deine Radcomputer bekommen einen Steckbrief.','Erfasse Hersteller, Modell, Seriennummer, Firmware und Foto.')}</div>`;
}
function computerDetail(id){
 const c=data.computers.find(c=>c.id===id);if(!c)return empty('Radcomputer nicht gefunden.','Wähle ein Gerät aus der Übersicht.','<a href="#computers">Zur Übersicht</a>');
 return '<a class="back" href="#computers">← Alle Radcomputer</a>'+heading(esc(c.model),esc(c.manufacturer),`<button class="primary" data-action="computer-edit" data-id="${esc(c.id)}">Bearbeiten</button>`)+`<div class="panel"><h2>Steckbrief</h2>${c.photo?`<a href="/api/files/${esc(c.photo)}" data-document-preview="${esc(c.model)}"><img width="640" height="400" class="stock-photo" src="/api/files/${esc(c.photo)}" alt="${esc(c.model)}"></a>`:''}<dl class="supply-facts">${computerFields.map(([key,label])=>`<div><dt>${label}</dt><dd>${esc(c[key]||'–')}</dd></div>`).join('')}</dl><button class="small-button stock-low" data-action="computer-delete" data-id="${esc(c.id)}">Radcomputer löschen</button></div>`;
}
function editComputer(id){
 const c=data.computers.find(x=>x.id===id)||{id:uid(),price:null,purchaseDate:'',software:''};
 modal(id?'Radcomputer bearbeiten':'Radcomputer anlegen',`<div class="form-grid">${computerFields.map(([key,label])=>{
  const max=key==='infos'?100:25,len=Array.from(c[key]||'').length;
  return input(key,label,c[key],'text',`${['manufacturer','model'].includes(key)?'required ':''}maxlength="${Math.max(max,len)}"`)+(len>max?`<p class="help">${label}: Vorhandener längerer Text bleibt erhalten. Geänderte Texte dürfen höchstens ${max} Zeichen enthalten.</p>`:'');
 }).join('')}</div><fieldset class="supply-fieldset"><legend>Foto</legend>${c.photo?`<img width="640" height="400" class="stock-photo" src="/api/files/${esc(c.photo)}" alt="${esc(c.model)}"><label><input type="checkbox" name="removePhoto"> Foto entfernen</label>`:''}<label>Foto hochladen / Fotoalbum<input name="articlePhoto" type="file" accept="image/*"></label><label>Mit Kamera aufnehmen<input name="cameraPhoto" type="file" accept="image/*" capture="environment"></label></fieldset>`,async form=>{
  const entry={...c};for(const [key] of computerFields){entry[key]=String(form.get(key)||'').trim();if(Array.from(entry[key]).length>(key==='infos'?100:25)&&entry[key]!==c[key])throw Error('Bitte die Zeichenbegrenzung für '+key+' beachten.');}
  if(!entry.manufacturer||!entry.model)throw Error('Bitte Hersteller und Modell angeben.');
  const album=form.get('articlePhoto'),camera=form.get('cameraPhoto');if(album?.size&&camera?.size)throw Error('Bitte genau ein Foto auswählen.');
  const unlock=lockEditor($('#editor'));try{
   entry.photo=await readImage(form,album?.size?album:camera,form.has('removePhoto')?null:c.photo||null);
   if(await mutate(()=>{if(id)data.computers=data.computers.map(x=>x.id===id?entry:x);else data.computers.push(entry);})){closeModal();location.hash='computer/'+entry.id;}
  }finally{unlock();}
 });
}
const defaultBikeTypes=['Gravelbike','Rennrad','Mountainbike','E-Bike','Citybike','Trekkingrad','Lastenrad','Allroadbike','Smarttrainer','Cyclocross','Sonstiges'];
function allBikeTypes(){return [...new Map([...defaultBikeTypes,...(data.bikeTypes||[]),...data.bikes.map(b=>b.type).filter(Boolean)].map(type=>[type.trim().toLocaleLowerCase('de-DE'),type.trim()])).values()];}
function canonicalBikeType(value){const name=String(value||'').trim();return allBikeTypes().find(type=>type.toLocaleLowerCase('de-DE')===name.toLocaleLowerCase('de-DE'))||name;}
function bikeTypeInput(value=''){
 const types=allBikeTypes();
 return `<label>Fahrradtyp<select name="type" id="bike-types" required><option value="" ${!value?'selected':''} disabled>Bitte Fahrradtyp auswählen</option>${types.map(type=>`<option value="${esc(type)}" ${type===value?'selected':''}>${esc(type)}</option>`).join('')}<option value="__custom__">＋ Eigenen Fahrradtyp anlegen</option></select></label><label data-custom-bike-type hidden>Eigener Fahrradtyp<input name="customBikeType" type="text" maxlength="200" disabled></label>`;
}
function bindBikeType(form){
 const choice=form.elements.namedItem('type'),field=form.elements.namedItem('customBikeType'),label=form.querySelector('[data-custom-bike-type]');
 const update=()=>{const custom=choice.value==='__custom__';label.hidden=!custom;field.disabled=!custom;field.required=custom;};
 choice.addEventListener('change',update);update();
}
function readBikeType(formData){return canonicalBikeType(formData.get('type')==='__custom__'?formData.get('customBikeType'):formData.get('type'));}

function planMileageText(b){return b?'Aktuelle Laufleistung: '+number(b.km)+' km':'';}
function bikeExtraEditor(b){const l=b.leasing||{};return `${input('year','Baujahr',b.year,'number','min="1900" max="2100" step="1"')}${input('modelYear','Modelljahr',b.modelYear,'number','min="1900" max="2100" step="1"')}${input('frameColor','Rahmenfarbe',b.frameColor,'text','maxlength="200"')}${input('frameMaterial','Rahmenmaterial',b.frameMaterial,'text','maxlength="200"')}${input('weightKg','Fahrradgewicht (kg)',b.weightKg,'number','min="0.001" max="1000" step="0.001"')}<fieldset class="supply-fieldset span2" id="jobrad-fields" ${b.jobrad?'':'hidden'}><legend>Jobrad-Vertrag & Übernahme</legend><div class="form-grid">${input('leasingMonthly','Monatliche Leasingrate laut Vertrag (€)',l.monthly,'number','min="0" step="0.01"')}${input('insurance','Versicherung / Versicherer und Tarif',l.insurance,'text','maxlength="500"')}${input('insuranceNumber','Versicherungsnummer',l.insuranceNumber,'text','maxlength="200"')}${input('insuranceUrl','Link zu Versicherungsunterlagen',l.insuranceUrl,'url','maxlength="2000"')}<label class="document-choice"><input name="leasingPurchased" type="checkbox" ${l.purchased?'checked':''}> Leasing beendet und Fahrrad übernommen</label><label id="leasing-buyout" ${l.purchased?'':'hidden'}>Übernahme-/Kaufpreis (€)<input type="number" name="leasingBuyout" min="0" step="0.01" value="${esc(l.buyout??'')}"></label></div><p class="help">Vertragsdaten bleiben nach der Übernahme erhalten. Versicherungsbelege kannst du bei den Fahrraddokumenten hochladen.</p></fieldset>`;}
function readBikeExtra(f,base={}){const optional=k=>f.get(k)===''?null:Number(f.get(k));const insuranceUrl=f.get('insuranceUrl').trim();if(insuranceUrl&&!safeShopLink(insuranceUrl))throw Error('Bitte einen gültigen Link zu den Versicherungsunterlagen angeben.');return {modelYear:f.get('modelYear')===''?null:Number(f.get('modelYear')),frameColor:f.get('frameColor').trim(),frameMaterial:f.get('frameMaterial').trim(),weightKg:optional('weightKg'),leasing:{monthly:optional('leasingMonthly'),insurance:f.get('insurance').trim(),insuranceNumber:f.get('insuranceNumber').trim(),insuranceUrl,documentId:f.get('insuranceDocumentId')??base.leasing?.documentId??'',purchased:f.has('leasingPurchased'),buyout:optional('leasingBuyout')}};}
function leasingView(b){if(!b.jobrad)return '';const l=b.leasing||{},doc=data.documents.find(d=>d.id===l.documentId&&d.bikeId===b.id),url=safeShopLink(l.insuranceUrl);return `<section class="panel leasing-summary"><h3>Jobrad · ${l.purchased?'Leasing beendet · Fahrrad übernommen':'Leasing'}</h3><dl class="supply-facts">${[['Monatliche Leasingrate',l.monthly==null?'–':money(l.monthly)],['Versicherung / Tarif',l.insurance||'–'],['Versicherungsnummer',l.insuranceNumber||'–'],...(l.purchased?[['Übernahme-/Kaufpreis',l.buyout==null?'–':money(l.buyout)]]:[])].map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${url?`<a class="small-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Versicherungsunterlagen ↗</a>`:''}${doc?`<a class="small-button" href="/api/files/${esc(doc.fileId)}" data-document-preview="${esc(doc.title)}">${esc(doc.title)}</a>`:''}</section>`;}
function extraComponentEditor(c){return `<div class="form-grid"><label class="rear-freehub" ${c.name==='Hinterrad'?'':'hidden'}>Freilaufkörper<input name="freehub" value="${esc(c.wheel?.freehub||'')}" maxlength="200" placeholder="z. B. SRAM XDR"></label></div><fieldset class="supply-fieldset tire-specs" ${componentCategory(c)==='Reifen'?'':'hidden'}><legend>Reifendaten</legend><div class="form-grid">${input('tireWidth','Reifenbreite',c.tireWidth,'number','min="0.001" max="1000" step="0.001"')}${select('tireUnit','Einheit der Reifenbreite',['mm','Zoll'],c.tireUnit||'mm')}</div></fieldset>`;}

function bikeLinkedDocuments(b){
 const files=[...new Map([...(b.attachments||[]),...data.documents.filter(d=>d.bikeId===b.id)].map(d=>[d.fileId,d])).values()];
 return files.length?`<section class="supply-fieldset"><h3>Verknüpfte Fahrraddokumente</h3><div class="receipt-links">${receiptLinks(files)}</div></section>`:'';
}
function bikePhotoEditor(b){
 return `<fieldset class="supply-fieldset span2" id="bikePhotoEditor" data-current-photo="${esc(b.photo||'')}"><legend>Fahrradfoto</legend>
 <img width="640" height="400" class="bike-photo-preview" ${b.photo?`src="/api/files/${esc(b.photo)}"`:'hidden'} alt="Fahrradfoto">
 <div data-photo-actions ${b.photo?'':'hidden'}><button type="button" class="secondary" data-bike-photo="replace">Foto ersetzen</button><button type="button" class="secondary" data-bike-photo="remove">Foto löschen</button></div>
 <div data-photo-upload ${b.photo?'hidden':''}><label>Foto hochladen / Fotoalbum<input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"></label><label>Foto mit Kamera aufnehmen<input name="bikeCameraPhoto" type="file" accept="image/*" capture="environment"></label><button type="button" class="small-button" data-bike-photo="keep" ${b.photo?'':'hidden'}>Bisheriges Foto beibehalten</button></div><p class="help">Ein aktuelles Foto · maximal 20 MB. Löschen und Ersetzen werden mit dem Fahrrad gespeichert.</p></fieldset>`;
}
function bindBikePhoto(form){
 const host=form.querySelector('#bikePhotoEditor');form.dataset.photoMode='keep';
 const release=()=>{if(form.bikePhotoURL){URL.revokeObjectURL(form.bikePhotoURL);form.bikePhotoURL=null;}};
 host.onclick=e=>{
  const action=e.target.closest('[data-bike-photo]')?.dataset.bikePhoto;if(!action)return;
  release();for(const field of host.querySelectorAll('input[type=file]'))field.value='';
  form.dataset.photoMode=action;
  host.querySelector('[data-photo-upload]').hidden=action==='keep';
  const image=host.querySelector('img');image.hidden=action==='remove'||!host.dataset.currentPhoto;
  if(host.dataset.currentPhoto)image.src='/api/files/'+host.dataset.currentPhoto;
  host.querySelector('[data-photo-actions]').hidden=action==='remove'||!host.dataset.currentPhoto;
 };
 host.onchange=e=>{
  if(e.target.type!=='file'||!e.target.files.length)return;
  const file=e.target.files[0];if(file.size>20*1024*1024){e.target.value='';toast('Maximal 20 MB pro Foto.');return;}
  for(const field of host.querySelectorAll('input[type=file]'))if(field!==e.target)field.value='';
  release();form.bikePhotoURL=URL.createObjectURL(file);
  const image=host.querySelector('img');image.src=form.bikePhotoURL;image.hidden=false;
 };
}
async function readBikePhoto(form,current){
 const album=form.elements.photo.files[0],camera=form.elements.bikeCameraPhoto.files[0];
 if(album&&camera)throw Error('Bitte genau ein Foto auswählen.');
 const file=album||camera;
 if(!file)return form.dataset.photoMode==='remove'?null:current||null;
 const saved=await upload(file);if(!saved.type.startsWith('image/'))throw Error('Bitte ein Foto auswählen.');return saved.id;
}
document.getElementById?.('modal')?.addEventListener('close',()=>{
 const form=document.getElementById('editor');if(form?.bikePhotoURL)URL.revokeObjectURL(form.bikePhotoURL);
});

const componentSpecifications={
 Schaltwerk:[['partNumber','Teilenummer']],
 Kassette:[['sprocketCount','Ritzelanzahl','1'],['sprocketRange','Abstufung Ritzel']],
 Kurbel:[['crankLength','Kurbelarmlänge (mm)','0.1'],['toothCount','Anzahl Zähne']],
 Kette:[['linkCount','Gliederanzahl','1']]
};
const powerMeterFields=[['powerManufacturer','Hersteller'],['powerModel','Modell'],['powerSerial','Seriennummer']];
const componentTypeName=name=>Object.keys(componentSpecifications).concat('Innenlager').find(type=>type.toLowerCase()===String(name).trim().toLowerCase());
const hasComponentSerial=name=>!['Kassette','Kurbel','Innenlager','Kette'].includes(componentTypeName(name));
function componentSpecificationFields(c){
 const type=componentTypeName(c.name);
 const field=([key,label,step],visible)=>`<div data-spec="${key}" ${visible?'':'hidden'}>${input(key,label,c[key],step?'number':'text',step?`min="${step}" step="${step}" max="10000"`:'maxlength="200"')}</div>`;
 return `<div data-spec="componentSerial" ${hasComponentSerial(c.name)?'':'hidden'}>${input('componentSerial','Seriennummer',c.serial,'text','maxlength="200"')}</div>
 ${Object.entries(componentSpecifications).flatMap(([name,fields])=>fields.map(spec=>field(spec,type===name))).join('')}
 <div data-spec="powerMeter" ${type==='Kurbel'?'':'hidden'}>${select('powerMeter','Powermeter',[['no','Nein'],['yes','Ja']],c.powerMeter?'yes':'no')}</div>
 <fieldset data-spec="powerDetails" class="supply-fieldset span2" ${type==='Kurbel'&&c.powerMeter?'':'hidden'}><legend>Powermeter</legend><div class="form-grid">${powerMeterFields.map(([key,label])=>input(key,label,c[key],'text','maxlength="200"')).join('')}</div></fieldset>`;
}
function updateComponentSpecifications(row){
 const type=componentTypeName(row.querySelector('[name="componentName"]').value);
 const keys=new Set((componentSpecifications[type]||[]).map(([key])=>key));
 if(hasComponentSerial(type))keys.add('componentSerial');
 if(type==='Kurbel'){
  keys.add('powerMeter');
  if(row.querySelector('[name="powerMeter"]').value==='yes')keys.add('powerDetails');
 }
 for(const group of row.querySelectorAll('[data-spec]')){
  group.hidden=!keys.has(group.dataset.spec);
  for(const control of group.querySelectorAll('input,select'))control.disabled=group.hidden;
 }
}
function readComponentSpecifications(value,name,prior){
 const type=componentTypeName(name);
 const fields={serial:hasComponentSerial(name)?value('componentSerial'):prior.serial??''};
 for(const [key,,step] of componentSpecifications[type]||[]){
  const raw=value(key).trim();fields[key]=step?(raw===''?null:Number(raw)):raw;
 }
 if(type==='Kurbel'){
  fields.powerMeter=value('powerMeter')==='yes';
  if(fields.powerMeter)for(const [key] of powerMeterFields)fields[key]=value(key).trim();
 }
 return fields;
}
function componentSpecificationsView(c){
 const type=componentTypeName(c.name);
 const fields=[...(hasComponentSerial(c.name)?[['Seriennummer',c.serial]]:[]),
  ...(componentSpecifications[type]||[]).map(([key,label])=>[label,c[key]])];
 if(type==='Kurbel'){
  fields.push(['Powermeter',c.powerMeter?'Ja':'Nein']);
  if(c.powerMeter)for(const [key,label] of powerMeterFields)fields.push(['Powermeter · '+label,c[key]]);
 }
 return fields.map(([label,value])=>`<div><small>${label}</small><span>${esc(value||'–')}</span></div>`).join('');
}
