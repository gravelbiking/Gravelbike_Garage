"""Start and rebuild the private Codespace preview. Never access production."""
import json,os,signal,subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
local=root/'.local/codespace';statefile=local/'processes.json'
os.chdir(root)
def state():return json.loads(statefile.read_text()) if statefile.exists() else {}
def alive(entry):
    if not entry:return False
    try:
        command=Path('/proc',str(entry['pid']),'cmdline').read_bytes().replace(b'\0',b' ').decode()
        return entry['marker'] in command
    except (FileNotFoundError,ProcessLookupError,PermissionError):return False
def stop():
    for entry in state().values():
        if alive(entry):os.kill(entry['pid'],signal.SIGTERM)
    statefile.write_text('{}\n');print('Vorschau beendet. Daten bleiben erhalten.')
def launch(args,log,marker,env=None):
    with (local/log).open('ab') as output:p=subprocess.Popen(args,stdout=output,stderr=output,start_new_session=True,env=env)
    return {'pid':p.pid,'marker':marker}
def build():subprocess.run(['node','codespace/build.mjs'],check=True)
def start():
    prior=state()
    if alive(prior.get('php')) and alive(prior.get('watch')):
        print('Vorschau läuft bereits auf Port 4173.');return
    if prior:stop()
    build()
    public=str(root/'.local/app/public')
    current={'php':launch(['php','-d','upload_max_filesize=20M','-d','post_max_size=24M','-S','0.0.0.0:4173','-t',public,str(root/'codespace/router.php')],'php.log',public,{**os.environ,'GRAVELTUBE_DEV':'1'})}
    current['watch']=launch([sys.executable,str(root/'codespace/manage.py'),'_watch'],'watch.log',str(root/'codespace/manage.py')+' _watch')
    statefile.write_text(json.dumps(current));statefile.chmod(0o600)
    time.sleep(.5)
    if not all(alive(e) for e in current.values()):raise RuntimeError('Vorschau konnte nicht starten; .local/codespace/*.log prüfen.')
    print('Port 4173 öffnen. Beim ersten Start einen eigenen Benutzer anlegen. Der private Installationsschlüssel ist vorausgefüllt.')
def watch():
    def fingerprint():return tuple((str(p),p.stat().st_mtime_ns,p.stat().st_size) for area in ['src','selfhost','scripts'] for p in sorted((root/area).rglob('*')) if p.is_file())
    previous=fingerprint()
    while True:
        time.sleep(1);current=fingerprint()
        if current!=previous:
            try:build();previous=current
            except subprocess.CalledProcessError:print('Build fehlgeschlagen. Fehler korrigieren; der letzte Stand bleibt bestehen.',flush=True)
if __name__=='__main__':
    action=sys.argv[1] if len(sys.argv)>1 else 'status'
    if action=='start':start()
    elif action=='stop':stop()
    elif action=='_watch':watch()
    elif action=='status':print(json.dumps({name:alive(e) for name,e in state().items()}))
    else:raise SystemExit('start, stop oder status verwenden')
