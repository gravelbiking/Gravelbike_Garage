"""Private instance manager. Only fixed actions and registry-bound paths, no shell input."""
import concurrent.futures, datetime, fcntl, hashlib, importlib.util, io, json, os, pathlib, pwd, re, secrets, shutil, subprocess, sys, time, urllib.request, zipfile
HERE=pathlib.Path(__file__).resolve().parent
SETTINGS=HERE/'settings.json'

def server_environment():
 # PHP-FPM does not provide a login-shell environment. Never trust HOME, USER,
 # database password overrides or proxy variables inherited from a web request.
 account=pwd.getpwuid(os.geteuid());home=account.pw_dir;runtime='/run/user/'+str(account.pw_uid)
 return {'HOME':home,'USER':account.pw_name,'LOGNAME':account.pw_name,
         'PATH':home+'/bin:/usr/local/bin:/usr/bin:/bin','LANG':'C.UTF-8','LC_ALL':'C.UTF-8',
         'XDG_RUNTIME_DIR':runtime,'DBUS_SESSION_BUS_ADDRESS':'unix:path='+runtime+'/bus',
         'XDG_CONFIG_HOME':home+'/.config','XDG_DATA_HOME':home+'/.local/share','XDG_CACHE_HOME':home+'/.cache',
         'PYTHONIOENCODING':'utf-8'}

def read(path):return json.loads(path.read_text())
def save(path,data):
 path=pathlib.Path(path);tmp=path.with_name(path.name+'.tmp-'+secrets.token_hex(5));tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2));tmp.chmod(0o600);os.replace(tmp,path)
def run(args,data=None,timeout=90):
 p=subprocess.run(args,input=data,capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError('Serveraktion fehlgeschlagen: '+pathlib.Path(args[0]).name)
 return p.stdout

def slug(name):
 if not isinstance(name,str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9-]{1,29}',name):raise ValueError('Instanzname: 2–30 Zeichen, Buchstaben, Zahlen oder Bindestrich; erstes Zeichen ein Buchstabe.')
 value=name.lower()
 if value in ['admin','grafana','api','private','public','assets','data','update','uploads','www','html']:raise ValueError('Dieser Instanzname ist reserviert.')
 return value

def redact(text):
 text=re.sub(r'(?i)(password|passwort|secret|token|installation[_ -]?key|setupkey|authorization|code)([\s"\x27:=]+)([^\s,;}&"\x27]+)',r'\1\2[ausgeblendet]',text)
 text=re.sub(r'(?i)([?&](?:code|token|key|state)=)[^&\s]+',r'\1[ausgeblendet]',text)
 return re.sub(r'\b[a-fA-F0-9]{32,}\b','[ausgeblendet]',text)

class Manager:
 def __init__(self,settings):
  self.s=settings;self.base=pathlib.Path(settings['base']);self.shared=pathlib.Path(settings['shared']);self.registry=self.shared/'registry.json'
 def log_error(self,error,operation,request_id=''):
  from job_logging import write_job
  write_job(HERE.parent,self.s['php'],'admin',error,operation,request_id)
 def entries(self):
  records=read(self.registry)
  for e in records:
   if not re.fullmatch(r'[a-z][a-z0-9-]{1,49}',e['id']) or not re.fullmatch(r'[a-z][a-z0-9-]{1,49}',e['project']) or not re.fullmatch(self.s['user']+r'_[a-z0-9_]+',e['database']):raise RuntimeError('Ungültige Installationszuordnung.')
  return records
 def entry(self,id):
  candidates=[e for e in self.entries() if e['id']==id]
  if len(candidates)!=1:raise ValueError('Unbekannte Instanz.')
  e=candidates[0];root=self.base/e['project'];shared=self.base/(e['project']+'.shared')
  if root.is_symlink():
   if root.resolve().parent!=(self.base/(e['project']+'.releases')).resolve():raise RuntimeError('Release-Ziel wurde verändert.')
   marker=read(self.base/(e['project']+'.releases')/'.garage-releases.json')
   if marker!={'project':e['project'],'domain':self.s['domain']}:raise RuntimeError('Release-Zuordnung stimmt nicht.')
  elif e['id']!='admin':raise RuntimeError('Kein verwaltetes Release-Ziel.')
  if shared.is_symlink() or not shared.is_dir() or (root/'private/config.php').resolve()!=(shared/'config.php').resolve():raise RuntimeError('Private Instanzzuordnung stimmt nicht.')
  meta=json.loads(run([self.s['php'],'-r','$c=require $argv[1];echo json_encode(["database"=>$c["database"]["name"],"origin"=>$c["origin"],"storage"=>$c["storage_path"]]);',str(shared/'config.php')]))
  if meta!={'database':e['database'],'origin':'https://'+self.s['domain'],'storage':str(shared/'data')}:raise RuntimeError('Konfiguration gehört nicht zur registrierten Instanz.')
  return e,root,shared
 def bridge(self,e,action,**extra):
  root=self.entry(e['id'])[1];return json.loads(run([self.s['php'],str(HERE/'bridge.php')],json.dumps({'action':action,'root':str(root),'database':e['database'],**extra})))
 def audit(self,action,actor,id,ok=True):
  p=self.shared/'audit.log'
  if p.exists() and p.stat().st_size>5*1024*1024:os.replace(p,p.with_suffix('.log.1'))
  with open(p,'a') as f:os.chmod(p,0o600);f.write(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'actor':actor,'action':action,'instance':id,'ok':ok})+'\n')
 def quota(self):
  try:
   text=run(['quota','-g','-l'],timeout=5)
   for line in text.splitlines():
    fields=line.split()
    if fields and fields[0].startswith('/dev/') and len(fields)>=4:
     nums=[int(x.rstrip('*'))*1024 for x in fields[1:4]];return {'used':nums[0],'limit':nums[1],'hardLimit':nums[2],'available':True}
  except (RuntimeError,subprocess.TimeoutExpired,ValueError) as error:self.log_error(error,'monitor.quota')
  return {'used':None,'limit':None,'hardLimit':None,'available':False}
 def disk(self,project):
  paths=[self.base/(project+x) for x in ['.releases','.shared','.backups']];paths=[str(p) for p in paths if p.exists() and not p.is_symlink()]
  if project=='admin':paths.append(str(self.base/'admin'))
  return sum(int(l.split()[0]) for l in run(['du','-sb',*paths],timeout=20).splitlines()) if paths else 0
 def collect(self):
  sessions=self.shared/'data/sessions'
  for path in sessions.glob('sess_*'):
   if path.is_symlink() or not path.is_file() or path.stat().st_mtime>time.time()-300:continue
   try:
    with path.open('r+b') as handle:
     fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
     if path.stat().st_mtime<time.time()-300 and b'enrollment|' in handle.read(20000):path.unlink()
   except (BlockingIOError,FileNotFoundError):pass
  quota=self.quota();ram={};cg=pathlib.Path('/sys/fs/cgroup/user.slice/user-'+str(os.getuid())+'.slice')
  for k,f in [('used','memory.current'),('limit','memory.max')]:
   try:ram[k]=int((cg/f).read_text())
   except (ValueError,OSError):ram[k]=None
  out=[]
  for e in self.entries():
   row={'id':e['id'],'name':e['name'],'url':'https://'+self.s['domain']+e['base_path']+'/','project':e['project'],'database':e['database']}
   try:
    info=self.bridge(e,'describe');metrics=self.bridge(e,'metrics');row.update(info);row.update(metrics);row['diskBytes']=self.disk(e['project']);row['healthy']=True
   except Exception as error:
    self.log_error(error,'monitor.instance.'+e['id']);row.update({'healthy':False,'error':'Instanz oder Datenbank nicht erreichbar.','diskBytes':None,'databaseBytes':None})
   out.append(row)
  # Check public auth endpoints using normal TLS, no redirect and no supplied URL.
  def check(row):
   if row['id']=='admin':return row
   try:
    req=urllib.request.Request(row['url']+'api.php?route=auth',headers={'User-Agent':'Garage-Admin-Monitor'})
    with urllib.request.urlopen(req,timeout=4) as r:d=json.load(r)
    row['httpHealthy']=isinstance(d.get('setup'),bool);row['healthy']=row['healthy'] and row['httpHealthy']
   except Exception as error:self.log_error(error,'monitor.http.'+row['id']);row['httpHealthy']=False;row['healthy']=False
   return row
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:out=list(ex.map(check,out))
  snapshot={'collectedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'quota':quota,'ram':ram,'instances':out,'databaseBytes':sum(x.get('databaseBytes') or 0 for x in out),'grafana':False}
  try:
   with urllib.request.urlopen('http://127.0.0.1:'+str(self.s['grafana_port'])+self.s['base_path']+'/grafana/api/health',timeout=2) as r:snapshot['grafana']=json.load(r).get('database')=='ok'
  except Exception as error:self.log_error(error,'monitor.grafana')
  save(self.shared/'snapshot.json',snapshot)
  ts=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S');rows=[[ts,e['name'],e.get('diskBytes') or 0,e.get('databaseBytes') or 0,quota['used'],quota['limit'],int(e['healthy']),ram.get('used'),ram.get('limit'),e['id'],e.get('databaseLatencyMs')] for e in out]
  admin=next(e for e in self.entries() if e['id']=='admin');self.bridge(admin,'store-metrics',rows=rows)
  builder=HERE/'dashboard_builder.py'
  if builder.is_file():
   spec=importlib.util.spec_from_file_location('garage_dashboard',builder);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);dashboard=module.build_dashboard(out,read(HERE/'queries.json'));dest=self.shared/'grafana/dashboards/garage.json';encoded=json.dumps(dashboard,ensure_ascii=False,indent=2)
   if not dest.exists() or dest.read_text()!=encoded:save(dest,dashboard)
  return {'ok':True,**snapshot}
 def snapshot(self):
  p=self.shared/'snapshot.json'
  if not p.exists():return self.collect()
  return {'ok':True,**read(p),'ageSeconds':int(time.time()-p.stat().st_mtime)}
 def latest(self):
  choices=[]
  for e in self.entries():
   if e['id']=='admin':continue
   _,root,_=self.entry(e['id']);r=read(root/'private/release.json');version=r['version']
   if not re.fullmatch(r'\d+\.\d+\.\d+(?:\.[a-z])?',version):continue
   parts=version.split('.');order=tuple(map(int,parts[:3]))+(ord(parts[3]) if len(parts)==4 else 0,)
   choices.append((order,str(root.resolve()),r))
  if not choices:raise RuntimeError('Keine installierbare Garage-Version vorhanden.')
  _,root,r=max(choices,key=lambda x:x[0]);return pathlib.Path(root),r
 def template(self):
  source,release=self.latest();buf=io.BytesIO();prefix='Garage/hochladen/gravelbike-garage/'
  with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
   for area in ['public','private']:
    for root,dirs,files in os.walk(source/area,followlinks=False):
     dirs[:]=[d for d in dirs if not (pathlib.Path(root)/d).is_symlink() and (area!='private' or (pathlib.Path(root)/d).relative_to(source/'private').parts[0]=='vendor')]
     for name in files:
      p=pathlib.Path(root)/name;rel=p.relative_to(source)
      if p.is_symlink() or name in ['config.php','setup-key.php'] or not re.fullmatch(r'[A-Za-z0-9_.-]+',name):continue
      if p.stat().st_size>20*1024*1024:raise RuntimeError('Unerwartet große Programmdatei.')
      z.write(p,prefix+str(rel))
   for name in ['index.php','.htaccess']:
    if (source/name).is_file():z.write(source/name,prefix+name)
   z.writestr(prefix+'private/config.php','<?php return [];')
   z.writestr(prefix+'private/setup-key.php','<?php return null;')
  return buf.getvalue(),release
 def create(self,name):
  id=slug(name)
  if any(e['id']==id or e['project']==id for e in self.entries()):raise ValueError('Instanz existiert bereits.')
  for suffix in ['', '.shared','.releases','.backups']:
   if os.path.lexists(self.base/(id+suffix)):raise ValueError('Verzeichnisname ist bereits belegt.')
  blob,release=self.template();sha=hashlib.sha256(blob).hexdigest();module=HERE/'uberspace_remote.py';spec=importlib.util.spec_from_file_location('remote',module);remote=importlib.util.module_from_spec(spec);spec.loader.exec_module(remote)
  request={'project':id,'database_suffix':id.replace('-','_'),'domain':self.s['domain'],'base_path':'/'+id,'uberspace_major':8,'data_mode':'empty','expected_user':self.s['user'],'expected_host':self.s['host'],'installation_name':name,'sha256':sha,'deployment':release['version']+'-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+sha[:10],'setup_key':secrets.token_hex(24)}
  remote.validate(request);remote.stage(request,blob);remote.provision(request);remote.activate(request)
  entry={'id':id,'name':name,'project':id,'database':self.s['user']+'_'+id.replace('-','_'),'base_path':'/'+id};save(self.registry,[*self.entries(),entry])
  remote.provision_updater({**request,'worker_source':(HERE/'garage_updater.py').read_text(),'remote_source':module.read_text()})
  return {'ok':True,'instance':entry,'installationKey':request['setup_key'],'release':release['version']}
 def delete(self,id,confirmation):
  if id=='admin':raise ValueError('Admin kann sich nicht selbst löschen.')
  e,root,shared=self.entry(id)
  if confirmation!=e['name']:raise ValueError('Bitte den Instanznamen zur Löschbestätigung exakt eingeben.')
  mounts=self.base/('.'+self.s['domain']+'.garage-mounts.json');mapping=read(mounts);slug=e['base_path'].strip('/')
  if slug:
   if mapping.get(slug)!=e['project']:raise RuntimeError('Domainzuordnung wurde verändert.')
   del mapping[slug]
  else:
   fallback=self.shared/'domain-root';fallback.mkdir(mode=0o755,exist_ok=True);(fallback/'.htaccess').write_text('Options -Indexes\nDirectoryIndex index.html\n');(fallback/'index.html').write_text('<!doctype html><meta charset=utf-8><title>Gravelbike Garage</title><h1>Gravelbike Garage</h1><p>Die Hauptgarage wurde entfernt. Deine weiteren Instanzen bleiben unter ihren bisherigen Adressen erreichbar.</p>')
   for child,project in mapping.items():
    link=fallback/child
    if not link.is_symlink():link.symlink_to(self.base/project/'public')
  # Validate every target before stopping services or altering the mount.
  for suffix in ['.releases','.shared','.backups']:
   path=self.base/(e['project']+suffix)
   if path.is_symlink():raise RuntimeError('Unsicherer Löschpfad.')
  mount=self.base/self.s['domain']/slug if slug else self.base/self.s['domain']
  if not mount.is_symlink() or mount.resolve()!=(root/'public').resolve():raise RuntimeError('Öffentliches Ziel wurde verändert.')
  old_mount=os.readlink(mount)
  units=pathlib.Path.home()/'.config/systemd/user';unitfiles=[];enabled=[]
  for kind in ['strava','update']:
   for ext in ['timer','path','service']:
    path=units/(e['project']+'-'+kind+'.'+ext)
    if path.is_file():
     state=subprocess.run(['systemctl','--user','is-enabled',path.name],capture_output=True,text=True,timeout=10)
     if state.stdout.strip()=='enabled':enabled.append(path.name)
     result=subprocess.run(['systemctl','--user','disable','--now',path.name],capture_output=True,timeout=15)
     if result.returncode:raise RuntimeError('Instanzdienst konnte nicht gestoppt werden.')
     unitfiles.append(path)
  lockpath=shared/'updates/writes.lock';lockpath.parent.mkdir(exist_ok=True);lock=open(lockpath,'a');fcntl.flock(lock,fcntl.LOCK_EX)
  mount.unlink()
  if not slug:mount.symlink_to(fallback)
  save(mounts,mapping)
  try:run(['mariadb','--batch','--skip-column-names'], 'DROP DATABASE `'+e['database']+'`;')
  except Exception:
   if mount.is_symlink():mount.unlink()
   mount.symlink_to(old_mount)
   if slug:mapping[slug]=e['project']
   save(mounts,mapping)
   for unit in enabled:subprocess.run(['systemctl','--user','enable','--now',unit],capture_output=True,timeout=15)
   raise
  for path in unitfiles:path.unlink()
  # Remove matching links in historical main releases too, to avoid a broken rollback mount.
  for p in (self.base/'gravelbike-garage.releases').glob('*/public/'+slug):
   if p.is_symlink() and os.readlink(p)==str(root/'public'):p.unlink()
  root.unlink()
  for suffix in ['.releases','.shared','.backups']:
   p=self.base/(e['project']+suffix)
   if p.exists():
    if p.is_symlink():raise RuntimeError('Unsicherer Löschpfad.')
    shutil.rmtree(p)
  save(self.registry,[x for x in self.entries() if x['id']!=id]);subprocess.run(['systemctl','--user','daemon-reload'],capture_output=True,timeout=15);return {'ok':True,'deleted':id}
 def logs(self,id,kind,options=None):
  if kind=='errors':
   e,root,shared=self.entry(id)
   from error_logs import read_logs
   return {**read_logs(shared,options or {}),'scope':'Instanz '+e['name']}
  if kind=='audit':p=self.shared/'audit.log'
  elif kind=='php':p=pathlib.Path.home()/'logs/php_error.log'
  elif kind=='apache':p=pathlib.Path.home()/'logs/apache/error_log_apache'
  elif kind in ['strava','update']:
   e,_,_=self.entry(id);text=run(['journalctl','--user','-u',e['project']+'-'+kind+'.service','-n','200','--no-pager','-o','short-iso'],timeout=10);return {'ok':True,'text':redact(text),'scope':'Instanz '+e['name']}
  elif kind in ['grafana','monitor']:
   text=run(['journalctl','--user','-u','garage-'+kind+'.service','-n','200','--no-pager','-o','short-iso'],timeout=10);return {'ok':True,'text':redact(text),'scope':kind}
  else:raise ValueError('Unbekanntes Protokoll.')
  if not p.exists():return {'ok':True,'text':'Noch keine Einträge.','scope':kind}
  if p.is_symlink():raise RuntimeError('Ungültiger Protokollpfad.')
  with open(p,'rb') as f:f.seek(max(0,p.stat().st_size-80000));text=f.read().decode('utf-8','replace')
  return {'ok':True,'text':redact('\n'.join(text.splitlines()[-300:])),'scope':'Server (gemeinsam)' if kind in ['php','apache'] else 'Admin'}
 def dispatch(self,action,args):
  if action=='collect':return self.collect()
  if action=='snapshot':return self.snapshot()
  if action=='logs':return self.logs(args.get('id','admin'),args.get('log','audit'),args)
  if action=='create':return self.create(args.get('name',''))
  e,root,shared=self.entry(args.get('id',''))
  if e['id']=='admin':raise ValueError('Diese Aktion ist für die Admin-Instanz gesperrt.')
  if action=='delete':return self.delete(e['id'],args.get('confirmation',''))
  if action=='key':return {'ok':True,**self.bridge(e,'key')}
  if action=='unlock':self.bridge(e,'unlock');return {'ok':True}
  if action=='reset-password':
   if args.get('confirmation')!=e['name']:raise ValueError('Bitte den Instanznamen zur Bestätigung exakt eingeben.')
   password='Tmp!'+secrets.token_urlsafe(24)+'7a';self.bridge(e,'reset-password',password=password);return {'ok':True,'temporaryPassword':password,'username':next(a['username'] for a in self.bridge(e,'describe')['accounts'] if int(a['id'])==1)}
  raise ValueError('Unbekannte Verwaltungsaktion.')

def main():
 os.umask(0o077);environment=server_environment();os.environ.clear();os.environ.update(environment);manager=Manager(read(SETTINGS));action=sys.argv[1];args=json.load(sys.stdin) if action!='collect' else {};allowed=['collect','snapshot','logs','create','delete','key','unlock','reset-password']
 if action not in allowed:raise ValueError('Unbekannte Verwaltungsaktion.')
 with open(manager.shared/'operations.lock','a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  try:result=manager.dispatch(action,args)
  except Exception as error:
   manager.log_error(error,action,args.get('request_id',''));error._garage_logged=True
   manager.audit(action,args.get('actor','system'),args.get('id',args.get('name','')),False);raise
  if action in ['create','delete','reset-password','unlock']:
   try:manager.collect()
   except Exception as error:
    manager.log_error(error,'monitor.after.'+action,args.get('request_id',''));result['warning']='Aktion ausgeführt; Monitoring wird beim nächsten Intervall aktualisiert.'
  if action not in ['snapshot','collect','logs']:manager.audit(action,args.get('actor','system'),args.get('id',args.get('name','')))
 print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':
 try:main()
 except Exception as e:
  if not getattr(e,'_garage_logged',False):
   from job_logging import write_job
   try:php=read(SETTINGS)['php']
   except Exception:php='php'
   write_job(HERE.parent,php,'admin',e,'worker.bootstrap')
  print(json.dumps({'ok':False,'error':str(e) if isinstance(e,(ValueError,RuntimeError)) else 'Verwaltungsaktion fehlgeschlagen. Privates Serverprotokoll prüfen.'}));sys.exit(1)
