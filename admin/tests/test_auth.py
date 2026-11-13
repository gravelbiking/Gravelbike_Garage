import os,shutil
import http.cookiejar,json,pathlib,subprocess,sys,unittest,urllib.request,urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[2];BASE=os.environ.get('GT_ADMIN_TEST_BASE','http://localhost:4186');PHP=os.environ.get('GT_TEST_PHP') or shutil.which('php')
class Client:
 def __init__(self):self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.csrf=None
 def call(self,route,body=None,csrf=True,origin=BASE):
  headers={'Origin':origin}
  if body is not None:body={**body,**({'csrf':self.csrf} if csrf else {})};headers['Content-Type']='application/json'
  req=urllib.request.Request(BASE+'/api.php?route='+route,data=json.dumps(body).encode() if body is not None else None,headers=headers)
  try:r=self.opener.open(req);status=r.status
  except urllib.error.HTTPError as e:r=e;status=e.code
  x=json.load(r)
  if x.get('csrf'):self.csrf=x['csrf']
  return status,x
 def fixture(self,action,options,**kw):
  p=subprocess.run([PHP,str(ROOT/'dev/webauthn-fixture.php')],input=json.dumps({'action':action,'options':options,'origin':BASE,**kw}),capture_output=True,text=True,check=True);return json.loads(p.stdout)
class TestAdmin(unittest.TestCase):
 def test_full_lifecycle(self):
  c=Client();status,x=c.call('status');self.assertTrue(x['setup']);self.assertFalse(x['authenticated'])
  for route in ['snapshot','create','delete','key','logs','unlock','reset-password']:
   self.assertEqual(c.call(route,{'name':'anything','id':'anything'})[0],401)
  self.assertEqual(c.call('grafana&path=api/health')[0],401)
  body={'key':'local-admin-test-installation-key-0123456789','username':'admin-test','password':'Secure-Test-Password!123'}
  self.assertEqual(c.call('setup/start',body,csrf=False)[0],403)
  self.assertEqual(c.call('setup/start',body,origin='https://evil.invalid')[0],403)
  self.assertEqual(c.call('setup/start',body)[0],200)
  self.assertEqual(c.call('snapshot',{})[0],401)
  self.assertEqual(c.call('setup/cancel',{})[0],200)
  self.assertTrue(c.call('status')[1]['setup'])
  self.assertEqual(c.call('setup/finish',{'credential':{}})[0],400)
  self.assertEqual(c.call('setup/start',body)[0],200)
  opts=c.call('setup/options',{})[1]['options'];weak=c.fixture('create',opts,flags=65)
  self.assertEqual(c.call('setup/finish',{'credential':weak['credential']})[0],400)
  self.assertTrue(c.call('status')[1]['setup'])
  self.assertEqual(c.call('setup/start',body)[0],200);opts=c.call('setup/options',{})[1]['options'];key=c.fixture('create',opts)
  self.assertEqual(c.call('setup/finish',{'credential':key['credential']})[0],200)
  status,x=c.call('status');self.assertFalse(x['setup']);self.assertTrue(x['authenticated'])
  self.assertEqual(c.call('snapshot',{})[0],200)
  self.assertEqual(c.call('grafana&path=api/admin/users')[0],403)
  self.assertEqual(c.call('grafana&path=api/ds/query',{'queries':[{'datasource':{'uid':'garage-metrics'},'rawSql':'SELECT * FROM gt_accounts'}],'from':'1700000000000','to':'1800000000000'})[0],403)
  self.assertEqual(c.call('setup/start',body)[0],409)
  self.assertEqual(c.call('logout',{})[0],200);self.assertFalse(c.call('status')[1]['authenticated'])
  self.assertEqual(c.call('login',body)[0],200);self.assertEqual(c.call('snapshot',{})[0],401)
  opts=c.call('login/options',{})[1]['options'];proof=c.fixture('get',opts,id=key['credential']['id'],privateKey=key['privateKey'],counter=1)
  self.assertEqual(c.call('login/finish',{'credential':proof['credential']})[0],200)
  self.assertEqual(c.call('login/finish',{'credential':proof['credential']})[0],400)
  self.assertTrue(c.call('status')[1]['authenticated']);self.assertEqual(c.call('logout',{})[0],200)
  fresh=Client();fresh.call('status');self.assertEqual(fresh.call('login/options',{})[0],401)
  print('PASS: no password-only access; enrollment cancel/reload; invalid UV; valid registration+login; replay; CSRF; Grafana query isolation.')
if __name__=='__main__':unittest.main()
