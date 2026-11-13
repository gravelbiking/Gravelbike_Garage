"""SSH-side fresh installer. Transferred as code, never a public web endpoint."""
import fcntl
import hashlib
from contextlib import contextmanager
import io
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import stat
import subprocess
import sys
import zipfile

WEB_BASE = Path('/var/www/virtual')


def run(args, data=None):
    result = subprocess.run(args, input=data, capture_output=True, text=True, timeout=90)
    if result.returncode:
        # Never reflect command stderr: providers may include private configuration.
        raise RuntimeError('Serverbefehl fehlgeschlagen: ' + args[0] + '. Privates Serverprotokoll vor Ort prüfen.')
    return result.stdout.strip()


def validate(r):
    for key, pattern in [('project', r'[a-z][a-z0-9-]{2,49}'), ('database_suffix', r'[a-z][a-z0-9_]{1,30}'), ('domain', r'[a-z0-9](?:[a-z0-9.-]{0,250}[a-z0-9])?')]:
        if not isinstance(r.get(key), str) or not re.fullmatch(pattern, r[key]):
            raise RuntimeError('Ungültiges Installationsziel: ' + key)
    if '..' in r['domain'] or '.' not in r['domain'] or r.get('data_mode') != 'empty' or r.get('uberspace_major') not in [7, 8]:
        raise RuntimeError('Nur eine explizite leere Erstinstallation auf Uberspace 7/8 ist vorgesehen.')
    if not re.fullmatch(r'(?:/[a-z][a-z0-9-]{1,30})?', r.get('base_path', '')):
        raise RuntimeError('Ungültiger Installations-Unterordner.')
    if 'installation_name' in r and (not isinstance(r['installation_name'], str) or not re.fullmatch(r'[\w .-]{1,80}', r['installation_name'])):
        raise RuntimeError('Ungültiger Installationsname.')
    if r.get('action') not in ['inspect','inspect-update','provision-updater','check-updater'] and (not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:\.[a-z])?-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{10}', r.get('deployment', '')) or not re.fullmatch(r'[a-f0-9]{64}', r.get('sha256', ''))):
        raise RuntimeError('Ungültiger Release-Datensatz.')


def layout(r):
    account = run(['id', '-un'])
    if not re.fullmatch(r'[a-z][a-z0-9_-]{0,31}', account) or os.getuid() == 0:
        raise RuntimeError('Installation benötigt den eigenen Uberspace-Benutzer, keinen root-Zugang.')
    if r.get('expected_user') and account != r['expected_user']:
        raise RuntimeError('Der SSH-Benutzer entspricht nicht dem vorgesehenen Zielkonto.')
    base = WEB_BASE / account
    if not base.is_dir() or base.stat().st_uid != os.getuid():
        raise RuntimeError('Der erwartete Uberspace-Webbereich gehört nicht diesem SSH-Benutzer.')
    return {'account': account, 'base': base, 'current': base / r['project'], 'shared': base / (r['project'] + '.shared'), 'releases': base / (r['project'] + '.releases'), 'domain': base / r['domain'] / r.get('base_path', '').lstrip('/'), 'database': account + '_' + r['database_suffix']}


def public_url(r):
    return 'https://' + r['domain'] + r.get('base_path', '')


def mounts_file(r, p):
    return p['base'] / ('.' + r['domain'] + '.garage-mounts.json')


def mounts(r, p):
    path = mounts_file(r, p)
    if not path.exists(): return {}
    if path.is_symlink() or path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
        raise RuntimeError('Installationszuordnungen sind nicht privat.')
    entries = json.loads(path.read_text())
    for name, project in entries.items():
        if not re.fullmatch(r'[a-z][a-z0-9-]{1,30}', name) or not re.fullmatch(r'[a-z][a-z0-9-]{2,49}', project):
            raise RuntimeError('Ungültige Installationszuordnung.')
    return entries


def mount_apps(r, p, public):
    # Keep child installations reachable through parent updates and maintenance.
    if r.get('base_path'): return
    for name, project in mounts(r, p).items():
        target = p['base'] / project / 'public'
        link = public / name
        if os.path.lexists(link):
            if not link.is_symlink() or os.readlink(link) != str(target):
                raise RuntimeError('Installationspfad kollidiert mit einer Paketdatei.')
        else: link.symlink_to(target)


def sql(query):
    return run(['mariadb', '--batch', '--skip-column-names'], query)


def database_exists(p):
    return sql("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + p['database'] + "';") != ''


def default_domain_link(p):
    link = p['domain']
    if not os.path.lexists(link):
        return None
    # Only a known default placeholder may be replaced. Never replace another app.
    if not link.is_symlink() or link.resolve() != (p['base'] / 'html').resolve():
        raise RuntimeError('Die Domain verweist bereits auf eigene Inhalte. Keine automatische Ersetzung.')
    html = p['base'] / 'html'
    if not html.is_dir() or any(x.name != 'nocontent.html' for x in html.iterdir()):
        raise RuntimeError('Im bisherigen DocumentRoot liegen Inhalte. Keine automatische Ersetzung.')
    return os.readlink(link)


def apache_only(r, routing):
    if r['uberspace_major']==7:
        rows=[line.strip() for line in routing.splitlines() if line.strip()]
        return bool(rows) and all(re.fullmatch(r'\S+\s+apache(?: \(default\))?',line) for line in rows)
    rows=json.loads(run(['uberspace','web','backend','list','--json']))
    if not isinstance(rows,list):return False
    relevant=[x for x in rows if isinstance(x,dict) and x.get('domain') in [None,'*',r['domain']]]
    return bool(relevant) and any(x.get('path')=='/' and x.get('destination')=='APACHE' for x in relevant) and all(x.get('destination')=='APACHE' and x.get('path')=='/' for x in relevant)


def inspect(r):
    p = layout(r)
    php = json.loads(run(['php', '-r', "echo json_encode(['version'=>PHP_VERSION,'id'=>PHP_VERSION_ID,'pdo'=>extension_loaded('pdo_mysql'),'fileinfo'=>extension_loaded('fileinfo'),'openssl'=>extension_loaded('openssl')]);"]))
    version = sql('SELECT VERSION();')
    # Validate tool availability and obtain provider routing information read-only.
    domains = run(['uberspace', 'web', 'domain', 'list'])
    backends = run(['uberspace', 'web', 'backend', 'list'])
    errors = []
    if not (shutil.which('mariadb-print-defaults') or shutil.which('my_print_defaults')):errors.append('MariaDB-Konfigurationswerkzeug fehlt.')
    if not apache_only(r,backends):errors.append('Eigene oder unbekannte Backend-Routen müssen vor Installation geprüft werden.')
    if php['id'] < 80200 or not all(php[x] for x in ['pdo','fileinfo','openssl']):
        errors.append('PHP benötigt mindestens 8.2 mit PDO_MySQL, fileinfo und OpenSSL; empfohlen 8.4.')
    if 'mariadb' not in version.lower():
        errors.append('MariaDB wurde nicht erkannt.')
    if os.path.lexists(p['releases']):
        marker=p['releases']/'.garage-releases.json'
        try:
            owned=json.loads(marker.read_text())
            if p['releases'].is_symlink() or not p['releases'].is_dir() or owned!={'project':r['project'],'domain':r['domain']}:
                errors.append('Das Release-Verzeichnis gehört nicht zu diesem Installationsziel.')
        except (OSError,ValueError):
            errors.append('Vorhandenes Release-Verzeichnis ist nicht als eigenes Installationsziel gekennzeichnet.')
    if database_exists(p): errors.append('Die vorgesehene Datenbank existiert bereits.')
    if os.path.lexists(p['current']) or os.path.lexists(p['shared']): errors.append('App-/Datenverzeichnis existiert bereits.')
    try:
        if r.get('base_path'):
            root = p['base'] / r['domain']
            if not root.is_dir() or not root.resolve().is_relative_to(p['base'].resolve()):
                raise RuntimeError('Die bestehende Domain ist nicht als eigenes Webziel verfügbar.')
            if os.path.lexists(p['domain']) or r['base_path'][1:] in mounts(r, p):
                raise RuntimeError('Der vorgesehene Unterordner ist bereits belegt.')
        else: default_domain_link(p)
    except RuntimeError as e: errors.append(str(e))
    return {'account':p['account'], 'php':php['version'], 'database_engine':version, 'database':p['database'], 'domain':r['domain'], 'domain_list':domains, 'backend_list':backends, 'fresh_install_ready':not errors, 'issues':errors}


def state_path(p, release):
    return p['releases'] / release / '.garage-install-state.json'


def save_json(path, value):
    temporary = path.with_name(path.name + '.tmp-' + secrets.token_hex(5))
    with open(temporary, 'x') as f:
        os.chmod(temporary, 0o600)
        json.dump(value, f)
    os.replace(temporary, path)


def load_state(p, r):
    path = state_path(p, r['deployment'])
    state = json.loads(path.read_text())
    if state['sha256'] != r['sha256'] or state['domain'] != r['domain'] or state['database'] != p['database']:
        raise RuntimeError('Die Installation passt nicht zum vorgemerkten Ziel.')
    return state


def extract_app(blob, target):
    """Reject traversal, symlinks, duplicates and non-app content before writing."""
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        names = z.namelist()
        if not names or len(names) != len(set(names)) or len({n.split('/')[0] for n in names}) != 1:
            raise RuntimeError('Ungültige Archivstruktur.')
        prefix = names[0].split('/')[0] + '/hochladen/gravelbike-garage/'
        selected = []
        for info in z.infolist():
            if stat.S_ISLNK(info.external_attr >> 16) or info.filename.startswith('/') or '..' in Path(info.filename).parts:
                raise RuntimeError('Unsicherer Archivpfad.')
            if info.filename.startswith(prefix) and not info.is_dir():
                raw = info.filename[len(prefix):]
                rel = Path(raw)
                if rel.as_posix() != raw:
                    raise RuntimeError('Nicht kanonischer Archivpfad.')
                if rel.parts[0] not in ['public','private'] and str(rel) not in ['index.php','.htaccess']:
                    raise RuntimeError('Unbekannter App-Pfad.')
                if info.file_size > 20*1024*1024:
                    raise RuntimeError('Unerwartet große Installationsdatei.')
                selected.append((info, rel))
        if sum(i.file_size for i, _ in selected) > 50*1024*1024:
            raise RuntimeError('Installationsarchiv ist zu groß.')
        required = {'public/index.php','public/api.php','public/.htaccess','private/config.php','private/backend.php','private/check-hosting.php','private/mfa.php'}
        if not required.issubset({str(p) for _, p in selected}):
            raise RuntimeError('Unvollständige Installation.')
        target.mkdir(mode=0o755)
        for info, rel in selected:
            dest = target / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(z.read(info))
        for path in [target, *target.rglob('*')]:
            private = path != target and path.relative_to(target).parts[0] == 'private'
            path.chmod((0o700 if private else 0o755) if path.is_dir() else (0o600 if private else 0o644))


def stage(r, blob):
    report = inspect(r)
    if not report['fresh_install_ready']:
        raise RuntimeError('Vorprüfung verhindert Erstinstallation: ' + '; '.join(report['issues']))
    if hashlib.sha256(blob).hexdigest() != r['sha256']:
        raise RuntimeError('Übertragungs-Prüfsumme stimmt nicht.')
    p = layout(r)
    if not p['releases'].exists():
        p['releases'].mkdir(mode=0o755)
        p['releases'].chmod(0o755)
        save_json(p['releases']/'.garage-releases.json',{'project':r['project'],'domain':r['domain']})
    dest = p['releases'] / r['deployment']
    if os.path.lexists(dest): raise RuntimeError('Dieser Installationsstand existiert bereits; nichts überschrieben.')
    extract_app(blob, dest)
    save_json(state_path(p,r['deployment']), {'sha256':r['sha256'],'domain':r['domain'],'database':p['database'],'provisioned':False,'activated':False,'previous_link':None})
    return {'staged':True,'deployment':r['deployment'],'public':False}


CONFIG_PHP = r'''
$input=json_decode(stream_get_contents(STDIN),true,64,JSON_THROW_ON_ERROR);
if(!is_string($input['db_password']??null)||$input['db_password']==='')throw new RuntimeException('Private MariaDB-Konfiguration fehlt.');
$config=['installation_name'=>($input['name']??'Prod1'),'cookie_prefix'=>($input['cookie_prefix']??'garage_'),'installation_key'=>$input['key'],'database'=>['host'=>'localhost','port'=>3306,'name'=>$argv[1],'user'=>$argv[2],'password'=>$input['db_password'],'table_prefix'=>'gt_'],'origin'=>$argv[3],'trusted_proxies'=>[],'storage_path'=>$argv[4]];
$file=$argv[5];$handle=fopen($file,'x');if(!$handle)throw new RuntimeException('Konfiguration existiert bereits.');chmod($file,0600);
fwrite($handle,"<?php\ndeclare(strict_types=1);\nreturn ".var_export($config,true).";\n");fclose($handle);
'''


def provision(r):
    p = layout(r); state = load_state(p,r)
    if state['provisioned'] or os.path.lexists(p['shared']) or database_exists(p):
        raise RuntimeError('Erstinstallation wurde bereits begonnen. Keine Daten oder Konfiguration überschrieben.')
    if not re.fullmatch(r'[a-f0-9]{48}',r.get('setup_key','')):
        raise RuntimeError('Privater Installationsschlüssel fehlt.')
    release = p['releases'] / r['deployment']
    # Re-check all user-controlled destinations immediately before mutations.
    default_domain_link(p)
    if os.path.lexists(p['current']): raise RuntimeError('Das App-Ziel wurde inzwischen angelegt.')
    defaults_tool=shutil.which('mariadb-print-defaults') or shutil.which('my_print_defaults')
    if not defaults_tool: raise RuntimeError('Das MariaDB-Konfigurationswerkzeug fehlt.')
    values=run([defaults_tool,'client']).splitlines()
    db_password=next((v.split('=',1)[1] for v in values if v.startswith('--password=')),None)
    if not db_password: raise RuntimeError('MariaDB-Passwort fehlt in der privaten Serverkonfiguration.')
    p['shared'].mkdir(mode=0o700)
    (p['shared'] / 'data').mkdir(mode=0o700)
    sql('CREATE DATABASE `' + p['database'] + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;')
    run(['php','-r',CONFIG_PHP,p['database'],p['account'],'https://'+r['domain'],str(p['shared']/'data'),str(p['shared']/'config.php')],json.dumps({'key':r['setup_key'],'db_password':db_password,'name':r.get('installation_name','Prod1'),'cookie_prefix':'garage_'+r['project'].replace('-','_')+'_' if r.get('base_path') else 'garage_'}))
    config = release/'private/config.php'
    config.unlink()  # Only the empty, verified package template in this new release.
    config.symlink_to(p['shared']/'config.php')
    check = run(['php',str(release/'private/check-hosting.php')])
    state['provisioned']=True;save_json(state_path(p,r['deployment']),state)
    return {'provisioned':True,'database':p['database'],'preflight':check,'public':False}


def atomic_link(path, target):
    tmp = path.with_name('.'+path.name+'-'+secrets.token_hex(6))
    tmp.symlink_to(target)
    try: os.replace(tmp, path)
    finally:
        if os.path.lexists(tmp): tmp.unlink()


def activate(r):
    p=layout(r);state=load_state(p,r)
    if not state['provisioned'] or state['activated'] or os.path.lexists(p['current']):
        raise RuntimeError('Dieser Stand kann nicht als Erstinstallation aktiviert werden.')
    previous=default_domain_link(p)
    # Domain registration changes no DNS records at the external registrar.
    # Abort on custom backends; changing those might affect another application.
    routing=run(['uberspace','web','backend','list'])
    if not apache_only(r,routing):
        raise RuntimeError('Eigene Backend-Routen vorhanden. Vor Aktivierung gezielt prüfen.')
    domains=run(['uberspace','web','domain','list'])
    if not re.search(r'(?<![a-zA-Z0-9.-])'+re.escape(r['domain'])+r'(?![a-zA-Z0-9.-])',domains):
        run(['uberspace','web','domain','add',r['domain']])
        previous=default_domain_link(p)
    state['previous_link']=previous
    state['activation_started']=True
    save_json(state_path(p,r['deployment']),state)
    p['current'].symlink_to(p['releases']/r['deployment'])
    if r.get('base_path'):
        entries = mounts(r, p)
        name = r['base_path'][1:]
        if name in entries: raise RuntimeError('Installationspfad wurde inzwischen belegt.')
        entries[name] = r['project']
        save_json(mounts_file(r, p), entries)
    atomic_link(p['domain'], str(p['current']/'public'))
    state['activated']=True;save_json(state_path(p,r['deployment']),state)
    return {'activated':True,'url':public_url(r),'dns_changed':False}


def rollback(r):
    p=layout(r);state=load_state(p,r)
    if not state.get('activation_started'): raise RuntimeError('Keine Aktivierung zum Zurücknehmen vorgemerkt.')
    domain=p['domain']
    if not domain.is_symlink() or os.readlink(domain)!=str(p['current']/'public'):
        raise RuntimeError('Domainziel wurde verändert. Keine automatische Ersetzung.')
    if state['previous_link'] is None: domain.unlink()
    else: atomic_link(domain,state['previous_link'])
    state['activated']=False;state['activation_started']=False;save_json(state_path(p,r['deployment']),state)
    if r.get('base_path'):
        entries = mounts(r, p)
        if entries.get(r['base_path'][1:]) == r['project']:
            del entries[r['base_path'][1:]]
            save_json(mounts_file(r, p), entries)
    return {'rolled_back':True,'database_retained':True,'private_data_retained':True}


def inspect_update(r):
    """Accept only our existing release/shared layout, never an unrelated site."""
    p=layout(r)
    marker=p['releases']/'.garage-releases.json'
    if p['releases'].is_symlink() or json.loads(marker.read_text())!={'project':r['project'],'domain':r['domain']}:
        raise RuntimeError('Das vorhandene Release-Verzeichnis gehört nicht zu diesem Ziel.')
    if not p['current'].is_symlink() or p['current'].resolve().parent!=p['releases'].resolve():
        raise RuntimeError('Keine eigene bestehende Release-Verknüpfung gefunden.')
    if not p['domain'].is_symlink() or os.readlink(p['domain'])!=str(p['current']/'public'):
        raise RuntimeError('Das Domainziel entspricht nicht der bestehenden Garage.')
    current=p['current'].resolve()
    if p['shared'].is_symlink() or not (p['shared']/'data').is_dir() or (current/'private/config.php').resolve()!=(p['shared']/'config.php').resolve():
        raise RuntimeError('Die private Konfiguration entspricht nicht der bestehenden Garage.')
    config=json.loads(run(['php','-r',"$c=require $argv[1];echo json_encode(['database'=>$c['database']['name'],'origin'=>$c['origin'],'storage'=>$c['storage_path']]);",str(p['shared']/'config.php')]))
    if config!={'database':p['database'],'origin':'https://'+r['domain'],'storage':str(p['shared']/'data')}:
        raise RuntimeError('Bestehende Datenbank, Origin oder Speicherpfad passen nicht zum Updateziel.')
    if not database_exists(p) or not apache_only(r,run(['uberspace','web','backend','list'])):
        raise RuntimeError('Datenbank oder Apache-Routing nicht wie erwartet vorhanden.')
    if not shutil.which('mariadb-dump'):
        raise RuntimeError('MariaDB-Sicherungswerkzeug fehlt.')
    php=json.loads(run(['php','-r',"echo json_encode(['id'=>PHP_VERSION_ID,'pdo'=>extension_loaded('pdo_mysql'),'fileinfo'=>extension_loaded('fileinfo'),'openssl'=>extension_loaded('openssl')]);"]))
    if php['id']<80200 or not all(php[k] for k in ['pdo','fileinfo','openssl']):
        raise RuntimeError('PHP-Voraussetzungen sind nicht erfüllt.')
    return {'update_ready':True,'database':p['database'],'domain':r['domain'],'previous_release':current.name,'data_preserved':True}


def restart_php(r):
    if r['uberspace_major'] == 8:
        run(['systemctl', '--user', 'restart', 'php-fpm'])


def verify_runtime(r, directory):
    # Historical releases predate the update metadata.
    if not (directory/'private/release.json').is_file():
        return
    import urllib.request
    from urllib.error import HTTPError
    metadata = json.loads((directory/'private/release.json').read_text())
    expected = ' · '.join(filter(None, ['GRAVELBIKE GARAGE', metadata['version'], metadata['name']])).encode()
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = urllib.request.build_opener(NoRedirect())
    def fetch(path):
        req = urllib.request.Request(public_url(r)+path, headers={'User-Agent':'Gravelbike-Garage-Update-Check','Cache-Control':'no-cache'})
        try:
            with opener.open(req, timeout=15) as response:
                return response.status, response.read(5*1024*1024)
        except HTTPError as error:
            return error.code, b''
    status, html = fetch('/?release='+metadata['version'])
    if status != 200 or expected not in html:
        raise RuntimeError('Die erwartete Versionsanzeige wird nicht ausgeliefert.')
    status, js = fetch('/app.js?release='+metadata['version'])
    if status != 200 or js != (directory/'public/app.js').read_bytes():
        raise RuntimeError('Die ausgelieferte App stimmt nicht mit dem Paket überein.')
    status, body = fetch('/api.php?route=auth')
    auth = json.loads(body) if status == 200 else {}
    if not isinstance(auth.get('setup'), bool) or auth.get('authenticated') is not False:
        raise RuntimeError('Anmeldeprüfung fehlgeschlagen.')
    if any(fetch('/api.php?route='+route)[0] != 401 for route in ('data','updates','files%2F'+'0'*32)):
        raise RuntimeError('Anmeldeschutz konnte nicht bestätigt werden.')
    if any(fetch(path)[0] not in [403,404] for path in ('/app.html','/private/config.php','/private/data/mfa-key.php')):
        raise RuntimeError('Dateischutz konnte nicht bestätigt werden.')


def updater_directory(r):
    return layout(r)['shared'] / 'updates'


def provision_updater(r):
    inspect_update(r)
    if r['uberspace_major'] != 8:
        raise RuntimeError('Der Update-Dienst benötigt Uberspace 8.')
    directory = updater_directory(r)
    directory.mkdir(mode=0o700, exist_ok=True)
    if directory.is_symlink() or directory.stat().st_mode & 0o077 or directory.stat().st_uid != os.getuid():
        raise RuntimeError('Das Update-Verzeichnis ist nicht privat.')
    if (directory/'request.json').exists():
        raise RuntimeError('Ein Update-Auftrag läuft bereits.')
    for name, field in [('uberspace_remote.py','remote_source'), ('worker.py','worker_source')]:
        source = r[field]
        compile(source, name, 'exec')
        temporary = directory / (name + '.tmp')
        temporary.write_text(source)
        os.replace(temporary, directory/name)
    save_json(directory/'target.json', {key:r[key] for key in ['domain','project','database_suffix','uberspace_major','data_mode','expected_user','base_path','installation_name'] if key in r})
    units = Path.home() / '.config/systemd/user'
    units.mkdir(parents=True, exist_ok=True)
    service = r['project'] + '-update'
    python = shutil.which('python3')
    (units/(service+'.service')).write_text(
        '[Unit]\nDescription=Gravelbike Garage update worker\n[Service]\nType=oneshot\nTimeoutStartSec=20min\n'
        f'ExecStart={python} {directory}/worker.py\n')
    (units/(service+'.path')).write_text(
        '[Unit]\nDescription=Watch for Gravelbike Garage updates\n[Path]\n'
        f'PathExists={directory}/request.json\n[Install]\nWantedBy=default.target\n')
    strava_service = r['project'] + '-strava'
    php = shutil.which('php')
    if not php: raise RuntimeError('PHP für den Strava-Hintergrunddienst fehlt.')
    current = layout(r)['current']
    (units/(strava_service+'.service')).write_text(
        '[Unit]\nDescription=Gravelbike Garage Strava sync\n[Service]\nType=oneshot\nTimeoutStartSec=5min\n'
        f'ExecStart={php} {current}/private/strava-job.php sync\n')
    (units/(strava_service+'.timer')).write_text(
        '[Unit]\nDescription=Strava sync for ' + r['project'] + '\n[Timer]\n'
        'OnBootSec=1min\nOnUnitActiveSec=1min\n[Install]\nWantedBy=timers.target\n')
    run(['systemctl','--user','daemon-reload'])
    run(['systemctl','--user','enable','--now',service+'.path'])
    run(['systemctl','--user','is-active',service+'.path'])
    run(['systemctl','--user','enable','--now',strava_service+'.timer'])
    run(['systemctl','--user','is-active',strava_service+'.timer'])
    (directory/'enabled').touch(mode=0o600)
    return {'updater_ready':True}


def check_updater(r):
    import time
    directory = updater_directory(r)
    if not (directory/'enabled').is_file():
        raise RuntimeError('Update-Dienst fehlt.')
    with (directory/'queue.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if (directory/'request.json').exists():
            raise RuntimeError('Ein Update-Auftrag läuft bereits.')
        job = {'id':secrets.token_hex(16),'action':'check','version':None}
        save_json(directory/'request.json',job)
    for _ in range(45):
        if (directory/'result.json').is_file():
            result = json.loads((directory/'result.json').read_text())
            if result.get('id') == job['id']:
                return {'update_check':result.get('message')}
        time.sleep(1)
    raise RuntimeError('Der Update-Dienst hat nicht rechtzeitig geantwortet.')


def update(r,blob):
    inspect_update(r)
    if hashlib.sha256(blob).hexdigest()!=r['sha256']:
        raise RuntimeError('Übertragungs-Prüfsumme stimmt nicht.')
    p=layout(r);previous=p['current'].resolve();dest=p['releases']/r['deployment']
    if os.path.lexists(dest):raise RuntimeError('Dieser Update-Stand existiert bereits; nichts überschrieben.')
    extract_app(blob,dest)
    mount_apps(r, p, dest/'public')
    (dest/'private/config.php').unlink()
    (dest/'private/config.php').symlink_to(p['shared']/'config.php')
    shutil.copy2(previous/'private/setup-key.php',dest/'private/setup-key.php')
    for file in dest.rglob('*.php'):
        run(['php','-l',str(file)])
    backup_root=p['base']/(r['project']+'.backups')
    if os.path.lexists(backup_root) and (backup_root.is_symlink() or backup_root.stat().st_uid!=os.getuid() or backup_root.stat().st_mode&0o077):
        raise RuntimeError('Sicherungsverzeichnis ist nicht privat oder gehört nicht diesem Konto.')
    backup_root.mkdir(mode=0o700,exist_ok=True)
    backup=backup_root/r['deployment'];backup.mkdir(mode=0o700)
    maintenance=dest/'.maintenance';maintenance.mkdir(mode=0o755);maintenance.chmod(0o755)
    mount_apps(r, p, maintenance)
    children = [] if r.get('base_path') else list(mounts(r, p))
    pattern = '^/(?!' + '|'.join(re.escape(name) + '(?:/|$)' for name in children) + ')' if children else '^/'
    (maintenance/'.htaccess').write_text('RedirectMatch 503 ' + pattern + '\nErrorDocument 503 "Gravelbike Garage wird aktualisiert. Bitte in einer Minute erneut laden."\n')
    (maintenance/'.htaccess').chmod(0o644)
    state={'sha256':r['sha256'],'domain':r['domain'],'database':p['database'],'previous_release':str(previous),'backup':str(backup),'activated':False,'phase':'staged'}
    save_json(state_path(p,r['deployment']),state)
    write_lock = None
    swapped = False
    try:
        # Pause requests while database and private files are snapshotted together.
        atomic_link(p['domain'],str(maintenance))
        import urllib.request,urllib.error,time
        try:status=urllib.request.urlopen(public_url(r)+'/',timeout=20).status
        except urllib.error.HTTPError as e:status=e.code
        if status!=503:raise RuntimeError('Wartungsmodus konnte nicht bestätigt werden; Update abgebrochen.')
        if (p['shared']/'updates'/'enabled').is_file():
            write_lock = (p['shared']/'updates'/'writes.lock').open('a')
            deadline = time.monotonic() + 45
            while True:
                try:
                    fcntl.flock(write_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        raise RuntimeError('Aktive Schreibzugriffe konnten nicht rechtzeitig abgeschlossen werden.')
                    time.sleep(.2)
        else:
            time.sleep(2)
        with open(backup/'database.sql','xb') as out:
            os.chmod(backup/'database.sql',0o600)
            result=subprocess.run(['mariadb-dump','--single-transaction','--skip-lock-tables','--hex-blob',p['database']],stdout=out,stderr=subprocess.PIPE,timeout=180)
        if result.returncode or (backup/'database.sql').stat().st_size==0:raise RuntimeError('Datenbanksicherung fehlgeschlagen.')
        shutil.copytree(p['shared'],backup/'shared',symlinks=True,
                        ignore=lambda path, names: {'updates'} if Path(path) == p['shared'] else set())
        save_json(backup/'.garage-backup-complete.json',{'project':r['project'],'database':p['database'],'sql_bytes':(backup/'database.sql').stat().st_size,'complete':True})
        state['phase']='backed-up';save_json(state_path(p,r['deployment']),state)
        run(['php',str(dest/'private/check-hosting.php')])
        if p['current'].resolve()!=previous or os.readlink(p['domain'])!=str(maintenance):raise RuntimeError('Das Installationsziel wurde während des Updates verändert.')
        atomic_link(p['current'],str(dest))
        swapped = True
        atomic_link(p['domain'],str(p['current']/'public'))
        restart_php(r)
        verify_runtime(r,dest)
        state['activated']=True;state['phase']='activated';save_json(state_path(p,r['deployment']),state)
        return {'updated':True,'deployment':r['deployment'],'previous_release':previous.name,'backup':str(backup),'data_preserved':True}
    except Exception:
        if p['current'].is_symlink() and p['current'].resolve()==dest.resolve():atomic_link(p['current'],str(previous))
        if p['domain'].is_symlink() and os.readlink(p['domain'])==str(maintenance):atomic_link(p['domain'],str(p['current']/'public'))
        state['phase']='failed-restored';save_json(state_path(p,r['deployment']),state)
        if swapped:restart_php(r)
        raise
    finally:
        if write_lock:write_lock.close()



def cleanup_after_update(r):
    """Retention only after successful activation and a fresh runtime check."""
    p=layout(r);state=load_state(p,r);active=p['current'].resolve(strict=True)
    if not state.get('activated') or active!=p['releases']/r['deployment']:
        raise RuntimeError('Bereinigung benötigt das erfolgreich aktivierte Update.')
    if not p['current'].is_symlink() or p['releases'].is_symlink() or active.parent!=p['releases']:
        raise RuntimeError('Unbekanntes Release-Verzeichnis; keine Bereinigung.')
    marker=json.loads((p['releases']/'.garage-releases.json').read_text())
    if marker!={'project':r['project'],'domain':r['domain']}:
        raise RuntimeError('Release-Verzeichnis gehört nicht zu dieser Garage.')
    verify_runtime(r,active)
    backups=p['base']/(r['project']+'.backups')
    if backups.is_symlink() or not backups.is_dir() or backups.stat().st_uid!=os.getuid():
        raise RuntimeError('Unbekanntes Backup-Verzeichnis; keine Bereinigung.')
    pattern=r'[0-9]+\.[0-9]+\.[0-9]+(?:\.[a-z])?-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{10}'
    def entries(directory):
        result=[]
        for item in directory.iterdir():
            if directory==p['releases'] and item.name=='.garage-releases.json':continue
            if item.is_symlink() or not item.is_dir() or not re.fullmatch(pattern,item.name) or item.stat().st_uid!=os.getuid():
                raise RuntimeError('Unerwarteter Eintrag; keine automatische Bereinigung.')
            result.append(item)
        return result
    releases=entries(p['releases']);candidates=entries(backups)
    def complete(item):
        sql=item/'database.sql';shared=item/'shared'
        structure=(sql.is_file() and not sql.is_symlink() and sql.stat().st_size>0
                   and shared.is_dir() and not shared.is_symlink()
                   and (shared/'config.php').is_file() and not (shared/'config.php').is_symlink()
                   and (shared/'data').is_dir() and not (shared/'data').is_symlink())
        if not structure:return False
        marker=item/'.garage-backup-complete.json'
        if marker.exists():
            if marker.is_symlink():return False
            try:info=json.loads(marker.read_text())
            except (OSError,ValueError):return False
            return info=={'project':r['project'],'database':p['database'],'sql_bytes':sql.stat().st_size,'complete':True}
        # Compatibility: only the backup of this successfully activated legacy
        # update is trusted without the new completion marker.
        return item==Path(state['backup'])
    complete_backups=[item for item in candidates if complete(item)]
    if not complete_backups or not complete(Path(state['backup'])):
        raise RuntimeError('Kein vollständiges Update-Backup; alle alten Stände bleiben erhalten.')
    keep=max(complete_backups,key=lambda item:item.name)
    if Path(state['backup']) not in candidates:
        raise RuntimeError('Update-Backup gehört nicht zu dieser Garage.')
    remove=[item for item in releases if item!=active]+[item for item in candidates if item!=keep]
    # The caller holds the common installation lock throughout validation/deletion.
    if p['current'].resolve()!=active:raise RuntimeError('Aktives Release hat sich geändert.')
    for item in remove:shutil.rmtree(item)
    state.update(phase='verified-retained',retention={'kept_release':active.name,'kept_backup':keep.name,'removed':len(remove)})
    save_json(state_path(p,r['deployment']),state)
    return state['retention']


def rollback_update(r):
    p=layout(r);state=load_state(p,r);dest=p['releases']/r['deployment'];previous=Path(state['previous_release'])
    if previous.parent!=p['releases'].resolve() or not previous.is_dir() or not state.get('activated'):
        raise RuntimeError('Kein eigener vorheriger Release-Stand zum Zurückschalten.')
    if not p['current'].is_symlink() or p['current'].resolve()!=dest.resolve() or not p['domain'].is_symlink() or os.readlink(p['domain'])!=str(p['current']/'public'):
        raise RuntimeError('Aktuelles Ziel wurde verändert; keine automatische Rückschaltung.')
    mount_apps(r, p, previous/'public')
    atomic_link(p['current'],str(previous))
    try:
        restart_php(r)
        verify_runtime(r,previous)
    except Exception:
        atomic_link(p['current'],str(dest))
        restart_php(r)
        raise
    state['activated']=False;state['phase']='rolled-back';save_json(state_path(p,r['deployment']),state)
    return {'rolled_back':True,'database_retained':True,'private_data_retained':True}


@contextmanager
def mutation_lock(r):
    p=layout(r);path=p['base']/('.'+r['domain']+'.garage-install.lock')
    try:
        with open(path,'x') as f:
            os.chmod(path,0o600);f.write(str(os.getpid()))
    except FileExistsError:
        raise RuntimeError('Eine Installation läuft oder wurde unterbrochen. Zuerst den vorhandenen Zwischenstand prüfen.')
    try: yield
    finally: path.unlink()


def main():
    os.umask(0o077)
    try:
        r=json.loads(sys.stdin.buffer.readline(100000));validate(r)
        action=r['action']
        if action=='inspect': result=inspect(r)
        elif action=='inspect-update': result=inspect_update(r)
        elif action=='check-updater': result=check_updater(r)
        elif action=='provision-updater':
            with mutation_lock(r):
                result=provision_updater(r)
        elif action in ['stage','provision','activate','rollback','update','rollback-update','finalize-update']:
            with mutation_lock(r):
                if action=='stage': result=stage(r,sys.stdin.buffer.read(50*1024*1024+1))
                elif action=='provision': result=provision(r)
                elif action=='activate': result=activate(r)
                elif action=='update': result=update(r,sys.stdin.buffer.read(50*1024*1024+1))
                elif action=='rollback-update': result=rollback_update(r)
                elif action=='finalize-update': result=cleanup_after_update(r)
                else: result=rollback(r)
        else: raise RuntimeError('Unbekannte Installationsaktion.')
        print(json.dumps({'ok':True,**result}))
    except Exception as e:
        message=str(e) if isinstance(e,RuntimeError) else 'Installation fehlgeschlagen. Privaten Zwischenstand prüfen; keine automatische Datenlöschung.'
        print(json.dumps({'ok':False,'error':message}));sys.exit(1)


if __name__=='__main__': main()
