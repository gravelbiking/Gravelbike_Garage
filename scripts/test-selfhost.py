"""Exercise the real PHP installation in an isolated, disposable directory.

Run through test-selfhost-mysql.py, which provides an isolated MySQL instance.
No existing installation or user data is read or changed.
"""
import hashlib
import hmac
import http.cookiejar
import json
import os
from pathlib import Path
import shutil
import socket
import base64
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

project = Path(__file__).resolve().parent.parent
app_tree = Path(os.environ.get('GT_TEST_APP', str(project / '.local/test-app')))
php = str(Path(sys.argv[1]).resolve())
setup_key = Path(os.environ.get('GT_TEST_SETUP_KEY_FILE', str(project / '.local/test-key.txt'))).read_text().strip()
mysql_bin = os.environ['GT_TEST_MYSQL_BIN']
mysql_socket = os.environ['GT_TEST_MYSQL_SOCKET']

def mysql(sql):
    result = subprocess.run([mysql_bin, '--no-defaults', '--protocol=SOCKET', '--socket=' + mysql_socket, '--user=root', '--batch', '--skip-column-names'], input=sql, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise AssertionError('Local MySQL test query failed: ' + result.stderr)
    return result.stdout.strip()



def run_case(prefix):
    with tempfile.TemporaryDirectory(prefix='graveltube-php-test-') as temp:
        root = Path(temp)
        install = root / 'install'
        shutil.copytree(app_tree, install)
        private = install / 'private'
        db_name = 'gt_test_' + secrets.token_hex(6)
        db_user = 'gt_user_' + secrets.token_hex(5)
        db_password = secrets.token_hex(24)
        table_prefix = 'gt_' if not prefix else 'garage2_'
        mysql(f"CREATE DATABASE `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER '{db_user}'@'localhost' IDENTIFIED BY '{db_password}'; GRANT CREATE, ALTER, DROP, SELECT, INSERT, UPDATE, DELETE ON `{db_name}`.* TO '{db_user}'@'localhost';")
        # Exercise recovery from an interrupted initial schema setup.
        import re
        schema = re.sub(r'\{\{(\w+)\}\}', lambda m: '`' + table_prefix + m[1] + '`', (private / 'schema.sql').read_text())
        mysql('USE `' + db_name + '`;' + ';'.join(schema.split(';')[:2]) + ';')
        configuration = {'database': {'host': 'localhost', 'port': 3306, 'unix_socket': mysql_socket, 'name': db_name, 'user': db_user, 'password': db_password, 'table_prefix': table_prefix}, 'origin': '', 'installation_key': setup_key, **({'cookie_prefix': 'garage_test1_'} if prefix else {}), 'storage_path': str(private / 'data')}
        encoded_config = base64.b64encode(json.dumps(configuration).encode()).decode()
        (private / 'config.php').write_text("<?php return json_decode(base64_decode('" + encoded_config + "'), true, 512, JSON_THROW_ON_ERROR);\n")
        (private / 'setup-key.php').write_text("<?php return '';\n")
        # Report local driver/authentication problems before the API sanitizes them.
        check = subprocess.run([php, '-r', '$c=(require $argv[1])["database"];try{new PDO("mysql:unix_socket=".$c["unix_socket"].";dbname=".$c["name"],$c["user"],$c["password"]);}catch(Throwable $e){fwrite(STDERR,$e->getMessage());exit(1);}', str(private / 'config.php')], capture_output=True, text=True)
        assert check.returncode == 0, check.stderr

        # A symlink models either the domain root or an installation in a subfolder.
        docroot = root / 'www'
        docroot.mkdir()
        public = install / 'public'
        if prefix:
            (docroot / 'garage').symlink_to(public, target_is_directory=True)
            webroot = docroot
        else:
            webroot = public
        sock = socket.socket()
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
        sock.close()
        origin = f'http://localhost:{port}'
        base = origin + (prefix or '/')
        log = open(root / 'php.log', 'w+')
        process = None

        def start(dev=True):
            env = os.environ.copy()
            env['GRAVELTUBE_DEV'] = '1' if dev else '0'
            p = subprocess.Popen([php, '-d', 'upload_max_filesize=20M', '-d', 'post_max_size=24M', '-S', f'127.0.0.1:{port}', '-t', str(webroot)], env=env, stdout=log, stderr=log)
            for _ in range(100):
                if p.poll() is not None:
                    log.seek(0)
                    raise AssertionError('PHP server failed: ' + log.read())
                try:
                    with socket.create_connection(('127.0.0.1', port), timeout=.1):
                        return p
                except OSError:
                    time.sleep(.05)
            raise AssertionError('PHP server did not start')

        jar = http.cookiejar.CookieJar()
        client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

        def call(route, method='GET', body=None, request_origin=origin, anonymous=False, mime=None, params=None, path='api.php'):
            headers = {'Origin': request_origin}
            if isinstance(body, dict):
                body = json.dumps(body).encode()
                headers['Content-Type'] = 'application/json'
            if mime:
                headers['Content-Type'] = mime
            query = dict(params or {})
            if route is not None:
                query['route'] = route
            request = urllib.request.Request(base + path + ('?' + urllib.parse.urlencode(query) if query else ''), data=body, method=method, headers=headers)
            opener = urllib.request.build_opener() if anonymous else client
            try:
                response = opener.open(request, timeout=15)
            except urllib.error.HTTPError as error:
                response = error
            payload = response.read()
            if 'application/json' in response.headers.get('Content-Type', ''):
                payload = json.loads(payload)
            return response.status, payload, response.headers

        credentials = {'username': 'test-owner', 'password': 'Disposable-Test-Password-2026!', 'setupKey': setup_key}
        try:
            process = start(dev=False)
            assert call('auth')[0] == 426, 'HTTP must be rejected in production'
            process.terminate()
            process.wait(timeout=5)
            process = start()
            status, page, _ = call(None, path='index.php', anonymous=True)
            assert status == 200 and b'<strong id="installationName">Prod1</strong>' in page
            assert b'<span id="workspaceName">Prod1</span>' in page
            config_path = private / 'config.php'
            original_config = config_path.read_bytes()
            try:
                for name, expected in [('Test2', 'Test2'), (' Garage <2> & "Test" ', 'Garage &lt;2&gt; &amp; &quot;Test&quot;'), (' ', 'Prod1')]:
                    config = {**configuration, 'installation_name': name}
                    encoded = base64.b64encode(json.dumps(config).encode()).decode()
                    config_path.write_text("<?php return json_decode(base64_decode('" + encoded + "'), true);\n")
                    status, page, _ = call(None, path='index.php', anonymous=True)
                    assert status == 200 and ('<strong id="installationName">' + expected + '</strong>').encode() in page
                    assert ('<span id="workspaceName">' + expected + '</span>').encode() in page
            finally:
                config_path.write_bytes(original_config)
            status, auth, _ = call('auth')
            assert status == 200 and auth['setup'] and not auth['authenticated'], (status, auth, Path(log.name).read_text())
            assert call('data')[0] == 401
            assert call('auth', 'POST', {**credentials, 'setupKey': 'incorrect'})[0] == 403
            assert call('auth', 'POST', {**credentials, 'password': 'short'})[0] == 400
            assert call('auth', 'POST', credentials, 'https://other.example')[0] == 403
            status, result, headers = call('auth', 'POST', credentials)
            assert status == 200 and result['ok']
            assert 'HttpOnly' in headers['Set-Cookie'] and f'path={prefix or "/"}' in headers['Set-Cookie']
            assert headers['Set-Cookie'].startswith(('garage_test1_' if prefix else 'garage_') + 'session=')
            # #106: real authenticated client reporting and server-side rejection logs.
            report_id='abcdef1234567890abcdef1234567890'
            log_status, log_result, _ = call('client-error','POST',{'entries':[{'context':'inventory','kind':'TypeError','requestId':report_id,'httpStatus':503,'page':'inventory','at':int(time.time()*1000),'message':'password=NEVER-IN-LOGS','client_secret':'NEVER-IN-LOGS','stack':['inventory.js:10:2']}]})
            assert log_status==200 and log_result['accepted']==1
            log_status, log_error, log_headers = call('not-a-real-route')
            assert log_status==404 and log_error['requestId']==log_headers['X-Garage-Request-Id']
            rows=[json.loads(line) for file in (private/'logs').glob('*.jsonl') for line in file.read_text().splitlines()]
            assert any(r['request_id']==report_id and r['source']=='frontend' and r['module']=='inventory' for r in rows)
            assert any(r['request_id']==log_error['requestId'] and r['http_status']==404 for r in rows)
            assert 'NEVER-IN-LOGS' not in json.dumps(rows)
            assert call('client-error','POST',{'entries':[]},anonymous=True)[0]==401
            print('PASS #106 HTTP: authenticated reports, module/correlation, secret exclusion and server error response linkage.')

            # Self-chosen setup password is immediately usable, including after a new login.
            assert result['passwordChangeRequired'] is False
            assert call('auth')[1]['passwordStatus']['required'] is False
            assert call('data')[0] == 200
            assert call('logout','POST',{})[0] == 200
            assert call('auth','POST',credentials)[1]['passwordChangeRequired'] is False
            assert call('data')[0] == 200
            fresh_policy=call('account/status')[1]
            assert not fresh_policy['required'] and 365<=fresh_policy['daysRemaining']<=366
            # Explicit temporary/reset state must still block protected routes.
            mysql(f'UPDATE `{db_name}`.`{table_prefix}password_policy` SET must_change=1;')
            assert call('auth')[1]['passwordStatus']['required'] is True
            for route in ['data','updates','system','security/status','strava','inventory-report','biography']:
                assert call(route)[0] == 428, route
            assert call('account/password','POST',{'current':credentials['password'],'next':credentials['password'],'confirmation':credentials['password']})[0] == 400
            assert call('account/password','POST',{'current':credentials['password'],'next':'First-Personal-2026!','confirmation':'different'})[0] == 400
            for weak in ['abcdefghijklmnop','short-A1!','ä'*36+'A1!']:
                assert call('account/password','POST',{'current':credentials['password'],'next':weak,'confirmation':weak})[0] == 400
            assert call('account/password','POST',{'current':credentials['password'],'next':'First-Personal-2026!','confirmation':'First-Personal-2026!'})[0] == 200
            credentials['password']='First-Personal-2026!'
            assert call('auth','POST',credentials)[0] == 200
            policy=call('account/status')[1]
            assert not policy['required'] and 365<=policy['daysRemaining']<=366
            assert call('updates', anonymous=True)[0] == 401
            status, updates, _ = call('updates')
            assert status == 200 and not updates['enabled'] and updates['installed']['version']
            assert call('updates', 'POST', {'action':'check'})[0] == 409
            update_dir = private / 'updates'
            update_dir.mkdir()
            (update_dir / 'enabled').touch()
            assert call('updates', 'POST', {'action':'install','version':'1.0.0'})[0] == 400
            assert call('updates', 'POST', {'action':'check'}, 'https://other.example')[0] == 403
            status, request, _ = call('updates', 'POST', {'action':'check'})
            assert status == 202 and request['job'] == call('updates')[1]['job']
            assert call('updates', 'POST', {'action':'check'})[0] == 409
            (update_dir / 'request.json').unlink()
            (update_dir / 'enabled').unlink()
            assert call('auth')[1]['authenticated']
            assert not call('auth')[1]['setup'], 'Setup must lock after the first account'
            assert call('system', anonymous=True)[0] == 401
            status, system, _ = call('system')
            assert status == 200 and system['database']['name'] == db_name and system['storage']['files'] > 0
            assert configuration['database']['password'] not in json.dumps(system)
            assert call('account/password','POST', {'current':credentials['password'],'next':'new-password-long-enough'}, anonymous=True)[0] == 401
            assert call('data', anonymous=True)[0] == 401
            payload = {'bikes': [{'id': 'bike-1', 'name': 'Test Gravel 🚲', 'km': 1800, 'components': [{'name': 'Kette', 'model': 'GRX', 'serial': 'test'}]}], 'plans': [{'id': 'plan-1', 'bikeId': 'bike-1', 'title': 'Kette prüfen', 'nextKm': 2000}], 'history': [], 'documents': []}
            payload['bikes'][0]['components'].extend([
                {'id': 'chain', 'name': 'Kette', 'model': 'GRX', 'serial': 'CHAIN-1', 'category': 'Antrieb', 'installedDate': '2026-09-01', 'installedKm': 1000, 'originalPartNumber': '000-CN-8100', 'price': 34.95, 'lastPurchasedAt': 'Bike24'},
                {'id': 'pads', 'name': 'Bremsbelag', 'category': 'Bremsen', 'installedDate': '', 'installedKm': None},
                {'id': 'front', 'name': 'Vorderrad', 'category': 'Räder', 'manufacturer': 'DT Swiss', 'model': 'GR 1600', 'installedDate': '2026-09-01', 'installedKm': 0, 'wheel': {'axleDimension': '12 × 100 mm', 'brakeMount': 'Center Lock', 'rimHeight': 25, 'internalWidth': 24.5, 'rimMaterial': 'Aluminium', 'bearingServiceDate': '2026-10-01'}},
                {'id': 'rear', 'name': 'Hinterrad', 'category': 'Räder', 'manufacturer': 'DT Swiss', 'model': 'GR 1600', 'wheel': {'axleDimension': '12 × 142 mm', 'rimHeight': None, 'internalWidth': None, 'bearingServiceDate': ''}},
            ])
            payload['inventory'] = [{'id':'oil','name':'Kettenöl','category':'Antrieb','manufacturer':'Test','kind':'Zubehör','articleNumber':'000-OIL','quantity':0.5,'unit':'Liter','unitPrice':20.99,'purchaseDate':'2026-10-01','minStock':0.5,'location':'Regal A','notes':'Trocken lagern','invoices':[]}]
            payload['shopping'] = [{'id':'buy-oil','bikeId':'bike-1','planId':'plan-1','inventoryId':'oil','source':'stock','status':'purchased','name':'Kettenöl','manufacturer':'Test','articleNumber':'000-OIL','quantity':0.2,'usedQuantity':0,'unit':'Liter','unitPrice':20.99,'purchaseDate':'','dealer':'','url':'','notes':'','invoices':[]}]
            assert call('data', 'PUT', {'data': payload, 'version': 0})[0] == 200
            assert call('data')[1] == {'data': payload, 'version': 1}
            assert call('data', 'PUT', {'data': payload, 'version': 0})[0] == 409
            from copy import deepcopy
            for field, bad_value in [('price', -1), ('price', '34.95'), ('originalPartNumber', 123), ('lastPurchasedAt', []), ('installedKm', -1), ('installedKm', '1000'), ('installedDate', '2026-02-30'), ('category', 'unbekannt')]:
                invalid = deepcopy(payload)
                invalid['bikes'][0]['components'][1][field] = bad_value
                assert call('data', 'PUT', {'data': invalid, 'version': 1})[0] == 400, (field, bad_value)

            for field, bad_value in [('rimHeight', -1), ('internalWidth', '25'), ('bearingServiceDate', '2026-02-30'), ('brakeMount', [])]:
                invalid = deepcopy(payload)
                invalid['bikes'][0]['components'][3]['wheel'][field] = bad_value
                assert call('data', 'PUT', {'data': invalid, 'version': 1})[0] == 400, (field, bad_value)
            for collection, field, bad_value in [('inventory','quantity',-1),('inventory','unit','unbekannt'),('inventory','minStock',0.0001),('inventory','unitPrice','20'),('shopping','source','bad'),('shopping','quantity',0),('shopping','usedQuantity',1),('shopping','inventoryId','missing'),('shopping','planId','missing'),('shopping','url','javascript:alert(1)'),('shopping','invoices',[{'fileId':'../config.php'}])]:
                invalid = deepcopy(payload)
                invalid[collection][0][field] = bad_value
                assert call('data', 'PUT', {'data': invalid, 'version': 1})[0] == 400, (collection, field, bad_value)
            assert call('data', 'PUT', {'data': {**payload, 'bikes': []}, 'version': 1})[0] == 400
            assert call('data', 'PUT', {'data': payload, 'version': 1}, 'https://other.example')[0] == 403
            assert call('data', 'PUT', b'{broken')[0] == 400

            def upload(content, name='vertrag.pdf'):
                boundary = 'GravelTube-test-boundary'
                body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/pdf\r\n\r\n'.encode() + content + f'\r\n--{boundary}--\r\n'.encode())
                return call('files', 'POST', body, mime='multipart/form-data; boundary=' + boundary)

            pdf = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'
            status, uploaded, _ = upload(pdf)
            assert status == 200, uploaded
            file_id = uploaded['id']
            assert call('files/' + file_id)[1] == pdf
            assert call('files/' + file_id, anonymous=True)[0] == 401
            assert call('files/../../config.php')[0] == 400
            assert call('files/' + '0' * 32)[0] == 404
            assert upload(b'<?php echo "not-a-pdf"; ?>')[0] == 400, 'Do not trust client MIME types'
            assert upload(pdf, name='a' + 'ü' * 100 + '.pdf')[0] == 200, 'Long Unicode filenames must remain valid UTF-8'
            assert upload(pdf, name='Fahrrad🚲.pdf')[0] == 200, 'MySQL must support four-byte UTF-8 filenames'
            invoice = {'fileId':file_id,'name':uploaded['name'],'size':uploaded['size']}
            payload['shopping'][0]['invoices'] = [invoice]
            payload['inventory'][0]['invoices'] = [invoice]
            payload['inventory'][0]['quantity'] = 0.4
            payload['shopping'][0]['usedQuantity'] = 0.1
            payload['history'].append({'id':'service-material','bikeId':'bike-1','title':'Kette gepflegt','date':'2026-11-01','km':1800,'materials':[{'shoppingId':'buy-oil','inventoryId':'oil','name':'Kettenöl','articleNumber':'000-OIL','quantity':0.1,'unit':'Liter','unitPrice':20.99}]})
            payload['contacts'] = [{'id':'workshop','name':'Werkstatt Test','type':'Werkstatt','address':'Testweg 1\n12345 Teststadt','person':'Kontakt Test','customerNumber':'000-123','phone':'+49 123 456','email':'werkstatt@example.com','notes':'','documents':[{**invoice,'id':'bill-1','title':'Werkstattbeleg','category':'Rechnung','date':'2026-11-01'}]}]
            payload['appointments'] = [{'id':'appointment','title':'Werkstattinspektion','contactId':'workshop','bikeId':'bike-1','planId':'plan-1','date':'2026-12-01','time':'09:30','status':'confirmed','notes':'Rad abgeben'}]
            payload['plans'][0]['contactId'] = 'workshop'
            payload['history'][0]['contactId'] = 'workshop'
            payload['appointments'].append({**payload['appointments'][0], 'id':'completed-visit', 'status':'completed', 'historyId':'service-material'})
            for key, value in [('time','25:00'),('contactId','missing'),('date','2026-02-30'),('status','unknown')]:
                invalid = deepcopy(payload); invalid['appointments'][0][key] = value
                assert call('data','PUT',{'data':invalid,'version':1})[0] == 400, (key,value)
            invalid = deepcopy(payload); invalid['contacts'][0]['email'] = 'not-email'
            assert call('data','PUT',{'data':invalid,'version':1})[0] == 400
            invalid = deepcopy(payload); invalid['inventory'][0]['photo'] = file_id
            assert call('data','PUT',{'data':invalid,'version':1})[0] == 400, 'A PDF cannot be an article photo'
            png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
            image_status, image, _ = upload(png, name='Artikelbild.png')
            assert image_status == 200 and image['type'] == 'image/png'
            payload['inventory'][0]['photo'] = image['id']
            assert call('files/'+image['id'], anonymous=True)[0] == 401
            payload['documents'].append({'id': 'doc-1', 'title': 'Kaufvertrag', 'bikeId': 'bike-1', 'fileId': file_id, 'name': uploaded['name'], 'size': uploaded['size']})
            payload['history'][0]['attachments'] = [invoice]
            payload['history'][0]['title'] = 'Kette bei Werkstatt Test gewechselt <script>'
            payload['history'][0]['notes'] = 'PRIVATE NOTES DO NOT EXPORT'
            payload['contacts'][0]['documents'].append({**invoice,'fileId':image['id'],'name':'Unrelated.png','id':'unrelated','title':'Unrelated','category':'Sonstiges','date':'2026-11-01'})
            assert call('data', 'PUT', {'data': payload, 'version': 1})[0] == 200
            bio_params = {'bike':'bike-1','kind':'seller'}
            assert call('biography', params=bio_params, anonymous=True)[0] == 401
            status, seller, _ = call('biography', params=bio_params)
            assert status == 200 and b'Werkstatt Test' in seller and b'&lt;script&gt;' in seller and b'PRIVATE NOTES' not in seller
            assert b'data-document-preview=' in seller and b'>Schlie\xc3\x9fen</a>' in seller
            assert b'document-preview.js' in seller and b'./#bike/bike-1' in seller
            assert call('biography',params={'bike':'missing','kind':'seller'})[0] == 404
            assert call('biography',params={'bike':'bike-1','kind':'unknown'})[0] == 400
            status, workshop, _ = call('biography',params={'bike':'bike-1','kind':'workshop'})
            assert status == 200 and b'Werkstatt Test' not in workshop and b'files%2F' not in workshop and b'PRIVATE NOTES' not in workshop
            assert b'Ketten' in workshop and b'1.800' in workshop
            import io, zipfile
            status, package, headers = call('biography',params={**bio_params,'download':'1'})
            assert status == 200 and 'application/zip' in headers['Content-Type']
            with zipfile.ZipFile(io.BytesIO(package)) as archive:
                assert archive.testzip() is None
                assert sorted(archive.namelist()) == ['Anlagen/Service-1-1.pdf','Lebenslauf.html','report.js']
                assert archive.read('Anlagen/Service-1-1.pdf') == pdf
                assert b'api.php' not in archive.read('Lebenslauf.html'), 'Export must be portable without authentication links'
                assert b'document-preview.js' not in archive.read('Lebenslauf.html')

            process.terminate()
            process.wait(timeout=5)
            process = start()
            assert call('data')[1]['data'] == payload, 'Data must survive a PHP restart'
            from features_case import check_features
            payload = check_features(call,payload,call('data')[1]['version'],project)
            assert call('files/' + file_id)[1] == pdf
            stored_hash = mysql(f'SELECT password_hash FROM `{db_name}`.`{table_prefix}accounts`;')
            assert stored_hash != credentials['password'] and stored_hash.startswith('$2y$')
            token_hash = mysql(f'SELECT token FROM `{db_name}`.`{table_prefix}sessions` LIMIT 1;')
            assert token_hash != next(iter(jar)).value
            assert not (private / 'data/garage.sqlite').exists(), 'No SQLite database should be created'
            # Optional 2FA is isolated from bicycle exports and disabled by default.
            assert not call('security/status')[1]['enabled']
            assert call('security/status',anonymous=True)[0] == 401
            def security(action, body):
                return call('security/'+action,'POST',body)
            assert security('register/options',{})[0] == 400
            assert security('unlock',{'password':'wrong'})[0] == 400
            unlocked = security('unlock',{'password':credentials['password']})[1]
            grant = unlocked['token']
            assert not unlocked['mfaRequired']
            assert security('enable',{'token':grant,'recoverySaved':True})[0] == 400
            seed = security('totp/start',{'token':grant})[1]['secret']
            otp = subprocess.check_output([php,'-r','require $argv[1]; echo gt_totp($argv[2],intdiv(time(),30));',str(private/'backend.php'),seed],text=True)
            assert security('totp/finish',{'token':grant,'code':otp})[0] == 200
            assert security('totp/finish',{'token':grant,'code':otp})[0] == 400
            # Register and exercise a cryptographically signed software credential.
            def authenticator(action, options, **extra):
                args = {'action':action,'options':options,'origin':origin,**extra}
                return json.loads(subprocess.check_output([php,str(project/'dev/webauthn-fixture.php')],input=json.dumps(args).encode()))
            options = security('register/options',{'token':grant})[1]['options']
            key = authenticator('create',options)
            assert security('register/finish',{'token':grant,'name':'Fixture Passkey','credential':key['credential']})[0] == 200
            assert security('register/finish',{'token':grant,'name':'replay','credential':key['credential']})[0] == 400
            codes = security('recovery/new',{'token':grant})[1]['codes']
            assert len(codes) == len(set(codes)) == 10
            assert security('enable',{'token':grant,'recoverySaved':False})[0] == 400
            other = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            other.open(urllib.request.Request(base+'api.php?route=auth',data=json.dumps(credentials).encode(),headers={'Origin':origin,'Content-Type':'application/json'})).read()
            assert security('enable',{'token':grant,'recoverySaved':True})[0] == 200
            try:
                other.open(base+'api.php?route=data'); raise AssertionError('Old session must be revoked')
            except urllib.error.HTTPError as error:
                assert error.code == 401
            assert security('disable',{'token':grant})[0] == 400, 'Activation invalidates management grants'
            assert call('logout','POST')[0] == 200
            mysql(f'UPDATE `{db_name}`.`{table_prefix}password_policy` SET must_change=1;')
            assert call('auth','POST',credentials)[1]['mfaRequired']
            assert call('data')[0] == 401 and call('files/'+file_id)[0] == 401
            assert security('verify',{'code':otp})[0] == 400, 'Enrollment code cannot be replayed for login'
            options = security('options',{})[1]['options']
            signed = authenticator('get',options,privateKey=key['privateKey'],id=key['credential']['id'])['credential']
            invalid = dict(signed); invalid['signature'] = invalid['signature'][:-4]+'AAAA'
            assert security('verify',{'credential':invalid})[0] == 400
            assert security('verify',{'credential':signed})[0] == 400, 'Failed assertions consume their challenge'
            options = security('options',{})[1]['options']
            wrong = authenticator('get',options,privateKey=key['privateKey'],id=key['credential']['id'],origin='https://evil.example')['credential']
            assert security('verify',{'credential':wrong})[0] == 400
            options = security('options',{})[1]['options']
            no_uv = authenticator('get',options,privateKey=key['privateKey'],id=key['credential']['id'],flags=1)['credential']
            assert security('verify',{'credential':no_uv})[0] == 400, 'User verification is mandatory'
            options = security('options',{})[1]['options']
            signed = authenticator('get',options,privateKey=key['privateKey'],id=key['credential']['id'])['credential']
            mfa_result=security('verify',{'credential':signed})
            assert mfa_result[0] == 200 and mfa_result[1]['passwordChangeRequired'] is True
            assert call('data')[0] == 428, 'Completing MFA must still enforce required password change'
            mysql(f'UPDATE `{db_name}`.`{table_prefix}password_policy` SET must_change=0;')
            assert call('data')[0] == 200
            assert security('verify',{'credential':signed})[0] == 400
            # Recovery proof is single-use, and required alongside password for management.
            manage = security('unlock',{'password':credentials['password']})[1]
            assert manage['mfaRequired']
            grant = security('verify',{'token':manage['token'],'code':codes[0]})[1]['token']
            assert security('remove',{'token':grant,'id':'totp'})[0] == 200
            assert security('remove',{'token':grant,'id':key['credential']['id']})[0] == 400
            assert security('disable',{'token':grant})[0] == 200
            assert not call('security/status')[1]['enabled']
            expired_grant = security('unlock',{'password':credentials['password']})[1]['token']
            mysql(f'UPDATE `{db_name}`.`{table_prefix}mfa_flows` SET expires=0;')
            assert security('totp/start',{'token':expired_grant})[0] == 400
            saved = mysql(f'SELECT data FROM `{db_name}`.`{table_prefix}security` WHERE id=1;')
            assert seed not in saved and codes[0] not in saved and credentials['password'] not in saved
            assert 'security' not in call('data')[1]['data']
            # Target CLI preflight runs privately and does not alter garage data.
            before_check = call('data')[1]
            config_path = private / 'config.php'
            original_config = config_path.read_bytes()
            target_config = {**configuration, 'origin':'https://garage.example'}
            encoded_target = base64.b64encode(json.dumps(target_config).encode()).decode()
            config_path.write_text("<?php return json_decode(base64_decode('" + encoded_target + "'),true);\n")
            try:
                preflight = subprocess.run([php,str(private/'check-hosting.php')],capture_output=True,text=True)
                assert preflight.returncode == 0, preflight.stdout
                assert 'Datenbank verbunden' in preflight.stdout and '2FA-Tabellen verfügbar' in preflight.stdout
                assert configuration['database']['password'] not in preflight.stdout and credentials['password'] not in preflight.stdout
            finally:
                config_path.write_bytes(original_config)
            assert call('data')[1] == before_check
            mysql(f'UPDATE `{db_name}`.`{table_prefix}meta` SET version=2 WHERE id=1;')
            assert call('data')[0] == 500, 'Reject a newer schema version'
            mysql(f'UPDATE `{db_name}`.`{table_prefix}meta` SET version=1 WHERE id=1;')
            snapshot = call('data')[1]
            snapshot['data']['bikes'][0]['archived'] = True
            snapshot['data']['preferences'] = {'theme':'meer','notifications':False}
            snapshot['data']['guides'] = [{'id':'guide-a','title':'Einbau','documents':[
                {'id':'guide-document','title':'Explosionszeichnung','category':'Werkstattanleitung',
                 'name':'werkstatt.pdf','fileId':'0'*32,'size':1024,'date':'2026-11-03'}
            ]}]
            assert call('data','PUT',snapshot)[0] == 200
            assert call('data')[1]['data']['guides'] == snapshot['data']['guides']
            invalid = call('data')[1]
            invalid['data']['guides'][0]['documents'].append(invalid['data']['guides'][0]['documents'][0])
            assert call('data','PUT',invalid)[0] == 400
            updated = call('data')[1]
            garage = updated['data']
            uploaded_rows = mysql(f'SELECT COUNT(*) FROM `{db_name}`.`{table_prefix}files`;')
            garage['documentTypes'] = ['Werkstattprotokoll']
            garage['unassignedDocuments'] = [{**invoice,'id':'independent','title':'Protokoll',
                'category':'Werkstattprotokoll','date':'2026-11-03'}]
            garage['plans'][0].update(guideIds=['guide-a'], attachments=[invoice])
            garage['orders'] = [
                {'id':'outside','type':'repair','bikeId':'','externalBike':'Rad eines Freundes','title':'Bremse reparieren',
                 'description':'Bremse einstellen','guideIds':['guide-a'],'attachments':[invoice],
                 'steps':[{'id':'step-a','title':'Prüfen','done':True,'guideIds':['guide-a']}],
                 'parts':[{'id':'part-a','inventoryId':'oil','name':'Kettenöl','unit':'Liter','quantity':0.5}]},
                {'id':'service','type':'service','bikeId':'bike-1','externalBike':'','title':'Service',
                 'description':'','steps':[],'parts':[]},
            ]
            assert call('data','PUT',updated)[0] == 200
            loaded = call('data')[1]
            assert loaded['data'] == garage and loaded['data']['orders'][0]['steps'][0]['done']
            for key, value in [('guideIds',['guide-a','guide-a']),('attachments',[invoice,invoice])]:
                invalid = deepcopy(loaded)
                invalid['data']['plans'][0][key] = value
                assert call('data','PUT',invalid)[0] == 400
            invalid = deepcopy(loaded)
            invalid['data']['orders'][0]['parts'][0]['inventoryId'] = 'missing'
            assert call('data','PUT',invalid)[0] == 400
            invalid = deepcopy(loaded)
            invalid['data']['orders'][0]['externalBike'] = ''
            assert call('data','PUT',invalid)[0] == 400
            invalid = deepcopy(loaded)
            invalid['data']['orders'][0]['parts'][0]['available'] = 'true'
            assert call('data','PUT',invalid)[0] == 400
            loaded['data']['orders'][0]['parts'][0]['available'] = True
            loaded['data']['orders'][0]['type'] = 'service'
            loaded['data']['plans'][0]['attachments'] = []
            assert call('data','PUT',loaded)[0] == 200
            saved = call('data')[1]['data']
            assert saved['inventory'][0]['invoices'] == [invoice] and saved['unassignedDocuments'][0]['fileId'] == file_id
            assert saved['orders'][0]['parts'][0]['available'] is True
            assert saved['orders'][0]['type'] == 'service' and saved['orders'][0]['bikeId'] == ''
            assert saved['orders'][0]['attachments'] == [invoice] and call('files/'+file_id)[1] == pdf
            assert mysql(f'SELECT COUNT(*) FROM `{db_name}`.`{table_prefix}files`;') == uploaded_rows
            assert call('logout', 'POST')[0] == 200
            assert call('data')[0] == 401
            assert call('auth', 'POST', {**credentials, 'password': 'incorrect'})[0] == 401
            assert call('auth', 'POST', {**credentials, 'setupKey': ''})[0] == 200
            next_password = 'Changed-Test-Password-2026!'
            assert call('account/password','POST', {'current':'incorrect','next':next_password,'confirmation':next_password})[0] == 403
            assert call('account/password','POST', {'current':credentials['password'],'next':next_password,'confirmation':next_password}, 'https://other.example')[0] == 403
            assert call('account/password','POST', {'current':credentials['password'],'next':next_password,'confirmation':next_password})[0] == 200
            assert call('data')[0] == 401
            assert call('auth', 'POST', credentials)[0] == 401
            credentials['password'] = next_password
            assert call('auth', 'POST', credentials)[0] == 200
            setup_status = call('strava')[1]
            assert not setup_status['configured'] and not setup_status['setup']['secretSaved']
            assert setup_status['setup']['website'] == base.rstrip('/')
            assert setup_status['setup']['callbackDomain'] == 'localhost'
            assert setup_status['setup']['callbackUrl'] == base + 'api.php/strava-callback'
            settings_path = private / 'data/strava-config.json'
            settings = {'action':'configure','clientId':'12345','clientSecret':'disposable-' + 'a'*40}
            assert call('strava','POST',settings,anonymous=True)[0] == 401
            assert call('strava','POST',settings,'https://other.example')[0] == 403
            assert call('strava','POST',settings)[0] == 403
            assert not settings_path.exists()
            settings['token'] = call('security/unlock','POST',{'password':credentials['password']})[1]['token']
            assert call('strava','POST',{**settings,'clientId':'invalid'})[0] == 400
            assert call('strava','POST',{**settings,'clientSecret':'short'})[0] == 400
            code, configured, _ = call('strava','POST',settings)
            assert code == 200 and configured['configured'] and configured['setup']['secretSaved']
            assert configured['setup']['clientId'] == '12345' and settings['clientSecret'] not in json.dumps(configured)
            saved_settings = settings_path.read_bytes()
            assert settings_path.stat().st_mode & 0o777 == 0o600
            assert json.loads(saved_settings)['connections']['1']['base_url'] == base.rstrip('/')
            assert call('strava','POST',{**settings,'clientSecret':''})[0] == 200
            assert settings_path.read_bytes() == saved_settings
            assert call('strava','POST',{**settings,'clientId':'456','clientSecret':''})[0] == 400
            assert call('strava','POST',{'action':'connect'})[1]['url'].find(urllib.parse.quote(base+'api.php/strava-callback',safe='')) >= 0
            # A connected token is encrypted with the saved secret. Reject changes before writing.
            row = json.loads(mysql(f'SELECT data FROM `{db_name}`.`{table_prefix}strava` WHERE id=1;'))
            row['token'] = 'connected-fixture'
            encoded_state = json.dumps(row).encode().hex()
            mysql(f"UPDATE `{db_name}`.`{table_prefix}strava` SET data=CONVERT(0x{encoded_state} USING utf8mb4) WHERE id=1;")
            assert call('strava','POST',{**settings,'clientSecret':'b'*40})[0] == 409
            assert settings_path.read_bytes() == saved_settings
            # Independent API configuration must be possible while connection one stays active.
            first_settings = json.loads(saved_settings)['connections']['1']
            first_state = mysql(f'SELECT data FROM `{db_name}`.`{table_prefix}strava` WHERE id=1;')
            second_settings = {**settings,'account':2,'clientId':'67890','clientSecret':'second-'+'c'*40}
            code, second_configured, _ = call('strava','POST',second_settings)
            assert code == 200 and second_configured['setup']['account'] == 2
            assert call('strava','POST',{**second_settings,'clientId':'12345'})[0] == 409
            assert second_configured['setup']['clientId'] == '67890'
            assert second_settings['clientSecret'] not in json.dumps(call('strava')[1])
            assert json.loads(settings_path.read_bytes())['connections']['1'] == first_settings
            assert mysql(f'SELECT data FROM `{db_name}`.`{table_prefix}strava` WHERE id=1;') == first_state
            for slot,client_id in [(1,'12345'),(2,'67890')]:
                oauth = call('strava','POST',{'action':'connect','account':slot})[1]['url']
                assert urllib.parse.parse_qs(urllib.parse.urlparse(oauth).query)['client_id'] == [client_id]
            # Distinct callback keys, and foreign application webhooks cannot reach the other account.
            private_settings=json.loads(settings_path.read_bytes())['connections']
            def independent_key(slot,purpose):
                import hmac,hashlib
                conf=private_settings[str(slot)]
                return hmac.new(conf['client_secret'].encode(),('Gravelbike Garage Strava '+purpose+' '+conf['scope']).encode(),hashlib.sha256).hexdigest()
            for slot in [1,2]:
                challenge={'hub.mode':'subscribe','hub.verify_token':independent_key(slot,'verify'),'hub.challenge':'separate'}
                assert call(None,anonymous=True,params=challenge,path='api.php/strava-webhook/'+independent_key(slot,'callback'))[1] == {'hub.challenge':'separate'}
            wrong={'hub.mode':'subscribe','hub.verify_token':independent_key(1,'verify'),'hub.challenge':'wrong'}
            assert call(None,anonymous=True,params=wrong,path='api.php/strava-webhook/'+independent_key(2,'callback'))[0] == 403
            previous_states={}
            for slot in [1,2]:
                account=json.loads(mysql(f'SELECT data FROM `{db_name}`.`{table_prefix}strava` WHERE id={slot};'))
                previous_states[slot]=dict(account)
                account.update(owner=str(900+slot),token='fixture-only',subscription=str(800+slot))
                encoded=json.dumps(account).encode().hex()
                mysql(f"UPDATE `{db_name}`.`{table_prefix}strava` SET data=CONVERT(0x{encoded} USING utf8mb4) WHERE id={slot};")
            for endpoint in [1,2]:
                other=3-endpoint
                event={'owner_id':900+other,'subscription_id':800+other,'object_type':'activity','aspect_type':'create','object_id':555}
                assert call(None,'POST',event,anonymous=True,path='api.php/strava-webhook/'+independent_key(endpoint,'callback'))[0] == 200
            assert mysql(f'SELECT COUNT(*) FROM `{db_name}`.`{table_prefix}strava_events` WHERE object_id=555;') == '0'
            for slot in [1,2]:
                event={'owner_id':900+slot,'subscription_id':800+slot,'object_type':'activity','aspect_type':'create','object_id':556}
                assert call(None,'POST',event,anonymous=True,path='api.php/strava-webhook/'+independent_key(slot,'callback'))[0] == 200
            assert mysql(f'SELECT COUNT(*) FROM `{db_name}`.`{table_prefix}strava_events` WHERE object_id=556;') == '2'
            # Rotating the connected second client's credentials affects neither config nor account one.
            blocked=settings_path.read_bytes()
            assert call('strava','POST',{**second_settings,'clientSecret':'d'*40})[0] == 409
            assert settings_path.read_bytes() == blocked
            for slot,account in previous_states.items():
                encoded=json.dumps(account).encode().hex()
                mysql(f"UPDATE `{db_name}`.`{table_prefix}strava` SET data=CONVERT(0x{encoded} USING utf8mb4) WHERE id={slot};")
            mysql(f'DELETE FROM `{db_name}`.`{table_prefix}strava_events`;')
            # Locking connection one does not prevent editing connection two.
            import fcntl
            with open(private/'data/strava-1.lock','a') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX)
                assert call('strava','POST',second_settings)[0] == 200
            # Keep the refreshed full document for the subsequent unchanged-file assertions.
            saved_settings=settings_path.read_bytes()
            row=json.loads(mysql(f'SELECT data FROM `{db_name}`.`{table_prefix}strava` WHERE id=1;'))
            row['token'] = ''
            encoded_state = json.dumps(row).encode().hex()
            mysql(f"UPDATE `{db_name}`.`{table_prefix}strava` SET data=CONVERT(0x{encoded_state} USING utf8mb4) WHERE id=1;")
            import fcntl
            with open(private/'data/strava.lock','a') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX)
                assert call('strava','POST',settings)[0] == 409
            assert settings_path.read_bytes() == saved_settings
            settings_path.unlink()
            strava_secret = secrets.token_hex(32)
            configuration['strava'] = {'client_id': '1', 'client_secret': strava_secret, 'base_url': 'https://garage.example' + (prefix or '')}
            encoded = base64.b64encode(json.dumps(configuration).encode()).decode()
            (private / 'config.php').write_text("<?php return json_decode(base64_decode('" + encoded + "'), true, 512, JSON_THROW_ON_ERROR);\n")
            assert call('strava', anonymous=True)[0] == 401
            assert call('strava', 'POST', {'action':'connect'}, 'https://other.example')[0] == 403
            code, connection, _ = call('strava', 'POST', {'action':'connect'})
            assert code == 200 and strava_secret not in connection['url']
            assert urllib.parse.parse_qs(urllib.parse.urlparse(connection['url']).query)['redirect_uri'] == [
                configuration['strava']['base_url'].rstrip('/') + '/api.php/strava-callback']
            assert call(None, params={'state':'invalid'}, path='api.php/strava-callback')[0] == 400
            key = lambda purpose: hmac.new(strava_secret.encode(), ('Gravelbike Garage Strava ' + purpose).encode(), hashlib.sha256).hexdigest()
            challenge = {'hub.mode':'subscribe', 'hub.verify_token':key('verify'), 'hub.challenge':'disposable'}
            hook = 'api.php/strava-webhook/'
            assert call(None, anonymous=True, params=challenge, path=hook+'0'*64)[0] == 404
            assert call(None, anonymous=True, params=challenge, path=hook+key('callback'))[1] == {'hub.challenge':'disposable'}
            subprocess.run([php, str(project / 'dev/test-strava.php'), str(private)], check=True)
            subprocess.run([php, str(project / 'dev/test-strava-clients.php'), str(private)], check=True)
            subprocess.run([php, str(project / 'dev/test-km-precision.php'), str(private)], check=True)
            status = call('strava')[1]
            assert len(status['accounts']) == 2
            assert [item['account'] for item in status['accounts']] == [1,2]
            for invalid in [0,3,'2',True]:
                assert call('strava','POST',{'action':'connect','account':invalid})[0] == 400
            first = call('strava','POST',{'action':'connect','account':1})[1]['url']
            entries=[json.loads(line) for file in (private/'logs').glob('*.jsonl') for line in file.read_text().splitlines()]
            assert any(e.get('operation')=='oauth.start' and e.get('connection')==1 and e.get('redirect_uri')==base.rstrip('/')+'/api.php/strava-callback' for e in entries)
            assert strava_secret not in json.dumps(entries)

            second = call('strava','POST',{'action':'connect','account':2})[1]['url']
            assert first != second
            for slot in [1,2]:
                saved = json.loads(mysql(f'SELECT data FROM `{db_name}`.`{table_prefix}strava` WHERE id={slot};'))
                assert 'flow' in saved
            assert call('strava','POST',{'action':'disconnect','account':2})[0] == 200
            # Route-level isolation for owners, queue entries and shared-bike mapping.
            saved_states = {}
            current = call('data')[1]
            original_garage = json.loads(json.dumps(current['data']))
            target_bike = 'strava-map-test'
            current['data']['bikes'].append({'id':target_bike,'name':'Strava-Zuordnungstest','km':0,'components':[]})
            assert call('data','PUT',current)[0] == 200
            current = call('data')[1]
            for slot in [1,2]:
                account = json.loads(mysql(f'SELECT data FROM `{db_name}`.`{table_prefix}strava` WHERE id={slot};'))
                saved_states[slot] = dict(account)
                account.update(owner=str(200+slot),token='fixture-only',subscription='77',gear={f'b{200+slot}':'Testbike'},maps={})
                account['from']=time.strftime('%Y-%m-%d')
                encoded = json.dumps(account).encode().hex()
                mysql(f"UPDATE `{db_name}`.`{table_prefix}strava` SET data=CONVERT(0x{encoded} USING utf8mb4) WHERE id={slot};")
            for slot in [1,2]:
                event={'owner_id':200+slot,'subscription_id':77,'object_type':'activity','aspect_type':'create','object_id':987}
                assert call(None,'POST',event,anonymous=True,path=hook+key('callback'))[0] == 200
            assert mysql(f'SELECT COUNT(*) FROM `{db_name}`.`{table_prefix}strava_events` WHERE object_id=987;') == '2'
            event['owner_id']=999
            event['object_id']=988
            assert call(None,'POST',event,anonymous=True,path=hook+key('callback'))[0] == 200
            assert mysql(f'SELECT COUNT(*) FROM `{db_name}`.`{table_prefix}strava_events` WHERE object_id=988;') == '0'
            payload={'action':'map','bike':target_bike,'version':current['version'],'from':time.strftime('%Y-%m-%d')}
            assert call('strava','POST',{**payload,'account':1,'gear':'b201'})[0] == 200
            assert call('strava','POST',{**payload,'account':2,'gear':'b202'})[0] == 409
            for slot,account in saved_states.items():
                encoded = json.dumps(account).encode().hex()
                mysql(f"UPDATE `{db_name}`.`{table_prefix}strava` SET data=CONVERT(0x{encoded} USING utf8mb4) WHERE id={slot};")
            mysql(f'DELETE FROM `{db_name}`.`{table_prefix}strava_events`;')
            current=call('data')[1]
            current['data']=original_garage
            assert call('data','PUT',current)[0] == 200
            print('PASS: two-account OAuth slots, webhook owner routing, event isolation and cross-account bike conflicts.')
            # Component lifecycle: server validates snapshots and freezes mileage permanently.
            lifecycle=call('data')[1]
            component={'id':'arch-chain','name':'Kette','category':'Antrieb','manufacturer':'ArchiveTest','serial':'ARCHIVE-SERIAL','installedKm':1000,'installedDate':'2026-01-01'}
            lifecycle['data']['bikes'].append({'id':'archive-bike','name':'Archivtest','km':2500,'components':[component]})
            lifecycle['data']['orders'].append({'id':'archive-order','bikeId':'archive-bike','externalBike':'','type':'service','title':'Kettentausch','description':'','steps':[],'parts':[],'guideIds':[],'attachments':[],'componentCategories':['Antrieb'],'replacementKeys':['arch-chain']})
            assert call('data','PUT',lifecycle)[0]==200
            lifecycle=call('data')[1]
            archbike=next(b for b in lifecycle['data']['bikes'] if b['id']=='archive-bike')
            archorder=next(o for o in lifecycle['data']['orders'] if o['id']=='archive-order')
            completed_date=time.strftime('%Y-%m-%d')
            archorder.update(completedAt=completed_date,completedKm=2700,removedKeys=['arch-chain'])
            archbike.update(km=2700,components=[],componentArchive=[{'id':'archive-order:arch-chain','orderId':'archive-order','componentKey':'arch-chain','component':component,'removedDate':completed_date,'removedKm':2700,'mileage':1700}])
            bad=json.loads(json.dumps(lifecycle));bad['data']['bikes'][-1]['componentArchive'][0]['mileage']=1701
            assert call('data','PUT',bad)[0]==400
            assert call('data','PUT',lifecycle)[0]==200
            lifecycle=call('data')[1];lifecycle['data']['bikes'][-1]['km']=5000
            lifecycle['data']['bikes'][-1]['components']=[{'id':'new-chain','name':'Kette','category':'Antrieb','installedKm':2700}]
            assert call('data','PUT',lifecycle)[0]==200
            lifecycle=call('data')[1]
            for kind in ['mileage','snapshot','delete','order']:
                bad=json.loads(json.dumps(lifecycle))
                if kind=='mileage':bad['data']['bikes'][-1]['componentArchive'][0]['mileage']=2300
                elif kind=='snapshot':bad['data']['bikes'][-1]['componentArchive'][0]['component']['serial']='forged'
                elif kind=='delete':bad['data']['bikes'][-1]['componentArchive']=[]
                else:bad['data']['orders'][-1]['completedKm']=5000
                assert call('data','PUT',bad)[0]==400,kind
            report=call('biography',params={'bike':'archive-bike','kind':'workshop'})
            assert report[0]==200 and b'Teilearchiv' in report[1] and b'ARCHIVE-SERIAL' in report[1] and b'1.700 km' in report[1]
            other=call('biography',params={'bike':'bike-1','kind':'workshop'})
            assert b'ARCHIVE-SERIAL' not in other[1]
            print('PASS: immutable component archive, correct frozen mileage, completed-order lock and per-bike biography archive.')

            # Order consumption must refer to the previously marked part and exact stock position.
            booking_case = call('data')[1]
            opening = {'id':'order-opening','positionId':'order-bin','type':'opening','change':2,'before':0,'after':2,
                       'at':completed_date+'T12:00:00.000Z','date':completed_date,'historyId':'','serviceTitle':'',
                       'bikeId':'','bikeName':'','shoppingId':'','reason':'','unitPrice':None}
            booking_case['data']['inventory'].append({
                'id':'order-stock','name':'Testkette','category':'Antrieb','manufacturer':'Test','kind':'Original',
                'articleNumber':'123','quantity':2,'unit':'Stück','unitPrice':None,'purchaseDate':'','minStock':0,
                'location':'Regal A','notes':'','invoices':[], 'movements':[opening],
                'positions':[{'id':'order-bin','label':'Box','location':'Regal A','quantity':2,'unitPrice':None,
                              'purchaseDate':'','supplierId':'','supplier':'','notes':'','packageSize':1,
                              'packageType':'Einzelbestand','invoices':[]}]})
            booking_case['data']['orders'].append({
                'id':'booking-order','bikeId':'','externalBike':'Leihrad','type':'repair','title':'Buchungstest',
                'description':'','steps':[{'id':'step','title':'Kette tauschen','done':False,'guideIds':[],'category':'none','componentKey':''}],
                'parts':[{'id':'order-part','stepId':'step','positionId':'order-bin','inventoryId':'order-stock',
                          'name':'Testkette','quantity':1,'unit':'Stück','available':True}]})
            assert call('data','PUT',booking_case)[0]==200
            booking_case = call('data')[1]
            order = booking_case['data']['orders'][-1]
            stock = booking_case['data']['inventory'][-1]
            order.update(pausedAt=completed_date,workLog=[{'action':'pause','date':completed_date,
                        'comment':'Nachbestellen','used':['order-part'],'returned':[]}])
            order['parts'][0]['booking'] = {'movementId':'order-debit','location':'Regal A','date':completed_date}
            debit = {**opening,'id':'order-debit','type':'withdrawal','change':-1,'before':2,'after':1,
                     'orderId':'booking-order','orderPartId':'order-part','serviceTitle':'Buchungstest','bikeName':'Leihrad'}
            stock.update(quantity=1,movements=[opening,debit])
            stock['positions'][0]['quantity']=1
            forged=deepcopy(booking_case)
            forged['data']['inventory'][-1]['movements'][-1]['orderPartId']='other-part'
            assert call('data','PUT',forged)[0]==400
            assert call('data','PUT',booking_case)[0]==200
            assert call('data','PUT',booking_case)[0]==409
            persisted=call('data')[1]
            assert persisted['data']['inventory'][-1]['quantity']==1
            persisted['data']['orders'][-1]['parts'][0].pop('booking')
            assert call('data','PUT',persisted)[0]==400
            print('PASS: order stock booking, forged reference rejection and duplicate-save protection.')

            from release123_case import check_release123
            check_release123(call,project)
            from release124_case import check_release124
            check_release124(call,project)
            assert call('logout', 'POST')[0] == 200
            for _ in range(3):
                assert call('auth','POST',{**credentials,'password':'incorrect'})[0]==401
            assert call('auth','POST',credentials)[0]==200
            assert call('logout','POST')[0]==200
            for index in range(10):
                assert call('auth', 'POST', {**credentials, 'password': 'incorrect'},anonymous=bool(index%2))[0] == (429 if index==9 else 401)
            code,locked,headers=call('auth','POST',credentials)
            assert code==429 and 590<=int(headers['Retry-After'])<=600
            # Expiry is measured from the tenth failure, not from the first attempt.
            mysql(f"UPDATE `{db_name}`.`{table_prefix}password_policy` SET blocked_until=UNIX_TIMESTAMP()-1;")
            assert call('auth','POST',credentials)[0]==200
            assert mysql(f'SELECT failed_count FROM `{db_name}`.`{table_prefix}password_policy`;')=='0'
            # Existing installations have no age/history: require a change, retain known hash.
            mysql(f'DELETE FROM `{db_name}`.`{table_prefix}password_policy`;')
            assert call('data')[0]==428
            assert call('auth')[1]['passwordStatus']['reason']=='initial'
            previous=credentials['password']
            def change_to(value):
                return call('account/password','POST',{'current':credentials['password'],'next':value,'confirmation':value})
            assert change_to('History-Password-One-2026!')[0]==200
            credentials['password']='History-Password-One-2026!'
            assert call('auth','POST',credentials)[0]==200
            assert change_to('History-Password-Two-2026!')[0]==200
            credentials['password']='History-Password-Two-2026!'
            assert call('auth','POST',credentials)[0]==200
            assert change_to(previous)[0]==400
            assert change_to('History-Password-One-2026!')[0]==400
            assert change_to(credentials['password'])[0]==400
            assert change_to('History-Password-Three-2026!')[0]==200
            credentials['password']='History-Password-Three-2026!'
            assert call('auth','POST',credentials)[0]==200
            assert change_to(previous)[0]==200, 'Fourth most recent password may be reused'
            credentials['password']=previous
            assert call('auth','POST',credentials)[0]==200
            # Active sessions also lose garage access once the password expires.
            mysql(f"UPDATE `{db_name}`.`{table_prefix}password_policy` SET changed_at=UNIX_TIMESTAMP()-367*86400;")
            assert call('account/status')[1]['reason']=='expired'
            assert call('data')[0]==428
            assert call('security/status')[0]==428
            assert call('logout','POST')[0]==200
            assert call('auth','POST',credentials)[1]['passwordChangeRequired'] is True
            assert change_to('Final-Personal-Password-2026!')[0]==200
            credentials['password']='Final-Personal-Password-2026!'
            assert call('auth','POST',credentials)[0]==200
            assert call('data')[0]==200
            history=mysql(f'SELECT history FROM `{db_name}`.`{table_prefix}password_policy`;')
            assert len(json.loads(history))==3 and credentials['password'] not in history
            print('PASS: forced initial/legacy change, server-side gates, password rules, confirmation, year expiry, history and account lock expiry.')
            with urllib.request.urlopen(base + 'manifest.webmanifest') as response:
                manifest = json.load(response)
            assert manifest['start_url'] == './' and manifest['scope'] == './'
            with urllib.request.urlopen(base) as response:
                html = response.read().decode()
            assert 'Installationsschlüssel' in html and 'ChatGPT' not in html
            assert 'uberspace-badge.png' in html and 'href="https://uberspace.de/" target="_blank"' in html
            with urllib.request.urlopen(base+'uberspace-badge.png') as response:
                assert response.read(8) == b'\x89PNG\r\n\x1a\n'

            assert re.search(r'app\.js\?v=[a-f0-9]{12}', html)
            assert 'document-preview.js' in html and 'document-preview.css' in html
            for asset in ['document-preview.js','pdfjs/pdf.min.mjs','pdfjs/pdf.worker.min.mjs']:
                with urllib.request.urlopen(base+asset) as response:
                    assert 'javascript' in response.headers['Content-Type'], (asset,response.headers)

            print(f'PASS {prefix or "/"}: HTTPS enforcement, setup key, login, cookies, data, conflicts, CSRF, uploads, MIME checks, private download, persistence, logout, rate limit, manifest.')
        finally:
            if process and process.poll() is None:
                process.terminate()
                process.wait(timeout=5)
            log.close()
            mysql(f"DROP DATABASE `{db_name}`; DROP USER '{db_user}'@'localhost';")


run_case('')
run_case('/garage/')
print('All self-hosted MySQL integration tests passed. Test data removed; development data and previous releases are untouched.')
