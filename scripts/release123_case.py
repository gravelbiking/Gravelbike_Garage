"""Exercise 1.2.3 through real garage PUTs in the disposable integration database."""
from copy import deepcopy
import json
import subprocess

def check_release123(call, project):
    node=json.loads((project/'.local/tools.json').read_text())['node']
    def transform(value, code):
        source="import {normalizeGarage,settleWorkshopOrder,installTire,addStockPosition} from './src/logic.js';let raw='';for await(const c of process.stdin)raw+=c;let g=normalizeGarage(JSON.parse(raw));"+code+";process.stdout.write(JSON.stringify(g));"
        return json.loads(subprocess.check_output([node,'--input-type=module','-e',source],cwd=project,input=json.dumps(value).encode()))
    def save(value, expected=200):
        state=call('data')[1]
        result=call('data','PUT',{'data':value,'version':state['version']})
        assert result[0]==expected,result
        return result
    current=call('data')[1]['data']
    current['bikeTypes']=['Cyclocross','Privates Reiserad']
    current['computers'].append({'id':'new-gps','manufacturer':'Garmin','model':'Edge','serial':'000-123','software':'1.0','infos':'Testinfo','price':None,'purchaseDate':''})
    save(current)
    bad=deepcopy(current);bad['computers'][-1]['serial']='x'*26;save(bad,400)
    bad=deepcopy(current);bad['computers'][-1]['infos']='x'*101;save(bad,400)
    bad=deepcopy(current);bad['bikeTypes'].append('CYCLOCROSS');save(bad,400)
    current['bikes'].append({'id':'tire-bike','name':'Sommerbike','type':'Cyclocross','km':1000,'components':[{'id':'summer-tire','category':'Reifen','name':'Vorderreifen','manufacturer':'Test','model':'Sommer','installedKm':100,'installedDate':'2026-01-01','tireWidth':40,'tireUnit':'mm'}]})
    current['bikes'].append({'id':'other-tire-bike','name':'Winterbike','type':'Privates Reiserad','km':200,'components':[]})
    current['orders'].append({'id':'tire-return','bikeId':'tire-bike','externalBike':'','title':'Sommerreifen ausbauen','description':'','type':'service','componentCategories':['Reifen'],'replacementKeys':['summer-tire'],'guideIds':[],'attachments':[],'steps':[],'parts':[]})
    save(current)
    day='2026-11-08'
    source="g=settleWorkshopOrder(g,'tire-return','complete',[],"+json.dumps(day)+",'', ['summer-tire'],1000,{'summer-tire':{mode:'stock',location:'Regal Reifen'}})"
    returned=transform(current,source)
    stock=next(s for s in returned['inventory'] if s['category']=='Reifen' and s.get('positions') and s['positions'][-1].get('tire'))
    position=stock['positions'][-1]
    assert position['quantity']==1 and position['tire']['history'][-1]['mileage']==900
    assert returned['bikes'][-2]['components']==[] and returned['bikes'][-2]['componentArchive']==[]
    save(returned)
    # Forging a historical segment must fail even if the stock balance is unchanged.
    bad=deepcopy(returned);bad['inventory'][-1]['positions'][-1]['tire']['history'][0]['mileage']=901;save(bad,400)
    install="g=installTire(g,"+','.join(json.dumps(v) for v in [stock['id'],position['id'],'other-tire-bike','Hinterreifen',day])+")"
    mounted=transform(returned,install)
    save(mounted)
    assert mounted['bikes'][-1]['components'][0]['tireHistory'][0]['mileage']==900
    assert next(s for s in mounted['inventory'] if s['id']==stock['id'])['quantity']==0
    # Repeat submission cannot debit twice, and the physical tire cannot be duplicated.
    state=call('data')[1]
    assert call('data','PUT',{'data':mounted,'version':state['version']-1})[0]==409
    bad=deepcopy(mounted);bad['bikes'][-2]['components']=[deepcopy(mounted['bikes'][-1]['components'][0])];save(bad,400)
    current=mounted
    tire=current['bikes'][-1]['components'][0]
    current['orders'].append({'id':'tire-return-again','bikeId':'other-tire-bike','externalBike':'','title':'Winterreifen ausbauen','description':'','type':'service','componentCategories':['Reifen'],'replacementKeys':[tire['id']],'guideIds':[],'attachments':[],'steps':[],'parts':[]})
    save(current)
    again=transform(current,"g=settleWorkshopOrder(g,'tire-return-again','complete',[],"+json.dumps(day)+",'',"+json.dumps([tire['id']])+",500,"+json.dumps({tire['id']:{'mode':'stock','inventoryId':stock['id'],'location':'Regal B'}})+")")
    save(again)
    last=next(s for s in again['inventory'] if s['id']==stock['id'])['positions'][-1]
    assert [h['mileage'] for h in last['tire']['history']]==[900,300]
    # A used tire is independently selectable again, preserving all earlier use.
    final=transform(again,"g=installTire(g,"+','.join(json.dumps(v) for v in [stock['id'],last['id'],'tire-bike','Vorderreifen',day])+")")
    save(final)
    c=final['bikes'][-2]['components'][0]
    final['orders'].append({'id':'tire-archive','bikeId':'tire-bike','externalBike':'','title':'Reifen archivieren','description':'','type':'service','componentCategories':['Reifen'],'replacementKeys':[c['id']],'guideIds':[],'attachments':[],'steps':[],'parts':[]})
    save(final)
    archived=transform(final,"g=settleWorkshopOrder(g,'tire-archive','complete',[],"+json.dumps(day)+",'',"+json.dumps([c['id']])+",1100,"+json.dumps({c['id']:{'mode':'archive'}})+")")
    save(archived)
    assert len(archived['bikes'][-2]['componentArchive'])==1
    print('PASS 1.2.3: custom types, computer limits, return/reinstall across bicycles, repeated tire use, immutable history, archive choice and duplicate protection.')
    # Replacement -> current bike component plus immutable exchange in both biographies.
    current=transform(archived,"""
    g.bikes.push({id:'chain-bike',name:'Kettenrad',km:2000,components:[{id:'chain-old',name:'Kette',category:'Antrieb',manufacturer:'Alt',model:'Altmodell',serial:'OLD',installedDate:'2026-01-01',installedKm:500}]});
    const stock=structuredClone(g.inventory[0]);Object.assign(stock,{id:'new-chain-stock',name:'CN-M8100',manufacturer:'Shimano',articleNumber:'ICNM8100126Q',category:'Antrieb',unit:'Stück',quantity:0,positions:[],movements:[],invoices:[],datasheets:[]});
    addStockPosition(stock,{label:'Ketten',quantity:2,unitPrice:29.99,purchaseDate:'2026-11-01',location:'Regal K',supplierId:'',supplier:'Privater Testladen',packageType:'Einzelbestand',packageSize:1,notes:'',invoices:[]});g.inventory.push(stock);
    g.orders.push({id:'chain-exchange',bikeId:'chain-bike',externalBike:'',title:'Kettenwechsel Test',description:'',type:'service',componentCategories:['Antrieb'],replacementKeys:['chain-old'],guideIds:[],attachments:[],steps:[],parts:[{id:'chain-part',inventoryId:stock.id,positionId:stock.positions[0].id,name:stock.name,quantity:1,unit:'Stück',available:true}]});
    """)
    save(current)
    changed=transform(current,"g=settleWorkshopOrder(g,'chain-exchange','complete',[],'2026-11-08','',['chain-old'],2100,{},[{partId:'chain-part',replacedKey:'chain-old'}])")
    bad=deepcopy(changed);bad['orders'][-1]['installations'][0]['component']['manufacturer']='Forged';save(bad,400)
    bad=deepcopy(changed);bad['bikes'][-1]['components'][0]['installedKm']=100;save(bad,400)
    save(changed)
    assert changed['bikes'][-1]['components'][0]['model']=='CN-M8100'
    assert changed['bikes'][-1]['componentArchive'][0]['mileage']==1600
    assert changed['inventory'][-1]['quantity']==1
    for kind in ['seller','workshop']:
        status,report,_=call('biography',params={'bike':'chain-bike','kind':kind})
        if isinstance(report,bytes): report=report.decode()
        assert status==200 and 'CN-M8100' in report and 'ICNM8100126Q' in report and 'Kettenwechsel Test' in report and 'Dokumentierte Bauteilwechsel' in report
    bad=deepcopy(changed);bad['orders'][-1]['installations'][0]['component']['model']='Rewritten';save(bad,400)
    print('PASS: replacement linked to bike, date and mileage, stock debit, frozen old part, exchange biographies and forged/history edits rejected.')
