function stravaPanel(){
 return '<section id="stravaPanel" class="panel settings-list" aria-labelledby="stravaHeading"><div class="list-row"><div class="row-copy"><strong id="stravaHeading">Strava</strong><small>Status wird geladen …</small></div></div></section>';
}

async function refreshStrava(){
 const panel=$('#stravaPanel');if(!panel)return;garageRuntime.loading(panel,'Strava-Status wird geladen …');
 try{
  const status=await api('strava');
  if(!status||typeof status!=='object')throw Error('Kein Strava-Status verfügbar.');if(panel.isConnected){panel.removeAttribute('aria-busy');renderStrava(panel,status);}
 }catch(error){
  garageRuntime.failure(error,refreshStrava,panel);
 }
}

function renderStrava(panel,status){
 if(status.accounts){
  panel.onclick=null;
  panel.innerHTML='<div class="list-row"><div class="row-copy"><strong id="stravaHeading">Strava · zwei unabhängige Verbindungen</strong><small>Jede Verbindung verwendet eine eigene Client ID und ein eigenes Client Secret.</small></div></div>'+status.accounts.map(account=>`<section class="strava-account" data-strava-account="${account.account}" aria-label="Strava-Verbindung ${account.account}"><h3>Verbindung ${account.account}</h3></section>`).join('');
  const mappedBikes=status.accounts.flatMap(account=>Object.values(account.maps).map(link=>link.bike));
  for(const account of status.accounts){
   const host=panel.querySelector(`[data-strava-account="${account.account}"]`);
   const needsOwnSetup=account.account===2&&!account.connected&&account.setup?.sharedClient;
   if(host)renderStrava(host,{...account,configured:needsOwnSetup?false:(account.configured??status.configured),setup:needsOwnSetup?{...account.setup,clientId:'',secretSaved:false}:account.setup,mappedBikes});
  }
  return;
 }

 panel.onclick=async event=>{
  const button=event.target.closest('[data-strava]');
  if(!button)return;
  button.disabled=true;
  try{
   const key=button.dataset.strava;
   if(key==='connect'){
    const result=await stravaPost({action:key,account:status.account||1});
    location.assign(result.url);
   }
   if(key==='map')stravaMap(status);
   if(key==='register'){await stravaPost({action:key,account:status.account||1});await refreshStrava();toast('Automatischer Import eingerichtet.');}
   if(key==='sync'){
    await stravaPost({action:key,account:status.account||1});
    await load();
    toast('Strava-Abgleich abgeschlossen.');scheduleReload();
   }
   if(key==='disconnect'&&confirm('Nur diese Strava-Verbindung trennen und ihre gespeicherten Fahrtdetails entfernen? Die andere Verbindung und die bisherigen Kilometerstände bleiben erhalten.')){
    await stravaPost({action:key,account:status.account||1});
    history.replaceState(null,'','#strava');
    if(panel.isConnected)await refreshStrava();
   }
  }catch(error){
   garageRuntime.log(error,'strava');toast(error.message);
   if(button.dataset.strava==='sync'&&panel.isConnected)await refreshStrava();
  }finally{button.disabled=false;}
 };
 const action=(key,label)=>`<button type="button" class="secondary" data-strava="${key}">${label}</button>`;
 const show=html=>{panel.innerHTML=html+stravaSetup(status);bindStravaSetup(panel);};
 const heading=`<h3>Verbindung ${status.account||1}</h3><div class="list-row"><div class="row-copy"><strong>${status.account?`Strava-Konto ${status.account}${status.name?' · '+esc(status.name):''}`:'Strava-Integration'}</strong><small>Übernimm Fahrtdatum und Strecke für die Kilometerstände deiner Fahrräder.</small></div>`;
 const result=location.hash.split('/')[1];
 const notice=result==='strava-denied'?'Die Verbindung braucht Lesefreigaben für das Profil und alle Fahrten, auch für „Nur du“.':result==='strava-failed'?'Die Verbindung ist fehlgeschlagen.':'';
 const message=[notice,status.error].filter(Boolean).join(' ');
 const report=message?`<p class="help" role="status">${esc(message)}</p>`:'';
 if(!status.configured){
  show(heading+'<span class="muted">API-Daten einrichten</span></div>');
  return;
 }
 if(!status.connected){
  show(heading+action('connect','Mit Strava verbinden')+'</div>'+
   '<p class="help">Melde dich bei Strava an und bestätige den Lesezugriff. Ordne danach deine Strava-Räder den Fahrrädern in der Garage zu.</p>'+report);
  return;
 }
 const last=status.lastSync?new Date(status.lastSync*1000).toLocaleString('de-DE'):'Noch kein Abgleich';
 const worker=Date.now()/1000-status.worker<600;
 const automatic=status.registered&&worker?'Automatischer Import aktiv':worker?'Zeitgesteuerter Abgleich aktiv':'Hintergrundjob ausstehend';
 const rows=Object.entries(status.maps).map(([id,link])=>`<div class="list-row"><div class="row-copy"><strong>${esc(status.gear[id]||id)} → ${esc(bike(link.bike)?.name||'Gelöschtes Fahrrad')}</strong><small>Import ab ${date(link.from)}</small></div></div>`).join('');
 const pending=status.pending.length?`<div class="list-row"><div class="row-copy"><strong>Fahrten ohne Zuordnung (${status.pendingCount})</strong><small>Wähle in Strava das richtige Fahrrad und starte anschließend einen Abgleich.</small>
 <ul>${status.pending.map(ride=>`<li>${date(ride.date)} · ${number(ride.meters/1000)} km · ${esc(status.gear[ride.gear]||ride.gear||'Kein Fahrrad ausgewählt')}</li>`).join('')}</ul></div></div>`:'';
 const firstBike=Object.keys(status.maps).length===0
  ? '<p class="help">Ordne ein Strava-Rad zu und bestätige den Startkilometerstand, um den Import für dieses Fahrrad zu aktivieren.</p>'
  : '';
 show(heading+`<span class="badge ok" role="status">Mit Strava verbunden</span></div>
 <div class="list-row"><div class="row-copy"><strong>${automatic}</strong><small>Letzter Abgleich · ${esc(last)}</small></div>${action('map','Fahrrad zuordnen')}</div>`+report+firstBike+rows+pending+
 `<div class="list-row"><div class="actions">${action('sync','Jetzt abgleichen')}${status.error?action('connect','Erneut verbinden'):''}${!status.registered?action('register','Automatischen Import einrichten'):''}${action('disconnect','Verbindung trennen')}</div></div>`);

}

function stravaPost(body){
 return api('strava',{method:'POST',body:JSON.stringify(body)});
}

function stravaSetup(status){
 const setup=status.setup;
 if(!setup)return '';
 const fields=[
  ['Application Name',`Gravelbike Garage ${setup.name}`],
  ['Category','Other'],
  ['Club','Leer lassen'],
  ['Website',setup.website],
  ['Application Description','Bicycle management and maintenance tracking. Imports authorized users’ cycling activities and bike assignments from Strava to update bicycle mileage and maintenance intervals.'],
  ['Authorization Callback Domain',setup.callbackDomain],
  ['Application Icon','Eigenes App-Logo auswählen, falls Strava danach fragt.']
 ];
 return `<details class="strava-setup" ${status.configured?'':'open'}>
 <summary>${status.configured?'Strava-API-Einstellungen und Kurzanleitung':'Strava einrichten · Kurzanleitung'}</summary>
 <p class="help">Diese API-Daten gelten ausschließlich für <strong>Verbindung ${setup.account||status.account||1}</strong> in <strong>${esc(setup.name)}</strong>. Die andere Verbindung bleibt unverändert.</p>
 <ol class="strava-instructions">
 <li>Öffne <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener noreferrer">Meine API-Anwendung bei Strava ↗</a> und melde dich dort an. Verwende für jede Verbindung eine eigene Strava-API-Anwendung mit anderer Client ID.</li>
 <li>Lege die API-Anwendung mit den folgenden Angaben an. Prüfe und bestätige die API-Vereinbarung bei Strava.</li>
 </ol>
 <dl class="system-facts strava-api-values">${fields.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
 <p class="help">Bei „Authorization Callback Domain“ nur die angezeigte Domain eintragen. Die Rückkehradresse für diese Umgebung ist <span class="strava-url">${esc(setup.callbackUrl)}</span>.</p>
 <form class="strava-setup-form" data-account="${setup.account||status.account||1}">
 <p>Übertrage die <strong>Client ID</strong> und das <strong>Client Secret</strong> aus Strava in diese Felder.</p>
 <div class="form-grid">
 ${input('clientId','Client ID',setup.clientId,'text','required inputmode="numeric" pattern="[1-9][0-9]{0,15}" maxlength="16" autocomplete="off"')}
 ${input('clientSecret','Client Secret','','password',`${setup.secretSaved?'':'required'} minlength="24" maxlength="256" autocomplete="off" spellcheck="false"`)}
 </div>
 ${setup.secretSaved?'<p class="help">Ein Client Secret ist gespeichert. Lass das Feld leer, um es für dieselbe Client ID weiterzuverwenden.</p>':''}
 <p class="help">Nach deiner Zugangsbestätigung speichert die Garage die API-Daten in der geschützten Ablage dieser Umgebung auf dem Server.</p>
 <button type="submit" class="primary">API-Daten speichern</button>
 </form>
 <p class="help">Wähle anschließend „Mit Strava verbinden“, bestätige bei Strava die Freigaben und ordne deine Fahrräder zu. Access- und Refresh-Token werden beim Verbinden automatisch bezogen und erneuert.</p>
 </details>`;
}

function bindStravaSetup(panel){
 const form=panel.querySelector('.strava-setup-form');
 if(!form)return;
 form.onsubmit=event=>{
  event.preventDefault();
  const values=new FormData(form);
  const settings={action:'configure',account:Number(form.dataset.account),clientId:values.get('clientId').trim(),clientSecret:values.get('clientSecret').trim()};
  securityWizard(async()=>{
   await stravaPost({...settings,token:securityGrant});
   settings.clientSecret='';
   form.reset();
   await refreshStrava();
   closeModal();
   toast(`API-Daten für Verbindung ${settings.account} gespeichert. Du kannst dieses Konto jetzt verbinden.`);scheduleReload();
  },`Strava-API-Daten für Verbindung ${settings.account} speichern`,`Bestätige deinen Zugang für Verbindung ${settings.account}. Die andere Verbindung wird nicht geändert.`);
 };
}

function stravaMap(status){
 const choices=Object.entries(status.gear).filter(([id])=>!status.maps[id]);
 const linked=new Set(status.mappedBikes||Object.values(status.maps).map(link=>link.bike));
 const bikes=activeBikes().filter(b=>!linked.has(b.id));
 if(!choices.length){toast('Keine freien Strava-Räder. Gleiche neue Räder zuerst über „Jetzt abgleichen“ ab.');return;}
 if(!bikes.length){toast('Es ist kein weiteres aktives Fahrrad in der Garage verfügbar.');return;}
 const savedVersion=version;
 modal(`Strava-Fahrrad zuordnen · Konto ${status.account||1}`,`<div class="form-grid">
 ${select('gear','Fahrrad in Strava',choices,choices[0][0])}
 ${select('bike','Fahrrad in der Garage',bikes.map(b=>[b.id,b.name+' · '+number(b.km)+' km']),bikes[0].id)}
 ${input('from','Erster Importtag',status.today,'date',`required min="${status.earliest}" max="${status.tomorrow}"`)}
 </div><p class="help">Bestätige den aktuellen Kilometerstand des gewählten Fahrrads. Der erste Importtag zählt mit. Wenn die heutigen Fahrten schon enthalten sind, wähle morgen.</p>`,async form=>{
  await stravaPost({action:'map',account:status.account||1,gear:form.get('gear'),bike:form.get('bike'),from:form.get('from'),version:savedVersion});
  closeModal();
  await refreshStrava();
  toast('Fahrrad zugeordnet. Der nächste Abgleich übernimmt neue Fahrten.');scheduleReload();
 });
}

