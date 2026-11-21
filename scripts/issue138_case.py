"""Service documentation through the actual data API and existing replacement guards."""
import json,subprocess

def check_issue138(call,project):
 def state():return call('data')[1]
 def put(g):
  r=call('data','PUT',{'data':g,'version':state()['version']});assert r[0]==200,r
 node=json.loads((project/'.local/tools.json').read_text())['node']
 g=state()['data'];g['bikes'].append({'id':'doc138-bike','name':'Dokumentation','km':100,'components':[{'id':'doc138-chain','name':'Kette','category':'Antrieb','manufacturer':'Alt','model':'Kette alt','installedDate':'2026-01-01','installedKm':0}]})
 g['plans'].append({'id':'doc138-plan','bikeId':'doc138-bike','title':'Kettenkontrolle','nextDate':'','nextKm':100,'months':None,'intervalKm':500,'source':'Eigene Wartung','performer':'self','notes':'','guideIds':[],'attachments':[],'contactId':''});put(g)
 source="""import vm from 'node:vm';import{readFileSync}from'node:fs';let raw='';for await(const c of process.stdin)raw+=c;const ctx=vm.createContext({document:{addEventListener(){}},g:JSON.parse(raw)});vm.runInContext(readFileSync('src/logic.js','utf8').replaceAll('export function','function'),ctx);vm.runInContext(readFileSync('src/tirepark.js','utf8'),ctx);vm.runInContext('saveServiceDocumentation(g,\"doc138-plan\",JSON.stringify([\"doc138-plan\",\"\",100]),\"Kette gereinigt, kein Austausch\",\"doc138-entry\",\"2026-11-21\",100)',ctx);process.stdout.write(JSON.stringify(ctx.g));"""
 before=state()['data'];g=json.loads(subprocess.check_output([node,'--input-type=module','-e',source],cwd=project,input=json.dumps(before).encode()));put(g)
 saved=state()['data'];entry=next(h for h in saved['history'] if h['id']=='doc138-entry');assert entry['partsExchanged'] is False and entry['notes']=='Kette gereinigt, kein Austausch';assert next(p for p in saved['plans'] if p['id']=='doc138-plan')['nextKm']==600;assert saved['inventory']==before['inventory'];assert saved['bikes']==before['bikes']
 g=json.loads(subprocess.check_output([node,'--input-type=module','-e',source],cwd=project,input=json.dumps(saved).encode()));put(g);assert len([h for h in state()['data']['history'] if h['id']=='doc138-entry'])==1
 print('PASS #138 PHP/MySQL: service documentation durable, recurrence to 600 km, replay once, no stock or component changes without exchange.')
