// Shared request lifecycle and last-resort recovery, loaded before application scripts.
(() => {
 for(const [id,tag,role,css] of [['offlineBanner','div','status','offline-banner'],['requestStatus','div','status','request-status'],['requestError','section','alert','request-error'],['fatalError','section','alert','fatal-error']]){
  if(!document.getElementById(id)){const node=document.createElement(tag);node.id=id;node.className=css;node.hidden=true;node.setAttribute('role',role);if(id==='offlineBanner')node.textContent='Du bist offline. Stelle die Verbindung wieder her.';document.body.append(node);}
 }
 const seen=new WeakSet();
 let pending=0,flushing=false,retryTimer;
 const safeContext=value=>String(value||'app').split(/[/?#]/)[0].replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40)||'app';
 const newId=()=>globalThis.crypto?.randomUUID?.()||Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join('');
 const queueKey='garageErrors:'+String(location.pathname||'/');
 let queue=[];
 try{const saved=JSON.parse(sessionStorage.getItem(queueKey)||'[]');if(Array.isArray(saved))queue=saved.filter(x=>x&&typeof x.context==='string'&&Date.now()-Number(x.at)<86400000).slice(-200);}catch{}
 function persist(){try{sessionStorage.setItem(queueKey,JSON.stringify(queue));}catch{}}
 async function flush(){
  if(flushing||navigator.onLine===false||!queue.length)return;
  flushing=true;let delivered=false,retryable=true;const entries=queue.slice(0,25),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
  try{
   const r=await fetch('api.php?route=client-error',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(typeof window.garageLogPayload==='function'?window.garageLogPayload({entries}):{entries}),signal:controller.signal});
   if(!r.ok){retryable=![401,403].includes(r.status);throw Error('Logger nicht erreichbar');}
   queue.splice(0,entries.length);persist();delivered=true;
  }catch{console.warn('Gravelbike Garage: Fehlerbericht bleibt für einen erneuten Versuch vorgemerkt.');}
  finally{clearTimeout(timer);flushing=false;if(queue.length&&retryable){clearTimeout(retryTimer);if(delivered)void flush();else retryTimer=setTimeout(flush,30000);}}
 }
 function log(error,context='app'){
  if(error&&typeof error==='object'){if(seen.has(error))return;seen.add(error);}
  const kind=['TimeoutError','AbortError','TypeError','SyntaxError'].includes(error?.name)?error.name:'Error';
  // Error messages can include user-entered passwords or document contents.
  // Backend messages are captured at their source; browser reports carry safe diagnostics.
  const entry={context:safeContext(context),kind,message:kind+' in '+safeContext(context),requestId:error?.requestId||newId(),httpStatus:Number(error?.httpStatus)||0,at:Date.now(),page:safeContext(String(location.hash||'dashboard').replace(/^#/,'')),stack:String(error?.stack||'').split('\n').slice(1,13).map(line=>line.match(/([a-zA-Z0-9_.-]+\.(?:js|mjs)):(\d+):(\d+)/)?.slice(1).join(':')).filter(Boolean),count:1};
  const diagnostics={"bike.basics.invalid": "Bitte zuerst die Fahrrad-Grunddaten prüfen.", "bike.name.missing": "Bitte zuerst einen Namen für das Fahrrad eingeben.", "bike.type.missing": "Bitte einen Fahrradtyp eingeben.", "component.name.missing": "Bitte zuerst einen Bauteilnamen eingeben.", "component.name.required": "Bitte jedes ausgefüllte Bauteil benennen.", "component.fields.invalid": "Bitte die markierten Bauteilfelder prüfen.", "component.date.invalid": "Bitte ein gültiges Einbaudatum bis heute eingeben.", "component.mileage.invalid": "Die Einbau-km müssen eine Zahl ab 0 sein.", "component.bearing-date.invalid": "Bitte ein gültiges Lagerservicedatum bis heute eingeben.", "component.wheel.invalid": "Felgenhöhe und Innenmaulweite müssen Zahlen ab 0 sein.", "component.price.invalid": "Bitte einen gültigen Teilepreis ab 0 eingeben."};
  const diagnostic=Object.keys(diagnostics).find(code=>diagnostics[code]===error?.message);if(diagnostic)entry.diagnosticCode=diagnostic;
  console.error('Gravelbike Garage',{context:entry.context,kind:entry.kind,requestId:entry.requestId});
  if(queue.length>=200){const overflow=queue.find(x=>x.context==='logger-overflow');if(overflow)overflow.count++;else queue[199]={...entry,context:'logger-overflow',message:'Weitere Browserfehler (Puffergrenze)',count:2};}
  else queue.push(entry);
  persist();void flush();
 }
 async function request(work,{signal,timeout=20000,context='request',requestId=newId()}={}){
  const controller=new AbortController();
  let timer,abortListener;
  const bar=document.getElementById('requestStatus');
  pending++;if(bar){bar.hidden=false;bar.textContent='Daten werden geladen / verarbeitet …';}
  try{
   return await Promise.race([
    Promise.resolve().then(()=>work(controller.signal)),
    new Promise((_,reject)=>{
     const abort=()=>{controller.abort();reject(new DOMException('Anfrage abgebrochen.','AbortError'));};
     abortListener=abort;
     if(signal?.aborted){abort();return;}
     signal?.addEventListener('abort',abort,{once:true});
     timer=setTimeout(()=>{controller.abort();reject(new DOMException('Zeitüberschreitung. Bitte erneut versuchen.','TimeoutError'));},timeout);
    })
   ]);
  }catch(error){if(error&&typeof error==='object'&&!error.requestId)error.requestId=requestId;if(!signal?.aborted)log(error,context);throw error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abortListener);pending--;if(bar)bar.hidden=pending===0;}
 }
 function panel(host,message,retry){
  if(!host||!host.isConnected)return;
  host.replaceChildren();host.removeAttribute('aria-busy');
  const text=document.createElement('p');text.setAttribute('role','alert');text.textContent=message;host.append(text);
  if(retry){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Erneut versuchen';button.onclick=()=>{button.disabled=true;Promise.resolve().then(retry).catch(error=>{log(error,'retry');panel(host,'Der erneute Versuch ist fehlgeschlagen.',retry);}).finally(()=>{button.disabled=false;});};host.append(button);}
 }
 function loading(host,message='Daten werden geladen …'){if(host?.isConnected){host.setAttribute('aria-busy','true');host.textContent=message;}}
 function failure(error,retry,host=document.getElementById('requestError')){
  log(error,'screen');if(host){host.hidden=false;panel(host,navigator.onLine===false?'Du bist offline. Stelle die Verbindung wieder her und versuche es erneut.':error?.name==='TimeoutError'?'Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.':'Daten konnten nicht geladen oder gespeichert werden. Deine Eingaben bleiben erhalten. Bitte erneut versuchen.',retry);}
 }
 function fatal(error){
  log(error,'boundary');
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  const host=document.getElementById('fatalError');if(!host)return;
  host.hidden=false;host.replaceChildren();
  const title=document.createElement('h1');title.textContent='Die Ansicht konnte nicht angezeigt werden.';
  const text=document.createElement('p');text.textContent='Lade die App neu. Nicht gespeicherte Eingaben können dabei verloren gehen.';
  const button=document.createElement('button');button.className='primary';button.textContent='App neu laden';button.onclick=()=>location.reload();host.append(title,text,button);document.getElementById('app')?.setAttribute('inert','');document.getElementById('auth')?.setAttribute('inert','');button.focus?.();
 }
 function online(){const host=document.getElementById('offlineBanner');if(host)host.hidden=navigator.onLine!==false;if(navigator.onLine!==false)void flush();}
 window.addEventListener('online',online);window.addEventListener('offline',online);online();
 window.addEventListener('error',event=>{if(event.error)fatal(event.error);else if(event.target?.tagName==='SCRIPT')fatal(Error('Script konnte nicht geladen werden.'));else if(['IMG','LINK','AUDIO','VIDEO'].includes(event.target?.tagName))log(Error('Ressource nicht geladen'),'resource');},true);
 window.addEventListener('unhandledrejection',event=>fatal(event.reason));
 document.addEventListener('click',event=>{if(event.target.closest('a[href^="#"]')){const host=document.getElementById('requestError');if(host)host.hidden=true;}});
 window.garageRuntime={request,log,panel,loading,failure,fatal,newId,flush};
})();
