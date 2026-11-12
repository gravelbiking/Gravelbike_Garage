// Shared service calculations are included by the build.
const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(v);
const number=v=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(Number(v)||0), date=v=>v?new Date(v+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}):'–', today=()=>new Date().toLocaleDateString('sv-SE');
const componentTabs=new Map();
let passwordStatus=null;
let data={bikes:[],plans:[],history:[],documents:[],inventory:[],shopping:[],contacts:[],appointments:[],tools:[],computers:[]},version=0,username='',filter='all',query='',historyBikeId=null,busy=false,notifShown=new Set();
const bike=id=>data.bikes.find(b=>b.id===id), plans=id=>data.plans.filter(p=>p.bikeId===id), uid=()=>crypto.randomUUID();
const bicycle=(color='#89967b')=>`<svg viewBox="0 0 440 225" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="220" cy="207" rx="191" ry="7" fill="#233e32" opacity=".06"/><g stroke="#344037" stroke-width="5"><circle cx="103" cy="137" r="64"/><circle cx="340" cy="137" r="64"/></g><g stroke="#73806e" stroke-width=".7" opacity=".48">${[0,30,60,90,120,150].map(a=>`<path d="M${103+61*Math.cos(a*Math.PI/180)} ${137+61*Math.sin(a*Math.PI/180)}L${103-61*Math.cos(a*Math.PI/180)} ${137-61*Math.sin(a*Math.PI/180)}M${340+61*Math.cos(a*Math.PI/180)} ${137+61*Math.sin(a*Math.PI/180)}L${340-61*Math.cos(a*Math.PI/180)} ${137-61*Math.sin(a*Math.PI/180)}"/>`).join('')}</g><g stroke="${color}" stroke-width="9" stroke-linejoin="round"><path d="M103 137L173 61L215 141L103 137L161 64L286 64L215 141L310 97"/><path d="M286 43L340 137"/></g><g stroke="#283b30" stroke-width="5" stroke-linecap="round"><path d="M173 61L163 37M144 35L182 35M286 43L282 29L311 29Q333 30 322 49L313 53M215 141L235 160L249 160M215 141L194 124L184 124"/></g><circle cx="215" cy="141" r="15" stroke="#46523f" stroke-width="3"/><path d="M103 140L214 156M103 134L214 126" stroke="#46523f" stroke-width="1.5"/></svg>`;
async function api(path,options={}){try{return await garageRuntime.request(async signal=>{const response=await fetch('/api/'+path,{cache:'no-store',...options,signal,headers:{...(options.body&&!(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...options.headers}});const result=await response.json();if(!response.ok){if((response.status===401&&path!=='auth')||response.status===428)showAuth();const error=Error(result.error||'Anfrage fehlgeschlagen.');error.httpStatus=response.status;throw error;}return result;},{signal:options.signal,timeout:options.body instanceof FormData?60000:20000,context:path});}catch(error){garageRuntime.log(error,path);if(options.method&&options.method!=='GET')garageRuntime.failure(error,()=>load());throw error;}}

function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),5000);}
async function mutate(fn){if(busy)return;busy=true;const previous=structuredClone(data),reloadView=captureReloadView();$('#sync').textContent='◌ Speichert …';try{fn();syncDocumentCatalog();const result=await api('data',{method:'PUT',body:JSON.stringify({data,version})});version=result.version;$('#sync').textContent='● Synchronisiert';render();scheduleReload(true,reloadView);return true;}catch(e){garageRuntime.log(e,'save');data=previous;$('#sync').textContent='○ Nicht gespeichert';toast(e.message);const retry=$('#editor [type=submit]');if(retry)retry.textContent='Erneut versuchen';return false;}finally{busy=false;}}
function status(p){return due(p,bike(p.bikeId),today());}
function dueText(p){const d=status(p);return [p.nextDate?date(p.nextDate):'',d.km!==null?(d.km<=0?`${number(Math.abs(d.km))} km überfällig`:`noch ${number(d.km)} km`):''].filter(Boolean).join(' · ');}
function badge(value,text){return `<span class="badge ${value}"><span class="notification-dot"></span>${esc(text||({overdue:'Service fällig',soon:'Demnächst fällig',ok:'Alles im grünen Bereich'}[value]))}</span>`;}
function bikeStatus(b){const states=plans(b.id).map(p=>status(p).status);return states.includes('overdue')?'overdue':states.includes('soon')?'soon':'ok';}
function heading(title,subtitle,action='',label='DEINE FAHRRADGARAGE'){return `<div class="page-heading"><div><div class="eyebrow">${label}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;}
const newBikeButton='<button class="primary" data-action="bike-new">＋ Fahrrad hinzufügen</button>';
function empty(title,text,action=''){return `<div class="empty"><div class="empty-symbol">↗</div><h3>${title}</h3><p>${text}</p>${action}</div>`;}
function bikeCard(b){return `<article class="bike-card"><a href="#bike/${b.id}" class="bike-visual" style="background:${esc(b.tint||'#e9ede3')}"><span class="type-tag">${esc(b.type||'FAHRRAD').toUpperCase()}${b.jobrad?' · JOBRAD':''}</span>${b.photo?`<img width="640" height="400" src="/api/files/${esc(b.photo)}" alt="${esc(b.name)}">`:bicycle(b.color||'#879576')}</a><div class="bike-info"><a href="#bike/${b.id}"><h3>${esc(b.name)}</h3></a><p>${esc([b.brand,b.model,b.year].filter(Boolean).join(' · ')||'Dein nächstes Abenteuer wartet.')}</p><div class="bike-meta"><span class="km">↗ ${number(b.km)} <span class="muted">km</span></span>${b.archived?badge('ok','Archiviert'):badge(bikeStatus(b),!plans(b.id).length?'Noch kein Intervall':null)}</div>${nextService(b)}</div></article>`;}
function legacyServiceRow(p){const b=bike(p.bikeId);if(!b)return '';const s=status(p);return `<div class="list-row"><span class="row-icon">${s.status==='overdue'?'◷':'⚒'}</span><div class="row-copy"><strong><a href="${recordRoute('plan',p.id)}">${esc(p.title)}</a></strong><small><a href="#bike/${b.id}">${esc(b.name)}</a> · ${esc(dueText(p))}</small>${p.contactId?`<small>Werkstatt: ${esc(contact(p.contactId)?.name||'–')}</small>`:''}<div class="receipt-links">${guideLinks(p.guideIds)} ${receiptLinks(p.attachments)}</div></div><div class="row-end">${badge(s.status,s.status==='overdue'?'Fällig':s.status==='soon'?'Demnächst':'Geplant')}<div class="actions" style="margin-top:7px"><button class="small-button" data-action="service-done" data-id="${p.id}">Erledigen</button><button class="small-button" data-action="plan-edit" data-id="${p.id}">Bearbeiten</button><button class="small-button" data-action="plan-order" data-id="${esc(p.id)}">Auftrag starten</button><button class="small-button" data-action="purchase-plan" data-id="${esc(p.id)}">Material planen</button></div></div></div>`;}
function historyRow(h){return `<div class="list-row"><span class="row-icon">✓</span><div class="row-copy"><strong><a href="${recordRoute('entry',h.id)}">${esc(h.title)}</a></strong><small>${esc(bike(h.bikeId)?.name||'Fahrrad')} · ${date(h.date)} · ${number(h.km)} km</small>${h.notes?`<div class="history-note">${esc(h.notes)}</div>`:''}${h.workshop||h.contactId?`<small>Werkstatt: ${esc(h.workshop||contact(h.contactId)?.name||'–')}</small>`:''}${h.part?`<small>Eingebaut: ${esc(h.part)}</small>`:''}${h.materials?.length?`<small>Verbraucht: ${h.materials.map(m=>esc(m.name)+' · '+amount(m.quantity)+' '+esc(m.unit)).join(', ')}</small>`:''}</div><div class="row-end">${h.cost?`<span class="cost">${number(h.cost)} €</span>`:''}<button class="small-button" data-action="history-edit" data-id="${h.id}">Bearbeiten</button><div class="receipt-links">${receiptLinks(h.attachments)}</div></div></div>`;}
function sortedPlans(rows=data.plans){return rows.filter(p=>!p.completed&&!bike(p.bikeId)?.archived).sort((a,b)=>({overdue:0,soon:1,ok:2}[status(a).status]-{overdue:0,soon:1,ok:2}[status(b).status])||(a.nextDate||'9999').localeCompare(b.nextDate||'9999'));}
function dashboard(){const bikes=activeBikes(),duePlans=sortedPlans().filter(p=>status(p).status!=='ok'),history=[...data.history].sort((a,b)=>b.date.localeCompare(a.date));return passwordExpiryNotice()+whatsNewNotice()+heading('Alles bereit für die nächste Tour.',`Deine Fahrräder, dein Service, dein Überblick.`,`<div class="actions"><button class="secondary" data-action="ride-km" ${bikes.length?"":"disabled"}>Gefahrene Kilometer</button>${newBikeButton}</div>`)+`<div class="stats"><a class="stat" href="#parking"><div class="stat-label">Meine Fahrräder <span>◎</span></div><div class="stat-value">${bikes.length}<small>${bikes.length===1?'Rad':'Räder'}</small></div><div class="stat-note">Deine persönliche Garage</div></a><a class="stat" href="#inventory"><div class="stat-label">Lagerartikel <span>▦</span></div><div class="stat-value">${number(data.inventory.length)}<small>Artikel</small></div><div class="stat-note">Artikel im Lager</div></a><a class="stat" href="#service"><div class="stat-label">Service im Blick <span>◷</span></div><div class="stat-value" style="color:${duePlans.length?'#ac653b':'inherit'}">${duePlans.length}<small>Termine</small></div><div class="stat-note">Fällig oder in 30 Tagen / 200 km</div></a><a class="stat" href="#documents"><div class="stat-label">Dokumente <span>▤</span></div><div class="stat-value">${allDocuments().length}<small>Dateien</small></div><div class="stat-note">Verträge & Belege an einem Ort</div></a></div><div class="section-title"><h2>Meine Fahrräder <span class="muted">(${bikes.length})</span></h2><a href="#parking">Alle Fahrräder ansehen ↗</a></div>${bikes.length?`<div class="bike-grid">${bikes.slice(0,2).map(bikeCard).join('')}</div>`:empty('Deine Garage wartet auf das erste Rad.','Lege dein Fahrrad an. Ausstattung, Kilometerstand, Verträge und Service bekommen hier ihren Platz.',newBikeButton)}<div class="lower-grid"><section><div class="section-title"><h2>Nächste Services</h2><a href="#service">Serviceplan ↗</a></div><div class="panel">${duePlans.length?duePlans.slice(0,3).map(serviceRow).join(''):empty('Alles entspannt.','Hier erscheinen Services, die bald oder bereits fällig sind.',bikes.length?'<button class="secondary" data-action="plan-new">＋ Intervall anlegen</button>':'')}</div></section><section><div class="section-title"><h2>Zuletzt erledigt</h2><a href="#history">Servicebuch ↗</a></div><div class="panel">${history.length?history.slice(0,3).map(historyRow).join(''):empty('Jede Pflege zählt.','Dokumentiere deine erste Wartung und baue die Geschichte deiner Räder auf.',bikes.length?'<button class="secondary" data-action="history-new">＋ Wartung eintragen</button>':'')}</div></section></div>`+purchasingTile();}
function bikesPage(){const visible=activeBikes().filter(b=>(filter==='all'||(filter==='jobrad'?b.jobrad:b.type===filter))&&[b.name,b.brand,b.model,b.serial].join(' ').toLowerCase().includes(query.toLowerCase()));return heading('Fahrradparkplatz','Jedes Rad hat seine Geschichte. Hier hältst du sie fest.',newBikeButton)+`<div class="filters">${['all','Gravelbike','Rennrad','Mountainbike','E-Bike','jobrad'].map(t=>`<button class="chip ${filter===t?'active':''}" data-action="filter" data-id="${t}">${{all:'Alle Fahrräder',jobrad:'Jobrad'}[t]||t}</button>`).join('')}<input class="search" id="bikeSearch" aria-label="Fahrräder durchsuchen" placeholder="Fahrrad suchen …" value="${esc(query)}"></div>${visible.length?`<div class="bike-grid">${visible.map(bikeCard).join('')}</div>`:empty(data.bikes.length?'Kein Fahrrad gefunden.':'Dein erstes Fahrrad.','Erfasse dein Rad mit Foto, Seriennummer und kompletter Ausstattung.',newBikeButton)}`;}
function detail(id){const b=data.bikes.find(b=>encodeURIComponent(b.id)===id);if(!b)return empty('Fahrrad nicht gefunden.','Kehre zu deiner Garage zurück.','<a class="primary" href="#bikes">Zur Garage</a>');id=b.id;return `<a class="back" href="#${b.archived?'archive':'parking'}">← ${b.archived?'Fahrradarchiv':'Fahrradparkplatz'}</a>`+heading(esc(b.name),esc([b.brand,b.model,b.type].filter(Boolean).join(' · ')),`<div class="actions"><button class="secondary" data-action="bike-edit" data-id="${id}">Bearbeiten</button><button class="secondary" data-action="bike-archive" data-id="${esc(b.id)}">${b.archived?'Wieder aktivieren':'Archivieren'}</button><button class="primary" data-action="km" data-id="${id}">↗ Kilometerstand</button></div>`,'DEIN FAHRRAD')+`<div class="biography-actions"><a class="secondary" href="api.php?route=biography&amp;bike=${encodeURIComponent(b.id)}&amp;kind=seller">Verkaufs-Lebenslauf ↗</a><a class="secondary" href="api.php?route=biography&amp;bike=${encodeURIComponent(b.id)}&amp;kind=workshop">Werkstatt-Lebenslauf ↗</a></div><div class="detail-grid"><div class="bike-visual" style="background:${esc(b.tint||'#e9ede3')}">${b.photo?`<img width="640" height="400" src="/api/files/${esc(b.photo)}" alt="${esc(b.name)}" style="border-radius:12px">`:bicycle(b.color)}<span class="type-tag">${esc(b.type)}${b.jobrad?' · JOBRAD':''}</span></div><div class="panel"><h3>Steckbrief</h3><div class="detail-facts">${[['Kilometerstand',number(b.km)+' km'],['Seriennummer',b.serial||'–'],['Baujahr',b.year||'–'],['Modelljahr',b.modelYear||'–'],['Rahmenfarbe',b.frameColor||'–'],['Rahmenmaterial',b.frameMaterial||'–'],['Fahrradgewicht',b.weightKg==null?'–':amount(b.weightKg)+' kg'],['Rahmengröße',b.size||'–'],['Kaufdatum',date(b.purchaseDate)],['Kaufpreis',b.price?number(b.price)+' €':'–']].map(([a,c])=>`<div><small>${a}</small><strong>${esc(c)}</strong></div>`).join('')}</div></div></div>${leasingView(b)}${b.notes?`<div class="notice" style="white-space:pre-wrap">${esc(b.notes)}</div>`:''}<div class="section-title"><h2>Ausstattung & Konfiguration</h2><button data-action="bike-edit" data-id="${id}">Bearbeiten ↗</button></div><div class="panel" id="bike-components">${componentsView(b)}</div><div class="section-title"><h2>Serviceplan</h2><button data-action="plan-new" data-id="${id}">＋ Intervall anlegen</button></div><div class="panel">${plans(id).length?sortedPlans().filter(p=>p.bikeId===id).map(serviceRow).join(''):empty('Noch kein Intervall','Zeit, Kilometer oder beides: Du legst fest, wann dein Rad Pflege braucht.')}</div><div class="section-title"><h2>Servicebuch</h2><button data-action="history-new" data-id="${id}">＋ Wartung eintragen</button></div><div class="panel">${data.history.some(h=>h.bikeId===id)?data.history.filter(h=>h.bikeId===id).sort((a,b)=>b.date.localeCompare(a.date)).map(historyRow).join(''):empty('Noch keine Wartung','Halte hier fest, was du wann ausgetauscht oder gewartet hast.')}</div><div class="section-title"><h2>Verträge & Dokumente</h2><button data-action="document-new" data-id="${id}">＋ Dokument hinzufügen</button></div><div class="panel">${(b.attachments||[]).length?`<div class="receipt-links">${receiptLinks(b.attachments)}</div>`:''}${data.documents.some(d=>d.bikeId===id)?data.documents.filter(d=>d.bikeId===id).map(d=>documentRow(d)).join(''):(b.attachments||[]).length?'':empty('Alles an einem Ort','Kaufvertrag, Leasingvertrag, Servicevertrag und Rechnungen sicher ablegen.')}</div>`;}
function legacyServicePage(){const visible=sortedPlans().filter(p=>filter==='all'||status(p).status===filter);return heading('Serviceplan','Gut gepflegt fährt es sich weiter.',`<button class="primary" data-action="plan-new">＋ Intervall anlegen</button>`)+`<div class="filters">${[['all','Alle Services'],['overdue','Fällig'],['soon','Demnächst'],['ok','Geplant']].map(([k,v])=>`<button class="chip ${filter===k?'active':''}" data-action="filter" data-id="${k}">${v}</button>`).join('')}<button class="secondary" data-action="calendar" style="margin-left:auto">↓ Kalenderexport</button></div><div class="panel">${visible.length?visible.map(serviceRow).join(''):empty('Hier bleibt dein Service im Blick.','Lege wiederkehrende Intervalle oder einen Servicetermin aus deinem Jobrad-Vertrag an.')}</div><div class="notice">Ein Service wird fällig, sobald das Datum <strong>oder</strong> der Kilometerstand erreicht ist. Die Vorwarnung beginnt 30 Tage oder 200 km vorher. Kilometerbasierte Hinweise benötigen einen aktuellen Kilometerstand.</div>`+appointmentsView()+shoppingList();}
function historyPage(){
 const selected=bike(historyBikeId)||data.bikes[0];historyBikeId=selected?.id||null;
 const entries=selected?data.history.filter(h=>h.bikeId===selected.id).sort((a,b)=>b.date.localeCompare(a.date)):[];
 return heading('Dein Servicebuch','Wähle dein Fahrrad und sieh seine Wartungshistorie.',selected?`<button class="primary" data-action="history-new" data-id="${esc(selected.id)}">＋ Wartung eintragen</button>`:'')+(selected?`<div class="panel" id="history-bikes"><div class="component-tabs history-bike-tabs" role="tablist" aria-label="Fahrräder im Servicebuch">${data.bikes.map((b,i)=>`<button type="button" role="tab" id="history-bike-tab-${i}" aria-controls="history-bike-panel" aria-selected="${b.id===selected.id}" tabindex="${b.id===selected.id?0:-1}" data-action="history-tab" data-id="${esc(b.id)}">${esc(b.name)}<span>${data.history.filter(h=>h.bikeId===b.id).length}</span></button>`).join('')}</div><div id="history-bike-panel" role="tabpanel" tabindex="0" aria-labelledby="history-bike-tab-${data.bikes.indexOf(selected)}">${entries.length?entries.map(historyRow).join(''):empty('Noch keine Wartung für dieses Fahrrad.','Dokumentiere die erste Wartung von '+esc(selected.name)+'.')}</div></div>`:empty('Dein Servicebuch wartet auf das erste Rad.','Lege ein Fahrrad an, um seine Wartungen zu dokumentieren.',newBikeButton));
}
function selectHistoryTab(id){
 if(!bike(id))return;historyBikeId=id;render();
 $('#history-bikes [aria-selected="true"]').focus({preventScroll:true});
}
function render(){try{renderPage();}catch(error){garageRuntime.fatal(error);}}
function modal(title,body,onSubmit){$('#modalTitle').textContent=title;$('#modalBody').innerHTML=`<form id="editor">${body}<div class="form-error" id="formError" role="alert"></div><div class="form-footer"><button type="button" class="secondary" data-action="close">Abbrechen</button><button type="submit" class="primary">Speichern</button></div></form>`;$('#editor').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await onSubmit(new FormData(e.target));}catch(error){garageRuntime.log(error,'form');$('#formError').textContent=error.message;button.textContent='Erneut versuchen';}finally{button.disabled=false;}};$('#modal').showModal();}
const input=(name,label,value='',type='text',extra='')=>{
 if(type==='number'&&['km','componentKm','nextKm','intervalKm','completedKm','distance'].includes(name)){
  value=kmInputValue(value);extra=extra.replace(/\b(min|max)="([^"]+)"/g,(_,key,v)=>`${key}="${kmInputValue(v)}"`);
 }
 return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
};
const select=(name,label,values,value)=>`<label>${label}<select name="${name}">${values.map(v=>{const [id,text]=Array.isArray(v)?v:[v,v];return `<option value="${esc(id)}" ${id===value?'selected':''}>${esc(text)}</option>`;}).join('')}</select></label>`;
const bikeSelect=(id,bikes=data.bikes)=>select('bikeId','Fahrrad',bikes.map(b=>[b.id,b.name]),id||bikes[0]?.id);
const notesInput=value=>`<label class="span2">Notizen<textarea name="notes" maxlength="10000">${esc(value)}</textarea></label>`;
function requireBike(){if(data.bikes.length)return true;toast('Lege zuerst dein Fahrrad an.');location.hash='parking';return false;}
async function upload(file){const form=new FormData();form.append('file',file);return api('files',{method:'POST',body:form});}
function componentsView(b){
 const categories=Object.keys(componentCategories()),parts=b.components||[];
 const selected=componentTabs.get(b.id),active=categories.includes(selected)?selected:(categories.find(category=>parts.some(c=>componentCategory(c)===category))||categories[0]);
 return `<div class="component-tabs" role="tablist" aria-label="Bauteilkategorien">${categories.map((category,i)=>`<button type="button" role="tab" id="component-tab-${i}" aria-controls="component-panel-${i}" aria-selected="${category===active}" tabindex="${category===active?0:-1}" data-action="component-tab" data-id="${esc(b.id)}" data-category="${category}">${category}<span>${parts.filter(c=>componentCategory(c)===category).length}</span></button>`).join('')}</div>${categories.map((category,i)=>{
  const items=parts.filter(c=>componentCategory(c)===category);
  return `<section class="component-group component-tabpanel" id="component-panel-${i}" role="tabpanel" aria-labelledby="component-tab-${i}" ${category===active?'':'hidden'}>${items.length?items.map(c=>{
   const usage=componentMileage(c,b,data.history);
   return `<div class="component-detail"><div class="component-heading"><strong>${esc(c.name)}</strong><div class="component-heading-actions"><span class="badge ${usage.reason==='odometer'?'overdue':''}">${usage.km!==null?number(usage.km)+' km Laufleistung':usage.reason==='odometer'?'Kilometerstand prüfen':'Einbau-km fehlen'}</span><button type="button" class="secondary component-edit-button" data-action="component-edit" data-id="${esc(b.id)}" data-component-id="${esc(c.id||'')}" data-component-index="${parts.indexOf(c)}" aria-label="${esc(c.name)} bearbeiten">Bearbeiten</button><button type="button" class="secondary component-delete-button" data-action="component-delete" data-id="${esc(b.id)}" data-component-id="${esc(c.id||'')}" data-component-index="${parts.indexOf(c)}" aria-label="${esc(c.name)} ${category==='Reifen'?'ausbauen':'löschen'}">${category==='Reifen'?'Ausbauen':'Löschen'}</button></div></div><div class="component-facts"><div><small>Hersteller</small><span>${esc(c.manufacturer||'–')}</span></div><div><small>Modell</small><span>${esc(c.model||'–')}</span></div>${componentSpecificationsView(c)}${c.tireHistory?`<div><small>Gesamtlaufleistung über alle Nutzungen</small><span>${tireLifetime(c,b,data.history)===null?'Teilweise unbekannt':number(tireLifetime(c,b,data.history))+' km'}</span></div>`:''}<div><small>Einbaudatum</small><span>${date(c.installedDate)}</span></div><div><small>Kilometerstand beim Einbau</small><span>${usage.baseline!==null?number(usage.baseline)+' km':'–'}${usage.source==='reading'?' · aus Aufzeichnung':''}</span></div>${hasPurchaseFields(c)?`<div><small>Original-Teilenummer</small><span class="mono">${esc(c.originalPartNumber||'–')}</span></div><div><small>Preis</small><span>${c.price!==null&&c.price!==undefined&&c.price!==''?money(c.price):'–'}</span></div><div><small>Zuletzt gekauft bei</small><span>${esc(c.lastPurchasedAt||'–')}</span></div>`:''}${category==='Räder'?wheelFields().map(field=>{const value=c.wheel?.[field.key];return `<div><small>${esc(field.label)}</small><span>${field.type==='date'?date(value):field.type==='number'?(value!==null&&value!==undefined&&value!==''?number(value)+' mm':'–'):esc(value||'–')}</span></div>`;}).join(''):''}${c.name==='Hinterrad'?`<div><small>Freilaufkörper</small><span>${esc(c.wheel?.freehub||'–')}</span></div>`:''}${category==='Reifen'?`<div><small>Reifenbreite</small><span>${c.tireWidth==null?'–':amount(c.tireWidth)+' '+esc(c.tireUnit||'mm')}</span></div>`:''}${componentToolsView(c)}</div>${c.tireHistory?tireHistoryView(c.tireHistory):''}</div>`;

  }).join(''):empty('Noch keine Bauteile in '+category,'Ergänze die Ausstattung deines Fahrrads.',`<button class="secondary" data-action="component-new" data-id="${esc(b.id)}" data-category="${category}">＋ Bauteil hinzufügen</button>`)}</section>`;
 }).join('')}`;
}
function selectComponentTab(id,category){
 const b=bike(id),host=$('#bike-components');if(!b||!host)return;
 componentTabs.set(id,category);host.innerHTML=componentsView(b);
 host.querySelector('[role="tab"][aria-selected="true"]').focus({preventScroll:true});
}
function componentEditor(c={},index='',{standalone=false}={}){
 const category=componentCategory(c),listId='component-types-'+uid(),expanded=standalone||!c.name;
 return `<div class="editor-component ${standalone?'standalone-component':''}"><input type="hidden" name="componentIndex" value="${esc(index)}"><input type="hidden" name="componentId" value="${esc(c.id||uid())}"><div class="component-editor-heading"><button type="button" class="component-toggle" data-action="component-toggle" aria-expanded="${expanded}" aria-controls="${listId}-body"><strong class="component-title">${esc(c.name||'Neues Bauteil')}</strong><small class="component-state">${esc(category)} · ${c.name?'Gespeichert':'Noch nicht gespeichert'}</small></button><button type="button" data-action="component-remove" aria-label="Bauteil entfernen">×</button></div><div class="component-body" id="${listId}-body" ${expanded?'':'hidden'}><div class="form-grid">${select('componentCategory','Kategorie',Object.keys(componentCategories()),category)}${input('componentName','Bauteil',c.name,'text',`list="${listId}" maxlength="120" placeholder="Auswählen oder frei benennen"`)}<datalist id="${listId}" class="component-types">${componentCategories()[category].map(name=>`<option value="${esc(name)}">`).join('')}</datalist>${input('componentManufacturer','Hersteller',c.manufacturer,'text','maxlength="200"')}${input('componentModel','Modell',c.model,'text','maxlength="200"')}${componentSpecificationFields(c)}${input('componentDate','Einbaudatum',c.installedDate,'date',`max="${today()}"`)}${input('componentKm','Kilometerstand beim Einbau',c.installedKm,'number','min="0" step="0.1" placeholder="z. B. 1250"')}</div><fieldset class="purchase-editor wheel-editor" ${hasPurchaseFields(c)?'':'hidden'}><legend>Ersatzteil & Einkauf</legend><div class="form-grid">${input('componentOriginalPartNumber','Original-Teilenummer',c.originalPartNumber,'text','maxlength="200"')}${input('componentPrice','Preis (€)',c.price,'number','min="0" step="0.01"')}${input('componentLastPurchasedAt','Zuletzt gekauft bei',c.lastPurchasedAt,'text','maxlength="500" placeholder="Shop, Händler oder Website"')}</div></fieldset><fieldset class="wheel-editor wheel-specs" ${category==='Räder'?'':'hidden'}><legend>Raddaten</legend><div class="form-grid">${wheelFields().map(field=>input('wheel_'+field.key,field.label,c.wheel?.[field.key],field.type,field.type==='number'?'min="0" step="0.1"':field.type==='date'?`max="${today()}"`:`maxlength="200" placeholder="${esc(field.placeholder||'')}"`)).join('')}</div></fieldset>${extraComponentEditor(c)}<p class="component-usage help" aria-live="polite"></p><p class="form-error component-error" role="alert"></p><div class="component-save-bar"><span class="help">Sichert dieses Bauteil als Zwischenstand.</span><button type="button" class="primary" data-action="component-save">Bauteil speichern</button></div></div></div>`;
}
function updateComponentPreviews(){
 const form=$('#editor');if(!form||!$('#components'))return;
 const original=bike(form.dataset.bikeId),current={...original,id:original?.id,km:Number(form.elements.namedItem('km')?.value??original?.km??0)};
 for(const row of form.querySelectorAll('.editor-component')){
  const km=row.querySelector('[name="componentKm"]').value;
  const c={installedDate:row.querySelector('[name="componentDate"]').value,installedKm:km===''?null:Number(km)};
  const usage=componentMileage(c,current,data.history);updateComponentSpecifications(row);row.querySelector('.rear-freehub').hidden=row.querySelector('[name="componentName"]').value.trim()!=='Hinterrad';row.querySelector('.tire-specs').hidden=row.querySelector('[name="componentCategory"]').value!=='Reifen';
  row.querySelector('.purchase-editor').hidden=!hasPurchaseFields({name:row.querySelector('[name="componentName"]').value});
  row.querySelector('.component-usage').textContent=usage.km!==null?`Aktuelle Laufleistung: ${number(usage.km)} km${usage.source==='reading'?' · Einbau-km aus Aufzeichnung am Einbaudatum':''}`:usage.reason==='odometer'?'Der aktuelle Kilometerstand liegt unter den Einbau-km. Bitte die Kilometerstände prüfen.':'Für die Laufleistung die Einbau-km ergänzen. Das Datum allein liefert keine gefahrenen Kilometer.';
 }
}
function readComponentRow(row,base){
 const value=name=>row.querySelector(`[name="${name}"]`).value;
 const name=value('componentName').trim(),index=value('componentIndex'),id=value('componentId');
 const known=knownComponentCategory(name);if(known){row.querySelector('[name="componentCategory"]').value=known;row.querySelector('.component-types').innerHTML=componentCategories()[known].map(type=>`<option value="${esc(type)}">`).join('');row.querySelector('.wheel-specs').hidden=known!=='Räder';}
 const meaningful=['componentManufacturer','componentModel','componentSerial','componentDate','componentKm','componentOriginalPartNumber','componentPrice','componentLastPurchasedAt',...wheelFields().map(f=>'wheel_'+f.key),'freehub','tireWidth'];
 if(!name){if(meaningful.some(key=>value(key)!==''))throw Error('Bitte jedes ausgefüllte Bauteil benennen.');return null;}
 for(const input of row.querySelectorAll('input,select'))if(!input.checkValidity()){input.reportValidity();throw Error('Bitte die markierten Bauteilfelder prüfen.');}
 const installedDate=value('componentDate');if(installedDate&&(!validISODate(installedDate)||installedDate>today()))throw Error('Bitte ein gültiges Einbaudatum bis heute eingeben.');
 const baseline=value('componentKm')===''?null:Number(value('componentKm'));
 if(baseline!==null&&(!Number.isFinite(baseline)||baseline<0))throw Error('Die Einbau-km müssen eine Zahl ab 0 sein.');
 const prior=base.components?.find(c=>c.id===id)||(index!==''&&!base.components?.[Number(index)]?.id?base.components?.[Number(index)]:null)||{};
 const wheel={...(prior.wheel||{})};
 for(const field of wheelFields()){
  const raw=value('wheel_'+field.key);
  if(field.type==='date'&&raw&&(!validISODate(raw)||raw>today()))throw Error('Bitte ein gültiges Lagerservicedatum bis heute eingeben.');
  wheel[field.key]=field.type==='number'?(raw===''?null:Number(raw)):raw;
  if(field.type==='number'&&wheel[field.key]!==null&&(!Number.isFinite(wheel[field.key])||wheel[field.key]<0))throw Error('Felgenhöhe und Innenmaulweite müssen Zahlen ab 0 sein.');
 }
 wheel.freehub=value('freehub').trim();const tireWidth=value('tireWidth')===''?null:Number(value('tireWidth'));
 const price=value('componentPrice')===''?null:Number(value('componentPrice'));
 if(price!==null&&(!Number.isFinite(price)||price<0))throw Error('Bitte einen gültigen Teilepreis ab 0 eingeben.');
 return {...prior,id,name,manufacturer:value('componentManufacturer'),model:value('componentModel'),...readComponentSpecifications(value,name,prior),category:value('componentCategory'),installedDate,installedKm:baseline===null?null:kmFromInput(baseline,prior.installedKm),wheel,tireWidth,tireUnit:value('tireUnit'),toolIds:prior.toolIds||[],originalPartNumber:value('componentOriginalPartNumber').trim(),price,lastPurchasedAt:value('componentLastPurchasedAt').trim()};
}
function setComponentExpanded(row,expanded){
 row.querySelector('.component-body').hidden=!expanded;
 const toggle=row.querySelector('.component-toggle');toggle.setAttribute('aria-expanded',String(expanded));
 if(!expanded){toggle.focus({preventScroll:true});row.scrollIntoView({block:'nearest'});}
}
function lockEditor(form){
 const controls=[...form.querySelectorAll('button,input,select,textarea')].map(control=>[control,control.disabled]);
 controls.forEach(([control])=>control.disabled=true);
 return ()=>controls.forEach(([control,disabled])=>control.disabled=disabled);
}
function deleteComponent(bikeId,index,componentId=''){
 const selected=bike(bikeId)?.components?.find((c,i)=>componentId?c.id===componentId:i===index);if(selected&&componentCategory(selected)==='Reifen'){editOrder(undefined,'',undefined,{bikeId,key:installedComponentKey(selected,index)});return;}

 const b=bike(bikeId),part=componentId?b?.components?.find(c=>c.id===componentId):Number.isInteger(index)&&index>=0?b?.components?.[index]:null;
 if(!b||!part){toast('Dieses Bauteil wurde nicht gefunden. Bitte die Ansicht neu laden.');return;}
 modal('Bauteil löschen?',`<p>Möchtest du <strong>${esc(part.name)}</strong> aus <strong>${esc(b.name)}</strong> löschen?</p><p class="help">Das Bauteil wird aus der Ausstattung entfernt. Vorhandene Servicebucheinträge bleiben erhalten.</p>`,async()=>{
  if(busy)return;
  const current=bike(bikeId),position=componentId?current?.components?.findIndex(c=>c.id===componentId):index;
  if(!current||!Number.isInteger(position)||position<0||!current.components?.[position]||(!componentId&&JSON.stringify(current.components[position])!==JSON.stringify(part)))throw Error('Das Bauteil hat sich geändert. Bitte die Ansicht neu laden.');
  const unlock=lockEditor($('#editor'));
  try{
   if(await mutate(()=>{current.components=current.components.filter((c,i)=>i!==position);})){closeModal();toast('Bauteil gelöscht.');}
   else $('#formError').textContent='Nicht gelöscht. Bitte versuche es erneut.';
  }finally{unlock();}
 });
 const submit=$('#editor [type="submit"]');submit.textContent='Bauteil löschen';submit.className='danger';
}
function editComponent(bikeId,index,componentId=''){
 const b=bike(bikeId),original=componentId?b?.components?.find(c=>c.id===componentId):Number.isInteger(index)&&index>=0?b?.components?.[index]:null;
 if(!b||!original){toast('Dieses Bauteil wurde nicht gefunden. Bitte die Ansicht neu laden.');return;}
 modal(original.name+' bearbeiten',`<p class="help">${esc(b.name)} · Nur dieses Bauteil wird geändert.</p><div id="components">${componentEditor(original,index,{standalone:true})}</div>`,async()=>{
  if(busy)return;
  const current=bike(bikeId),existing=componentId?current?.components?.find(c=>c.id===componentId):current?.components?.[index];
  if(!current||!existing)throw Error('Das Bauteil ist nicht mehr vorhanden. Bitte die Ansicht neu laden.');
  const component=readComponentRow($('#editor .editor-component'),current);if(!component)throw Error('Bitte einen Bauteilnamen eingeben.');
  const form=$('#editor'),unlock=lockEditor(form);
  try{
   if(await mutate(()=>{bike(bikeId).components=upsertComponent(current.components,component,String(index));})){
    componentTabs.set(bikeId,componentCategory(component));closeModal();render();toast('Bauteil gespeichert.');
   }else $('#formError').textContent='Nicht gespeichert. Deine Eingaben bleiben zum erneuten Speichern erhalten.';
  }finally{unlock();}
 });
 $('#editor').dataset.bikeId=bikeId;$('#editor [type="submit"]').textContent='Bauteil speichern';updateComponentPreviews();
}
function editBike(id,{newCategory=null,draft=null}={}){
 let savedId=id,b=structuredClone(bike(id)||{id:uid(),km:0,type:'',components:[]});
 modal(id?'Fahrrad bearbeiten':'Dein Fahrrad hinzufügen',draft?.html||`<details class="bike-basics" ${id?'':'open'}><summary>Fahrrad-Grunddaten <span class="basics-summary">${esc(b.name||'Name und Kilometerstand')}</span></summary><div class="form-grid">${input('name','Spitzname deines Fahrrads',b.name,'text','required maxlength="120" placeholder="z. B. Mein Canyon Grizl"')}${bikeTypeInput(b.type)}${input('brand','Hersteller',b.brand)}${input('model','Modell',b.model)}${input('serial','Rahmen-Seriennummer',b.serial)}${input('size','Rahmengröße',b.size)}${input('km','Kilometerstand',b.km,'number','min="0" step="0.1" required')}${input('purchaseDate','Kaufdatum',b.purchaseDate,'date')}${input('price','Kaufpreis (€)',b.price,'number','min="0" step="0.01"')}${select('jobrad','Jobrad / Leasing',[['no','Nein'],['yes','Ja']],b.jobrad?'yes':'no')}${bikeExtraEditor(b)}${bikePhotoEditor(b)}${notesInput(b.notes||'')}</div>${bikeLinkedDocuments(b)}</details><div class="bike-parts"><label>Ausstattung & Anbauteile</label><p class="help">Wähle Kategorie und Bauteil. Laufleistung = aktueller Kilometerstand − Kilometerstand beim Einbau. Eine eindeutige Aufzeichnung am Einbaudatum kann die Einbau-km ergänzen.</p><div id="components" class="editor-components">${(b.components?.length?b.components:[{}]).map((c,i)=>componentEditor(c,i)).join('')}</div><button class="small-button" type="button" data-action="component-add">＋ Bauteil hinzufügen</button></div>${savedId?`<button class="small-button" style="color:var(--red);margin-top:15px" type="button" data-action="bike-delete" data-id="${savedId}">Fahrrad und zugehörige Einträge löschen</button>`:''}`,async f=>{
  const base=bike(b.id)||b,components=[...$('#components').querySelectorAll('.editor-component')].map(row=>readComponentRow(row,base)).filter(Boolean);
  if(await persist(f,components)){closeModal();location.hash='bike/'+b.id;toast('Fahrrad gespeichert.');}
 });
 const form=$('#editor');bindBikePhoto(form);bindBikeType(form);form.dataset.bikeId=savedId||'';form.elements.jobrad.addEventListener('change',()=>{$('#jobrad-fields').hidden=form.elements.jobrad.value!=='yes';});form.elements.leasingPurchased.addEventListener('change',()=>{$('#leasing-buyout').hidden=!form.elements.leasingPurchased.checked;});form.querySelector('[type="submit"]').textContent='Fahrrad speichern';
 async function persist(f,components){
  if(busy)return false;
  for(const key of ['name','type','customBikeType','km','year','modelYear','weightKg','purchaseDate','price','leasingMonthly','leasingBuyout','insuranceUrl']){const control=form.elements.namedItem(key);if(!control.checkValidity()){form.querySelector('.bike-basics').open=true;control.reportValidity();throw Error('Bitte zuerst die Fahrrad-Grunddaten prüfen.');}}
  const unlock=lockEditor(form);
  try{
   const base=bike(b.id)||b;const photo=await readBikePhoto(form,base.photo);const attachments=base.attachments||[];
   const updated={...base,attachments,name:f.get('name').trim(),type:readBikeType(f),brand:f.get('brand'),model:f.get('model'),serial:f.get('serial'),size:f.get('size'),year:f.get('year')??base.year??'',...readBikeExtra(f,base),km:kmFromInput(f.get('km'),base.km),purchaseDate:f.get('purchaseDate'),price:Number(f.get('price')),jobrad:f.get('jobrad')==='yes',notes:f.get('notes'),color:base.color,photo,components};
   if(!updated.name)throw Error('Bitte zuerst einen Namen für das Fahrrad eingeben.');if(!updated.type)throw Error('Bitte einen Fahrradtyp eingeben.');
   if(!savedId||updated.km!==base.km){updated.kmDate=today();updated.readings=[...(base.readings||[]),{date:today(),km:updated.km,note:'Fahrraddaten aktualisiert'}];}
   const ok=await mutate(()=>{data.bikeTypes=[...new Set([...(data.bikeTypes||[]),updated.type])];if(savedId)data.bikes=data.bikes.map(x=>x.id===savedId?updated:x);else data.bikes.push(updated);});
   if(ok){savedId=updated.id;b=structuredClone(updated);form.dataset.bikeId=savedId;form.querySelector('.bike-basics').open=false;form.querySelector('.basics-summary').textContent=updated.name+' · '+number(updated.km)+' km';form.querySelector('#bikePhotoEditor').outerHTML=bikePhotoEditor(updated);bindBikePhoto(form);$('#modalTitle').textContent='Fahrrad bearbeiten';}
   return ok;
  }finally{unlock();}
 }
 form.saveComponent=async row=>{
  if(busy)return;
  const error=row.querySelector('.component-error');error.textContent='';
  try{
   const component=readComponentRow(row,bike(b.id)||b);if(!component)throw Error('Bitte zuerst einen Bauteilnamen eingeben.');
   const f=new FormData(form),current=bike(b.id)||b;
   const components=upsertComponent(current.components||[],component,row.querySelector('[name="componentIndex"]').value);
   if(await persist(f,components)){
    row.dataset.saved='true';row.querySelector('.component-title').textContent=component.name;row.querySelector('[name="componentCategory"]').value=component.category;row.querySelector('.component-state').textContent=componentCategory(component)+' · Gespeichert';
    setComponentExpanded(row,false);componentTabs.set(b.id,componentCategory(component));render();
    toast('Bauteil gespeichert. Weitere Bauteiländerungen mit „Fahrrad speichern“ sichern.');
   }else error.textContent='Bauteil nicht gespeichert. Deine Eingaben bleiben geöffnet.';
  }catch(e){error.textContent=e.message;}
 };
 if(newCategory){if(!b.components?.length)$('#components').innerHTML='';$('#components').insertAdjacentHTML('beforeend',componentEditor({category:newCategory}));}
 updateComponentPreviews();
}
function legacyEditPlan(id,bikeId){const bikes=activeBikes();if(!bikes.length){toast('Auf dem Fahrradparkplatz steht noch kein aktives Fahrrad.');return;}const p=data.plans.find(x=>x.id===id)||{id:uid(),bikeId:bikes.some(b=>b.id===bikeId)?bikeId:bikes[0].id};modal(id?'Serviceintervall bearbeiten':'Serviceintervall anlegen',`<p class="help">Zeit oder Kilometerstand können einzeln oder gemeinsam gelten. Bei wiederkehrenden Services berechnet die App nach der Erledigung die nächste Fälligkeit.</p><div class="form-grid">${bikeSelect(p.bikeId,bikes)}<p id="planMileage" class="help" aria-live="polite"></p>${input('title','Service / Bauteil',p.title,'text','required maxlength="200" placeholder="z. B. Kette prüfen"')}${input('nextDate','Nächstes Fälligkeitsdatum',p.nextDate,'date')}${input('nextKm','Fällig bei Kilometerstand',p.nextKm,'number','min="0" step="0.1"')}${input('months','Wiederholung alle … Monate',p.months,'number','min="1" max="120" placeholder="leer = einmalig"')}${input('intervalKm','Wiederholung alle … km',p.intervalKm,'number','min="1" placeholder="leer = einmalig"')}${select('source','Grundlage',['Eigene Wartung','Servicevertrag','Leasingvertrag','Herstellervorgabe'],p.source||'Eigene Wartung')}${contactSelect(p.contactId)}${notesInput(p.notes||'')}</div>${guidePicker(p.guideIds)}${receiptEditor(p.attachments,'Dokumente zum Serviceplan')}${id?`<button type="button" class="small-button" style="color:var(--red)" data-action="plan-delete" data-id="${id}">Intervall löschen</button>`:''}`,async f=>{const nextDate=f.get('nextDate'),nextKm=f.get('nextKm');if(!nextDate&&nextKm==='')throw Error('Bitte mindestens Datum oder Kilometerstand angeben.');const updated={...p,bikeId:f.get('bikeId'),title:f.get('title').trim(),nextDate,nextKm:nextKm===''?null:Number(nextKm),months:Number(f.get('months'))||null,intervalKm:Number(f.get('intervalKm'))||null,source:f.get('source'),contactId:f.get('contactId'),notes:f.get('notes')};if(!updated.title)throw Error('Bitte die Wartungsarbeit benennen.');if(updated.months&&!nextDate)throw Error('Für die monatliche Wiederholung bitte auch das nächste Datum angeben.');if(updated.intervalKm&&nextKm==='')throw Error('Für die Kilometerwiederholung bitte den nächsten Kilometerstand angeben.');updated.guideIds=f.getAll('guideIds');updated.attachments=await readReceipts(f,p.attachments);if(await mutate(()=>{if(id){data.plans=data.plans.map(x=>x.id===id?updated:x);if(data.appointments.some(a=>a.planId===id&&a.bikeId!==updated.bikeId))throw Error('Dieser Service ist mit einem Werkstatttermin verknüpft. Bitte zuerst die Terminzuordnung aufheben.');data.shopping=data.shopping.map(x=>x.planId===id?{...x,bikeId:updated.bikeId}:x);}else data.plans.push(updated);})){closeModal();toast('Serviceintervall gespeichert.');}});const showMileage=()=>{$('#planMileage').textContent=planMileageText(bike($('#editor').elements.bikeId.value));};$('#editor').elements.bikeId.addEventListener('change',showMileage);showMileage();}
function editHistory(id,bikeId,planId,appointmentId){const appointment=data.appointments.find(a=>a.id===appointmentId);if(!requireBike())return;const p=data.plans.find(x=>x.id===planId),h=data.history.find(x=>x.id===id)||{id:uid(),bikeId:p?.bikeId||bikeId||data.bikes[0].id,title:p?.title||appointment?.title||'',date:today(),contactId:appointment?.contactId||p?.contactId||'',workshop:contact(appointment?.contactId||p?.contactId)?.name||''};const b=bike(h.bikeId);modal(planId?'Service erledigen':id?'Wartung bearbeiten':'Wartung dokumentieren',`${p?'<p class="help">Das Serviceintervall wird ab dem tatsächlichen Wartungsdatum und Kilometerstand neu berechnet. Einmalige Termine werden abgeschlossen.</p>':''}<div class="form-grid">${bikeSelect(h.bikeId)}${input('title','Durchgeführte Arbeit',h.title,'text','required maxlength="200" list="workTypes"')}<datalist id="workTypes">${['Inspektion','Kette gewechselt','Bremsbeläge gewechselt','Bremsen entlüftet','Reifen gewechselt','Schaltung eingestellt','Lager gewartet','Federgabel gewartet','Akku geprüft','Laufräder zentriert'].map(x=>`<option value="${x}">`).join('')}</datalist>${input('date','Durchgeführt am',h.date,'date',`required max="${today()}"`)}${input('km','Kilometerstand bei Wartung',h.km??b.km,'number','required min="0" step="0.1"')}${input('cost','Kosten (€)',h.cost,'number','min="0" step="0.01"')}${contactSelect(h.contactId)}${input('workshop','Werkstatt / selbst durchgeführt',h.workshop)}${input('part','Eingebautes Teil / Modell',h.part)}${input('partSerial','Seriennummer des neuen Teils',h.partSerial)}${notesInput(h.notes||'')}</div><div id="service-material-container">${serviceMaterialEditor(h,p)}</div>${serviceDocumentsEditor(h)}`,async f=>{const entry={...h,bikeId:f.get('bikeId'),title:f.get('title').trim(),date:f.get('date'),km:kmFromInput(f.get('km'),h.bikeId===f.get('bikeId')&&h.km!=null?h.km:bike(f.get('bikeId')).km),cost:Number(f.get('cost')),contactId:f.get('contactId'),workshop:f.get('workshop')||contact(f.get('contactId'))?.name||'',part:f.get('part'),partSerial:f.get('partSerial'),notes:f.get('notes')};if(!entry.title)throw Error('Bitte die Wartungsarbeit angeben.');if(p&&entry.bikeId!==p.bikeId)throw Error('Dieser Service gehört zum ursprünglich ausgewählten Fahrrad.');if(appointment&&(entry.bikeId!==appointment.bikeId||entry.contactId!==appointment.contactId))throw Error('Bitte Fahrrad und Werkstatt des Termins beibehalten.');entry.attachments=await readReceipts(f,h.attachments);const consumption=id?null:consumeSupplies(data,readMaterialRequests(),{...entry,bikeName:bike(entry.bikeId)?.name||''});if(consumption)entry.materials=consumption.materials;if(await mutate(()=>{if(consumption){data.inventory=consumption.inventory;data.shopping=consumption.shopping;}if(appointment){appointment.status='completed';appointment.historyId=entry.id;}if(id)data.history=data.history.map(x=>x.id===id?entry:x);else data.history.push(entry);const selected=bike(entry.bikeId);if(entry.km>selected.km){selected.km=entry.km;selected.kmDate=entry.date;}if(p){if(!p.months&&!p.intervalKm){data.plans=data.plans.filter(x=>x.id!==p.id);data.shopping=data.shopping.map(x=>x.planId===p.id?{...x,planId:''}:x);data.appointments=data.appointments.map(x=>x.planId===p.id?{...x,planId:''}:x);}else data.plans=data.plans.map(x=>x.id===p.id?completePlan(p,entry.date,entry.km):x);}})){historyBikeId=entry.bikeId;closeModal();render();toast('Wartung im Servicebuch gespeichert.');}});const select=$('#editor select[name="bikeId"]');select.onchange=()=>{$('#editor input[name="km"]').value=kmInputValue(bike(select.value).km);if(!id&&!p)$('#service-material-container').innerHTML=serviceMaterialEditor({...h,bikeId:select.value},null);};}
function editKm(id){const b=bike(id);modal('Kilometerstand aktualisieren',`<p class="help">${esc(b.name)} · Bisher ${number(b.km)} km. Der aktuelle Stand wird für die Service-Erinnerungen verwendet.</p>${input('km','Neuer Kilometerstand',b.km,'number','required min="0" step="0.1"')}${input('date','Abgelesen am',today(),'date',`required max="${today()}"`)}${input('reason','Notiz (optional, z. B. Tacho korrigiert)')}`,async f=>{if(await mutate(()=>{b.km=kmFromInput(f.get('km'),b.km);b.kmDate=f.get('date');b.readings=b.readings||[];b.readings.push({date:f.get('date'),km:b.km,note:f.get('reason')});})){closeModal();toast('Kilometerstand aktualisiert.');}});}
function closeModal(){securityGrant=null;$('#modal').close();$('#modalBody').innerHTML='';}
function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function calendar(){
 const dated=sortedPlans().filter(p=>p.nextDate);
 if(!dated.length){toast('Es gibt noch keine Services mit Datum.');return;}
 const text=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
 const now=new Date().toISOString().replace(/[-:]|\.\d{3}/g,'');
 const events=dated.flatMap(p=>{
  const description=(p.source||'Service')+(p.nextKm!==null&&p.nextKm!==undefined?' · Fällig bei '+p.nextKm+' km':'')+'\n'+(p.notes||'');
  return ['BEGIN:VEVENT','UID:'+p.id+'@graveltube.be','DTSTAMP:'+now,'DTSTART;VALUE=DATE:'+p.nextDate.replaceAll('-',''),'SUMMARY:'+text(p.title+' – '+bike(p.bikeId)?.name),'DESCRIPTION:'+text(description),'BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY','DESCRIPTION:Service-Erinnerung','END:VALARM','END:VEVENT'];
 });
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Gravelbike Garage//Garage//DE','CALSCALE:GREGORIAN',...events,'END:VCALENDAR'];
 const folded=lines.map(line=>{let out='',len=0;for(const c of line){const bytes=new TextEncoder().encode(c).length;if(len+bytes>70){out+='\r\n ';len=1;}out+=c;len+=bytes;}return out;});
 download(folded.join('\r\n')+'\r\n','text/calendar;charset=utf-8','Gravelbike Garage-Serviceplan.ics');
 toast('Kalenderdatei exportiert. Jetzt in deinen Kalender importieren.');
}
function notify(){if(data.preferences?.notifications===false||!('Notification'in window)||Notification.permission!=='granted')return;const ready=sortedPlans().filter(p=>status(p).status==='overdue'&&!notifShown.has(p.id+':'+p.nextDate+':'+p.nextKm));if(ready.length){ready.forEach(p=>notifShown.add(p.id+':'+p.nextDate+':'+p.nextKm));try{const message=ready.slice(0,3).map(p=>`${bike(p.bikeId)?.name}: ${p.title}`).join('\n');navigator.serviceWorker?.ready.then(reg=>reg.showNotification('Gravelbike Garage · Service fällig',{body:message,icon:'/icon.svg',tag:'garage-service'})).catch(()=>new Notification('Gravelbike Garage · Service fällig',{body:message}));}catch(e){console.info('Benachrichtigungen nicht verfügbar');}}}
document.addEventListener('click',async e=>{const target=e.target.closest('[data-action]');if(!target)return;const action=target.dataset.action,id=target.dataset.id;try{if(action==='tool-new')editTool();if(action==='tool-edit')editTool(id);if(action==='tool-delete')deleteEquipment('tools',id);if(action==='computer-new')editComputer();if(action==='computer-edit')editComputer(id);if(action==='computer-delete')deleteEquipment('computers',id);if(action==='component-tool-create')await quickComponentTool(target.closest('.editor-component'));if(action==='stock-search-clear')clearInventorySearch();if(action==='stock-filter'){inventoryFilter=id;render();}if(action==='movement-service'){closeModal();editHistory(id);}if(action==='stock-position')editStockPosition(id);if(action==='stock-position-edit')editStockPosition(id,target.dataset.positionId);if(action==='stock-adjust')adjustStockPosition(id,target.dataset.positionId);if(action==='stock-withdraw')withdrawStock(id,target.dataset.positionId);if(action==='stock-history')stockHistory(id);if(action==='inventory-report')inventoryReport();if(action==='security-wizard')securityWizard();if(action==='update-job')await startUpdateJob(id,target.dataset.version);if(action==='contact-new')editContact();if(action==='contact-edit')editContact(id);if(action==='contact-docs')contactDocuments(id);if(action==='contact-delete')deleteContact(id);if(action==='appointment-new')editAppointment();if(action==='appointment-contact')editAppointment(null,id);if(action==='appointment-edit')editAppointment(id);if(action==='appointment-calendar')appointmentCalendar(id);if(action==='appointment-done'){const a=data.appointments.find(a=>a.id===id);if(a&&['planned','confirmed'].includes(a.status))editHistory(null,a.bikeId,a.planId||null,a.id);}if(action==='tire-install')installStoredTire(id,target.dataset.positionId);if(action==='stock-receive')receiveStock();if(action==='stock-new')editStock();if(action==='stock-edit')editStock(id);if(action==='stock-delete')deleteStock(id);if(action==='restock')editPurchase(null,{inventoryId:id});if(action==='purchase-new')editPurchase();if(action==='purchase-plan')editPurchase(null,{planId:id});if(action==='purchase-edit')editPurchase(id);if(action==='purchase-delete')deletePurchase(id);if(action==='purchase-receive')receiveIntoStock(id);if(action==='component-delete')deleteComponent(id,Number(target.dataset.componentIndex),target.dataset.componentId);if(action==='history-tab')selectHistoryTab(id);if(action==='component-edit')editComponent(id,Number(target.dataset.componentIndex),target.dataset.componentId);if(action==='component-tab')selectComponentTab(id,target.dataset.category);if(action==='component-new')editBike(id,{newCategory:target.dataset.category});if(action==='component-toggle'){const row=target.closest('.editor-component');setComponentExpanded(row,target.getAttribute('aria-expanded')!=='true');}if(action==='component-save')await $('#editor').saveComponent(target.closest('.editor-component'));if(action==='close')closeModal();if(action==='bike-new')editBike();if(action==='bike-edit')editBike(id);if(action==='bike-archive')await toggleBikeArchive(id);if(action==='km')editKm(id);if(action==='ride-km')addRide();if(action==='plan-new')editPlan(null,id);if(action==='plan-edit')editPlan(id);if(action==='service-done')editHistory(null,null,id);if(action==='history-new')editHistory(null,id);if(action==='history-edit')editHistory(id);if(action==='document-new')newDocument(id);if(action==='guide-new')newGuide();if(action==='guide-document')newDocument(null,id);if(action==='document-assign')assignDocument(id);if(action==='guide-links')editGuideLinks(id);if(action==='order-new')editOrder();if(action==='plan-order')editOrder(null,id);if(action==='order-edit')editOrder(id);if(action==='order-step')editOrderStep(id,target.dataset.itemId);if(action==='password-change')changePassword();if(action==='component-add'){$('#components').insertAdjacentHTML('beforeend',componentEditor());updateComponentPreviews();}if(action==='component-remove'){const row=target.closest('.editor-component');if(row.dataset.saved==='true'&&row.querySelector('[name=componentCategory]').value==='Reifen')toast('Reifen bitte im Fahrradsteckbrief über Ausbauen und den Werkstattauftrag einlagern oder archivieren.');else row.remove();}if(action==='filter'){filter=id;render();}if(action==='settings')location.hash='settings';if(action==='logout'){await api('logout',{method:'POST'});data={bikes:[],plans:[],history:[],documents:[],inventory:[],shopping:[],contacts:[],appointments:[],tools:[],computers:[]};$('#main').innerHTML='';await showAuth();}if(action==='calendar')calendar();if(action==='export')download(JSON.stringify({format:'graveltube-v1',exportedAt:new Date().toISOString(),...data},null,2),'application/json','Gravelbike Garage-Backup-'+today()+'.json');if(action==='notifications')await configureNotifications(true);if(action==='notifications-off')await configureNotifications(false);if(action==='bike-delete'&&data.orders.some(o=>o.bikeId===id))return toast('Dieses Fahrrad ist mit einem Werkstattauftrag verknüpft. Du kannst es archivieren.');if(action==='bike-delete'&&confirm('Dieses Fahrrad mit allen Serviceeinträgen und Dokumentverweisen löschen?')){if(await mutate(()=>{data.bikes=data.bikes.filter(x=>x.id!==id);for(const d of data.documents.filter(d=>d.bikeId===id))putDocument(d,{});for(const key of ['plans','history','documents','shopping','appointments'])data[key]=data[key].filter(x=>x.bikeId!==id);})){closeModal();location.hash='parking';toast('Fahrrad gelöscht.');}}if(action==='plan-delete'&&confirm('Dieses Intervall löschen? Bereits dokumentierte Wartungen bleiben erhalten.')){if(await mutate(()=>{data.plans=data.plans.filter(x=>x.id!==id);data.shopping=data.shopping.map(x=>x.planId===id?{...x,planId:''}:x);data.appointments=data.appointments.map(x=>x.planId===id?{...x,planId:''}:x);}))closeModal();}if(action==='document-remove'&&confirm('Dokument aus der Ablage entfernen?'))await deleteCatalogDocument(id);}catch(error){garageRuntime.log(error,'action');toast(error.message);}});
document.addEventListener('input',e=>{if(e.target.closest('#editor')){const row=e.target.closest('.editor-component');if(row){row.dataset.saved='false';row.querySelector('.component-state').textContent='Noch nicht gespeichert';}updateComponentPreviews();}if(e.target.id==='bikeSearch'){const pos=e.target.selectionStart;query=e.target.value;render();$('#bikeSearch').focus();$('#bikeSearch').setSelectionRange(pos,pos);}});
document.addEventListener('change',e=>{
 if(e.target.matches('.material-position')){const q=e.target.closest('.material-row').querySelector('.material-quantity'),available=Number(e.target.selectedOptions[0]?.dataset.available||0);q.max=available;if(Number(q.value)>available)q.value=available;}
 if(e.target.name==='contactId'&&$('#editor [name="workshop"]'))$('#editor [name="workshop"]').value=contact(e.target.value)?.name||'';
 if(e.target.matches('.material-check')){e.target.closest('.material-row').querySelector('.material-quantity').disabled=!e.target.checked;}

 const row=e.target.closest('.editor-component');if(!row)return;
 row.dataset.saved='false';row.querySelector('.component-state').textContent='Noch nicht gespeichert';
 if(e.target.name==='componentCategory'){row.querySelector('.component-types').innerHTML=componentCategories()[e.target.value].map(name=>`<option value="${esc(name)}">`).join('');row.querySelector('.wheel-specs').hidden=e.target.value!=='Räder';}
 if(e.target.name==='componentName'){
  const known=Object.entries(componentCategories()).find(([,names])=>names.some(name=>name.toLocaleLowerCase('de-DE')===e.target.value.trim().toLocaleLowerCase('de-DE')));
  if(known){row.querySelector('[name="componentCategory"]').value=known[0];row.querySelector('.component-types').innerHTML=known[1].map(name=>`<option value="${esc(name)}">`).join('');row.querySelector('.wheel-specs').hidden=known[0]!=='Räder';}
 }
 if(e.target.name==='componentDate'){
  const field=row.querySelector('[name="componentKm"]'),original=bike($('#editor').dataset.bikeId);
  if(field.value===''&&original){const value=installationKm(original,e.target.value,data.history);if(value!==null)field.value=kmInputValue(value);}
 }
 updateComponentPreviews();
});
let renderedHash=location.hash,reloadPending=false,reloadTimer;
function editorChanged(){return [...document.querySelectorAll('dialog[open] form')].some(form=>form.dataset.dirty==='true');}
document.addEventListener('click',event=>{const button=event.target.closest('dialog form button[type=button]');if(button&&!button.matches('[data-action=close]'))button.closest('form').dataset.dirty='true';});
document.addEventListener('input',event=>{const form=event.target.closest('dialog form');if(form)form.dataset.dirty='true';});
document.addEventListener('change',event=>{const form=event.target.closest('dialog form');if(form)form.dataset.dirty='true';});
function saveOpenDraft(){
 const form=$('#editor');if(!form||!$('#modal').open)return;
 const kind=form.orderDraft?'order':form.dataset.bikeId?'bike':null;if(!kind)return;
 const clone=form.cloneNode(true),original=[...form.querySelectorAll('input,select,textarea')],copies=[...clone.querySelectorAll('input,select,textarea')];
 original.forEach((field,index)=>{const copy=copies[index];if(field.type==='file'||field.type==='password')return;if(field.tagName==='SELECT'){[...copy.options].forEach((option,i)=>{option.toggleAttribute('selected',field.options[i].selected);});}else if(field.tagName==='TEXTAREA')copy.textContent=field.value;else {copy.setAttribute('value',field.value);copy.toggleAttribute('checked',field.checked);}});
 clone.querySelector('.form-footer')?.remove();clone.querySelector('.form-error')?.remove();
 sessionStorage.setItem('garageReloadDraft',JSON.stringify({kind,id:form.dataset.bikeId||form.orderDraft.id,order:form.orderDraft,html:clone.innerHTML,hash:location.hash}));
}
// Save only presentation state, scoped to this tab and route; never field values.
function reloadViewNodes(){return [...document.querySelectorAll('#main, #main *, #modal, #modal *')];}
function captureReloadView(){
 const nodes=reloadViewNodes(),active=document.activeElement;
 const identity=el=>el.id?{id:el.id}:el.dataset.orderCheck?{orderCheck:el.dataset.orderCheck,orderId:el.dataset.orderId,itemId:el.dataset.itemId}:null;
 return {hash:location.hash,time:Date.now(),x:window.scrollX,y:window.scrollY,
  details:nodes.filter(el=>el.tagName==='DETAILS').map((el,index)=>({index,open:el.open})),
  scroll:nodes.map((el,index)=>({index,top:el.scrollTop,left:el.scrollLeft})).filter(el=>el.top||el.left),
  focus:active&&identity(active)};
}
function scheduleReload(preserveDraft=true,view=null){
 if(reloadPending)return;clearTimeout(reloadTimer);
 reloadTimer=setTimeout(()=>{
  if(preserveDraft)saveOpenDraft();
  try{if(preserveDraft)sessionStorage.setItem('garageReloadView',JSON.stringify(view||captureReloadView()));else sessionStorage.removeItem('garageReloadView');}catch{}
  reloadPending=true;location.reload();
 },0);
}
function restoreReloadView(){
 let view;try{const value=sessionStorage.getItem('garageReloadView');sessionStorage.removeItem('garageReloadView');view=JSON.parse(value);}catch{return;}
 if(!view||view.hash!==location.hash||Date.now()-view.time>60000)return;
 const nodes=reloadViewNodes(),details=nodes.filter(el=>el.tagName==='DETAILS');
 view.details.forEach(item=>{if(details[item.index])details[item.index].open=item.open;});
 const focus=view.focus&&(view.focus.id?document.getElementById(view.focus.id):nodes.find(el=>el.dataset.orderCheck===view.focus.orderCheck&&el.dataset.orderId===view.focus.orderId&&el.dataset.itemId===view.focus.itemId));
 focus?.focus({preventScroll:true});
 const restore=()=>{view.scroll.forEach(item=>{const el=nodes[item.index];if(el){el.scrollTop=item.top;el.scrollLeft=item.left;}});window.scrollTo({left:view.x,top:view.y,behavior:'instant'});};
 // Wait for the restored form and layout, including the second layout frame.
 requestAnimationFrame(()=>{restore();requestAnimationFrame(restore);});
}
function restoreReloadDraft(){
 const value=sessionStorage.getItem('garageReloadDraft');sessionStorage.removeItem('garageReloadDraft');if(!value)return;
 try{const draft=JSON.parse(value);if(draft.hash!==location.hash)return;if(draft.kind==='bike'&&bike(draft.id))editBike(draft.id,{draft});if(draft.kind==='order')editOrder(workshopOrder(draft.id)?draft.id:undefined,'',undefined,undefined,draft);}catch{toast('Bitte das Formular erneut öffnen.');}
}
document.addEventListener('click',event=>{
 const link=event.target.closest('a[href^="#"]');if(!link||link.hash===location.hash||$('#app').hidden)return;
 if((busy||editorChanged())&&!confirm('Ungespeicherte Eingaben verwerfen und die Ansicht wechseln?')){event.preventDefault();event.stopImmediatePropagation();return;}
 if($('#modal').open)closeModal();
},true);
window.addEventListener('beforeunload',event=>{if(!reloadPending&&(busy||editorChanged())){event.preventDefault();event.returnValue='';}});
window.addEventListener('hashchange',()=>{
 if($('#app').hidden){renderedHash=location.hash;return;}
 if(reloadPending)return;
 if(editorChanged()&&!confirm('Ungespeicherte Eingaben verwerfen und die Ansicht wechseln?')){history.replaceState(null,'',renderedHash);return;}
 renderedHash=location.hash;scheduleReload(false);
});
async function load(authState=null){
 const state=authState||await api('auth');
 if(state.passwordStatus?.required){showRequiredPasswordChange(state.passwordStatus);return;}
 passwordStatus=state.passwordStatus;
 garageRuntime.loading($('#main'));
 let result;try{result=await api('data');if(!result.data||typeof result.data!=='object')throw Error('Ungültige Garagendaten.');data=normalizeGarage(result.data);syncDocumentCatalog();version=result.version;}catch(error){if(error.httpStatus===401||error.httpStatus===428)return;$('#auth').hidden=true;$('#app').hidden=false;garageRuntime.failure(error,()=>load(authState),$('#main'));return;}
 $('#auth').hidden=true;$('#app').hidden=false;$('#avatar').textContent=username.slice(0,1).toUpperCase();render();restoreReloadDraft();restoreReloadView();restoreServiceWizard();
}
async function showAuth(){
 closeModal();$('#authError').textContent='';garageRuntime.loading($('#authText'),'Zugang wird geprüft …');
 $('#app').hidden=true;$('#auth').hidden=false;$('#requiredPasswordForm')?.remove();$('#mfaLogin')?.remove();
 try{
  const state=await api('auth');
  if(state.authenticated){username=state.username;await load(state);return;}
  $('#authText').textContent=state.setup?'Richte deinen persönlichen Zugang ein. Wähle einen Benutzernamen und ein Passwort mit mindestens 15 Zeichen.':'Willkommen zurück. Melde dich bei deiner Fahrradgarage an.';
  $('#password').minLength=state.setup?15:1;$('#password').autocomplete=state.setup?'new-password':'current-password';
  $('#authSubmit').textContent=state.setup?'Zugang einrichten →':'Anmelden →';$('#authForm').hidden=false;
  if(state.mfaPending)showMfaLogin();
 }catch(error){garageRuntime.failure(error,()=>showAuth(),$('#authText'));}finally{$('#authText').removeAttribute('aria-busy');}
}
$('#authForm').onsubmit=async e=>{e.preventDefault();$('#authSubmit').disabled=true;$('#authError').textContent='';const f=new FormData(e.target);try{const authResult=await api('auth',{method:'POST',body:JSON.stringify({username:f.get('username'),password:f.get('password')})});username=f.get('username');e.target.reset();history.replaceState(null,'','#dashboard');if(authResult.mfaRequired){showMfaLogin();return;}await load();}catch(error){$('#authError').textContent=error.message;}finally{$('#authSubmit').disabled=false;}};
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(error=>garageRuntime.log(error,'service-worker'));
setInterval(()=>{if(!$('#app').hidden){notify();refreshPasswordStatus();}},60000);
showAuth();

document.addEventListener('keydown',e=>{
 const tab=e.target.closest('#bike-components [role="tab"],#history-bikes [role="tab"]');if(!tab)return;
 const tabs=[...tab.parentElement.querySelectorAll('[role="tab"]')],index=tabs.indexOf(tab);
 const next=e.key==='ArrowRight'?(index+1)%tabs.length:e.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:null;
 if(next!==null){e.preventDefault();if(tab.dataset.action==='history-tab')selectHistoryTab(tabs[next].dataset.id);else selectComponentTab(tab.dataset.id,tabs[next].dataset.category);}
});

$('#modal').addEventListener('close',()=>{if(!$('#modal').open){securityGrant=null;$('#modalBody').innerHTML='';}});

function addRide(){
 const bikes=activeBikes();
 if(!bikes.length)return;
 modal('Gefahrene Kilometer',`<div class="form-grid"><label>Fahrrad<select name="bikeId" required>${bikes.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></label>${input('distance','Gefahrene Kilometer', '', 'number','required min="0.1" step="0.1"')}</div><p id="ridePreview" class="help" aria-live="polite"></p>`,async f=>{
  const distance=Number(f.get('distance'));
  if(!Number.isFinite(distance)||distance<=0)throw Error('Gib eine positive Strecke ein.');
  if(!bike(f.get('bikeId')))throw Error('Das Fahrrad ist nicht mehr verfügbar.');
  if(await mutate(()=>{
   const b=bike(f.get('bikeId'));
   b.km=rideTotal(b.km,distance);
   b.kmDate=today();
   (b.readings??=[]).push({date:b.kmDate,km:b.km,note:'Gefahrene Kilometer: '+number(distance)+' km'});
  })){closeModal();toast('Gefahrene Kilometer gespeichert.');}
 });
 const editor=$('#editor');
 const preview=()=>{
  const b=bike(editor.elements.bikeId.value);
  const distance=Number(editor.elements.distance.value);
  if(b)$('#ridePreview').textContent=`Bisher: ${number(b.km)} km · Neuer Stand: ${number(rideTotal(b.km,Math.max(0,distance)))} km`;
 };
 editor.addEventListener('input',preview);
 preview();
}

function rideTotal(km,distance){return Math.round((Number(km)+distance)*1000)/1000;}
