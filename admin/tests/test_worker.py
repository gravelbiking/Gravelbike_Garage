import importlib.util,json,pathlib,tempfile,unittest,os,types
from unittest.mock import patch
P=pathlib.Path(__file__).resolve().parents[1]/'private/worker.py';spec=importlib.util.spec_from_file_location('worker',P);w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
class WorkerTests(unittest.TestCase):
 def test_fpm_environment_uses_real_account(self):
  account=types.SimpleNamespace(pw_dir='/home/test-account',pw_name='test-account',pw_uid=1234)
  with patch.object(w.pwd,'getpwuid',return_value=account),patch.dict(os.environ,{'HOME':'/wrong','MYSQL_PWD':'untrusted','DBUS_SESSION_BUS_ADDRESS':'wrong','HTTP_PROXY':'http://bad.invalid'},clear=True):
   env=w.server_environment()
  self.assertEqual(env['HOME'],'/home/test-account');self.assertEqual(env['USER'],'test-account')
  self.assertEqual(env['DBUS_SESSION_BUS_ADDRESS'],'unix:path=/run/user/1234/bus')
  self.assertEqual(env['XDG_CONFIG_HOME'],'/home/test-account/.config')
  self.assertNotIn('MYSQL_PWD',env);self.assertNotIn('HTTP_PROXY',env)

 def test_names_and_secret_redaction(self):
  for name in ['../prod1','A; rm -r','admin','Grafana','../','x','a/b','a\nq']:
   with self.assertRaises(ValueError):w.slug(name)
  self.assertEqual(w.slug('Neue-Garage'),'neue-garage')
  text=w.redact('password=abc installation_key: 123 code=456 secret=longsecret '+('a'*48))
  for secret in ['abc','123','456','longsecret','a'*48]:self.assertNotIn(secret,text)
 def test_registry_and_template_safety(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=pathlib.Path(tmp);shared=b/'admin.shared';shared.mkdir();project='garage';release=b/'garage.releases'/'1.2.3-release';release.mkdir(parents=True);(release/'public').mkdir();(release/'private').mkdir();(release/'private/vendor').mkdir();(release/'private/data').mkdir()
   (release/'private/release.json').write_text('{"version":"1.2.3"}');(release/'private/backend.php').write_text('code');(release/'private/data/secret.txt').write_text('PRIVATE');(release/'public/index.php').write_text('app');(b/'garage.shared').mkdir();(b/'garage.shared/config.php').write_text('PRIVATE DATABASE PASSWORD');(release/'private/config.php').symlink_to(b/'garage.shared/config.php');(b/'garage').symlink_to(release);(release.parent/'.garage-releases.json').write_text('{"project":"garage","domain":"example.org"}')
   (release/'public/child').symlink_to(b/'garage.shared');(shared/'registry.json').write_text(json.dumps([{'id':'garage','name':'Garage','project':'garage','database':'test_garage','base_path':'/garage'}]))
   m=w.Manager({'base':str(b),'shared':str(shared),'domain':'example.org','user':'test','php':'php'});
   with patch.object(w,'run',return_value=json.dumps({'database':'test_garage','origin':'https://example.org','storage':str(b/'garage.shared/data')})):blob,ver=m.template()
   import zipfile,io
   with zipfile.ZipFile(io.BytesIO(blob)) as z:
    names=z.namelist();self.assertFalse(any('secret.txt' in x or '/child/' in x for x in names));self.assertTrue(any(x.endswith('setup-key.php') for x in names));self.assertFalse(any(b'PRIVATE DATABASE PASSWORD' in z.read(n) for n in names))
   (b/'garage').unlink();(b/'garage').symlink_to(b/'garage.shared')
   with self.assertRaises(RuntimeError):m.entry('garage')
 def test_target_domain_routing(self):
  spec=importlib.util.spec_from_file_location('route_guard',P.parent/'uberspace_remote.py');remote=importlib.util.module_from_spec(spec);spec.loader.exec_module(remote)
  base=[{'domain':None,'path':'/','destination':'APACHE'}];target={'domain':'garage.example','uberspace_major':8}
  for extra,expected in [([{'domain':'other.example','path':'/','destination':'PORT'}],True),([{'domain':'garage.example','path':'/','destination':'PORT'}],False),([{'domain':'garage.example','path':'/test1','destination':'PORT'}],False)]:
   with patch.object(remote,'run',return_value=json.dumps(base+extra)):self.assertEqual(remote.apache_only(target,''),expected)
 def test_admin_and_confirmation_guard(self):
  with tempfile.TemporaryDirectory() as tmp:
   m=w.Manager({'base':tmp,'shared':tmp,'domain':'example.org','user':'test','php':'php'})
   with self.assertRaises(ValueError):m.delete('admin','Admin')
if __name__=='__main__':unittest.main()
