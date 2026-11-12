"""Generate private credentials once per Codespace; never use hosting credentials."""
import json,os,secrets
from pathlib import Path
root=Path(__file__).resolve().parents[1]
private=root/'.local/codespace'
private.mkdir(parents=True,exist_ok=True,mode=0o700)
path=private/'credentials.json'
if path.exists():
    credentials=json.loads(path.read_text())
else:
    credentials={key:secrets.token_hex(24) for key in ['database_password','root_password','installation_key']}
    with path.open('x') as f:
        os.chmod(path,0o600);json.dump(credentials,f)
app={'MARIADB_HOST':'db','MARIADB_DATABASE':'garage_codespace','MARIADB_USER':'garage','MARIADB_PASSWORD':credentials['database_password']}
for filename,values in [('app.env',app),('db.env',{**{k:v for k,v in app.items() if k!='MARIADB_HOST'},'MARIADB_ROOT_PASSWORD':credentials['root_password']})]:
    p=private/filename
    p.write_text(''.join(k+'='+v+'\n' for k,v in values.items()));p.chmod(0o600)
print('Private Codespace-Konfiguration vorbereitet. Keine Verbindung zu Uberspace.')
