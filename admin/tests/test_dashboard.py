import importlib.util,json,pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('dashboard',ROOT/'grafana_dashboard.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class DashboardTests(unittest.TestCase):
 def test_metrics_and_instance_selection(self):
  q=json.loads((ROOT/'private/queries.json').read_text());d=m.build_dashboard([{'id':'test1','name':'Test1'},{'id':'test2','name':'Test2'},{'id':'admin','name':'Admin'}],q)
  self.assertEqual(len(d['panels']),11);v=d['templating']['list'][0];self.assertEqual(v['allValue'],'__all__');self.assertEqual([x['value'] for x in v['options'][1:]],['test1','test2'])
  for p in d['panels']:
   raw=p['targets'][0]['rawSql'];self.assertIn(raw,q)
   if p['id'] not in [1,2]:
    self.assertIn('${instanz:raw}',raw);self.assertIn("instance_id<>'admin'",raw)
   else:self.assertNotIn("instance_id<>'admin'",raw)
  for p in d['panels']:
   if p['id'] in [4,5,6,7,8,9]:self.assertEqual(p['fieldConfig']['defaults']['unit'],'garagebytes')
  self.assertEqual(len([x for x in d['panels'] if x['type']=='timeseries']),4)
if __name__=='__main__':unittest.main()
