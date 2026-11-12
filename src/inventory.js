let inventoryFilter='all', inventorySearch='', inventoryCategory='all';
const inventoryColumns={name:'',category:'',manufacturer:'',articleNumber:'',quantity:'',location:''};
function bike24Link(item){return 'https://www.bike24.de/suchergebnis?searchTerm='+encodeURIComponent(item.ean||[item.manufacturer,item.name,item.articleNumber].filter(Boolean).join(' '));}
function inventoryPage(){
 const low=data.inventory.filter(s=>s.quantity<=s.minStock),value=data.inventory.reduce((v,s)=>{const n=stockValue(s);return {cents:v.cents+n.cents,missing:v.missing+n.missing};},{cents:0,missing:0});
 return heading('Mein Lager','Artikel, einzelne Bestände und jede Entnahme im Blick.',`<div class="actions inventory-actions"><button class="secondary" data-action="inventory-report">Inventur & Lagerwert</button><button class="primary" data-action="stock-new">＋ Artikel anlegen</button><button class="secondary" data-action="stock-receive">Bestand erfassen</button></div>`)+`<div class="supply-summary"><span>${data.inventory.length} Artikel</span><span>${data.inventory.reduce((n,s)=>n+s.positions.filter(position=>position.quantity>0).length,0)} Lagerpositionen</span><span class="${low.length?'stock-low':''}">${low.length} am Mindestbestand</span><span>Erfasster Lagerwert: <strong>${money(value.cents/100)}</strong>${value.missing?' · '+value.missing+' Position(en) ohne Preis':''}</span></div><div class="filters"><button class="chip ${inventoryFilter==='all'?'active':''}" data-action="stock-filter" data-id="all">Alle Artikel</button><button class="chip ${inventoryFilter==='low'?'active':''}" data-action="stock-filter" data-id="low">Nachkaufen (${low.length})</button><a class="small-button" href="#shopping">Zur Einkaufsliste ↗</a></div><div class="stock-search"><label>Lager durchsuchen<input id="inventorySearch" type="search" value="${esc(inventorySearch)}" placeholder="Teil, Kategorie, Lagerort oder Artikelnummer"></label><button class="secondary" type="button" data-action="stock-search-clear">Leeren</button></div>${inventoryCategoryButtons()}<div id="inventoryResults" aria-live="polite">${inventoryResults()}</div>`;
}
function stockLocations(s){
 const locations=s.positions.filter(p=>p.quantity>0).map(p=>p.location||s.location).filter(Boolean);
 return [...new Set(locations.length?locations:[s.location].filter(Boolean))];
}
function inventoryResults(){
 if(!data.inventory.length)return empty('Dein Material bekommt einen Platz.','Lege einen Artikel an und erfasse darunter seine Kisten, Packungen oder einzelnen Einkäufe.');
 const words=inventorySearch.toLocaleLowerCase('de').trim().split(/\s+/);
 const visible=data.inventory.filter(s=>{
  if(inventoryCategory!=='all'&&s.category!==inventoryCategory)return false;
  if(!Object.entries(inventoryColumns).every(([key,q])=>stockColumnMatch(key,q,s)))return false;
  if(inventoryFilter==='low'&&s.quantity>s.minStock)return false;
  const haystack=[s.name,s.category,s.manufacturer,s.articleNumber,s.ean,...stockLocations(s)].join(' ').toLocaleLowerCase('de');
  return words.every(word=>haystack.includes(word));
 });

 return `<div class="panel stock-table-wrap"><table class="stock-table"><thead><tr>${Object.entries(stockColumnLabels).map(([key,label])=>`<th scope="col">${label}<input type="search" data-stock-column="${key}" aria-label="${label} filtern" value="${esc(inventoryColumns[key])}" placeholder="${key==='quantity'?'z. B. >= 2':'Filtern …'}"></th>`).join('')}</tr></thead><tbody>${visible.map(s=>`<tr><th scope="row"><a href="#stock/${encodeURIComponent(s.id)}">${esc(s.name)}</a></th><td>${esc(s.category)}</td><td>${esc(s.manufacturer||'–')}</td><td>${esc(s.articleNumber||'–')}</td><td class="${s.quantity<=s.minStock?'stock-low':''}">${number(s.quantity)} ${esc(s.unit)}</td><td>${esc(stockLocations(s).join(', ')||'–')}</td></tr>`).join('')||'<tr><td colspan="6">Keine Lagerartikel gefunden. Passe die Filter an.</td></tr>'}</tbody></table></div>`;
}
function stockDetail(id){
 const item=data.inventory.find(s=>encodeURIComponent(s.id)===id);
 return '<a class="back" href="#inventory">← Mein Lager</a>'+(item?stockCard(item):empty('Artikel nicht gefunden.','Wähle einen Artikel in der Lagerliste aus.'));
}
function clearInventorySearch(){
 const field=$('#inventorySearch');
 field.value='';
 field.dispatchEvent(new Event('input',{bubbles:true}));
 field.focus();
}
document.addEventListener('input',e=>{
 if(e.target.id!=='inventorySearch')return;
 inventorySearch=e.target.value;
 document.getElementById('inventoryResults').innerHTML=inventoryResults();
});
function stockCard(s,{preview=false}={}){const v=stockValue(s),url=safeShopLink(s.productUrl),positions=s.positions.filter(position=>position.quantity>0);return `<article class="panel stock-card" data-stock-id="${esc(s.id)}">${s.photo?`<a href="/api/files/${esc(s.photo)}" data-document-preview="${esc(s.name)}"><img width="640" height="400" class="stock-photo" src="/api/files/${esc(s.photo)}" alt="${esc(s.name)}"></a>`:''}<div class="section-title"><div><div class="eyebrow">${esc(s.category)} · ${esc(s.kind)}</div><h2>${esc(s.name)}</h2></div><span class="badge ${s.quantity<=s.minStock?'overdue':'ok'}">${s.quantity===0?'Leer':s.quantity<=s.minStock?'Auffüllen':'Vorrätig'}</span></div><p class="muted">${esc(s.manufacturer||'Hersteller offen')} · Art.-Nr. ${esc(s.articleNumber||'–')}${s.ean?' · EAN '+esc(s.ean):''}</p><div class="stock-quantity">${amount(s.quantity)} <small>${esc(s.unit)}</small></div><p class="help">Mindestbestand: ${amount(s.minStock)} ${esc(s.unit)} · Wert: ${money(v.cents/100)}${v.missing?' · Preisangaben unvollständig':''}</p>${s.notes?`<p class="history-note">${esc(s.notes)}</p>`:''}<details class="stock-positions" open><summary>Lagerpositionen (${positions.length})</summary>${positions.map(p=>`<div id="position-${encodeURIComponent(p.id)}" class="stock-position ${p.quantity===0?'depleted':''}"><div><strong>${esc(p.location||'Lagerort offen')}</strong><small>${amount(p.quantity)} ${esc(s.unit)}${p.packageType!=='Einzelbestand'?' · '+positionPackaging(p,s.unit):''} · ${esc(p.location||'Lagerort offen')}</small><small>${p.unitPrice===null?'Preis offen':money(p.unitPrice)+' / '+esc(s.unit)} · ${date(p.purchaseDate)}${p.supplierId?' · '+esc(contact(p.supplierId)?.name||p.supplier||''):p.supplier?' · '+esc(p.supplier):''}${p.tire?' · Gebrauchter Reifen · '+esc(p.tire.history.some(h=>h.mileage===null)?'Laufleistung teilweise unbekannt':number(p.tire.history.reduce((sum,h)=>sum+h.mileage,0))+' km bisher'):''}${p.quantity===0?' · Vollständig entnommen':''}</small><div class="receipt-links">${receiptLinks(p.invoices)}</div>${p.tire?tireHistoryView(p.tire.history):''}</div>${preview?'':`<div class="supply-actions"><button class="small-button" data-action="stock-position-edit" data-id="${esc(s.id)}" data-position-id="${esc(p.id)}" aria-label="${esc(p.location||'Lagerort offen')} bearbeiten">Bearbeiten</button><button class="small-button" data-action="stock-adjust" data-id="${esc(s.id)}" data-position-id="${esc(p.id)}">Bestand korrigieren</button>${p.tire?`<button class="primary" data-action="tire-install" data-id="${esc(s.id)}" data-position-id="${esc(p.id)}" ${p.quantity===0?'disabled':''}>Reifen einbauen</button>`:''}<button class="secondary" data-action="stock-withdraw" data-id="${esc(s.id)}" data-position-id="${esc(p.id)}" ${p.quantity===0||p.tire?'disabled':''}>Für Service entnehmen</button></div>`}</div>`).join('')||'<p class="help">Kein Bestand vorhanden.</p>'}</details><h3>Produktdatenblätter</h3><div class="receipt-links">${receiptLinks(s.datasheets||[])}</div><div class="receipt-links">${receiptLinks(s.invoices)}</div>${preview?'':`<div class="supply-actions"><button class="primary" data-action="stock-position" data-id="${esc(s.id)}">＋ Bestand erfassen</button><button class="secondary" data-action="stock-history" data-id="${esc(s.id)}">Bewegungen (${s.movements.length})</button><button class="small-button" data-action="stock-edit" data-id="${esc(s.id)}">Artikel bearbeiten</button><button class="small-button" data-action="restock" data-id="${esc(s.id)}">Nachkauf planen</button><a class="small-button" href="${esc(bike24Link(s))}" target="_blank" rel="noopener noreferrer">BIKE24-Suche ↗</a>${url?`<a class="small-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">BIKE24-Produkt ↗</a>`:''}<button class="small-button stock-low" data-action="stock-delete" data-id="${esc(s.id)}">Artikel löschen</button></div>`}</article>`;}
function newStockItem(){return {id:uid(),category:'Antrieb',kind:'Original',quantity:0,unit:'Stück',minStock:0,unitPrice:null,invoices:[],positions:[],movements:[]};}
function stockEditorFields(s,id){
 return `<div class="form-grid">${select('category','Kategorie',Object.keys(componentCategories()),s.category)}${input('name','Artikelname',s.name,'text','required maxlength="200"')}${input('manufacturer','Hersteller',s.manufacturer,'text','maxlength="200"')}${select('kind','Original oder Zubehör',['Original','Zubehör'],s.kind)}${input('articleNumber','Artikelnummer',s.articleNumber,'text','maxlength="200"')}${input('ean','EAN / GTIN',s.ean,'text','maxlength="40"')}${select('unit','Basiseinheit',supplyUnits,s.unit)}${input('minStock','Mindestbestand',s.minStock,'number','required min="0" max="100000000" step="0.001"')}${notesInput(s.notes||'')}</div><fieldset class="supply-fieldset"><legend>Artikelbild</legend>${s.photo?`<img width="640" height="400" class="stock-photo" src="/api/files/${esc(s.photo)}" alt="${esc(s.name)}"><label><input type="checkbox" name="removePhoto"> Bild entfernen</label>`:''}<label>Fotoalbum / Bilddatei<input type="file" name="articlePhoto" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"></label><label>Foto mit Kamera aufnehmen<input type="file" name="cameraPhoto" accept="image/*" capture="environment"></label></fieldset>${directDocumentEditor(s.datasheets||[])}`;
}
async function readStockEditor(f,s,id){
  const updated={...s,name:f.get('name').trim(),category:f.get('category'),manufacturer:f.get('manufacturer').trim(),kind:f.get('kind'),articleNumber:f.get('articleNumber').trim(),ean:f.get('ean').trim(),unit:f.get('unit'),minStock:quantity(f.get('minStock')),productUrl:s.productUrl||'',notes:f.get('notes'),location:s.location||'',purchaseDate:s.purchaseDate||''};
  if(!updated.name)throw Error('Bitte das Teil benennen.');
  if(id&&s.unit!==updated.unit&&(s.positions.length||data.shopping.some(p=>p.inventoryId===id)))throw Error('Die Basiseinheit eines Artikels mit Lagerpositionen oder Einkäufen bleibt unverändert.');
  if(updated.productUrl){let url;try{url=new URL(updated.productUrl);}catch{}if(!safeShopLink(updated.productUrl)||!['bike24.de','www.bike24.de'].includes(url?.hostname))throw Error('Bitte einen BIKE24-Link eingeben.');}
  const album=f.get('articlePhoto'),camera=f.get('cameraPhoto');if(album?.size&&camera?.size)throw Error('Bitte entweder ein Foto aus dem Album oder eine Kameraaufnahme auswählen.');const photo=album?.size?album:camera;updated.photo=f.has('removePhoto')?null:s.photo||null;updated.photo=await readImage(f,photo,updated.photo);updated.datasheets=await readDirectDocuments(f,s.datasheets||[]);


 return updated;
}
function editStock(id){
 const s=stockItem(id)||newStockItem();
 modal(id?'Lagerartikel bearbeiten':'Lagerartikel anlegen',stockEditorFields(s,id),async f=>{
  const unlock=lockEditor($('#editor'));
  try{
   const updated=await readStockEditor(f,s,id);
   if(await mutate(()=>{if(id)data.inventory=data.inventory.map(x=>x.id===id?updated:x);else data.inventory.push(updated);})){closeModal();toast('Lagerartikel gespeichert.');}
  }finally{unlock();}
 });
}
function deleteStock(id){const s=stockItem(id);if(!s)return;if(data.orders.some(o=>o.parts.some(p=>p.inventoryId===id))||s.movements.length||s.positions.length||data.shopping.some(p=>p.inventoryId===id)||data.history.some(h=>h.materials?.some(m=>m.inventoryId===id)))return toast('Artikel mit Bestand oder Buchungshistorie bleiben als Nachweis erhalten, auch bei Bestand 0.');modal('Lagerartikel löschen?',`<p>Den ungenutzten Artikel ${esc(s.name)} löschen?</p>`,async()=>{if(await mutate(()=>data.inventory=data.inventory.filter(s=>s.id!==id))){closeModal();toast('Artikel entfernt.');}});$('#editor [type="submit"]').textContent='Löschen';}
function editStockPosition(id,positionId){
 const s=stockItem(id);if(!s)return;const old=s.positions.find(p=>p.id===positionId),p=old||{label:'Bestand '+(s.positions.length+1),quantity:1,unitPrice:null,packageType:'Einzelbestand',packageSize:1,purchaseDate:today(),location:s.location||'',supplierId:'',supplier:'',notes:'',invoices:[]};
 modal(old?'Lagerposition bearbeiten':'Bestand erfassen · '+s.name,`<div class="form-grid">${input('location','Lagerort',p.location,'text','maxlength="300"')}${select('packageType','Verpackung',['Einzelbestand','Kiste','Packung','Flasche','Rolle','Sonstiges'],p.packageType)}${input('count','Anzahl Verpackungen / Einzelmenge',p.quantity/p.packageSize,'number',`required min="0" max="100000000" step="0.001" ${old?'readonly':''}`)}${input('packageSize','Inhalt pro Verpackung ('+s.unit+')',p.packageSize,'number',`required min="0.001" max="100000000" step="0.001" ${old?'readonly':''}`)}${input('unitPrice','Einzelpreis je '+s.unit+' (€)',p.unitPrice,'number','min="0" step="0.01"')}${input('purchaseDate','Kaufdatum',p.purchaseDate,'date',`max="${today()}"`)}${select('supplierId','Lieferant / Händler',[['','Keine Zuordnung'],...data.contacts.map(c=>[c.id,c.name+' · '+contactRoles(c).map(r=>r==='Lieferant'?'Lieferant (online)':r).join(', ')])],p.supplierId)}${input('supplier','Weitere Bezugsangabe',p.supplier,'text','maxlength="300"')}${notesInput(p.notes)}</div><p class="help">Die Menge ergibt sich aus Anzahl × Inhalt. Der Einzelpreis gilt pro ${esc(s.unit)}, nicht pro Kiste. ${old?'Mengenänderungen bitte über „Bestand korrigieren“ buchen.':''}</p>${receiptEditor(p.invoices)}`,async f=>{const values={label:old?.label||'Lagerbestand',packageType:f.get('packageType'),packageSize:quantity(f.get('packageSize')),unitPrice:f.get('unitPrice')===''?null:Number(f.get('unitPrice')),purchaseDate:f.get('purchaseDate'),location:f.get('location').trim(),supplierId:f.get('supplierId'),supplier:f.get('supplier').trim(),notes:f.get('notes')};if(values.packageSize<=0)throw Error('Bitte den Inhalt pro Verpackung angeben.');const q=old?old.quantity:quantity(quantity(f.get('count'))*values.packageSize);if(!old&&q<=0)throw Error('Bitte einen Zugang größer als 0 eingeben.');values.quantity=old?old.quantity:q;
  const unlock=lockEditor($('#editor'));try{values.invoices=await readReceipts(f,p.invoices);if(await mutate(()=>{const current=stockItem(id);if(old)current.positions=current.positions.map(x=>x.id===old.id?{...old,...values,quantity:old.quantity,packageSize:old.packageSize}:x);else addStockPosition(current,values);})){closeModal();toast('Lagerposition gespeichert.');}}finally{unlock();}
 });
}
function adjustStockPosition(id,positionId){const s=stockItem(id),p=s?.positions.find(p=>p.id===positionId);if(!p)return;modal('Bestand korrigieren',`<p>${esc(s.name)} · ${esc(p.label)} · bisher ${amount(p.quantity)} ${esc(s.unit)}</p><div class="form-grid">${input('quantity','Tatsächlicher Bestand ('+s.unit+')',p.quantity,'number','required min="0" max="100000000" step="0.001"')}${input('reason','Grund / Inventurvermerk','','text','required maxlength="500"')}</div><p class="help">Die Differenz wird als neue Lagerbewegung dokumentiert.</p>`,async f=>{const q=quantity(f.get('quantity')),reason=f.get('reason').trim();if(!reason)throw Error('Bitte einen Grund angeben.');if(q===p.quantity)throw Error('Der Bestand ist unverändert.');if(await mutate(()=>{const current=stockItem(id),position=current.positions.find(x=>x.id===positionId);stockMovement(current,position,q-position.quantity,'adjustment',{reason});})){closeModal();toast('Bestandskorrektur dokumentiert.');}});}
function withdrawStock(id,positionId){const s=stockItem(id),p=s?.positions.find(p=>p.id===positionId);if(!p)return;if(!data.history.length)return toast('Dokumentiere zuerst den Service im Servicebuch. Dort kannst du Material direkt bestätigen.');modal('Für Service entnehmen',`<p>${esc(s.name)} · ${esc(p.label)} · ${amount(p.quantity)} ${esc(s.unit)} verfügbar.</p><div class="form-grid">${select('historyId','Durchgeführter Service',data.history.map(h=>[h.id,date(h.date)+' · '+(bike(h.bikeId)?.name||'Fahrrad')+' · '+h.title]),data.history[0].id)}${input('quantity','Entnahmemenge ('+s.unit+')',Math.min(1,p.quantity),'number',`required min="0.001" max="${p.quantity}" step="0.001"`)}</div><p class="help">Die Entnahme wird einmalig gebucht und dem Materialnachweis dieses Services hinzugefügt.</p>`,async f=>{const h=data.history.find(h=>h.id===f.get('historyId'));if(!h)throw Error('Bitte einen Service auswählen.');const result=consumeSupplies(data,[{inventoryId:id,positionId,quantity:f.get('quantity')}],{...h,bikeName:bike(h.bikeId)?.name||''});if(await mutate(()=>{data.inventory=result.inventory;data.shopping=result.shopping;data.history.find(x=>x.id===h.id).materials=[...(h.materials||[]),...result.materials];})){closeModal();toast('Entnahme mit Servicezuordnung gespeichert.');}});}
function stockHistory(id){const s=stockItem(id);if(!s)return;const labels={opening:'Übernommener Bestand',receipt:'Zugang',withdrawal:'Entnahme',adjustment:'Bestandskorrektur'};modal('Lagerbewegungen · '+s.name,`<p class="help">Zugänge, Entnahmen und Korrekturen bleiben dauerhaft nachvollziehbar.</p><div class="movement-list">${[...s.movements].reverse().map(m=>{const h=data.history.find(h=>h.id===m.historyId),p=s.positions.find(p=>p.id===m.positionId);return `<article class="stock-position"><div><strong>${labels[m.type]} · ${m.change>0?'+':''}${amount(m.change)} ${esc(s.unit)}</strong><small>${new Date(m.at).toLocaleString('de-DE')} · ${esc(p?.label||'Lagerposition')} · Restbestand danach: ${amount(m.after)} ${esc(s.unit)}</small>${m.orderId||m.tireReturnOrderId?`<small><a href="${recordRoute('order',m.orderId||m.tireReturnOrderId)}" data-movement-order>Werkstattauftrag: ${esc(m.serviceTitle)}</a> · ${date(m.date)}</small>`:(m.historyId?`<small>Service: ${esc(m.serviceTitle)} · ${esc(m.bikeName)} · ${date(m.date)}</small>`:'')}${m.reason?`<p>${esc(m.reason)}</p>`:''}</div>${h?`<button type="button" class="small-button" data-action="movement-service" data-id="${esc(h.id)}">Service öffnen ↗</button>`:m.historyId?'<small>Servicezuordnung als historischer Nachweis erhalten.</small>':''}</article>`;}).join('')||'<p>Noch keine Lagerbewegungen.</p>'}</div>`,async()=>closeModal());$('#editor [type="submit"]').textContent='Schließen';}
function inventoryReport(){const timestamp=new Date().toLocaleString('de-DE'),total=data.inventory.reduce((v,s)=>{const n=stockValue(s);return {cents:v.cents+n.cents,missing:v.missing+n.missing};},{cents:0,missing:0});modal('Inventur & Lagerwert',`<p>Bestand am ${esc(timestamp)}</p><p><strong>Erfasster Gesamtwert: ${money(total.cents/100)}</strong></p>${total.missing?`<p class="notice">${total.missing} Position(en) mit Bestand haben keinen Preis. Der Gesamtwert ist daher unvollständig.</p>`:''}<div class="actions"><a class="secondary" href="api.php?route=inventory-report&amp;format=pdf" target="_blank" rel="noopener">PDF herunterladen ↗</a><a class="secondary" href="api.php?route=inventory-report&amp;format=csv">CSV herunterladen ↓</a></div><div class="inventory-table-wrap"><table class="inventory-table"><thead><tr><th>Artikel / Lagerposition</th><th>Lagerort</th><th>Sollbestand</th><th>Einzelpreis</th><th>Wert</th><th>Gezählt / Notiz</th></tr></thead><tbody>${data.inventory.map(s=>s.positions.map(p=>`<tr><td>${esc(s.name)}<small>${esc(s.articleNumber)} · ${esc(p.label)}</small></td><td>${esc(p.location||'–')}</td><td>${amount(p.quantity)} ${esc(s.unit)}</td><td>${p.unitPrice===null?'Preis fehlt':money(p.unitPrice)}</td><td>${p.unitPrice===null&&p.quantity>0?'offen':money(Math.round(p.quantity*(p.unitPrice||0)*100)/100)}</td><td><input aria-label="Gezählter Bestand ${esc(s.name)} ${esc(p.label)}" type="number" min="0" step="0.001"><input aria-label="Inventurnotiz ${esc(s.name)} ${esc(p.label)}" placeholder="Notiz"></td></tr>`).join('')+`<tr class="inventory-subtotal"><td colspan="4">${esc(s.name)} · ${amount(s.quantity)} ${esc(s.unit)} gesamt</td><td>${money(stockValue(s).cents/100)}</td><td></td></tr>`).join('')}</tbody></table></div><p class="help">Gezählte Mengen und Notizen hier dienen dem Abgleich und werden nicht gespeichert. Abweichungen anschließend gezielt über „Bestand korrigieren“ buchen. PDF und CSV enthalten leere Zählfelder und den jeweils aktuellen gespeicherten Bestand.</p>`,async()=>closeModal());$('#editor [type="submit"]').textContent='Schließen';}

function positionPackaging(p,unit){const n=packageBalance(p),plural={Kiste:'Kisten',Packung:'Packungen',Flasche:'Flaschen',Rolle:'Rollen',Sonstiges:'Verpackungen'};return n.full+' '+esc(n.full===1?p.packageType:plural[p.packageType]||p.packageType)+' à '+amount(p.packageSize)+' '+esc(unit)+(n.remainder?' + '+amount(n.remainder)+' '+esc(unit)+' angebrochen':'');}

const stockColumnLabels={name:'Teilname',category:'Kategorie',manufacturer:'Hersteller',articleNumber:'Teilenummer',quantity:'Lagerbestand',location:'Lagerort'};
function inventoryCategoryButtons(){
 const categories=[...new Set(['Antrieb','Bremsen','Räder','Reifen',...data.inventory.map(s=>s.category)])];
 return `<div class="inventory-categories" role="group" aria-label="Lagerkategorien">${['all',...categories].map(c=>`<button type="button" data-stock-category="${esc(c)}" aria-pressed="${inventoryCategory===c}">${c==='all'?'Alle Kategorien':esc(c)}</button>`).join('')}</div>`;
}
function stockColumnMatch(key,query,s){
 const q=query.trim().toLocaleLowerCase('de');if(!q)return true;
 if(key==='quantity'){
  const match=q.match(/^(>=|<=|>|<|=)?\s*(\d+(?:[.,]\d+)?)$/);
  if(match){const n=Number(match[2].replace(',','.'));return ({'>=':s.quantity>=n,'<=':s.quantity<=n,'>':s.quantity>n,'<':s.quantity<n,'=':s.quantity===n})[match[1]||'='];}
 }
 const value=key==='location'?stockLocations(s).join(' '):key==='quantity'?number(s.quantity)+' '+s.unit:s[key];
 return String(value||'').toLocaleLowerCase('de').includes(q);
}
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-stock-category]');if(!button)return;
 inventoryCategory=button.dataset.stockCategory;
 for(const el of document.querySelectorAll('[data-stock-category]'))el.setAttribute('aria-pressed',String(el===button));
 document.getElementById('inventoryResults').innerHTML=inventoryResults();
});
document.addEventListener('input',e=>{
 const key=e.target.dataset.stockColumn;if(!Object.hasOwn(inventoryColumns,key))return;
 const cursor=e.target.selectionStart;inventoryColumns[key]=e.target.value;
 document.getElementById('inventoryResults').innerHTML=inventoryResults();
 const input=document.querySelector(`[data-stock-column="${key}"]`);input?.focus();input?.setSelectionRange(cursor,cursor);
});

document.addEventListener('click',e=>{if(e.target.closest('[data-movement-order]'))closeModal();});

function receiveStock(){
 if(!data.inventory.length){toast('Lege zuerst einen Artikel an.');editStock();return;}
 const options=data.inventory.map(item=>[item.id,[item.manufacturer,item.name].filter(Boolean).join(' · ')]);
 modal('Bestand erfassen',`${select('inventoryId','Artikel',options,options[0][0])}<div class="form-grid">${input('quantity','Menge',1,'number','required min="0.001" max="100000000" step="0.001"')}<p id="stockUnit" class="help"></p>${input('location','Lagerort','','text','required maxlength="300"')}${input('supplier','Gekauft bei (optional)','','text','maxlength="300"')}</div>${directDocumentEditor([],'Rechnung / Lieferschein (optional)')}`,async form=>{
  const item=stockItem(form.get('inventoryId')),count=quantity(form.get('quantity')),location=form.get('location').trim();
  if(!item||!count||!location)throw Error('Bitte Artikel, positive Menge und Lagerort angeben.');
  if(['Stück','Paar','Set'].includes(item.unit)&&!Number.isInteger(count))throw Error('Bitte eine ganze Anzahl eingeben.');
  const unlock=lockEditor($('#editor'));
  try{
   const invoices=await readDirectDocuments(form);
   if(await mutate(()=>addStockPosition(stockItem(item.id),{label:'Zugang '+date(today()),quantity:count,unitPrice:null,purchaseDate:today(),location,supplierId:'',supplier:form.get('supplier').trim(),packageType:'Einzelbestand',packageSize:1,notes:'',invoices}))){closeModal();toast('Bestand erfasst.');}
  }finally{unlock();}
 });
 const editor=$('#editor');const show=()=>{$('#stockUnit').textContent='Einheit: '+stockItem(editor.elements.inventoryId.value).unit;};editor.elements.inventoryId.onchange=show;show();
}

function installStoredTire(id,positionId){
 if(!activeBikes().length)return toast('Lege zuerst ein Fahrrad an.');
 modal('Reifen wieder einbauen',`<div class="form-grid">${bikeSelect(activeBikes()[0].id,activeBikes())}${select('tirePosition','Position',[['Vorderreifen','Vorderrad'],['Hinterreifen','Hinterrad']],'Vorderreifen')}${input('date','Einbaudatum',today(),'date',`required max="${today()}"`)}</div><p class="help">Der aktuelle Kilometerstand des Fahrrads wird als Einbau-km übernommen. Frühere Nutzungsabschnitte bleiben erhalten.</p>`,async form=>{
  const next=installTire(data,id,positionId,form.get('bikeId'),form.get('tirePosition'),form.get('date'));
  if(await mutate(()=>{data.bikes=next.bikes;data.inventory=next.inventory;})){closeModal();toast('Reifen eingebaut.');}
 });
}

function tireHistoryView(history=[]){
 return `<details><summary>Frühere Nutzungsabschnitte (${history.length})</summary>${history.map(h=>`<p>${esc(h.bikeName)} · ${date(h.installedDate)} bis ${date(h.removedDate)} · ${h.mileage===null?'Laufleistung unbekannt':number(h.mileage)+' km'}</p>`).join('')}</details>`;
}
