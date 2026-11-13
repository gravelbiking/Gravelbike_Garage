const workshopOrder=id=>data.orders.find(o=>o.id===id);
const orderType=o=>o.type==='service'?'Service':'Reparatur';
const orderBike=o=>bike(o.bikeId)?.name||o.externalBike;
const orderLink=o=>recordRoute('order',o.id);

function ordersPage(){
 const orders=data.orders.slice().reverse();
 return heading('Werkstattaufträge','Service und Reparaturen für eigene und fremde Fahrräder.',
  '<button class="primary" data-action="order-new">＋ Auftrag anlegen</button>')+
  (orders.length?`<div class="panel">${orders.map(o=>`<a class="list-row" href="${orderLink(o)}"><div class="row-copy"><strong>${esc(o.title)}</strong><small>${esc(orderType(o))} · ${esc(orderBike(o))} · ${orderState(o)}</small></div><span>${o.steps.filter(s=>s.done).length} / ${o.steps.length} Schritte ↗</span></a>`).join('')}</div>`:
  empty('Noch keine Aufträge.','Lege einen Auftrag für die nächste Arbeit in deiner Werkstatt an.'));
}

const orderLocked=order=>Boolean(order.completedAt||order.cancelledAt);
const orderState=order=>order.completedAt?'Abgeschlossen':order.cancelledAt?'Abgebrochen':order.pausedAt?'Pausiert':'Offen';
const orderCategories=()=>[['none','Alle Bauteile'],...Object.keys(componentCategories()).map(name=>[name,name])];

function editOrder(id,planId='',focusStep,tireTarget,draft){
 if(!id&&!tireTarget&&!draft)return startOrderWizard(planId);
 const existing=workshopOrder(id);
 if(existing&&orderLocked(existing))return;
 const plan=data.plans.find(p=>p.id===planId);
 const bikeId=tireTarget?.bikeId||plan?.bikeId||activeBikes()[0]?.id||'';
 const o=structuredClone(draft?.order||existing||{
  id:uid(),type:bikeId?'service':'repair',bikeId,externalBike:'',title:plan?.title||'',description:'',
  steps:plan?.notes?[{id:uid(),title:plan.notes.slice(0,200),done:false,guideIds:plan.guideIds?.slice(0,1)||[]}]:[],
  attachments:[],guideIds:plan?.guideIds||[],
  parts:plan?data.shopping.filter(p=>p.planId===plan.id&&p.quantity>p.usedQuantity).map(p=>({
   id:uid(),inventoryId:p.inventoryId||'',name:p.name,unit:p.unit,quantity:quantity(p.quantity-p.usedQuantity)
  })):[]
 });
 if(tireTarget){o.title='Reifen ausbauen';o.steps=[{id:uid(),title:'Reifen ausbauen / wechseln',category:'Reifen',componentKey:tireTarget.key,guideIds:[],done:false}];o.replacementKeys=[tireTarget.key];}
 // Keep earlier free-text work and attachments in existing records.
 if(!o.steps.length&&o.description)o.steps.push({id:uid(),title:o.description.slice(0,200),done:false,guideIds:[]});
 const choices=data.bikes.filter(b=>!b.archived||b.id===o.bikeId);
 modal(existing?'Werkstattauftrag bearbeiten':'Werkstattauftrag anlegen',draft?.html||`<div class="form-grid">
 ${select('type','Auftragstyp',[['service','Service'],['repair','Reparatur']],o.type)}
 ${select('bikeId','Fahrrad',[['','Fremdes Fahrrad'],...choices.map(b=>[b.id,b.name])],o.bikeId)}
 ${input('externalBike','Fremdes Fahrrad beschreiben',o.externalBike,'text','maxlength="200"')}
 ${input('title','Auftragskurzbezeichnung',o.title,'text','required maxlength="200"')}</div>
 <div data-order-steps></div><button type="button" class="primary" data-add-work-step>＋ Weiterer Arbeitsschritt</button>
 <div data-order-loose-parts></div>`,async f=>{
  const editor=$('#editor'),type=f.get('type'),bikeId=f.get('bikeId');
  const externalBike=bikeId?'':f.get('externalBike').trim(),title=f.get('title').trim();
  if(!title)throw Error('Bitte gib dem Auftrag eine Kurzbezeichnung.');
  if(bikeId&&!bike(bikeId))throw Error('Das ausgewählte Fahrrad ist nicht mehr vorhanden.');
  if(!bikeId&&!externalBike)throw Error('Beschreibe das fremde Fahrrad kurz.');
  const rows=[...editor.querySelectorAll('[data-work-step]')];
  const parts=[...editor.querySelectorAll('[data-draft-part]')].map(row=>readOrderDraftPart(row,o)).filter(Boolean);
  const steps=rows.flatMap(row=>{
   const previous=o.steps.find(step=>step.id===row.dataset.workStep);
   const title=row.querySelector('[data-step-title]').value.trim();
   const componentKey=row.querySelector('[data-step-component]').value;
   const guideId=row.querySelector('[data-step-guide]').value;
   if(!title){
    if(row.hasAttribute('data-empty-step')&&!componentKey&&!guideId&&!parts.some(part=>part.stepId===row.dataset.workStep))return [];
    throw Error('Bitte alle Arbeitsschritte benennen.');
   }
   const guideIds=guideId===previous?.guideIds?.[0]?previous.guideIds:(guideId?[guideId]:[]);
   const done=Boolean(previous?.done&&previous.title===title&&(previous.componentKey||'')===componentKey&&
    JSON.stringify(previous.guideIds||[])===JSON.stringify(guideIds));
   return {id:row.dataset.workStep,title,done,category:row.querySelector('[data-step-category]').value,componentKey,guideIds};
  });
  const allowed=new Set(plannedOrderComponents(bike(bikeId)).map(row=>row.key));
  const replacementKeys=[...new Set([...(bikeId===o.bikeId?(o.replacementKeys||[]).filter(key=>!o.steps.some(step=>step.componentKey===key)):[]),
   ...steps.map(step=>step.componentKey)].filter(key=>key&&allowed.has(key)))];
  const updated={...o,type,bikeId,externalBike,title,steps,parts,componentCategories:[],replacementKeys};
  if(await mutate(()=>{
   if(existing)data.orders=data.orders.map(x=>x.id===id?updated:x);
   else data.orders.push(updated);
  })){closeModal();location.hash=orderLink(updated);toast('Werkstattauftrag gespeichert.');}
 });
 const editor=$('#editor'),host=editor.querySelector('[data-order-steps]');editor.orderDraft=o;
 const renumberSteps=()=>[...host.children].forEach((row,index)=>{
  row.querySelector('legend').textContent='Arbeitsschritt '+(index+1);
 });
 const addStep=(step={id:uid(),title:'',guideIds:[]},prefill=true,optional=false)=>{
  const parts=o.parts.filter(part=>part.stepId===step.id);
  if(prefill&&!parts.length)parts.push({id:uid(),quantity:1,placeholder:true});
  host.insertAdjacentHTML('beforeend',orderDraftStep(step,parts,optional));
  updateDraftComponents(host.lastElementChild,editor.elements.bikeId.value,step.componentKey);
  renumberSteps();
  return host.lastElementChild;
 };
 if(!draft)o.steps.forEach(step=>addStep(step,!existing));
 if(!draft&&!existing&&!o.steps.length)addStep(undefined,true,true);
 const loose=o.parts.filter(part=>!part.stepId||!o.steps.some(step=>step.id===part.stepId));
 const looseHost=editor.querySelector('[data-order-loose-parts]');
 if(!draft&&loose.length)looseHost.innerHTML=`<fieldset class="supply-fieldset"><legend>Allgemeine Ersatzteile</legend><div data-draft-parts>${loose.map(orderDraftPart).join('')}</div></fieldset>`;
 const updateBike=()=>{
  const external=editor.elements.externalBike,isExternal=!editor.elements.bikeId.value;
  external.closest('label').hidden=!isExternal;external.required=isExternal;
  for(const row of host.children)updateDraftComponents(row,editor.elements.bikeId.value);
 };
 editor.elements.bikeId.addEventListener('change',updateBike);
 updateBike();
 editor.addEventListener('change',e=>{
  const target=e.target;
  if(target.matches('[data-step-category]'))updateDraftComponents(target.closest('[data-work-step]'),editor.elements.bikeId.value);
  if(target.matches('[data-part-stock]')){
   const row=target.closest('[data-draft-part]');
   if(target.value==='@new'){
    target.value=target.dataset.previous||'';
    createOrderStock(row,editor);
   }else refreshDraftPosition(row);
  }
 });
 editor.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.matches('[data-add-work-step]'))addStep().querySelector('[data-step-title]').focus();
  if(button.matches('[data-remove-work-step]')){const row=button.closest('[data-work-step]');if(row.querySelector('[data-draft-part]')&&!confirm('Arbeitsschritt einschließlich seiner Ersatzteilzuordnungen entfernen?'))return;row.remove();renumberSteps();}
  if(button.matches('[data-add-step-part]')){
   const parts=button.closest('[data-work-step]').querySelector('[data-draft-parts]');
   parts.insertAdjacentHTML('beforeend',orderDraftPart({id:uid(),quantity:1}));
   parts.lastElementChild.querySelector('[data-part-stock]').focus();
  }
  if(button.matches('[data-remove-draft-part]'))button.closest('[data-draft-part]').remove();
 });
 if(focusStep!==undefined){
  const row=focusStep?Array.from(host.children).find(el=>el.dataset.workStep===focusStep):addStep();
  row?.querySelector('[data-step-title]').focus();
 }
}
function orderDraftStep(step,parts,optional=false){
 const locked=parts.some(part=>part.booking);
 return `<fieldset class="order-draft-step" data-work-step="${esc(step.id)}" ${optional?'data-empty-step':''}><legend>Arbeitsschritt</legend>
 <div class="form-grid"><label class="span2">Geplante Arbeiten<input data-step-title ${optional?'':'required'} maxlength="200" value="${esc(step.title)}"></label>
 ${select('orderCategory','Kategorie',orderCategories(),step.category||'none').replace('<select ','<select data-step-category ')}
 <label>Verbautes Bauteil<select data-step-component></select></label></div>
 <div data-draft-parts>${parts.map(orderDraftPart).join('')}</div>
 <div class="supply-actions"><button type="button" class="primary" data-add-step-part>＋ Weitere Ersatzteile</button></div>
 <label>Werkstattanleitung<select data-step-guide>${stepGuideOptions('',step.guideIds?.[0]||'').options}</select></label>
 <div class="supply-actions">${locked?'':'<button type="button" class="small-button" data-remove-work-step>Arbeitsschritt entfernen</button>'}</div></fieldset>`;
}
function updateDraftComponents(row,bikeId,previous){
 const select=row.querySelector('[data-step-component]');
 const key=previous??select.value;
 const category=row.querySelector('[data-step-category]').value;
 select.innerHTML='<option value="">Kein Bauteil</option>'+plannedOrderComponents(bike(bikeId),[category]).map(({key:id,component})=>
  `<option value="${esc(id)}" ${key===id?'selected':''}>${esc([component.manufacturer,component.name,component.serial].filter(Boolean).join(' · '))}</option>`).join('');
 select.disabled=!bikeId;
}
function orderStockOptions(selected=''){
 return '<option value="">Ohne Lagerzuordnung</option>'+data.inventory.map(s=>
  `<option value="${esc(s.id)}" ${s.id===selected?'selected':''}>${esc([s.manufacturer,s.name,s.articleNumber].filter(Boolean).join(' · '))}</option>`).join('')+
  '<option value="@new">Neues Ersatzteil jetzt anlegen</option>';
}
function orderPositionOptions(item,selected=''){
 return '<option value="">Lagerposition auswählen</option>'+(item?.positions||[]).map(p=>
  `<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.location||'Lagerort offen')} · ${esc(p.label)} · ${amount(p.quantity)} ${esc(item.unit)}</option>`).join('');
}
function orderDraftPart(part){
 if(part.booking)return `<p data-draft-part="${esc(part.id)}">${esc(part.name)} · ${amount(part.quantity)} ${esc(part.unit)} · bereits ausgebucht</p>`;
 return `<div class="form-grid order-draft-part" data-draft-part="${esc(part.id)}" ${part.placeholder?'data-empty-part':''}>
 <label>Ersatzteil<select data-part-stock data-previous="${esc(part.inventoryId||'')}">${orderStockOptions(part.inventoryId)}</select></label>
 <label>Lagerposition<select data-part-position>${orderPositionOptions(stockItem(part.inventoryId),part.positionId)}</select></label>
 <label>Teilname ohne Lagerzuordnung<input data-part-name maxlength="200" value="${esc(part.name||'')}"></label>
 ${select('partUnit','Einheit',supplyUnits,part.unit||'Stück').replace('<select ','<select data-part-unit ')}
 <label ${stockItem(part.inventoryId)?.category==='Reifen'?'':'hidden'}>Position beim Wiedereinbau eines Reifens<select data-tire-position><option value="Vorderreifen" ${part.tirePosition==='Vorderreifen'?'selected':''}>Vorderrad</option><option value="Hinterreifen" ${part.tirePosition==='Hinterreifen'?'selected':''}>Hinterrad</option></select></label>
 <label>Menge<input data-part-quantity type="number" required min="0.001" max="100000000" step="0.001" value="${esc(part.quantity)}"></label>
 <button type="button" class="small-button" data-remove-draft-part>Ersatzteil entfernen</button></div>`;
}
function refreshDraftPosition(row){
 const stock=row.querySelector('[data-part-stock]');
 stock.dataset.previous=stock.value;
 const item=stockItem(stock.value);
 row.querySelector('[data-tire-position]').closest('label').hidden=item?.category!=='Reifen';
 row.querySelector('[data-part-position]').innerHTML=orderPositionOptions(item,item?.positions.length===1?item.positions[0].id:'');
}
function readOrderDraftPart(row,order){
 const id=row.dataset.draftPart,previous=order.parts.find(part=>part.id===id);
 if(previous?.booking)return previous;
 const item=stockItem(row.querySelector('[data-part-stock]').value);
 const name=item?.name||row.querySelector('[data-part-name]').value.trim();
 const rawCount=row.querySelector('[data-part-quantity]').value;
 const unit=item?.unit||row.querySelector('[data-part-unit]').value;
 if(row.hasAttribute('data-empty-part')&&!item&&!name&&rawCount==='1'&&unit==='Stück')return null;
 const count=quantity(rawCount);
 if(!name||!count)throw Error('Bitte alle Ersatzteile benennen und eine positive Menge angeben.');
 const positionId=row.querySelector('[data-part-position]').value;
 const updated={...previous,id,stepId:row.closest('[data-work-step]')?.dataset.workStep||'',inventoryId:item?.id||'',positionId,
  name,unit,quantity:count,tirePosition:row.querySelector('[data-tire-position]').value};
 updated.procurement=item?'':previous?.procurement||'';
 if(item&&previous?.inventoryId!==item.id)for(const field of ['manufacturer','model','articleNumber','serial'])delete updated[field];
 updated.available=Boolean(previous?.available&&previous.inventoryId===updated.inventoryId&&
  (previous.positionId||'')===positionId&&previous.quantity===count&&previous.name===name&&previous.unit===updated.unit);
 return updated;
}
function createOrderStock(row,editor){
 const item=newStockItem(),dialog=document.createElement('dialog');
 dialog.className='order-stock-dialog';
 dialog.innerHTML=`<form><h2>Neues Ersatzteil jetzt anlegen</h2>${stockEditorFields(item)}
 <p class="form-error" role="alert"></p><div class="form-footer"><button type="button" class="secondary" data-cancel-stock>Abbrechen</button>
 <button type="submit" class="primary">Lagerartikel anlegen</button></div></form>`;
 document.body.append(dialog);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.querySelector('[data-cancel-stock]').onclick=()=>dialog.close();
 dialog.querySelector('form').onsubmit=async e=>{
  e.preventDefault();
  const form=e.currentTarget,fields=new FormData(form),unlock=lockEditor(form);
  try{
   const updated=await readStockEditor(fields,item);
   if(!await mutate(()=>data.inventory.push(updated)))return;
   for(const select of editor.querySelectorAll('[data-part-stock]')){
    const selected=select===row.querySelector('[data-part-stock]')?updated.id:select.value;
    select.innerHTML=orderStockOptions(selected);
   }
   refreshDraftPosition(row);dialog.close();
  }catch(error){garageRuntime.log(error,'workshop-form');form.querySelector('.form-error').textContent=error.message;}
  finally{unlock();}
 };
 dialog.showModal();
}

function orderDashboard(id){
 const o=data.orders.find(w=>encodeURIComponent(w.id)===id);
 if(!o)return '<a class="back" href="#orders">← Werkstattaufträge</a>'+empty('Auftrag nicht gefunden.','Wähle einen Auftrag aus der Liste.');
 const next=o.steps.find(s=>!s.done);
 const previous=document.querySelector('[data-workshop-order]');
 const expanded=new Set(previous?.dataset.workshopOrder===o.id
  ?[...previous.querySelectorAll('details[data-order-guide][open]')].map(el=>el.dataset.orderGuide):[]);
 const locked=orderLocked(o);
 const action=(key,label,item='',style='small-button')=>locked?'':`<button class="${style}" data-action="${key}" data-id="${esc(o.id)}" data-item-id="${esc(item)}">${label}</button>`;
 return '<a class="back" href="#orders">← Werkstattaufträge</a>'+
  heading(esc(o.title),esc(orderType(o)+' · '+orderBike(o)),`<span class="badge">${orderState(o)}</span>`+action('order-edit','Auftrag bearbeiten'),'WERKSTATTAUFTRAG')+
  `<div class="order-dashboard" data-workshop-order="${esc(o.id)}">
   <section class="panel order-section"><h2>Auftrag</h2><p>${esc(o.title)}</p>${o.plannedDate?`<p>Geplante Durchführung: ${date(o.plannedDate)}</p>`:''}</section>
   ${orderReplacementView(o)}
   <section class="panel order-section"><h2>Allgemeine Ersatzteile</h2>
   ${o.parts.some(part=>!part.stepId)?o.parts.filter(part=>!part.stepId).map(part=>orderPartRow(o,part)).join(''):'<p class="help">Keine allgemeinen Ersatzteile. Zugeordnete Teile stehen direkt bei ihren Arbeitsschritten.</p>'}</section>
   <section class="panel order-section"><div class="section-title"><h2>Arbeitsschritte</h2>${action('order-step','＋ Arbeitsschritt hinzufügen')}</div>
   ${orderGuides(o.guideIds,'',expanded)}
   ${o.description&&!o.steps.length?`<p class="order-description">${esc(o.description)}</p>`:''}
   <p class="help">${next?'Als Nächstes · '+esc(next.title):o.steps.length?'Alle Arbeitsschritte sind erledigt.':'Hier erscheinen die geplanten Arbeiten.'}</p>
   <ol class="order-steps">${o.steps.map(step=>`<li class="${step===next?'order-next':''}">
    <div class="list-row"><div class="row-copy"><strong>${esc(step.title)}</strong>
    <small>${esc(orderReplacementRows(o).find(row=>row.key===step.componentKey)?.component.name||'')}</small></div>
    ${orderCheckbox(o,step,'step','Erledigt',step.title,step.done)}${action('order-step','Bearbeiten',step.id)}</div>
    <h3>Ersatzteile für diesen Arbeitsschritt</h3>${o.parts.filter(part=>part.stepId===step.id).map(part=>orderPartRow(o,part)).join('')||'<p class="help">Keine Ersatzteile zugeordnet.</p>'}
    ${orderGuides(step.guideIds,step.id,expanded)}</li>`).join('')}</ol></section>
   ${o.workLog?.length?`<section class="panel order-section"><h2>Auftragsverlauf</h2>${o.workLog.map(event=>`<p><strong>${esc(event.date)} · ${workEventLabel[event.action]}</strong>${event.comment?' · '+esc(event.comment):''}</p>`).join('')}</section>`:''}
   ${locked?'':`<div class="supply-actions">${action('order-complete','Auftrag abschließen','','primary')}
    ${o.pausedAt?action('order-resume','Auftrag fortsetzen','','secondary'):action('order-pause','Auftrag pausieren','','secondary')}
    ${action('order-cancel','Auftrag abbrechen','','danger')}</div>`}
  </div>`;
}
const workEventLabel={complete:'Abgeschlossen',pause:'Pausiert',cancel:'Abgebrochen',resume:'Fortgesetzt'};

function orderGuides(ids=[],stepId,expanded){
 return ids.map(guide).filter(Boolean).map(g=>{
  const key=JSON.stringify([stepId,g.id]);
  const files=[...new Map([...g.documents,...(g.attachments||[])].map(file=>[file.fileId,file])).values()];
  return `<details class="order-guide" data-order-guide="${esc(key)}" ${expanded.has(key)?'open':''}>
   <summary>${esc(g.title)} anzeigen</summary>
   ${files.length?`<div class="receipt-links">${receiptLinks(files)}</div>`:'<p class="help">Zu dieser Anleitung sind keine Dateien hinterlegt.</p>'}
  </details>`;
 }).join('');
}

function orderCheckbox(order,item,kind,label,name,checked){
 return `<label class="document-choice order-check"><input type="checkbox"
  data-order-check="${kind}" data-order-id="${esc(order.id)}" data-item-id="${esc(item.id)}"
  aria-label="${label} · ${esc(name)}" ${orderLocked(order)||item.booking?'disabled':''} ${checked?'checked':''}> ${label}</label>`;
}

function orderPartRow(o,part){
 const item=stockItem(part.inventoryId),position=item?.positions.find(p=>p.id===part.positionId);
 const name=item?.name||part.name;
 const location=part.booking?part.booking.location:position?.location|| (item?stockLocations(item).join(', '):'');
 const step=o.steps.find(step=>step.id===part.stepId);
 const photo=item?.photo?`<img width="640" height="400" class="order-part-photo" src="/api/files/${esc(item.photo)}" alt="${esc(name)}">`:'';
 return `<div class="list-row order-part">${photo}<div class="row-copy">
 <strong>${esc([item?.manufacturer||part.manufacturer,name].filter(Boolean).join(' '))}</strong>
 <small>Artikelnummer · ${esc(item?.articleNumber||part.articleNumber||'na')}</small>
 <small>Menge · ${amount(part.quantity)} ${esc(part.unit)}</small>
 <small>${part.procurement==='external'?'Extern beschafft – ohne Einlagerung':'Lagerort · '+esc(location||'na')}${step?' · '+esc(step.title):''}</small>
 ${item?`<button class="small-button" type="button" data-order-stock-preview="${esc(item.id)}">Lagerartikel als Vorschau öffnen ↗</button>`:''}
 ${part.booking?'<small>Ausgebucht</small>':item&&((position?.quantity??item.quantity)<part.quantity)?'<small class="stock-low">Lagerbestand reicht nicht</small>':''}</div>
 ${orderCheckbox(o,part,'part','Vorhanden',name,part.available)}</div>`;
}
function showOrderStockPreview(item,trigger){
 const dialog=document.createElement('dialog');
 dialog.className='order-stock-dialog';
 dialog.innerHTML=`<h2>Lagerartikel · ${esc(item.name)}</h2>${stockCard(item,{preview:true})}
 <button type="button" class="secondary" data-return-order>← Zurück zum Werkstattauftrag</button>`;
 document.body.append(dialog);
 dialog.querySelector('[data-return-order]').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{dialog.remove();trigger.focus();},{once:true});
 dialog.showModal();
}
function stepGuideOptions(query='',selected=''){
 const terms=query.trim().toLocaleLowerCase('de').split(/\s+/);
 const matches=data.guides.filter(g=>terms.every(term=>g.title.toLocaleLowerCase('de').includes(term)));
 const current=guide(selected);
 const choices=current&&!matches.includes(current)?[current,...matches]:matches;
 return {
  count:matches.length,
  options:'<option value="">Anleitung auswählen</option>'+choices.map(g=>
   `<option value="${esc(g.id)}" ${g.id===selected?'selected':''}>${esc(g.title)}</option>`).join('')
 };
}

function editOrderStep(id,stepId){editOrder(id,'',stepId||'');}

document.addEventListener('change',async e=>{
 const control=e.target;
 const {orderCheck,orderId,itemId}=control.dataset;
 if(orderCheck!=='part'&&orderCheck!=='step')return;
 const order=workshopOrder(orderId),isPart=orderCheck==='part';
 const item=(isPart?order?.parts:order?.steps)?.find(row=>row.id===itemId);
 if(!item||orderLocked(order)||item.booking){control.checked=!control.checked;return;}
 const key=isPart?'available':'done',checked=control.checked;
 let positionId=item.positionId;
 if(isPart&&checked&&item.inventoryId&&!positionId){
  const positions=stockItem(item.inventoryId)?.positions||[];
  if(positions.length!==1){control.checked=false;return toast('Wähle zuerst beim Ersatzteil im Auftrag eine Lagerposition.');}
  positionId=positions[0].id;
 }
 if(!await mutate(()=>{item[key]=checked;if(isPart&&positionId)item.positionId=positionId;}))control.checked=!checked;
 else [...document.querySelectorAll('[data-order-check]')].find(el=>
  el.dataset.orderCheck===orderCheck&&el.dataset.orderId===orderId&&el.dataset.itemId===itemId)?.focus({preventScroll:true});
});

function orderReplacementRows(o){
 if(o.replacementSnapshot)return o.replacementSnapshot;
 const b=bike(o.bikeId);
 const archived=(b?.componentArchive||[]).filter(c=>c.orderId===o.id);
 const removed=new Map(archived.map(c=>[c.componentKey,c.component]));
 const current=new Map(plannedOrderComponents(b).map(({key,component})=>[key,component]));
 return (o.replacementKeys||[]).map(key=>({key,component:removed.get(key)||current.get(key)||{}}));
}
function orderReplacementView(o){
 const rows=orderReplacementRows(o);
 return `<section class="panel order-section"><h2>Zum Austausch vorgesehen</h2>
 ${rows.length?rows.map(({component:c})=>`<dl class="supply-facts">${[['Hersteller',c.manufacturer],['Teilname',c.name],['Seriennummer',c.serial]].map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value||'na')}</dd></div>`).join('')}</dl>`).join(''):'<p class="help">Keine Bauteile ausgewählt.</p>'}</section>`;
}
function finishWorkshopOrder(id,action='complete'){
 const o=workshopOrder(id);if(!o||orderLocked(o))return;
 const b=bike(o.bikeId),rows=orderReplacementRows(o).filter(row=>row.component.name);
 const parts=o.parts.filter(part=>part.available&&!part.booking);
 const describe=part=>{
  const stock=stockItem(part.inventoryId);
  const position=stock?.positions.find(p=>p.id===part.positionId)||(stock?.positions.length===1?stock.positions[0]:null);
  return `${esc(part.name)} · ${amount(part.quantity)} ${esc(part.unit)} · ${esc(position?.location||'Lagerort offen')}`;
 };
 const installable=b?o.parts.filter(part=>(part.available||part.booking)&&!stockItem(part.inventoryId)?.positions.find(p=>p.id===part.positionId)?.tire):[];
 const suggested=new Map(installable.map(part=>[part.id,suggestedWorkshopReplacement(data,o,part)]));
 const required=new Set(requiredWorkshopReplacements(data,o).map(p=>p.id));
 const installFields=action==='complete'&&b&&rows.length?`<h3>Bauteiltausch bestätigen</h3><p class="help">Die geplante Zuordnung ist vorausgefüllt. Prüfe für jedes Ersatzteil, welches Bauteil ersetzt wird. Kennzeichne Verbrauchsmaterial ausdrücklich.</p>${installable.map((part,index)=>select('installPart'+index,part.name,[['',required.has(part.id)?'Bitte Zuordnung wählen':'Kein Bauteiltausch'],['__consumable__','Nur Verbrauchsmaterial / kein Bauteiltausch'],...rows.map(({key,component})=>[key,component.name+' · '+(component.manufacturer||'na')])],suggested.get(part.id)||'').replace('<select ',`<select data-install-part ${required.has(part.id)?'required':''} `)).join('')}<div class="exchange-preview" data-exchange-preview aria-live="polite"></div><label class="document-choice" data-exchange-confirm hidden><input type="checkbox" name="exchangeConfirm"> Ich bestätige den angezeigten Ausbau und Einbau.</label>`:'';
 const titles={complete:'Auftrag abschließen',pause:'Auftrag pausieren',cancel:'Auftrag abbrechen',resume:'Auftrag fortsetzen'};
 const dateField=input('workDate','Datum',today(),'date',`required max="${today()}"`);
 const choice=action==='pause'?'Zurück ins Lager?':'Verbraucht';
 const choices=parts.map(part=>action==='complete'?`<p>${describe(part)}</p>`:
  `<label class="document-choice"><input type="checkbox" name="workPart" value="${esc(part.id)}"> ${choice} · ${describe(part)}</label>`).join('');
 modal(titles[action],`${dateField}
 ${action==='resume'?'':`<h3>Als vorhanden markierte Ersatzteile</h3>${choices||'<p class="help">Keine offenen Entnahmen markiert.</p>'}`}
 ${action==='pause'||action==='cancel'?`<label>${action==='pause'?'Grund der Unterbrechung':'Abbruchgrund'}<textarea name="workComment" maxlength="1000"></textarea></label>`:''}
 ${action==='complete'?`${b?input('completedKm','Kilometerstand beim Abschluss',b.km,'number',`required min="${b.km}" step="0.1"`):''}
 ${installFields}${rows.map(({component:c,key},index)=>`<div data-tire-choice="${esc(key)}"><label class="document-choice"><input type="checkbox" name="removedKeys" value="${esc(key)}" ${[...suggested.values()].includes(key)?'checked':''}> Ausgebaut · ${esc(c.name)} · ${esc(c.manufacturer||'na')}</label>${componentCategory(c)==='Reifen'?`<div class="form-grid">${select('tireMode'+index,'Ausgebauten Reifen',[['','Bitte auswählen'],['stock','Wieder einlagern'],['archive','Archivieren']], '')}${select('tireStock'+index,'Lagerartikel',[['','Neuen Reifenartikel anlegen'],...data.inventory.filter(s=>s.category==='Reifen'&&s.unit==='Stück').map(s=>[s.id,[s.manufacturer,s.name].filter(Boolean).join(' · ')])],'')}${input('tireLocation'+index,'Lagerort','','text','maxlength="300"')}</div>`:''}</div>`).join('')}`:''}`,async f=>{
  const day=f.get('workDate');
  if(day>today())throw Error('Das Datum darf nicht in der Zukunft liegen.');
  const tireChoices={};rows.forEach(({key,component},index)=>{if(componentCategory(component)==='Reifen'&&f.getAll('removedKeys').includes(key))tireChoices[key]={mode:f.get('tireMode'+index),inventoryId:f.get('tireStock'+index),location:f.get('tireLocation'+index)};});
  if(action==='complete'&&installable.some((part,index)=>{const value=f.get('installPart'+index);return value&&value!=='__consumable__';})&&!f.get('exchangeConfirm'))throw Error('Bitte den angezeigten Ausbau und Einbau bestätigen.');
  const next=settleWorkshopOrder(data,id,action,f.getAll('workPart'),day,f.get('workComment')||'',f.getAll('removedKeys'),b?kmFromInput(f.get('completedKm'),b.km):null,tireChoices,installable.flatMap((part,index)=>f.get('installPart'+index)?[{partId:part.id,replacedKey:f.get('installPart'+index)}]:[]));
  if(await mutate(()=>{data.bikes=next.bikes;data.orders=next.orders;data.inventory=next.inventory;data.plans=next.plans;})){closeModal();toast('Auftrag '+workEventLabel[action].toLowerCase()+'.');}
 });
 const editor=$('#editor'),preview=editor.querySelector('[data-exchange-preview]');
 if(preview){const update=()=>{
  const pairs=installable.flatMap((part,index)=>{const key=editor.elements['installPart'+index].value,old=rows.find(r=>r.key===key)?.component;return old?[{part,old}]:[];});
  preview.innerHTML=pairs.length?pairs.map(({part,old})=>`<p><strong>Ausbau:</strong> ${esc([old.manufacturer,old.name,old.model].filter(Boolean).join(' · '))}<br><strong>Einbau:</strong> ${esc([stockItem(part.inventoryId)?.manufacturer||part.manufacturer,stockItem(part.inventoryId)?.name||part.model||part.name].filter(Boolean).join(' · '))}</p>`).join(''):'<p>Kein Bauteiltausch ausgewählt.</p>';
  const confirm=editor.querySelector('[data-exchange-confirm]');confirm.hidden=!pairs.length;confirm.querySelector('input').required=!!pairs.length;confirm.querySelector('input').checked=false;
 };editor.querySelectorAll('[data-install-part]').forEach(el=>el.onchange=()=>{const remove=[...editor.querySelectorAll('[name=removedKeys]')].find(box=>box.value===el.value);if(remove)remove.checked=true;update();});update();}
 const submit=$('#editor [type="submit"]');submit.textContent=titles[action];
 if(action==='cancel')submit.className='danger';
}
document.addEventListener('click',e=>{
 const preview=e.target.closest('[data-order-stock-preview]');
 if(preview){const item=stockItem(preview.dataset.orderStockPreview);if(item)showOrderStockPreview(item,preview);return;}
 const button=e.target.closest('[data-action]');
 const action=button?.dataset.action.match(/^order-(complete|pause|cancel|resume)$/)?.[1];
 if(action)finishWorkshopOrder(button.dataset.id,action);
});
