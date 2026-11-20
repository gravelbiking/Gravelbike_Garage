import datetime,importlib.util,json,os,pathlib,sys,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'admin/private'))
from error_logs import read_logs
class LogTests(unittest.TestCase):
 def test_filters_paging_export_and_health(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);(root/'logs').mkdir();(root/'data').mkdir();(root/'data/logging-status.json').write_text('{"healthy":false,"error":"disk full"}')
   rows=[{'timestamp':f'2026-11-13T10:{i//60:02}:{i%60:02}Z','module':'strava','source':'external-api','level':'error' if i%2 else 'warning','request_id':'request-A' if i<100 else 'request-B','message':'HTTP failure' if i%2 else 'retry','client_secret':'DO NOT EXPORT','http_status':400,'stack':[{'password':'NESTED SECRET'},'file.js:9:3'],'reason':{'secret':'NESTED SECRET'},'error_code':'invalid','provider_field':'redirect_uri'} for i in range(205)]
   p=root/'logs/strava--external-api--2026-11-13.jsonl';p.write_text(''.join(json.dumps(r)+'\n' for r in rows))
   first=read_logs(root,{});self.assertIn('invalid',first['text']);self.assertIn('redirect_uri',first['text']);self.assertEqual(len(first['entries']),100);self.assertTrue(first['has_more']);self.assertFalse(first['logger']['healthy']);self.assertNotIn('DO NOT EXPORT',first['text']);self.assertNotIn('NESTED SECRET',first['text'])
   second=read_logs(root,{'offset':'100'});self.assertEqual(len(second['entries']),100);self.assertNotEqual(first['entries'][0]['timestamp'],second['entries'][0]['timestamp'])
   filtered=read_logs(root,{'request_id_filter':'request-A','level':'error','query':'HTTP','from':'2026-11-13T10:00:00Z','to':'2026-11-13T10:02:00Z','export':True});self.assertEqual(filtered['total'],50);self.assertEqual(len(filtered['entries']),50)
   self.assertEqual(read_logs(root,{'module':'inventory'})['total'],0)
   with self.assertRaises(ValueError):read_logs(root,{'from':'2026-11-13T10:00'})
   with self.assertRaises(ValueError):read_logs(root,{'module':'../secrets'})
   with self.assertRaises(ValueError):read_logs(root,{'offset':'-1'})
 def test_debug_filter(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);(root/'logs').mkdir();(root/'logs/bikes--backend--2026-11-20.jsonl').write_text(json.dumps({'timestamp':'2026-11-20T18:00:00Z','level':'debug','message':'Anfrage abgeschlossen.','module':'bikes','source':'backend'})+'\n');self.assertEqual(read_logs(root,{'level':'debug'})['total'],1)
 def test_missing_malformed_and_symlinks(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);self.assertIn('Noch keine',read_logs(root,{})['text']);(root/'logs').mkdir();p=root/'logs/api--backend--2026-11-13.jsonl';p.write_text('bad json\n{"partial":');self.assertTrue(read_logs(root,{})['truncated'])
   p.unlink();p.symlink_to(root/'secret')
   with self.assertRaises((ValueError,FileNotFoundError)):read_logs(root,{})
if __name__=='__main__':unittest.main()
