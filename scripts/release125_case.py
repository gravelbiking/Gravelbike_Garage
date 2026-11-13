"""Real API transactions for required replacement decisions and external procurement."""
import json,subprocess
from copy import deepcopy

def check_release125(call,project):
 node=json.loads((project/'.local/tools.json').read_text())['node']
 def transform(value,code):
  js="import{normalizeGarage,settleWorkshopOrder,addStockPosition}from'./src/logic.js';let raw='';for await(const x of process.stdin)raw+=x;let g=normalizeGarage(JSON.parse(raw));"+code+";console.log(JSON.stringify(g));"
  return json.loads(subprocess.check_output([node,'--input-type=module','-e',js],cwd=project,input=json.dumps(value).encode()))
 def save(value,status=200):
  state=call('data')[1];response=call('data','PUT',{'data':value,'version':state['version']});assert response[0]==status,response
  if status!=200:assert call('data')[1]==state,'Rejected update must be atomic'
 current=call('data')[1]['data'];count=len(current['inventory'])
 current['bikes'].append({'id':'external-bike','name':'Externrad','km':1000,'components':[{'id':'external-old','name':'Bremsbelag','category':'Bremsen','manufacturer':'Alt','model':'Alt','installedKm':100,'installedDate':'2026-01-01'}]})
 current['orders'].append({'id':'external-order','title':'Externe Beläge montieren','type':'service','bikeId':'external-bike','externalBike':'','description':'','guideIds':[],'attachments':[],'componentCategories':[],'replacementKeys':['external-old'],'steps':[{'id':'external-step','title':'Belag wechseln','category':'Bremsen','componentKey':'external-old','done':False,'guideIds':[]}],'parts':[{'id':'external-part','stepId':'external-step','name':'Neue Beläge','manufacturer':'SRAM','model':'Disc Pad','articleNumber':'PAD-125','serial':'NEU125','inventoryId':'','positionId':'','procurement':'external','unit':'Stück','quantity':1,'available':True}]})
 save(current)
 bad=deepcopy(current);bad['orders'][-1]['parts'][0]['inventoryId']=current['inventory'][0]['id'];save(bad,400)
 done=transform(current,"g=settleWorkshopOrder(g,'external-order','complete',[],'2026-11-13','',['external-old'],1000,{},[{partId:'external-part',replacedKey:'external-old'}])")
 bad=deepcopy(done);bad['orders'][-1]['installations']=[];save(bad,400)
 bad=deepcopy(done);bad['orders'][-1]['exchangeConfirmed']=False;save(bad,400)
 bad=deepcopy(done);bad['orders'][-1]['installations'][0]['component']['serial']='FORGED';save(bad,400)
 save(done);assert len(done['inventory'])==count and done['bikes'][-1]['components'][0]['model']=='Disc Pad' and done['bikes'][-1]['componentArchive'][0]['mileage']==900
 stale=call('data')[1];assert call('data','PUT',{'data':done,'version':stale['version']-1})[0]==409
 for kind in ['seller','workshop']:
  status,html,_=call('biography',params={'bike':'external-bike','kind':kind});html=html.decode() if isinstance(html,bytes) else html;assert status==200 and 'Disc Pad' in html and 'PAD-125' in html and 'Externe Beläge montieren' in html
 current=done;new_id=current['bikes'][-1]['components'][0]['id']
 order=deepcopy(current['orders'][-1]);order.update(id='consumable-order',title='Reinigung',replacementKeys=[new_id]);order['steps']=[{'id':'clean-step','title':'Reinigen','category':'Bremsen','componentKey':new_id,'done':False,'guideIds':[]}];order['parts']=[{'id':'cleaner','stepId':'clean-step','inventoryId':'','positionId':'','procurement':'external','name':'Reiniger','unit':'Milliliter','quantity':10,'available':True}]
 for field in ['completedAt','completedKm','removedKeys','replacementSnapshot','installations','workLog','exchangeConfirmed','consumablePartIds']:order.pop(field,None)
 current['orders'].append(order);save(current)
 consumed=transform(current,"g=settleWorkshopOrder(g,'consumable-order','complete',[],'2026-11-13','',[],1000,{},[{partId:'cleaner',replacedKey:'__consumable__'}])");save(consumed);assert consumed['bikes'][-1]['components']==current['bikes'][-1]['components']
 print('PASS 1.2.5 HTTP: external procurement, explicit exchange, rejection without mapping/confirmation, both biographies, duplicate protection, consumables and atomic failed transactions.')
