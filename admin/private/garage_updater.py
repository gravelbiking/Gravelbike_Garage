#!/usr/bin/env python3
"""Private Uberspace 8 worker, invoked by the systemd user path unit."""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile
import subprocess
import shutil

import uberspace_remote as garage

REPO = 'gravelbiking/Gravelbike_Garage'
RELEASES = 'https://api.github.com/repos/' + REPO + '/releases/latest'
MAX_ZIP = 50 * 1024 * 1024


def version_tuple(version):
    if not isinstance(version, str) or not re.fullmatch(r'(0|[1-9]\d{0,3})(\.(0|[1-9]\d{0,3})){2}(\.[a-z])?', version):
        raise RuntimeError('Ungültige Versionsnummer im Release.')
    major, minor, patch, *suffix = version.split('.')
    return (int(major), int(minor), int(patch), ord(suffix[0]) - 96 if suffix else 0)


def fetch(url, limit):
    headers = {'User-Agent': 'Gravelbike-Garage-Updater', 'Accept': 'application/vnd.github+json'}
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise RuntimeError('Download ist größer als erwartet.')
    return data


def latest(installed):
    try:
        release = json.loads(fetch(RELEASES, 1024 * 1024))
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise
    tag = release.get('tag_name', '')
    if release.get('draft') is not False or release.get('prerelease') is not False or not tag.startswith('v'):
        return None
    version = tag[1:]
    if version_tuple(version) <= version_tuple(installed):
        return None
    filename = f'Gravelbike-Garage-Uberspace-{version}.zip'
    assets = {asset['name']: asset for asset in release['assets'] if asset.get('state') == 'uploaded'}
    if filename not in assets or filename + '.sha256' not in assets:
        return None
    base = f'https://github.com/{REPO}/releases/download/{tag}/'
    checksum = fetch(base + filename + '.sha256', 512).decode('ascii')
    match = re.fullmatch(r'([a-f0-9]{64})  ' + re.escape(filename) + r'\n?', checksum)
    if not match or assets[filename].get('digest') not in (None, 'sha256:' + match[1]):
        raise RuntimeError('Die Prüfsummen des GitHub-Releases stimmen nicht überein.')
    return {'version': version, 'name': (release.get('name') or tag)[:120],
            'notes': (release.get('body') or '')[:12000], 'digest': match[1], 'url': base + filename}


def install(target, paths, release):
    blob = fetch(release['url'], MAX_ZIP)
    if hashlib.sha256(blob).hexdigest() != release['digest']:
        raise RuntimeError('Die Prüfsumme des Downloads stimmt nicht.')
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        root = archive.namelist()[0].split('/')[0]
        prefix = root + '/hochladen/gravelbike-garage/'
        schema = archive.getinfo(prefix + 'private/schema.sql')
        if schema.file_size > 1024 * 1024 or archive.read(schema) != (paths['current'] / 'private/schema.sql').read_bytes():
            raise RuntimeError('Dieses Release benötigt eine gesonderte Datenbankmigration. Die Garage wurde nicht verändert.')
        info = archive.getinfo(prefix + 'private/release.json')
        if info.file_size > 4096:
            raise RuntimeError('Ungültige Release-Metadaten im Paket.')
        metadata = json.loads(archive.read(info))
        if metadata['version'] != release['version'] or (metadata['name'] or 'v'+metadata['version']) != release['name']:
            raise RuntimeError('Paketversion oder Releasename passen nicht zur Veröffentlichung.')
    deployment = release['version'] + '-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + release['digest'][:10]
    request = dict(target, action='update', deployment=deployment, sha256=release['digest'])
    garage.validate(request)
    with garage.mutation_lock(request):
        garage.update(request, blob)
        try:
            retention=garage.cleanup_after_update(request)
            warning=None
        except Exception as error:
            log_failure(paths['shared']/'updates',error,'cleanup')
            retention=None
            warning='Die Bereinigung wurde nicht vollständig ausgeführt. Bitte den Serverstand prüfen.'
    return {'deployment': deployment, 'sha256': release['digest'], 'retention':retention, 'retentionWarning':warning}


def can_rollback(target, paths, rollback):
    if not rollback or paths['current'].resolve().name != rollback['deployment']:
        return False
    request = dict(target, action='rollback-update', **{k:rollback[k] for k in ['deployment','sha256']})
    garage.validate(request)
    state = garage.load_state(paths, request)
    previous = Path(state['previous_release'])
    return state.get('activated') is True and (previous / 'private/release.json').is_file()


def log_failure(directory,error,operation):
    # The updater is deployed as a standalone file: no job_logging import available.
    try:
        target=json.loads((directory/'target.json').read_text())
        garage.validate(dict(target,action='inspect-update'))
        paths=garage.layout(target)
        if directory.resolve()!=(paths['shared']/'updates').resolve():return
        core=paths['current']/'private/backend.php'
        code="$r=json_decode(stream_get_contents(STDIN),true);require $argv[1];if(function_exists('gt_log'))gt_log('error','background',$r['message'],['module'=>'updates','operation'=>$r['operation'],'error_type'=>$r['kind']]);"
        subprocess.run([shutil.which('php') or 'php','-r',code,str(core)],input=json.dumps({'message':str(error),'operation':operation,'kind':type(error).__name__}),text=True,capture_output=True,timeout=10)
    except Exception:
        print('Gravelbike Garage: Update-Fehlerprotokoll nicht erreichbar.',file=sys.stderr)


def main(directory):
    os.umask(0o077)
    target = json.loads((directory / 'target.json').read_text())
    garage.validate(dict(target, action='inspect-update'))
    paths = garage.layout(target)
    if directory.resolve() != (paths['shared'] / 'updates').resolve():
        raise RuntimeError('Unbekannter Update-Pfad.')
    request_file = directory / 'request.json'
    result_file = directory / 'result.json'
    if not request_file.is_file():
        return
    job = json.loads(request_file.read_text())
    old_result = json.loads(result_file.read_text()) if result_file.is_file() else {}
    rollback = old_result.get('rollback')
    result = {'id': job['id']}
    try:
        installed = json.loads((paths['current'] / 'private/release.json').read_text())['version']
        action = job['action']
        if action == 'check':
            available = latest(installed)
            result.update(available=available, message='Ein Update ist verfügbar.' if available else 'Die Garage ist auf dem aktuellen Stand.')
        elif action == 'install':
            available = latest(installed)
            confirmed = old_result.get('available') or {}
            if not available or available['version'] != job['version'] or available['digest'] != confirmed.get('digest'):
                raise RuntimeError('Das Release hat sich geändert. Bitte suche erneut nach Updates.')
            rollback = install(target, paths, available)
            result.update(retention=rollback.get('retention'),retentionWarning=rollback.get('retentionWarning'),changed=True, message=f"Installiert: {available['version']} · {available['name']}")
            if rollback.get('retentionWarning'):result['message']+=' '+rollback['retentionWarning']
        elif action == 'rollback' and can_rollback(target, paths, rollback):
            request = dict(target, action='rollback-update', **{k:rollback[k] for k in ['deployment','sha256']})
            with garage.mutation_lock(request):
                garage.rollback_update(request)
            result.update(changed=True, message='Vorherige Version wieder aktiviert.')
            rollback = None
        else:
            raise RuntimeError('Dieser Update-Auftrag ist nicht verfügbar.')
    except Exception as error:
        log_failure(directory,error,job.get('action','update'))
        result['message'] = str(error) if type(error) is RuntimeError else 'Der Update-Dienst konnte den Auftrag nicht abschließen. Prüfe die Verbindung oder das Serverprotokoll.'
        print('Update-Auftrag fehlgeschlagen:', type(error).__name__, file=sys.stderr)
    result.update(rollback=rollback, canRollback=can_rollback(target, paths, rollback))
    garage.save_json(result_file, result)
    request_file.unlink()


if __name__ == '__main__':
    directory=Path(__file__).resolve().parent
    try:main(directory)
    except Exception as error:
        log_failure(directory,error,'bootstrap')
        print('Update-Dienst fehlgeschlagen:',type(error).__name__,file=sys.stderr)
        sys.exit(1)
