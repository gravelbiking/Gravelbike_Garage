const navModules=[
 {id:'dashboard',label:'Startseite',icon:'⌂'},
 {id:'bikes',label:'Meine Fahrräder',icon:'bicycle',children:[
  ['parking','Fahrradparkplatz','Ⓟ'],['service','Serviceintervalle','◷'],['maintenance','Wartung','wrench'],
  ['history','Servicebuch','book'],['computers','Radcomputer','GPS'],['archive','Fahrradarchiv','cloud']
 ]},
 {id:'inventory',label:'Lager',icon:'shelf',children:[['tirepark','Reifenpark','◉']]},
 {id:'contacts',label:'Adressbuch',icon:'☷'},
 {id:'workshop',label:'Werkstatt',icon:'wrench',children:[['orders','Werkstattaufträge','pencil'],['tools','Werkzeug','⚒'],['guides','Anleitungen','▤']]},
 {id:'documents',label:'Dokumente',icon:'document'},
 {id:'settings',label:'Verwaltung',icon:'⚙',children:[
  ['configuration','Konfiguration','⚙'],['strava','Strava Integration','↗'],['users','Userverwaltung','person'],['system','System','server'],
  ['info','Info','ⓘ'],['backup','Datensicherung','↓']
 ]}
];

const navIcons={
 cloud:'<path d="M6 19a4 4 0 1 1 .7-7.94 5.5 5.5 0 0 1 10.64 1.44H18a3.25 3.25 0 0 1 0 6.5H6Z"/>',
 book:'<path d="M12 6C9 4 6 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14"/>',
 pencil:'<path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4M4 16l4 4"/>',
 bicycle:'<circle cx="5.5" cy="17" r="4"/><circle cx="18.5" cy="17" r="4"/><path d="m5.5 17 4-8 4 8H5.5m8 0 4-8-2-4h4M8 9h4m5 0 1.5 8"/>',
 shelf:'<path d="M4 21V3m16 0v18M4 12h16M4 20h16M7 6h5v6m2 2h3v6"/>',
 wrench:'<path d="M14 6a5 5 0 0 1 6-2l-3 3 2 2 3-3a5 5 0 0 1-6 6l-8 8a3 3 0 0 1-4-4l8-8a5 5 0 0 1 2-6"/>',
 document:'<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8m-8 4h8"/>',
 person:'<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 server:'<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h1m-1 9h1"/>'
};

function navIcon(icon){
 const path=navIcons[icon];
 return `<span class="nav-icon${icon==='GPS'?' nav-icon-gps':''}" aria-hidden="true">${path?`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`:icon}</span>`;
}

function renderNavigation(page){
 const parent={bike:data.bikes.find(b=>encodeURIComponent(b.id)===location.hash.split('/')[1])?.archived?'archive':'parking',computer:'computers',stock:'inventory',order:(data.orders||[]).some(o=>encodeURIComponent(o.id)===location.hash.split('/')[1]&&(o.maintenancePlanning||o.planId))?'maintenance':'orders',guide:'guides',plan:'service',purchase:'inventory',shopping:'inventory',entry:'history',tire:'tirepark',contact:'contacts',updates:'info'}[page]||page;
 const owner=navModules.find(m=>m.id===parent||m.children?.some(([id])=>id===parent))||navModules[0];
 const child=owner.children?.find(([id])=>id===parent);
 $('#crumb').textContent=child?`${owner.label} / ${child[1]}`:owner.label;
 const link=(id,label,icon,module=false)=>`<a href="#${id}" ${id===parent?'aria-current="page"':''} class="${module?'module-link ':''}${id===parent?'active':''}">${navIcon(icon)}<span>${label}</span></a>`;
 $('#nav').innerHTML=`<ul class="module-nav">${navModules.map(m=>`<li class="${owner===m?'current-module':''}">${m.children?`<span class="module-label">${navIcon(m.icon)}<span>${m.label}</span></span>`:''}${link(m.id,m.label,m.icon,!!m.children)}${m.children?`<ul class="area-nav">${m.children.filter(([id])=>id!=='tirepark'||typeof tireParkEnabled==='undefined'||tireParkEnabled).map(item=>link(...item)).map(a=>'<li>'+a+'</li>').join('')}</ul>`:''}</li>`).join('')}</ul>`;
}

function moduleDashboard(id,description){
 const module=navModules.find(m=>m.id===id);
 return heading(module.label,description)+`<div class="supply-grid module-cards">${module.children.filter(([route])=>route!=='tirepark'||typeof tireParkEnabled==='undefined'||tireParkEnabled).map(([route,label,icon])=>`<a class="panel" href="#${route}">${navIcon(icon)}<strong>${label}</strong><span aria-hidden="true">↗</span></a>`).join('')}</div>`;
}

function renderPage(){
 const focusInfoTab=document.activeElement?.matches('.info-tabs [role="tab"]');
 const [route,id,subId]=(location.hash.slice(1)||'dashboard').split('/');
 const page=route==='repairs'?'orders':route;
 renderNavigation(page);
 const views={
  dashboard, bikes:()=>moduleDashboard('bikes','Fahrräder, Wartung und Radcomputer verwalten.'),
  parking:bikesPage, bike:()=>detail(id), archive:archivePage, service:servicePage, history:historyPage, plan:()=>planDetail(id), entry:()=>historyDetail(id), purchase:()=>purchaseDetail(id), shopping:()=>heading('Einkaufsliste','Geplante Einkäufe und Material für deine Werkstatt.')+shoppingList(),
  computers:computersPage, computer:()=>computerDetail(id), inventory:inventoryPage, stock:()=>stockDetail(id,subId),
  contacts:addressBook, contact:()=>addressBook(id), workshop:()=>moduleDashboard('workshop','Werkzeug und Werkstattanleitungen an einem Ort.'),
  tirepark:()=>tireParkPage(), tire:()=>tireParkPage(id), maintenance:maintenancePage, tools:toolsPage, guides:()=>guidesPage(), guide:()=>guidesPage(id), documents:documentsPage, orders:()=>ordersPage(), order:()=>orderDashboard(id),
  settings:()=>moduleDashboard('settings','Konfiguration, Zugang und Betrieb deiner Garage.'),
  configuration:configurationPage, strava:()=>heading('Strava Integration','Konten verbinden und Fahrräder zuordnen.')+stravaPanel(), users:usersPage, system:systemPage, info:()=>infoPage(id), updates:()=>infoPage('update'), backup:backupPage
 };
 document.documentElement.dataset.theme=data.preferences.theme||'wald';
 $('#main').removeAttribute('aria-busy');$('#requestError').hidden=true;
 $('#main').innerHTML=(Object.hasOwn(views,page)?views[page]:dashboard)();
 if(page==='info'){
  if(focusInfoTab)$('#info-panel')?.previousElementSibling.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});
  if(id==='manual'&&subId)document.getElementById('manual-'+subId)?.scrollIntoView({block:'start'});
 }
 notify();
 if(page==='dashboard')refreshPasswordStatus();
 if(page==='tirepark'||page==='tire'||page==='bike')queueMicrotask(()=>refreshTirePark());
 if(page==='strava')refreshStrava();
 if(page==='users'){refreshSecurityStatus();refreshPasswordStatus();}
 if(page==='updates'||(page==='info'&&id==='update'))refreshUpdates();
 if(page==='system')refreshSystemStatus();
 if(page==='stock'&&subId)document.getElementById('position-'+subId)?.scrollIntoView({block:'center'});
}

const activeBikes=()=>data.bikes.filter(b=>!b.archived);

function nextService(b){
 const next=sortedPlans(plans(b.id))[0];
 return next?`<small class="bike-next-service">Nächster Service · ${esc(next.title)} · ${esc(dueText(next))}</small>`:'';
}

function archivePage(){
 const archived=data.bikes.filter(b=>b.archived);
 return heading('Fahrradarchiv','Archivierte Fahrräder mit Steckbrief, Dokumenten und Servicehistorie.')+
  (archived.length?`<div class="bike-grid">${archived.map(bikeCard).join('')}</div>`:empty('Das Fahrradarchiv ist leer.','Du kannst ein Fahrrad in seinem Steckbrief archivieren.'));
}

function toggleBikeArchive(id){
 const b=bike(id);
 if(!b)return;
 const archived=!b.archived;
 const title=archived?'Fahrrad archivieren':'Fahrrad wieder aktivieren';
 const message=archived?'Steckbrief, Dokumente und Servicehistorie bleiben erhalten.':'Das Fahrrad erscheint wieder auf dem Fahrradparkplatz und im aktiven Serviceintervallen.';
 modal(title,`<p>${esc(b.name)} · ${message}</p>`,async ()=>{
  if(await mutate(()=>{b.archived=archived;})){
   closeModal();
   location.hash=archived?'archive':'parking';
   toast(archived?'Fahrrad archiviert.':'Fahrrad wieder aktiv.');
  }
 });
 $('#editor [type="submit"]').textContent=archived?'Archivieren':'Wieder aktivieren';
}
