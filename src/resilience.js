// Shared request lifecycle and last-resort recovery, loaded before application scripts.
(() => {
 for(const [id,tag,role,css] of [['offlineBanner','div','status','offline-banner'],['requestStatus','div','status','request-status'],['requestError','section','alert','request-error'],['fatalError','section','alert','fatal-error']]){
  if(!document.getElementById(id)){const node=document.createElement(tag);node.id=id;node.className=css;node.hidden=true;node.setAttribute('role',role);if(id==='offlineBanner')node.textContent='Du bist offline. Stelle die Verbindung wieder her.';document.body.append(node);}
 }
 const seen=new WeakSet();
 let pending=0,logCount=0;
 const safeContext=value=>String(value||'app').split(/[/?#]/)[0].replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40)||'app';
 function log(error,context='app'){
  if(error&&typeof error==='object'){if(seen.has(error))return;seen.add(error);}
  // Never log form values, URLs, server messages, documents, tokens or credentials.
  const entry={context:safeContext(context),kind:['TimeoutError','AbortError','TypeError','SyntaxError'].includes(error?.name)?error.name:'Error'};
  console.error('Gravelbike Garage',entry);
  if(logCount++>=10||navigator.onLine===false)return;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
  fetch('api.php?route=client-error',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry),signal:controller.signal}).then(r=>{if(!r.ok)console.warn('Gravelbike Garage: Server-Logger nicht erreichbar.');}).catch(()=>console.warn('Gravelbike Garage: Fehler nur lokal protokolliert.')).finally(()=>clearTimeout(timer));
 }
 async function request(work,{signal,timeout=20000,context='request'}={}){
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
  }catch(error){if(!signal?.aborted)log(error,context);throw error;}
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
 function online(){const host=document.getElementById('offlineBanner');if(host)host.hidden=navigator.onLine!==false;}
 window.addEventListener('online',online);window.addEventListener('offline',online);online();
 window.addEventListener('error',event=>{if(event.error)fatal(event.error);else if(event.target?.tagName==='SCRIPT')fatal(Error('Script konnte nicht geladen werden.'));},true);
 window.addEventListener('unhandledrejection',event=>fatal(event.reason));
 document.addEventListener('click',event=>{if(event.target.closest('a[href^="#"]')){const host=document.getElementById('requestError');if(host)host.hidden=true;}});
 window.garageRuntime={request,log,panel,loading,failure,fatal};
})();
