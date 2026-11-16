"""PHP/SQL service planning with distinct inspection and replacement steps."""
import json,subprocess
from copy import deepcopy

def check_release132(call,project):
 def save(g,status=200):
  state=call('data')[1];r=call('data','PUT',{'data':g,'version':state['version']});assert r[0]==status,r
  if status!=200:assert call('data')[1]==state,'Rejected planning save changed persisted data'
 g=call('data')[1]['data'];stock=next(s for s in g['inventory'] if s['category']=='Bremsen');before=deepcopy(g['inventory'])
 g['bikes'].append({'id':'planning132-bike','name':'Planrad','km':100,'components':[{'id':'planning132-chain','name':'Kette','category':'Antrieb','installedKm':0},{'id':'planning132-pad','name':'Bremsbelag','category':'Bremsen','installedKm':0}]})
 plan={'id':'planning132-plan','bikeId':'planning132-bike','title':'Jahresservice','nextDate':'2099-01-01','nextKm':None,'months':12,'intervalKm':None,'source':'Eigene Wartung','performer':'self','notes':'','wizardVersion':2}
 g['plans'].append(plan);save(g)
 o={'id':'planning132-order','maintenancePlanning':True,'type':'service','bikeId':plan['bikeId'],'externalBike':'','title':'Selbst gewählte Kurzbezeichnung','description':'','steps':[{'id':'planning132-inspect','title':'Kette warten','category':'Antrieb','operation':'maintenance','componentKey':'planning132-chain','done':False,'guideIds':[]},{'id':'planning132-replace','title':'Belag wechseln','category':'Bremsen','operation':'replace','componentKey':'planning132-pad','done':False,'guideIds':[]}],'parts':[{'id':'planning132-part','stepId':'planning132-replace','inventoryId':stock['id'],'positionId':'','name':stock['name'],'quantity':2,'unit':stock['unit'],'available':False}],'replacementKeys':['planning132-pad'],'componentCategories':[],'guideIds':[],'attachments':[],'plannedDate':'2098-12-01','planId':plan['id'],'planOccurrence':json.dumps([plan['id'],plan['nextDate'],None],separators=(',',':')),'planSnapshot':deepcopy(plan),'wizardVersion':2}
 g['orders'].append(o);save(g);stored=call('data')[1]['data'];assert stored['inventory']==before;assert stored['orders'][-1]['steps'][0]['operation']=='maintenance';assert stored['orders'][-1]['steps'][1]['operation']=='replace';assert stored['bikes'][-1]['components']==g['bikes'][-1]['components'];assert stored['plans'][-1]==plan
 bad=deepcopy(g);bad['orders'][-1]['steps'][0]['operation']='invalid';save(bad,400)
 bad=deepcopy(g);bad['orders'][-1]['parts'][0]['stepId']='planning132-inspect';save(bad,400)
 bad=deepcopy(g);bad['orders'][-1]['type']='repair';save(bad,400)
 bad=deepcopy(g);bad['orders'][-1]['replacementKeys'].append('planning132-chain');save(bad,400)
 bad=deepcopy(g);bad['orders'][-1]['steps'][1]['category']='Antrieb';save(bad,400)
 bad=deepcopy(g);bad['orders'][-1]['plannedDate']='';save(bad,400)
 bad=deepcopy(g);dup=deepcopy(o);dup['id']='planning132-duplicate';bad['orders'].append(dup);save(bad,400)
 # A maintenance-only order has a component reference but no removal mapping or stock.
 g['plans'].append({**plan,'id':'planning132-inspection-plan'});inspection=deepcopy(o);inspection.update(id='planning132-inspection',planId='planning132-inspection-plan',planOccurrence=json.dumps(['planning132-inspection-plan',plan['nextDate'],None],separators=(',',':')),planSnapshot=deepcopy(g['plans'][-1]),parts=[],replacementKeys=[],steps=[deepcopy(o['steps'][0])]);g['orders'].append(inspection);save(g)
 print('PASS 1.3.2 HTTP: persisted maintenance/replacement steps, no stock or bike changes during planning, pure maintenance reference without removal, invalid operation/type/date/part association and duplicate occurrence rejected atomically.')
