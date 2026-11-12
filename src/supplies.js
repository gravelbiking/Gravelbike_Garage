// Inventory, shopping and service consumption share the authenticated garage record.
const supplyUnits=['Stück','Paar','Set','Liter','Milliliter','Meter','Zentimeter','Kilogramm','Gramm'];
const stockItem=id=>data.inventory.find(s=>s.id===id);
const purchaseItem=id=>data.shopping.find(p=>p.id===id);
const amount=v=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:3}).format(v||0);
function safeShopLink(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function idealoLink(item){return 'https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q='+encodeURIComponent([item.manufacturer,item.name,item.articleNumber].filter(Boolean).join(' '));}
function receiptLinks(invoices=[]){return invoices.map(r=>`<a class="small-button" href="/api/files/${esc(r.fileId)}" data-document-preview="${esc(r.name)}">▤ ${esc(r.name)}</a>`).join(' ');}
function receiptEditor(invoices=[],title='Rechnungen',alsoLinked=[]){
 return `<fieldset class="supply-fieldset"><legend>${title}</legend><p class="help">PDF und Bilddateien bis 20 MB pro Datei.</p>
 ${invoices.map(r=>`<div class="receipt-row">${receiptLinks([r])}<label><input type="checkbox" name="removeInvoice" value="${esc(r.fileId)}"> Zuordnung entfernen</label></div>`).join('')}
 ${documentPicker([...invoices,...alsoLinked])}
 <label>Dateien hochladen<input type="file" name="invoices" multiple accept="${documentMime}"></label></fieldset>`;
}
function directDocumentEditor(files=[],title='Produktdatenblätter'){
 return `<fieldset class="supply-fieldset"><legend>${esc(title)}</legend>${files.map(file=>`<div class="receipt-row">${receiptLinks([file])}<label><input type="checkbox" name="removeInvoice" value="${esc(file.fileId)}"> Entfernen</label></div>`).join('')}<label>Dateien hochladen<input type="file" name="invoices" multiple accept="${documentMime}"></label><label>Mit Kamera aufnehmen<input type="file" name="cameraDocument" accept="image/*" capture="environment" multiple></label></fieldset>`;
}
async function readDirectDocuments(form,existing=[]){
 const fields=new FormData();
 for(const id of form.getAll('removeInvoice'))fields.append('removeInvoice',id);
 for(const key of ['invoices','cameraDocument'])for(const file of form.getAll(key))if(file?.size)fields.append('invoices',file);
 return readDocumentUploads(fields,existing);
}
const readReceipts=(f,existing=[])=>readDocumentUploads(f,existing);
function shoppingList(){
 const groups=[['needed','Noch kaufen'],['purchased','Bereits gekauft'],['stock','Aus dem Lager'],['used','Verbraucht']];
 return `<section id="shopping"><div class="section-title"><h2>Einkauf & Material</h2><button class="secondary" data-action="purchase-new">＋ Teil einplanen</button></div><p class="help">Plane Material für einen Service oder einen Nachkauf. Reservieren ändert den Bestand nicht; erst der bestätigte Verbrauch bucht ihn ab.</p>${groups.map(([key,title])=>{
  const items=data.shopping.filter(p=>(p.usedQuantity>=p.quantity?'used':p.source==='stock'?'stock':p.status)===key);
  return `<details class="shopping-group" ${key!=='used'?'open':''}><summary>${title} <span class="muted">(${items.length})</span></summary>${items.length?items.map(purchaseRow).join(''):'<p class="help">Keine Artikel in dieser Gruppe.</p>'}</details>`;
 }).join('')}</section>`;
}
function purchaseRow(p){
 const plan=data.plans.find(x=>x.id===p.planId),s=stockItem(p.inventoryId),link=safeShopLink(p.url);
 return `<article class="supply-purchase"><div class="row-copy"><strong>${esc(p.name)}</strong><small>${esc([p.manufacturer,p.articleNumber].filter(Boolean).join(' · '))}</small><small>${plan?esc(plan.title):p.bikeId?esc(bike(p.bikeId)?.name||'Fahrrad'):'Allgemeiner Nachkauf'} · ${amount(p.quantity)} ${esc(p.unit)} · ${money(p.unitPrice)} / ${esc(p.unit)}</small><small>${p.source==='stock'?'Lager: '+esc(s?.location||s?.name||'–'):p.source==='online'?'Online'+(link?` · <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Shop öffnen ↗</a>`:''):'Vor Ort: '+esc(p.dealer||'–')}${p.receivedAt?' · Eingelagert am '+date(p.receivedAt):''}${p.usedQuantity?' · Verbraucht: '+amount(p.usedQuantity)+' '+esc(p.unit):''}</small>${p.notes?`<p class="history-note">${esc(p.notes)}</p>`:''}<div class="receipt-links">${receiptLinks(p.invoices)}</div></div><div class="supply-actions"><button class="small-button" data-action="purchase-edit" data-id="${esc(p.id)}" aria-label="${esc(p.name)} in Einkaufsliste bearbeiten">Bearbeiten</button>${p.source!=='stock'&&p.status==='purchased'&&!p.receivedAt&&p.usedQuantity<p.quantity?`<button class="secondary" data-action="purchase-receive" data-id="${esc(p.id)}">Ins Lager buchen</button>`:''}<a class="small-button" href="${esc(bike24Link(p))}" target="_blank" rel="noopener noreferrer">BIKE24-Suche ↗</a>${!p.usedQuantity&&!p.receivedAt?`<button class="small-button stock-low" data-action="purchase-delete" data-id="${esc(p.id)}" aria-label="${esc(p.name)} aus Einkaufsliste entfernen">Entfernen</button>`:''}</div></article>`;
}
function editPurchase(id,{planId='',inventoryId=''}={}){
 const linked=stockItem(inventoryId),plan=data.plans.find(p=>p.id===planId),p=purchaseItem(id)||{id:uid(),planId,bikeId:plan?.bikeId||'',source:linked?'local':'online',status:'needed',name:linked?.name||'',manufacturer:linked?.manufacturer||'',articleNumber:linked?.articleNumber||'',quantity:1,unit:linked?.unit||'Stück',unitPrice:linked?.unitPrice||0,inventoryId,usedQuantity:0,invoices:[]};
 const frozen=!!(p.usedQuantity||p.receivedAt);
 modal(id?'Einkaufsartikel bearbeiten':'Teil für Service oder Nachkauf',`<div class="form-grid">${select('planId','Service zuordnen',[['','Kein Service / Nachkauf'],...data.plans.map(x=>[x.id,(bike(x.bikeId)?.name||'Fahrrad')+' · '+x.title])],p.planId)}${select('bikeId','Fahrrad (ohne Service)',[['','Allgemein / Lager'],...data.bikes.map(b=>[b.id,b.name])],p.bikeId)}${select('source','Bezugsquelle',[['stock','Auf Lager'],['local','Vor Ort'],['online','Online']],p.source)}${select('status','Einkaufsstatus',[['needed','Noch kaufen'],['purchased','Bereits gekauft']],p.status)}</div><fieldset class="supply-fieldset" id="purchase-stock"><legend>Aus dem Lager</legend>${select('stockId','Lagerartikel',[['','Bitte auswählen'],...data.inventory.map(s=>[s.id,s.name+' · '+amount(s.quantity)+' '+s.unit+' · '+(s.location||'ohne Lagerort')])],p.inventoryId)}<p class="help">Name, Hersteller, Artikelnummer, Einheit und Preis werden aus dem Lager übernommen. Der Bestand wird erst beim Serviceverbrauch reduziert.</p></fieldset><div class="form-grid" id="purchase-description">${input('name','Teil',p.name,'text','required maxlength="200"')}${input('manufacturer','Hersteller',p.manufacturer,'text','maxlength="200"')}${input('articleNumber','Artikelnummer',p.articleNumber,'text','maxlength="200"')}${input('ean','EAN / GTIN',p.ean,'text','maxlength="40"')}${select('unit','Einheit',supplyUnits,p.unit)}${input('unitPrice','Einzelpreis (€)',p.unitPrice,'number','required min="0" step="0.01"')}</div><div class="form-grid">${input('quantity','Benötigte / gekaufte Menge',p.quantity,'number','required min="0.001" max="100000000" step="0.001"')}${input('purchaseDate','Kaufdatum',p.purchaseDate,'date',`max="${today()}"`)}<label id="purchase-online">Shop-Link<input name="url" type="url" value="${esc(p.url||'')}" maxlength="2000" placeholder="https://…"></label><label id="purchase-local">Händler vor Ort<input name="dealer" value="${esc(p.dealer||'')}" maxlength="300"></label>${notesInput(p.notes||'')}</div>${frozen?'<p class="help">Dieser Artikel wurde bereits eingelagert oder verbraucht. Die Mengen- und Bezugsdaten sind zur Nachvollziehbarkeit gesperrt; Belege und Notizen bleiben bearbeitbar.</p>':''}${receiptEditor(p.invoices)}`,async f=>{
  const source=frozen?p.source:f.get('source'),s=source==='stock'?stockItem(frozen?p.inventoryId:f.get('stockId')):null;
  if(source==='stock'&&!s)throw Error('Bitte einen Lagerartikel auswählen.');
  const selectedPlan=data.plans.find(x=>x.id===f.get('planId'));
  const fields=frozen?{}:{source,status:source==='stock'?'purchased':f.get('status'),inventoryId:s?.id||p.inventoryId||'',name:s?.name||f.get('name')?.trim(),manufacturer:s?.manufacturer||f.get('manufacturer')?.trim()||'',articleNumber:s?.articleNumber||f.get('articleNumber')?.trim()||'',unit:s?.unit||f.get('unit'),unitPrice:s?.unitPrice??Number(f.get('unitPrice')),quantity:quantity(f.get('quantity')),url:source==='online'?f.get('url')?.trim()||'':'',dealer:source==='local'?f.get('dealer')?.trim()||'':'',purchaseDate:f.get('purchaseDate')||''};
  const updated={...p,...fields,ean:frozen?p.ean||'':s?.ean||f.get('ean')?.trim()||'',planId:selectedPlan?.id||'',bikeId:selectedPlan?.bikeId||f.get('bikeId')||'',notes:f.get('notes')};
  if(!updated.name||!updated.quantity)throw Error('Bitte Teil und Menge angeben.');
  if(updated.url&&!safeShopLink(updated.url))throw Error('Bitte einen http- oder https-Link eingeben.');
  const unlock=lockEditor($('#editor'));try{updated.invoices=await readReceipts(f,p.invoices);if(await mutate(()=>{if(id)data.shopping=data.shopping.map(x=>x.id===id?updated:x);else data.shopping.push(updated);})){closeModal();toast('Einkaufsartikel gespeichert.');}}finally{unlock();}
 });
 const form=$('#editor');form.dataset.purchaseFrozen=String(frozen);
 for(const name of ['source','stockId','name','manufacturer','articleNumber','ean','unit','unitPrice','quantity','status','purchaseDate','url','dealer']){const control=form.elements.namedItem(name);if(frozen&&control)control.dataset.frozen='true';}
 updatePurchaseFields();
 form.elements.namedItem('source').addEventListener('change',updatePurchaseFields);
}
function updatePurchaseFields(){
 const form=$('#editor');if(!form?.elements.namedItem('source'))return;
 const source=form.elements.namedItem('source').value;
 for(const [selector,visible] of [['#purchase-stock',source==='stock'],['#purchase-description',source!=='stock'],['#purchase-online',source==='online'],['#purchase-local',source==='local']]){
  const group=$(selector);group.hidden=!visible;for(const control of group.querySelectorAll('input,select'))control.disabled=!visible||control.dataset.frozen==='true';
 }
 const status=form.elements.namedItem('status');status.closest('label').hidden=source==='stock';status.disabled=source==='stock'||form.dataset.purchaseFrozen==='true';
 for(const control of form.querySelectorAll('[data-frozen="true"]'))control.disabled=true;
}
function deletePurchase(id){const p=purchaseItem(id);if(!p||p.usedQuantity||p.receivedAt)return toast('Bereits gebuchte Artikel bleiben als Nachweis erhalten.');modal('Einkaufsartikel entfernen?',`<p><strong>${esc(p.name)}</strong> aus der Einkaufsliste entfernen?</p><p class="help">Der Lagerbestand wird dabei nicht verändert.</p>`,async()=>{if(await mutate(()=>data.shopping=data.shopping.filter(p=>p.id!==id))){closeModal();toast('Einkaufsartikel entfernt.');}});$('#editor [type="submit"]').textContent='Entfernen';}
function receiveIntoStock(id){
 const p=purchaseItem(id);if(!p)return;
 modal('Einkauf ins Lager buchen',`<p>${esc(p.name)} · ${amount(quantity(p.quantity-p.usedQuantity))} ${esc(p.unit)} verbleibend.</p>${select('inventoryId','Ziellagerartikel',[['','Bitte auswählen'],...data.inventory.filter(s=>s.unit===p.unit).map(s=>[s.id,s.name+' · '+(s.location||'ohne Lagerort')])],p.inventoryId)}<p class="help">Die verbleibende Menge wird genau einmal eingebucht. Lege bei Bedarf zuerst im Lager einen Artikel mit Menge 0 und passender Einheit an.</p>`,async f=>{const result=receivePurchase(data,id,f.get('inventoryId'),today());if(await mutate(()=>{data.inventory=result.inventory;data.shopping=result.shopping;})){closeModal();toast('Einkauf ins Lager gebucht.');}});
}
function purchasingItemLink(item){
 const stock=stockItem(item.inventoryId),title=esc([item.manufacturer||stock?.manufacturer,item.name].filter(Boolean).join(' '));
 if(stock)return `<strong><a href="#stock/${encodeURIComponent(stock.id)}">${title}</a></strong>`;
 return `<strong>${title}</strong>`;
}
function purchasingTile(){
 const needs=purchaseNeeds(data);
 return `<section class="purchasing-tile"><div class="section-title"><h2>Einkaufen & Lager auffüllen <span class="muted">(${needs.length})</span></h2><a href="#shopping">Zur Einkaufsliste ↗</a></div><div class="panel">${needs.length?needs.map(n=>`<div class="list-row"><span class="row-icon">▤</span><div class="row-copy">${purchasingItemLink(n)}<small>${esc(n.reason)} · ${amount(n.quantity)} ${esc(n.unit)}</small><small>${esc([n.manufacturer,n.articleNumber].filter(Boolean).join(' · '))}</small></div><div class="supply-actions"><a class="small-button" href="${esc(idealoLink(n))}" target="_blank" rel="noopener noreferrer">Bei idealo suchen ↗</a><a class="small-button" href="${esc(bike24Link(n))}" target="_blank" rel="noopener noreferrer">BIKE24-Suche ↗</a><button class="secondary" data-action="${n.shoppingId?'purchase-edit':'restock'}" data-id="${esc(n.shoppingId||n.inventoryId)}">${n.shoppingId?'Einkauf bearbeiten':'Nachkauf planen'}</button></div></div>`).join(''):empty('Alles für die nächste Wartung bereit.','Hier erscheinen offene Einkäufe und Lagerartikel, die ihren Mindestbestand erreicht haben.')}</div></section>`;
}
function serviceMaterialEditor(h,p){
 if(h.materials?.length)return `<fieldset class="supply-fieldset"><legend>Dokumentierter Materialverbrauch</legend>${h.materials.map(m=>`<p>${esc(m.name)} · ${amount(m.quantity)} ${esc(m.unit)}${m.positionLabel?' · '+esc(m.positionLabel):''}</p>`).join('')}<p class="help">Bereits gebuchter Verbrauch bleibt unverändert. Er wird beim Bearbeiten dieser Wartung nicht erneut abgezogen.</p></fieldset>`;
 // Editing a past service must never trigger a new stock deduction.
 if(data.history.some(x=>x.id===h.id))return '';
 const purchases=data.shopping.filter(x=>x.usedQuantity<x.quantity&&(p?x.planId===p.id:!x.planId&&x.bikeId===h.bikeId));
 return `<fieldset class="supply-fieldset" id="service-materials"><legend>Tatsächlich verbrauchtes Material bestätigen</legend><p class="help">Nur angehakte Artikel werden gebucht. Trage die wirklich verbrauchte Menge ein. Einkauf und Lager werden gemeinsam mit der Wartung gespeichert.</p>${purchases.map(x=>{
  const available=x.source==='stock'||x.status==='purchased';
  return `<div class="material-row" data-shopping-id="${esc(x.id)}"><label><input type="checkbox" class="material-check" ${available&&(!(x.source==='stock'||x.receivedAt)||stockItem(x.inventoryId)?.quantity>0)?'':'disabled'}> ${esc(x.name)} <small>${available?x.source==='stock'?'aus Lager':'gekauft':'noch nicht gekauft'}</small></label>${materialPositionSelect(x)}<label>Verbrauch (${esc(x.unit)})<input class="material-quantity" type="number" min="0.001" step="0.001" max="${quantity(x.quantity-x.usedQuantity)}" value="${quantity(x.quantity-x.usedQuantity)}" disabled></label></div>`;
 }).join('')}<details><summary>Weiteres Material direkt aus dem Lager</summary>${data.inventory.length?data.inventory.map(s=>`<div class="material-row" data-inventory-id="${esc(s.id)}"><label><input type="checkbox" class="material-check" ${s.quantity>0?'':'disabled'}> ${esc(s.name)} <small>${amount(s.quantity)} ${esc(s.unit)} vorrätig · ${esc(s.location||'ohne Lagerort')}</small></label>${materialPositionSelect(null,s)}<label>Verbrauch (${esc(s.unit)})<input class="material-quantity" type="number" min="0.001" max="${s.quantity}" step="0.001" value="${Math.min(1,s.quantity)}" disabled></label></div>`).join(''):'<p class="help">Noch keine Lagerartikel angelegt.</p>'}</details></fieldset>`;
}
function readMaterialRequests(){return [...document.querySelectorAll('#service-materials .material-row')].filter(row=>row.querySelector('.material-check').checked).map(row=>({shoppingId:row.dataset.shoppingId||'',inventoryId:row.dataset.inventoryId||'',positionId:row.querySelector('.material-position')?.value||'',quantity:row.querySelector('.material-quantity').value}));}

function materialPositionSelect(p,s=stockItem(p?.inventoryId)){if(!s||p&&p.source!=='stock'&&!p.receivedAt)return '';const positions=s.positions.filter(x=>x.quantity>0&&(!p?.receivedPositionId||p.receivedPositionId===x.id));return `<label>Lagerposition<select class="material-position">${positions.map(x=>`<option value="${esc(x.id)}" data-available="${Math.min(x.quantity,p?quantity(p.quantity-p.usedQuantity):x.quantity)}">${esc(x.label)} · ${amount(x.quantity)} ${esc(s.unit)} · ${esc(x.location||'ohne Lagerort')}</option>`).join('')}</select></label>`;}
