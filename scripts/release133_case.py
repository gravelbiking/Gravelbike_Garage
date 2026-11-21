"""Exercise real Reifenpark writes; all calls run inside a disposable local installation."""
import json,uuid,datetime,base64
from copy import deepcopy

def check_release133(call,project,private,configuration):
 day=datetime.date.today().isoformat()
 def state():return call('data')[1]
 def put(g):
  r=call('data','PUT',{'data':g,'version':state()['version']});assert r[0]==200,r
 def post(action,status=200,**kwargs):
  before=state();body={'action':action,'version':before['version'],'operationId':uuid.uuid4().hex,**kwargs};r=call('tirepark','POST',body);assert r[0]==status,(body,r)
  if status!=200:assert state()==before,'Rejected operation changed data'
  return r[1],body
 def records():
  r=call('tirepark');assert r[0]==200,r;return {t['id']:t for t in r[1]['tires']}
 g=state()['data'];g['bikes'].extend([{'id':'tp-bike-a','name':'Albatros','km':1000,'components':[{'id':'tp-old','name':'Vorderreifen','category':'Reifen','manufacturer':'Alt','model':'Winter','installedDate':day,'installedKm':100}]},{'id':'tp-bike-b','name':'Bussard','km':5000,'components':[]}]);put(g)
 old=next(t for t in records().values() if t['mount'] and t['mount']['bikeId']=='tp-bike-a');assert old['totalMileage'] is None and not old['isNew'];assert old['mount']['mileage']==900
 post('save',id=old['id'],profile={'usageState':'used','initialMileage':0})
 assert records()[old['id']]['mount']['bikeId']=='tp-bike-a'
 assert next(b for b in state()['data']['bikes'] if b['id']=='tp-bike-a')['components'][0]['tireId']==old['id']
 created,body=post('save',profile={'usageState':'new'},location='Reifenregal');a=created['id'];assert records()[a]['isNew'];assert records()[a]['totalMileage']==0
 replay=call('tirepark','POST',body);assert replay[0]==200 and replay[1]['replayed'];assert len([t for t in records() if t==a])==1
 changed=deepcopy(body);changed['profile']['model']='changed';assert call('tirepark','POST',changed)[0]==400
 created,_=post('save',profile={'usageState':'used','model':'Partner','initialMileage':25,'tubeless':False},partnerId=a);b=created['id'];rr=records();assert rr[a]['pairId']==rr[b]['pairId'];assert rr[a]['pairRole']!=rr[b]['pairRole'];assert rr[b]['tubeless'] is False;assert not rr[b]['isNew']
 post('save',400,id=a,profile={'usageState':'new','photo':'f'*32})
 post('save',400,id=a,profile={'usageState':'new','tubeless':'yes'})
 post('save',400,profile='invalid')
 before=state();orders=deepcopy(before['data']['orders']);history=len(before['data']['history'])
 result,swap=post('swap',bikeId='tp-bike-a',position='Vorderreifen',outgoingId=old['id'],incomingId=a,date=day,location='Winterlager')
 rr=records();assert rr[a]['mount']['bikeId']=='tp-bike-a' and not rr[a]['isNew'];assert rr[old['id']]['available'];assert rr[old['id']]['history'][-1]['mileage']==900;assert rr[old['id']]['history'][-1]['bikeName']=='Albatros';assert state()['data']['orders']==orders;assert len(state()['data']['history'])==history+1
 assert call('tirepark','POST',swap)[1]['replayed'];assert len(state()['data']['history'])==history+1
 post('swap',400,bikeId='tp-bike-b',position='Vorderreifen',outgoingId='',incomingId=a,date=day)
 post('save',400,id=a,profile={'usageState':'new'})
 stale={'action':'save','profile':{'usageState':'unknown'},'operationId':uuid.uuid4().hex,'version':before['version']};assert call('tirepark','POST',stale)[0]==409
 # An ordinary save must preserve the new metadata; it cannot forge history or identities.
 g=state()['data'];g['bikes'][-2]['km']=1100;g['bikes'][-2]['name']='Albatros neu';put(g)
 post('swap',bikeId='tp-bike-a',position='Vorderreifen',outgoingId=a,incomingId=b,date=day,location='Regal A')
 rr=records();assert rr[a]['history'][-1]['mileage']==100 and rr[a]['history'][-1]['bikeName']=='Albatros neu';assert not rr[a]['isNew']
 post('swap',bikeId='tp-bike-b',position='Hinterreifen',outgoingId='',incomingId=a,date=day)
 g=state()['data'];g['bikes'][-1]['km']=5100;put(g);rr=records();assert rr[a]['totalMileage']==200 and rr[a]['mount']['mileage']==100
 post('swap',bikeId='tp-bike-b',position='Hinterreifen',outgoingId=a,incomingId='',date=day,location='Regal B')
 rr=records();assert rr[a]['totalMileage']==200;assert len(rr[a]['history'])==2;assert rr[a]['history'][0]['bikeId']=='tp-bike-a' and rr[a]['history'][1]['bikeId']=='tp-bike-b';assert rr[a]['available'] and not rr[a]['isNew']
 # Repeated ordinary saves still satisfy all legacy transition guards.
 g=state()['data'];put(g)
 bad=deepcopy(g);bad['tireProfiles'][0]['model']='forged';assert call('data','PUT',{'data':bad,'version':state()['version']})[0]==400
 # Materialize an existing anonymous stock unit without increasing total stock.
 stock=next(s for s in g['inventory'] if s['id']==rr[a]['stock']['inventoryId']);source=next(p for p in stock['positions'] if p.get('tire',{}).get('id')==a)
 post('save',400,profile={'usageState':'unknown'},inventoryId=stock['id'],positionId=source['id'])
 bio=call('biography',params={'bike':'tp-bike-a','kind':'seller'})
 assert bio[0]==200 and b'Reifenpark' in bio[1] and b'Montagehistorie' in bio[1],bio[0]
 # Pair unlinking preserves individual histories; feature disable keeps all stored data.
 post('save',id=b,profile={'usageState':'used','initialMileage':25})
 rr=records();assert rr[b]['pairId']=='' and rr[a]['pairId']=='';assert len(rr[a]['history'])==2
 # New bicycle attachment uses one transaction, with exact 700 × 45 dimensions.
 attached,request=post('saveMount',bikeId='tp-bike-b',position='Vorderreifen',date=day,profile={'usageState':'new','dimensionSize':'700','width':'45','dimensionsEdited':True,'manufacturer':'Test','model':'Direktmontage'})
 linked=records()[attached['id']];assert linked['mount']['bikeId']=='tp-bike-b';assert linked['dimensions']=='700 × 45';assert linked['width']=='45';assert not linked['isNew'];assert linked['totalMileage']==0
 assert call('tirepark','POST',request)[1]['replayed']
 post('saveMount',400,bikeId='tp-bike-b',position='Vorderreifen',date=day,profile={'usageState':'new','model':'must roll back'})
 assert any(c.get('tireDimensions')=='700 × 45' for x in state()['data']['bikes'] if x['id']=='tp-bike-b' for c in x['components'])
 legacy,_=post('save',profile={'usageState':'unknown','dimensionLabel':'40-622','width':'40','diameter':'622'})
 assert records()[legacy['id']]['dimensions']=='40-622'
 post('save',id=legacy['id'],profile={'usageState':'unknown','manufacturer':'Edited'})
 assert records()[legacy['id']]['dimensionLabel']=='40-622' and records()[legacy['id']]['diameter']=='622'
 post('save',id=legacy['id'],profile={'usageState':'unknown','dimensionSize':'700','width':'45','dimensionsEdited':True})
 assert records()[legacy['id']]['dimensions']=='700 × 45' and records()[legacy['id']]['diameter']=='622'
 print('PASS Reifenpark assignment: atomic create+mount, occupied-slot rollback, exact dimensions and legacy dimension preservation.')
 previous_config=(private/'config.php').read_bytes();snapshot=state()
 try:
  disabled={**configuration,'features':{'tirepark':False}};encoded=base64.b64encode(json.dumps(disabled).encode()).decode();(private/'config.php').write_text("<?php return json_decode(base64_decode('"+encoded+"'),true);")
  assert call('tirepark')[0]==403;assert call('auth')[1]['tireparkEnabled'] is False;assert state()==snapshot
 finally:(private/'config.php').write_bytes(previous_config)
 assert call('tirepark',anonymous=True)[0]==401
 assert call('tirepark','POST',{'version':state()['version'],'action':'swap','operationId':uuid.uuid4().hex},request_origin='https://evil.example')[0]==403
 print('PASS 1.3.3 PHP/SQL: optional profiles, pairs, never-mounted badge, atomic cross-bike swaps, frozen km, no orders, idempotency/replay, CAS, duplicate montage/forged metadata/photo/type/CSRF/auth rejection and biography. Tests only in disposable database.')
