const documentTypes=['Kaufvertrag','Servicevertrag','Leasingvertrag','Rechnung','Garantie','Werkstattanleitung','Sonstiges'];
const documentMime='application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';
const guide=id=>data.guides.find(g=>g.id===id);
const allDocuments=()=>[...data.documents,...data.unassignedDocuments,...data.guides.flatMap(g=>g.documents.map(d=>({...d,guideId:g.id})))];
const documentOwner=d=>d.guideId?'Anleitung · '+(guide(d.guideId)?.title||''):d.bikeId?bike(d.bikeId)?.name||'Fahrrad':'Ohne Zuordnung';
const recordRoute=(route,id)=>'#'+route+'/'+encodeURIComponent(id);
const fileLink=id=>'/api/files/'+encodeURIComponent(id);

function documentReferences(){
 const references=new Map();
 function add(rows,label,href,category='Sonstiges'){
  for(const doc of rows||[]){
   if(!doc?.fileId)continue;
   if(!references.has(doc.fileId))references.set(doc.fileId,[]);
   references.get(doc.fileId).push({doc,label,href,category});
  }
 }
 for(const b of data.bikes){
  const href=recordRoute('bike',b.id);
  add(b.attachments,'Fahrrad · '+b.name,href);
  if(b.photo)add([{fileId:b.photo}],'Fahrradfoto · '+b.name,href);
  const lease=data.documents.find(d=>d.id===b.leasing?.documentId);
  if(lease)add([lease],'Versicherung · '+b.name,href);
 }
 for(const s of data.inventory){
  const href=recordRoute('stock',s.id);
  add(s.datasheets,'Produktdatenblätter · '+s.name,href,'Produktdatenblatt');
  add(s.invoices,'Lagerartikel · '+s.name,href,'Rechnung');
  if(s.photo)add([{fileId:s.photo}],'Artikelfoto · '+s.name,href);
  for(const p of s.positions)add(p.invoices,'Lagerposition · '+s.name+' / '+p.label,href+'/'+encodeURIComponent(p.id),'Rechnung');
 }
 for(const p of data.shopping)add(p.invoices,'Einkauf · '+p.name,recordRoute('purchase',p.id),'Rechnung');
 for(const c of data.computers)if(c.photo)add([{fileId:c.photo}],'Radcomputerfoto · '+c.model,recordRoute('computer',c.id));
 for(const p of data.plans)add(p.attachments,'Serviceintervalle · '+p.title,recordRoute('plan',p.id));
 for(const h of data.history)add(h.attachments,'Servicebuch / Lebenslauf · '+h.title,recordRoute('entry',h.id));
 for(const c of data.contacts)add(c.documents,'Adressbuch · '+c.name,recordRoute('contact',c.id));
 for(const g of data.guides)add(g.attachments,'Anleitung · '+g.title,recordRoute('guide',g.id));
 for(const w of data.orders)add(w.attachments,'Werkstattauftrag · '+w.title,recordRoute('order',w.id));
 return references;
}

function syncDocumentCatalog(){
 const known=new Set(allDocuments().map(d=>d.fileId));
 for(const [fileId,uses] of documentReferences()){
  if(known.has(fileId))continue;
  const source=uses.find(use=>use.doc.name&&use.doc.size);
  if(!source)continue;
  const {doc,category}=source;
  data.unassignedDocuments.push({id:'file-'+fileId,fileId,title:doc.title||doc.name,name:doc.name,size:doc.size,mime:doc.mime||'',date:doc.date||'',category:doc.category||category});
 }
}

function documentPicker(existing=[],name='existingDocument',imagesOnly=false){
 const attached=new Set(existing.map(d=>typeof d==='string'?d:d.fileId));
 const choices=new Map();
 for(const d of allDocuments()){
  if(imagesOnly&&!(d.mime?d.mime.startsWith('image/'):/\.(jpe?g|png|webp|heic|heif)$/i.test(d.name)))continue;
  if(!choices.has(d.fileId))choices.set(d.fileId,d);
 }
 return `<details class="document-picker"><summary>Vorhandenes Dokument auswählen</summary>
 <label>Dokumentname<input type="search" data-document-filter placeholder="Nach Dokumentname suchen …"></label>
 <div class="document-options">${choices.size?[...choices.values()].map(d=>{
  const linked=attached.has(d.fileId);
  return `<label class="document-choice"><input type="${imagesOnly?'radio':'checkbox'}" name="${name}" value="${esc(d.fileId)}" ${linked?'disabled':''}>
  <span>${esc(d.title)} · ${esc(d.name)}${linked?' · Bereits verknüpft':''}</span></label>`;
 }).join(''):'<p class="help">Keine passenden Dokumente in der Ablage.</p>'}</div><p data-no-document hidden>Keine Treffer.</p></details>`;
}

function addExistingDocuments(f,existing=[],field='existingDocument'){
 const ids=new Set(f.getAll(field));
 const merged=new Map(existing.map(d=>[d.fileId,d]));
 for(const d of allDocuments()){
  if(ids.has(d.fileId)&&!merged.has(d.fileId)){
   merged.set(d.fileId,{fileId:d.fileId,name:d.name,size:d.size,mime:d.mime||''});
  }
 }
 return [...merged.values()];
}

async function readDocumentUploads(f,existing=[],{field='invoices',selection='existingDocument',remove='removeInvoice'}={}){
 const keep=existing.filter(d=>!f.getAll(remove).includes(d.fileId));
 const rows=addExistingDocuments(f,keep,selection);
 for(const file of f.getAll(field)){
  if(!file?.size)continue;
  const uploaded=await upload(file);
  rows.push({fileId:uploaded.id,name:uploaded.name,size:uploaded.size,mime:uploaded.type});
 }
 return rows;
}

function documentRow(d,allowAssignment=true,references=null){
 const refs=references?.get(d.fileId)||[];
 const ownerRoute=d.guideId?recordRoute('guide',d.guideId):d.bikeId?recordRoute('bike',d.bikeId):'';
 return `<div class="list-row"><span class="row-icon" aria-hidden="true">▤</span><div class="row-copy">
 <strong>${esc(d.title)}</strong><small>${ownerRoute?`<a href="${ownerRoute}">${esc(documentOwner(d))} ↗</a>`:esc(documentOwner(d))} · ${esc(d.category)} · ${date(d.date)}</small>
 <small>${esc(d.name)} · ${number(d.size/1024)} KB</small>
 ${refs.length?`<ul class="document-references">${[...new Map(refs.map(r=>[r.href,r])).values()].map(r=>`<li><a href="${esc(r.href)}">${esc(r.label)} ↗</a></li>`).join('')}</ul>`:''}</div>
 <div class="row-end actions"><a class="small-button" href="${fileLink(d.fileId)}" data-document-preview="${esc(d.title||d.name)}">Öffnen</a>
 ${allowAssignment?`<button class="small-button" data-action="document-assign" data-id="${esc(d.id)}">Bearbeiten</button>
 <button class="small-button" data-action="document-remove" data-id="${esc(d.id)}">Aus Ablage entfernen</button>`:''}</div></div>`;
}

let documentQuery='';
function documentsPage(){
 return heading('Dokumente','Dateien für Fahrräder, Werkstatt und Service verwalten.',`<button class="primary" data-action="document-new">＋ Dokument hinzufügen</button>`)+
 `<div class="filters"><label class="document-search">Dokumente durchsuchen<input type="search" id="documentSearch" value="${esc(documentQuery)}" placeholder="Titel, Datei, Fahrrad oder Anleitung"></label></div>
 <div class="panel" id="documentResults" aria-live="polite">${documentResults()}</div>`;
}

function documentResults(){
 const terms=documentQuery.trim().toLocaleLowerCase('de').split(/\s+/);
 const rows=allDocuments(),references=documentReferences();
 const visible=rows.filter(d=>{
  const keywords=[d.title,d.name,d.category,documentOwner(d),...(references.get(d.fileId)||[]).map(r=>r.label)].join(' ').toLocaleLowerCase('de');
  return terms.every(term=>keywords.includes(term));
 });
 return visible.length?visible.map(d=>documentRow(d,true,references)).join(''):rows.length?
  empty('Keine Dokumente gefunden.','Versuche einen anderen Suchbegriff.'):
  empty('Deine Dokumente bekommen einen festen Platz.','Lade PDF-Dateien oder Fotos hoch. Eine Zuordnung ist optional.');
}

function guidesPage(id){
 const guides=id?data.guides.filter(g=>encodeURIComponent(g.id)===id):data.guides;
 return (id?'<a class="back" href="#guides">← Anleitungen</a>':'')+
 heading('Anleitungen','Werkstattanleitungen und die zugehörigen Dokumente.',`<button class="primary" data-action="guide-new">＋ Anleitung anlegen</button>`)+
 (guides.length?`<div class="guide-list">${guides.map(g=>`<section class="panel"><div class="list-row"><div class="row-copy"><h2><a href="${recordRoute('guide',g.id)}">${esc(g.title)}</a></h2><small>${g.documents.length+(g.attachments||[]).length} Dokumente</small></div>
 <button class="secondary" data-action="guide-document" data-id="${esc(g.id)}">＋ Dokument</button>
 <button class="secondary" data-action="guide-links" data-id="${esc(g.id)}">Verknüpfungen bearbeiten</button></div>
 ${g.documents.map(d=>documentRow({...d,guideId:g.id})).join('')}
 <div class="receipt-links">${receiptLinks(g.attachments)}</div></section>`).join('')}</div>`:
 empty('Hier entsteht deine Werkstattablage.','Lege eine Anleitung an und ordne ihr Dokumente zu.'));
}

function newGuide(){
 modal('Anleitung anlegen',input('title','Titel','','text','required maxlength="200"'),async f=>{
  const title=f.get('title').trim();
  if(!title)throw Error('Bitte gib einen Titel ein.');
  if(await mutate(()=>data.guides.push({id:uid(),title,documents:[]}))){
   closeModal();toast('Anleitung angelegt.');
  }
 });
}

function editGuideLinks(id){
 const g=guide(id);
 if(!g)return;
 modal('Verknüpfungen · '+g.title,receiptEditor(g.attachments||[],'Dokumente',g.documents),async f=>{
  const attachments=await readReceipts(f,g.attachments||[]);
  if(await mutate(()=>{g.attachments=attachments;}))closeModal();
 });
}

function guideLinks(ids=[]){
 return ids.map(id=>guide(id)).filter(Boolean).map(g=>`<a class="small-button" href="${recordRoute('guide',g.id)}">▤ ${esc(g.title)} ↗</a>`).join(' ');
}

function guidePicker(ids=[]){
 return `<fieldset class="supply-fieldset"><legend>Werkstattanleitungen</legend>${data.guides.length?data.guides.map(g=>`<label class="document-choice"><input type="checkbox" name="guideIds" value="${esc(g.id)}" ${ids.includes(g.id)?'checked':''}> ${esc(g.title)}</label>`).join(''):'<p class="help">Anleitungen kannst du in der Werkstatt anlegen.</p>'}</fieldset>`;
}

function documentDestination(value){
 if(!value)return {};
 const separator=value.indexOf(':');
 const kind=value.slice(0,separator),id=value.slice(separator+1);
 if(kind==='bike'&&bike(id))return {bikeId:id};
 if(kind==='guide'&&guide(id))return {guideId:id};
 throw Error('Wähle ein vorhandenes Fahrrad oder eine Werkstattanleitung aus.');
}

function destinationSelect(selected){
 return select('destination','Zuordnung',[
  ['','Ohne Zuordnung'],
  ...data.bikes.map(b=>['bike:'+b.id,'Fahrrad · '+b.name]),
  ...data.guides.map(g=>['guide:'+g.id,'Anleitung · '+g.title])
 ],selected);
}

function putDocument(doc,{bikeId,guideId}){
 const record={...doc};
 delete record.guideId;
 delete record.bikeId;
 if(guideId)guide(guideId).documents.push(record);
 else if(bikeId)data.documents.push({...record,bikeId});
 else data.unassignedDocuments.push(record);
}

function removeDocument(id,keepBikeId=''){
 data.documents=data.documents.filter(d=>d.id!==id);
 data.unassignedDocuments=data.unassignedDocuments.filter(d=>d.id!==id);
 for(const g of data.guides)g.documents=g.documents.filter(d=>d.id!==id);
 for(const b of data.bikes)if(b.id!==keepBikeId&&b.leasing?.documentId===id)b.leasing.documentId='';
}

function deleteCatalogDocument(id){
 const doc=allDocuments().find(d=>d.id===id);
 if(!doc)return;
 if(documentReferences().has(doc.fileId)){toast('Dieses Dokument ist verknüpft. Entferne zuerst die Zuordnungen am jeweiligen Eintrag.');return;}
 return mutate(()=>removeDocument(id));
}

function documentTypeInput(value){
 const types=[...new Set([...documentTypes,...data.documentTypes,...allDocuments().map(d=>d.category).filter(Boolean)])];
 return input('category','Dokumenttyp auswählen oder eingeben',value,'text','required maxlength="200" list="document-types"')+
 `<datalist id="document-types">${types.map(type=>`<option value="${esc(type)}"></option>`).join('')}</datalist>`;
}

function rememberDocumentType(category){
 if(!documentTypes.includes(category)&&!data.documentTypes.includes(category))data.documentTypes.push(category);
}

function destinationDocuments(value){
 const {bikeId,guideId}=documentDestination(value);
 if(bikeId)return [...data.documents.filter(d=>d.bikeId===bikeId),...(bike(bikeId).attachments||[])];
 if(guideId)return [...guide(guideId).documents,...(guide(guideId).attachments||[])];
 return [];
}

function newDocument(bikeId,guideId){
 const selected=guideId?'guide:'+guideId:bikeId?'bike:'+bikeId:'';
 modal('Dokument ablegen',`<p class="help">PDF, JPG, PNG, WebP oder HEIC · Maximal 20 MB.</p><div class="form-grid">
 ${destinationSelect(selected)}${documentTypeInput(guideId?'Werkstattanleitung':'Sonstiges')}
 ${input('title','Bezeichnung','','text','maxlength="200"')}${input('date','Datum',today(),'date','required')}
 <label class="span2">Datei<input type="file" name="file" accept="${documentMime}"></label></div>
 <div id="destination-document-picker">${documentPicker(destinationDocuments(selected))}</div>`,async f=>{
  const destination=documentDestination(f.get('destination')),file=f.get('file'),title=f.get('title').trim(),category=f.get('category').trim();
  const existing=addExistingDocuments(f).filter(d=>!destinationDocuments(f.get('destination')).some(x=>x.fileId===d.fileId));
  if(!file?.size&&!existing.length)throw Error('Bitte lade eine Datei hoch oder wähle ein vorhandenes Dokument aus.');
  if(existing.length&&!destination.bikeId&&!destination.guideId)throw Error('Wähle ein Fahrrad oder eine Anleitung für die vorhandenen Dokumente aus.');
  if(file?.size&&(!title||!category))throw Error('Bitte Bezeichnung und Dokumenttyp für die neue Datei angeben.');
  const result=file?.size?await upload(file):null;
  if(await mutate(()=>{
   if(result){
    putDocument({id:uid(),category,title,date:f.get('date'),fileId:result.id,name:result.name,size:result.size,mime:result.type},destination);
    rememberDocumentType(category);
   }
   if(existing.length){
    const item=destination.bikeId?bike(destination.bikeId):guide(destination.guideId);
    item.attachments=[...(item.attachments||[]),...existing];
   }
  })){closeModal();toast('Dokumente gespeichert.');}
 });
 $('#editor [name="destination"]').addEventListener('change',e=>{
  $('#destination-document-picker').innerHTML=documentPicker(destinationDocuments(e.target.value));
 });
}

function assignDocument(id){
 const doc=allDocuments().find(d=>d.id===id);
 if(!doc)return;
 modal('Dokument bearbeiten',`<div class="form-grid">${destinationSelect(doc.guideId?'guide:'+doc.guideId:doc.bikeId?'bike:'+doc.bikeId:'')}
 ${documentTypeInput(doc.category)}${input('title','Bezeichnung',doc.title,'text','required maxlength="200"')}</div>`,async f=>{
  const destination=documentDestination(f.get('destination')),category=f.get('category').trim(),title=f.get('title').trim();
  if(!category||!title)throw Error('Bitte Dokumenttyp und Bezeichnung angeben.');
  if(await mutate(()=>{
   removeDocument(id,destination.bikeId);
   const target=destination.bikeId?bike(destination.bikeId):guide(destination.guideId);
   if(target?.attachments)target.attachments=target.attachments.filter(a=>a.fileId!==doc.fileId);
   putDocument({...doc,category,title},destination);
   rememberDocumentType(category);
  })){closeModal();toast('Dokument gespeichert.');}
 });
}

document.addEventListener('input',e=>{
 if(e.target.id==='documentSearch'){
  documentQuery=e.target.value;
  $('#documentResults').innerHTML=documentResults();
 }
 if(!e.target.matches('[data-document-filter]'))return;
 const picker=e.target.closest('.document-picker'),query=e.target.value.trim().toLocaleLowerCase('de');
 const rows=[...picker.querySelectorAll('.document-choice')];
 for(const row of rows)row.hidden=!row.textContent.toLocaleLowerCase('de').includes(query);
 picker.querySelector('[data-no-document]').hidden=!rows.length||rows.some(row=>!row.hidden);
});

async function readImage(f,file,current){
 const existing=f.get('existingPhoto');
 if(file?.size&&existing)throw Error('Wähle entweder ein vorhandenes Bild oder eine neue Datei aus.');
 if(!file?.size)return existing||current;
 const saved=await upload(file);
 if(!saved.type.startsWith('image/'))throw Error('Bitte eine Bilddatei auswählen.');
 return saved.id;
}

function planDetail(id){
 const plan=data.plans.find(p=>encodeURIComponent(p.id)===id);
 return '<a class="back" href="#service">← Serviceintervalle</a>'+
  (plan?heading(esc(plan.title),'Serviceintervall für '+esc(bike(plan.bikeId)?.name||'Fahrrad'))+`<div class="panel">${serviceRow(plan)}${plan.notes?`<p class="history-note">${esc(plan.notes)}</p>`:''}</div>`:
   empty('Serviceintervalle nicht gefunden.','Wähle ein Intervall aus der Übersicht.'));
}

function historyDetail(id){
 const entry=data.history.find(h=>encodeURIComponent(h.id)===id);
 return '<a class="back" href="#history">← Servicebuch</a>'+
  (entry?heading(esc(entry.title),'Wartung · '+esc(bike(entry.bikeId)?.name||'Fahrrad'))+`<div class="panel">${historyRow(entry)}</div>`:
   empty('Wartung nicht gefunden.','Wähle einen Eintrag aus dem Servicebuch.'));
}

function purchaseDetail(id){
 const purchase=data.shopping.find(p=>encodeURIComponent(p.id)===id);
 return '<a class="back" href="#service">← Serviceintervalle und Einkauf</a>'+
  (purchase?heading(esc(purchase.name),'Einkauf und Material')+`<div class="panel">${purchaseRow(purchase)}</div>`:
   empty('Einkaufsartikel nicht gefunden.','Wähle einen Artikel aus der Einkaufsliste.'));
}
