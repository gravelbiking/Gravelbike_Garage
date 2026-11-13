import {readFile,writeFile,mkdir,copyFile,cp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFile(join(project,p),'utf8');

// Compile an executable app tree for local development/tests. Never create a ZIP.
export async function prepareApp(output,{development=false,installationKey=null,preserveConfig=false}={}){
 if(installationKey!==null&&!/^[a-f0-9]{48}$/.test(installationKey))throw Error('Invalid local installation key');
 const upload=resolve(output),pub=join(upload,'public'),priv=join(upload,'private');
 await mkdir(pub,{recursive:true});await mkdir(join(priv,'data'),{recursive:true});
let [html,css,client,logic,icon,supplies,contacts,security,qr,equipment,inventory,updates,navigation,administration,documents,orders,strava]=await Promise.all(['src/index.html','src/style.css','src/client.js','src/logic.js','src/icon.svg','src/supplies.js','src/contacts.js','src/security.js','src/vendor/qrcode.js','src/equipment.js','src/inventory.js','src/updates.js','src/navigation.js','src/administration.js','src/documents.js','src/orders.js','src/strava.js'].map(read));
const serviceWizards=await read('src/service-wizards.js');
const resilience=await read('src/resilience.js');
const {version,releaseName=''}=JSON.parse(await read('package.json'));
if(!/^(?:0|[1-9]\d{0,3})(?:\.(?:0|[1-9]\d{0,3})){2}(?:\.[a-z])?$/.test(version))throw Error('Invalid application version');
if(typeof releaseName!=='string'||(releaseName&&!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,79}$/u.test(releaseName)))throw Error('Invalid release name');
administration=administration.replace('/*APP_RELEASE*/{}',JSON.stringify({version,name:releaseName,development}));
html=html.replaceAll('<span class="app-version">GRAVELBIKE GARAGE</span>',`<span class="app-version">GRAVELBIKE GARAGE · ${version}${releaseName?' · '+releaseName:''}</span>`);
const fingerprint=createHash('sha256').update(resilience+version+serviceWizards+html+css+client+logic+supplies+contacts+security+qr+equipment+inventory+updates+navigation+administration+documents+orders+strava).digest('hex').slice(0,12);
const replace=(source,from,to)=>{if(!source.includes(from))throw Error('Frontend template changed: '+from.slice(0,70));return source.replace(from,to);};
client=replace(client,"fetch('/api/'+path,","fetch('api.php?route='+encodeURIComponent(path),");
client=client.replaceAll('/api/files/','api.php?route=files%2F').replaceAll("'/icon.svg'","'icon.svg'").replaceAll("register('/sw.js')","register('sw.js')");
client=replace(client,"password:f.get('password')","password:f.get('password'),setupKey:f.get('setupKey')||''");
client=replace(client,"$('#authForm').hidden=false;","$('#authForm').hidden=false;$('#setupKeyField').hidden=!state.setup;$('#setupKey').required=state.setup;");
client=replace(client,'Wähle einen Benutzernamen und ein Passwort mit mindestens 15 Zeichen.','Gib den Installationsschlüssel aus deiner privaten Konfiguration ein und wähle deinen Benutzernamen und ein vorläufiges Passwort mit mindestens 15 Zeichen und höchstens 72 UTF-8-Bytes. Verwende mindestens drei der vier Gruppen: Großbuchstaben, Kleinbuchstaben, Zahlen und Sonderzeichen. Nach der Einrichtung legst du ein eigenes Passwort fest.');
html=html.replaceAll('href="/','href="').replace('maxlength="256"','maxlength="72"');
html=replace(html,'<form id="authForm" hidden>','<form id="authForm" hidden><label id="setupKeyField" hidden>Installationsschlüssel<input id="setupKey" name="setupKey" type="password" autocomplete="off" spellcheck="false" maxlength="48"></label>');
html=html.replace(/<a id="platformSignIn"[\s\S]*?<\/a>/,'');
html=replace(html,'<style>/*CSS*/</style>',`<link rel="stylesheet" href="style.css?v=${fingerprint}">`);
html=replace(html,'<script>/*JS*/</script>',`<script src="document-preview.js" defer></script><script src="app.js?v=${fingerprint}" defer></script>`);
html=html.replace('src="resilience.js"',`src="resilience.js?v=${fingerprint}"`);
html=html.replace('</head>','<link rel="stylesheet" href="document-preview.css"></head>');
if(development){html=html.replace('<body>','<body><div class="dev-banner" role="status">LOKALE TESTUMGEBUNG · PHP + MySQL · Kein Hosting-Zugriff</div>');css+='\n.dev-banner{position:sticky;top:0;z-index:50;background:#f3d684;color:#433719;text-align:center;font:600 11px/30px -apple-system,sans-serif;padding:0 8px}';if(installationKey)html=html.replace('id="setupKey" name="setupKey"',`id="setupKey" name="setupKey" value="${installationKey}"`);}
await Promise.all([
 copyFile(join(project,'src/uberspace-badge.png'),join(pub,'uberspace-badge.png')),
 writeFile(join(pub,'app.html'),html),writeFile(join(pub,'style.css'),css),
 writeFile(join(pub,'app.js'),qr+'\n'+logic.replaceAll('export function','function')+'\n'+supplies.replaceAll('/api/files/','api.php?route=files%2F')+'\n'+contacts.replaceAll('/api/files/','api.php?route=files%2F')+'\n'+inventory.replaceAll('/api/files/','api.php?route=files%2F')+'\n'+equipment.replaceAll('/api/files/','api.php?route=files%2F')+'\n'+security+'\n'+updates+'\n'+navigation+'\n'+administration+'\n'+documents.replaceAll('/api/files/','api.php?route=files%2F')+'\n'+orders+'\n'+strava+'\n'+serviceWizards.replaceAll('/api/files/','api.php?route=files%2F')+'\n'+client),writeFile(join(pub,'icon.svg'),icon),
 writeFile(join(pub,'manifest.webmanifest'),JSON.stringify({name:'Gravelbike Garage',short_name:'Gravelbike Garage',lang:'de',start_url:'./',scope:'./',display:'standalone',background_color:'#f5f5f0',theme_color:'#233e32',icons:[{src:'icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]},null,2)),
 writeFile(join(pub,'sw.js'),"// Private records and contracts are deliberately never cached.\nself.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',()=>{});self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.openWindow(self.registration.scope));});\n"),
 writeFile(join(priv,'release.json'),JSON.stringify({version,name:releaseName})),
 writeFile(join(priv,'setup-key.php'),"<?php\n// Only a hash of the one-time installation key.\nreturn '"+(installationKey?createHash('sha256').update(installationKey).digest('hex'):'')+"';\n"),
 writeFile(join(upload,'.htaccess'),'Options -Indexes\n'),
 writeFile(join(upload,'index.php'),"<?php\nheader('Location: public/', true, 302);\nexit;\n"),
 writeFile(join(priv,'data','.keep'),''),writeFile(join(priv,'protection-check.txt'),'GRAVELBIKE_GARAGE_PRIVATE_DO_NOT_EXPOSE\n'),
]);
for(const [from,name] of [['selfhost/logging.php','logging.php'],['selfhost/check-hosting.php','check-hosting.php'],['selfhost/mfa.php','mfa.php'],['selfhost/biography.php','biography.php'],['selfhost/schema.sql','schema.sql'],['selfhost/backend.php','backend.php'],['selfhost/updates.php','updates.php'],['selfhost/administration.php','administration.php'],['selfhost/features.php','features.php'],['selfhost/workshop.php','workshop.php'],['selfhost/inventory-report.php','inventory-report.php'],['selfhost/config.php','config.php'],['selfhost/strava.php','strava.php'],['selfhost/strava-job.php','strava-job.php']]){
 if(name==='config.php'&&preserveConfig&&existsSync(join(priv,name)))continue;
 await copyFile(join(project,from),join(priv,name));
}
for(const [from,to] of [['selfhost/report.js',join(pub,'report.js')],['selfhost/index.php',join(pub,'index.php')],['selfhost/api.php',join(pub,'api.php')],['selfhost/public.htaccess',join(pub,'.htaccess')],['selfhost/private.htaccess',join(priv,'.htaccess')],['selfhost/.user.ini',join(pub,'.user.ini')]])await copyFile(join(project,from),to);
await cp(join(project,'src/vendor/pdfjs'),join(pub,'pdfjs'),{recursive:true});
for(const name of ['resilience.js','document-preview.js','document-preview.css'])await copyFile(join(project,'src',name),join(pub,name));
await cp(join(project,'selfhost/vendor'),join(priv,'vendor'),{recursive:true});
await copyFile(join(project,'src/vendor/qrcode-LICENSE'),join(priv,'vendor/qrcode-LICENSE'));

return {public:pub,private:priv,fingerprint};
}
