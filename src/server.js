const json = (value, status=200, headers={}) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const hex = data => [...new Uint8Array(data)].map(b=>b.toString(16).padStart(2,'0')).join('');
const digest = async data => hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)));
async function passwordHash(password, salt) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256));
}
function equal(a,b) { let diff=a.length^b.length; for(let i=0;i<Math.max(a.length,b.length);i++) diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0); return diff===0; }
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com"};
export default {
 async fetch(request,env) {
  try {
   const url=new URL(request.url), path=url.pathname;
   if(path==='/icon.svg') return new Response(ICON,{headers:{'Content-Type':'image/svg+xml'}});
   if(path==='/manifest.webmanifest') return json({name:'GravelTube Garage',short_name:'GravelTube',lang:'de',start_url:'/',scope:'/',display:'standalone',background_color:'#f5f5f0',theme_color:'#233e32',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]},200,{'Content-Type':'application/manifest+json'});
   if(path==='/sw.js') return new Response("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',()=>{});",{headers:{'Content-Type':'text/javascript','Cache-Control':'no-cache'}});
   if(!path.startsWith('/api/')) return new Response(HTML,{headers});
   const owner=request.headers.get('oai-authenticated-user-id');
   if(!owner) return json({error:'Bitte zuerst über den privaten ChatGPT-Zugang anmelden.'},401);
   if(request.method!=='GET' && request.headers.get('Origin')!==url.origin) return json({error:'Ungültiger Ursprung.'},403);
   const account=await env.DB.prepare('SELECT * FROM accounts WHERE owner = ?').bind(owner).first();
   const cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)garage_session=([^;]+)/)?.[1];
   const session=cookie?await env.DB.prepare('SELECT * FROM sessions WHERE token = ? AND owner = ? AND expires > ?').bind(await digest(cookie),owner,Date.now()).first():null;
   if(path==='/api/auth' && request.method==='GET') return json({setup:!account,authenticated:!!session,username:session?account?.username:null});
   if(path==='/api/auth' && request.method==='POST') {
    const body=await request.json(), now=Date.now();
    if(typeof body.username!=='string'||typeof body.password!=='string'||body.username.length>80||body.password.length>256) return json({error:'Bitte gültige Zugangsdaten eingeben.'},400);
    const attempt=await env.DB.prepare('SELECT * FROM attempts WHERE owner = ?').bind(owner).first();
    if(attempt && now-attempt.since<900000 && attempt.count>=10) return json({error:'Zu viele Versuche. Bitte in 15 Minuten erneut anmelden.'},429);
    await env.DB.prepare('INSERT INTO attempts(owner,count,since) VALUES(?,1,?) ON CONFLICT(owner) DO UPDATE SET count=CASE WHEN since < ? THEN 1 ELSE count+1 END,since=CASE WHEN since < ? THEN ? ELSE since END').bind(owner,now,now-900000,now-900000,now).run();
    if(!account) {
     if(body.username.trim().length<3||body.password.length<12) return json({error:'Benutzername: mindestens 3 Zeichen. Passwort: mindestens 12 Zeichen.'},400);
     const salt=crypto.randomUUID();
     await env.DB.prepare('INSERT INTO accounts(owner,username,salt,hash) VALUES(?,?,?,?)').bind(owner,body.username.trim(),salt,await passwordHash(body.password,salt)).run();
    } else if(!equal(await passwordHash(body.password,account.salt),account.hash)||!equal(body.username.trim(),account.username)) return json({error:'Benutzername oder Passwort ist falsch.'},401);
    await env.DB.prepare('DELETE FROM attempts WHERE owner = ?').bind(owner).run();
    await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now).run();
    const token=hex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare('INSERT INTO sessions(token,owner,expires) VALUES(?,?,?)').bind(await digest(token),owner,now+30*86400000).run();
    return json({ok:true},200,{'Set-Cookie':`garage_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`});
   }
   if(!session) return json({error:'Bitte mit deinem Benutzernamen und Passwort anmelden.'},401);
   if(path==='/api/logout' && request.method==='POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(await digest(cookie)).run();
    return json({ok:true},200,{'Set-Cookie':'garage_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'});
   }
   if(path==='/api/data' && request.method==='GET') {
    const row=await env.DB.prepare('SELECT data,version FROM garage WHERE owner = ?').bind(owner).first();
    return json(row?{data:JSON.parse(row.data),version:row.version}:{data:{bikes:[],plans:[],history:[],documents:[]},version:0});
   }
   if(path==='/api/data' && request.method==='PUT') {
    const raw=await request.text(); if(raw.length>2000000) return json({error:'Daten sind zu groß.'},413);
    const {data,version}=JSON.parse(raw);
    if(!Number.isInteger(version)||!data||!['bikes','plans','history','documents'].every(k=>Array.isArray(data[k])) || data.bikes.some(b=>typeof b.id!=='string'||typeof b.name!=='string'||!Number.isFinite(b.km)||b.km<0)) return json({error:'Ungültige Fahrraddaten.'},400);
    await env.DB.prepare('INSERT OR IGNORE INTO garage(owner,data,version) VALUES(?,?,0)').bind(owner,JSON.stringify({bikes:[],plans:[],history:[],documents:[]})).run();
    const result=await env.DB.prepare('UPDATE garage SET data = ?, version = version + 1 WHERE owner = ? AND version = ?').bind(JSON.stringify(data),owner,version).run();
    if(!result.meta.changes) return json({error:'Auf einem anderen Gerät wurden Daten geändert. Bitte neu laden, bevor du speicherst.'},409);
    return json({version:version+1});
   }
   const prefix=(await digest(owner))+'/';
   if(path==='/api/files' && request.method==='POST') {
    const length=Number(request.headers.get('Content-Length')); if(length>20*1024*1024) return json({error:'Maximal 20 MB pro Datei.'},413);
    const form=await request.formData(),file=form.get('file');
    if(!file||typeof file.arrayBuffer!=='function'||file.size>20*1024*1024) return json({error:'Bitte eine Datei bis 20 MB auswählen.'},400);
    const allowed=['application/pdf','image/jpeg','image/png','image/webp','image/heic'];
    if(!allowed.includes(file.type)) return json({error:'Erlaubt sind PDF, JPG, PNG, WebP und HEIC.'},400);
    const id=crypto.randomUUID(); await env.BUCKET.put(prefix+id,await file.arrayBuffer(),{httpMetadata:{contentType:file.type},customMetadata:{name:file.name.slice(0,200)}});
    return json({id,name:file.name,type:file.type,size:file.size});
   }
   if(path.startsWith('/api/files/') && request.method==='GET') {
    const id=path.slice('/api/files/'.length); if(!/^[\da-f-]{36}$/.test(id)) return json({error:'Ungültige Datei.'},400);
    const file=await env.BUCKET.get(prefix+id); if(!file) return json({error:'Datei nicht gefunden.'},404);
    return new Response(file.body,{headers:{'Content-Type':file.httpMetadata.contentType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.customMetadata.name)}`}});
   }
   return json({error:'Nicht gefunden.'},404);
  } catch(error) { console.error(error); return json({error:'Die Anfrage konnte nicht verarbeitet werden. Bitte erneut versuchen.'},500); }
 }
};
