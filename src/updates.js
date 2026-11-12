let updateTimer;
let followedUpdate;
let observedUpdate;

function updatePanel(){
 return '<section class="update-panel" id="updatePanel" aria-label="Updates"><div class="list-row"><div class="row-copy"><strong>Updates</strong><small>Update-Dienst wird geprüft …</small></div></div></section>';
}

function showUpdates({installed,enabled,job,result}){
 const panel=$('#updatePanel');
 if(!panel)return;panel.removeAttribute('aria-busy');
 const release=result?.available;
 const action=(id,label,version='')=>`<button class="secondary" data-action="update-job" data-id="${id}" data-version="${esc(version)}">${label}</button>`;
 const available=release&&release.version!==installed.version;
 const info=job?{
  check:'GitHub-Releases werden geprüft …',
  install:'Paketprüfung, Sicherung und Installation laufen. Die Garage kann kurz im Wartungsmodus sein.',
  rollback:'Die vorherige Version wird aktiviert und geprüft.'
 }[job.action]:result?.message;
 panel.innerHTML=`<div class="list-row"><div class="row-copy"><strong>Updates</strong><small>Installiert: ${esc([installed.version,installed.name].filter(Boolean).join(' · '))}</small></div>${enabled&&!job?action('check','Nach Updates suchen'):''}</div>
 ${!enabled?'<p class="help">Der Update-Dienst ist auf diesem Server noch nicht eingerichtet.</p>':''}
 ${info?`<p class="help" role="status">${esc(info)}</p>`:''}
 ${available&&!job?`<div class="update-release"><strong>${esc(release.version)} · ${esc(release.name)}</strong><p>${esc(release.notes)}</p>${action('install','Jetzt aktualisieren',release.version)}</div>`:''}
 ${!job&&!available&&enabled?'<p class="help">Kein neueres Update verfügbar. Du kannst erneut nach Updates suchen.</p>':''}
 ${result?.canRollback&&!job?action('rollback','Vorherige Version wieder aktivieren'):''}`;
}

async function refreshUpdates(){
 clearTimeout(updateTimer);
 if(!$('#updatePanel')&&!followedUpdate)return;
 try{
  garageRuntime.loading($('#updatePanel'),'Update-Status wird geladen …');
  const state=await api('updates');
  if(followedUpdate&&state.result?.id===followedUpdate.id){
   followedUpdate=null;
   if(state.result.changed){location.reload();return;}
  }
  if(state.job){if(observedUpdate?.id!==state.job.id)observedUpdate={id:state.job.id,started:Date.now()};if(Date.now()-observedUpdate.started>20*60*1000){followedUpdate=null;garageRuntime.panel($('#updatePanel'),'Das Update dauert ungewöhnlich lange. Prüfe den Status erneut; starte keine zweite Installation.',()=>{observedUpdate=null;return refreshUpdates();});return;}}else observedUpdate=null;
  showUpdates(state);
  if(state.job||followedUpdate)updateTimer=setTimeout(refreshUpdates,2500);
 }catch(error){
  garageRuntime.log(error,'updates');
  const failedPanel=$('#updatePanel');if(failedPanel)garageRuntime.failure(error,refreshUpdates,failedPanel);
  if(followedUpdate&&Date.now()-followedUpdate.started<20*60*1000){
   updateTimer=setTimeout(refreshUpdates,3500);
  }else{
   followedUpdate=null;
   const panel=$('#updatePanel');
   if(panel)garageRuntime.failure(error,refreshUpdates,panel);
  }
 }
}

async function startUpdateJob(action,version){
 if(action==='install'&&!confirm('Update '+version+' installieren? Die Garage legt vorher eine Sicherung an und ist kurz im Wartungsmodus.'))return;
 if(action==='rollback'&&!confirm('Die vorherige Version wieder aktivieren? Die gespeicherten Garagendaten bleiben erhalten.'))return;
 const {job}=await api('updates',{method:'POST',body:JSON.stringify({action,version})});
 followedUpdate={...job,started:Date.now()};
 await refreshUpdates();
}
