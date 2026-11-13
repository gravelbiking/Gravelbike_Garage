"""Exercise new service-plan/workshop contracts in the disposable integration DB."""
import json,subprocess
from copy import deepcopy

def check_release124(call,project):
 node=json.loads((project/'.local/tools.json').read_text())['node']
 def transform(value,code):
  source="import {normalizeGarage,settleWorkshopOrder} from './src/logic.js';let raw='';for await(const c of process.stdin)raw+=c;let g=normalizeGarage(JSON.parse(raw));"+code+";process.stdout.write(JSON.stringify(g));"
  return json.loads(subprocess.check_output([node,'--input-type=module','-e',source],cwd=project,input=json.dumps(value).encode()))
 def save(value,status=200):
  state=call('data')[1];r=call('data','PUT',{'data':value,'version':state['version']});assert r[0]==status,r
 current=call('data')[1]['data']
 current['bikes'].append({'id':'interval-bike','name':'Intervallrad','km':1200,'components':[]})
 plan={'id':'new-service','bikeId':'interval-bike','title':'UVV 124','nextDate':'2026-12-01','nextKm':None,'months':12,'intervalKm':None,'source':'Leasingvertrag','performer':'workshop','notes':'Optional','guideIds':[],'attachments':[],'contactId':'','wizardVersion':2}
 current['plans'].append(plan);save(current)
 for kind in ['seller','workshop']:
  code,html,_=call('biography',params={'bike':'interval-bike','kind':kind});html=html.decode() if isinstance(html,bytes) else html
  assert code==200 and 'Geplante Serviceintervalle' in html and 'UVV 124' in html and 'Leasingvertrag' in html
 bad=deepcopy(current);bad['plans'][-1]['nextKm']=2000;save(bad,400)
 bad=deepcopy(current);bad['plans'][-1]['performer']='dealer';save(bad,400)
 current['plans'][-1]['performer']='custom';current['plans'][-1]['performerName']='Mobile Fahrradpflege';save(current)
 bad=deepcopy(current);bad['plans'][-1]['performerName']='';save(bad,400)
 status,html,_=call('biography',params={'bike':'interval-bike','kind':'seller'});html=html.decode() if isinstance(html,bytes) else html;assert status==200 and 'Mobile Fahrradpflege' in html
 current['customComponentCategories']=['Rahmenpflege']
 current['inventory'].append({'id':'new-unstocked','name':'Rahmenpflege 124','manufacturer':'Test','articleNumber':'124','category':'Rahmenpflege','kind':'Zubehör','unit':'Stück','quantity':0,'minStock':0,'unitPrice':None,'notes':'Technische Daten','location':'','purchaseDate':'','positions':[],'movements':[],'invoices':[],'technicalData':{'model':'Vorhandenes Bauteil'}})
 save(current)
 bad=deepcopy(current);bad['customComponentCategories']=[{'bad':1}];save(bad,400)
 order={'id':'wizard-order','bikeId':'interval-bike','externalBike':'','title':'UVV Werkstattauftrag 124','description':'','type':'service','planId':plan['id'],'planOccurrence':json.dumps([plan['id'],plan['nextDate'],None],separators=(',',':')),'planSnapshot':deepcopy(plan),'plannedDate':'2026-11-20','wizardVersion':2,'componentCategories':[],'replacementKeys':[],'guideIds':[],'attachments':[],'steps':[{'id':'check-step','title':'Prüfung ohne Ersatzteil','category':'Rahmenpflege','componentKey':'','guideIds':[],'done':False}],'parts':[{'id':'part-124','stepId':'check-step','inventoryId':'new-unstocked','name':'Rahmenpflege 124','quantity':2,'unit':'Stück','positionId':'','available':False,'decision':'no'}]}
 bad=deepcopy(current);bad['orders'].append({**order,'plannedDate':''});save(bad,400)
 current['orders'].append(order);save(current)
 bad=deepcopy(current);second=deepcopy(order);second['id']='duplicate-order';bad['orders'].append(second);save(bad,400)
 bad=deepcopy(current);bad['orders'][-1]['planOccurrence']='["different","2026-12-01",null]';save(bad,400)
 before=deepcopy(current)
 current=transform(current,"g=settleWorkshopOrder(g,'wizard-order','complete',[],'2026-11-10','',[],1200,{})")
 save(current)
 assert current['plans'][-1]['nextDate']=='2027-11-10' and current['inventory'][-1]['quantity']==0
 for kind in ['seller','workshop']:
  code,html,_=call('biography',params={'bike':'interval-bike','kind':kind});html=html.decode() if isinstance(html,bytes) else html
  assert code==200 and 'UVV Werkstattauftrag 124' in html and 'Durchgeführte Werkstattaufträge' in html and '10.11.2027' in html
 # Same recurring plan may have a new order only for the NEW occurrence.
 next_order=deepcopy(order);next_order['id']='next-wizard-order';next_order['planOccurrence']=json.dumps([plan['id'],'2027-11-10',None],separators=(',',':'));next_order['plannedDate']='2027-11-01'
 current['orders'].append(next_order);save(current)
 print('PASS 1.2.4: exclusive due modes, custom categories, zero-stock planning, mandatory scheduled date, occurrence uniqueness, recurrence and both biographies.')
