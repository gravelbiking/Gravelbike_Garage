"""Real PHP/SQL persistence of catalogue-only fitted components and optional purchases."""
import json,subprocess
from copy import deepcopy

def check_release13(call,project):
 node=json.loads((project/'.local/tools.json').read_text())['node']
 def transform(value):
  js="import{normalizeGarage,syncInstalledInventory}from'./src/logic.js';let s='';for await(const c of process.stdin)s+=c;let g=normalizeGarage(JSON.parse(s));syncInstalledInventory(g);console.log(JSON.stringify(g));"
  return json.loads(subprocess.check_output([node,'--input-type=module','-e',js],cwd=project,input=json.dumps(value).encode()))
 def save(value):
  row=call('data')[1];response=call('data','PUT',{'data':value,'version':row['version']});assert response[0]==200,response
 current=call('data')[1]['data'];original=deepcopy(current['inventory'])
 current['bikes'].append({'id':'catalog-bike','name':'Katalograd','km':123,'components':[{'id':'catalog-part','name':'Bremsbelag','category':'Bremsen','manufacturer':'Test13','model':'Pad13','originalPartNumber':'C13','installedKm':0}]})
 migrated=transform(current);save(migrated);saved=call('data')[1]['data'];article=next(s for s in saved['inventory'] if s.get('manufacturer')=='Test13');assert article['quantity']==0 and article['positions']==[] and article['movements']==[] and 'Katalograd' in article['notes'];assert saved['inventory'][:len(original)]==migrated['inventory'][:len(original)]
 again=transform(saved);assert again==saved
 order={'id':'optional13','title':'Ohne Einkauf planen','type':'repair','bikeId':'catalog-bike','externalBike':'','description':'','guideIds':[],'attachments':[],'replacementKeys':[],'componentCategories':[],'steps':[{'id':'optional-step','title':'Prüfung','category':'Bremsen','componentKey':'','componentNotListed':True,'done':False,'guideIds':[]}],'parts':[{'id':'optional-part','stepId':'optional-step','inventoryId':article['id'],'positionId':'','name':article['name'],'quantity':3,'unit':'Stück','available':False,'decision':''}],'plannedDate':'2026-11-14','wizardVersion':2}
 before=len(saved['shopping']);saved['orders'].append(order);save(saved);loaded=call('data')[1]['data'];assert len(loaded['shopping'])==before and loaded['orders'][-1]['steps'][0]['componentNotListed'] is True
 print('PASS 1.3 HTTP: auto catalogue survives PHP/SQL with zero quantity, technical/source metadata, idempotent migration and optional no-purchase order.')
