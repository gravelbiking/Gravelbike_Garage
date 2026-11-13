"""Feature integration checks, run against the disposable PHP/MySQL test case."""
from copy import deepcopy
import json
from pathlib import Path
import subprocess

def check_features(call, payload, version, project):
    node = json.loads((project / '.local/tools.json').read_text())['node']
    source = """
import {normalizeGarage,addStockPosition,consumeSupplies} from './src/logic.js';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
let g=normalizeGarage(JSON.parse(raw));
g.tools=[{id:'puller',name:'Kurbelabzieher',manufacturer:'Test',model:'CP-1',articleNumber:'0001',dimensions:'M22 × 1',compatibility:'Vierkant',notes:''}];
g.computers=[{id:'computer',manufacturer:'Garmin',model:'Testgerät',software:'12.34',purchaseDate:'2026-10-01',price:0}];
g.contacts[0].roles=['Händler','Werkstatt','Lieferant'];g.contacts[0].accountUrl='https://example.com/account';g.contacts[0].appointmentUrl='https://example.com/termine';
Object.assign(g.bikes[0],{modelYear:2027,frameColor:'Grün metallic',frameMaterial:'Carbon',weightKg:8.125,leasing:{monthly:62.50,insurance:'Test Versicherung',insuranceNumber:'000-INS',insuranceUrl:'https://example.com/policy',documentId:'doc-1',purchased:true,buyout:700}});
g.bikes[0].components[0].toolIds=['puller'];g.bikes[0].components.find(c=>c.name==='Hinterrad').wheel.freehub='SRAM XDR';
g.bikes[0].components.push({id:'tire',name:'Vorderreifen',category:'Reifen',manufacturer:'Test',model:'Gravel',tireWidth:45,tireUnit:'mm',toolIds:[]});
g.inventory[0].ean='1234567890123';g.inventory[0].productUrl='https://www.bike24.de/p1324213.html';
addStockPosition(g.inventory[0],{label:'Kiste 2',quantity:2,unitPrice:null,purchaseDate:'2026-11-01',location:'Regal B',supplierId:'workshop',supplier:'',packageType:'Kiste',packageSize:2,notes:'',invoices:[]});
const h={id:'inventory-service',bikeId:'bike-1',title:'Material aus Lager verwendet',date:'2026-11-02',km:1800};
const r=consumeSupplies(g,[{inventoryId:'oil',positionId:'legacy-oil',quantity:0.1}],{...h,bikeName:g.bikes[0].name});
g.inventory=r.inventory;g.shopping=r.shopping;h.materials=r.materials;g.history.push(h);
process.stdout.write(JSON.stringify(g));
"""
    result = subprocess.run([node, '--input-type=module', '-e', source], cwd=project, input=json.dumps(payload), capture_output=True, text=True, check=True)
    value = json.loads(result.stdout)
    status, response, _ = call('data','PUT',{'data':value,'version':version})
    assert status == 200, response
    current = version + 1
    assert call('data')[1] == {'data':value,'version':current}
    for path, invalid in [
        (['bikes',0,'modelYear'],1800), (['bikes',0,'weightKg'],-1),
        (['bikes',0,'leasing','insuranceUrl'],'javascript:alert(1)'),
        (['bikes',0,'components',0,'toolIds'],['missing']),
        (['bikes',0,'components',4,'wheel','freehub'],{}),
        (['bikes',0,'components',5,'tireWidth'],'45'),
        (['contacts',0,'roles'],[]), (['contacts',0,'roles'],['Werkstatt','Werkstatt']),
        (['contacts',0,'accountUrl'],'data:text/html,bad'),
        (['computers',0,'price'],-1), (['computers',0,'purchaseDate'],'2026-02-30'),
        (['inventory',0,'positions',0,'quantity'],0.2),
        (['inventory',0,'movements',0,'reason'],'Historical journal tampered'),
        (['inventory',0,'positions'],[]),
    ]:
        bad = deepcopy(value); cursor=bad
        for key in path[:-1]: cursor=cursor[key]
        cursor[path[-1]]=invalid
        assert call('data','PUT',{'data':bad,'version':current})[0] == 400, path
    bad=deepcopy(value);bad['inventory']=[];bad['shopping']=[]
    assert call('data','PUT',{'data':bad,'version':current})[0] == 400, 'Journaled articles cannot disappear'
    assert call('data','PUT',{'data':value,'version':version})[0] == 409
    assert call('inventory-report',params={'format':'pdf'},anonymous=True)[0] == 401
    assert call('inventory-report',params={'format':'bad'})[0] == 400
    status,pdf,headers=call('inventory-report',params={'format':'pdf'})
    assert status==200 and pdf.startswith(b'%PDF-1.4') and b'startxref' in pdf and 'attachment' in headers['Content-Disposition']
    assert b'6,30 EUR' in pdf and b'unvollst' in pdf
    assert b'Ketten\xf6l' in pdf and b'Gez\xe4hlte' in pdf, 'German letters must survive PDF encoding without iconv'
    status,csv,headers=call('inventory-report',params={'format':'csv'})
    assert status==200 and csv.startswith(b'\xef\xbb\xbf') and 'text/csv' in headers['Content-Type']
    assert 'Kiste 2' in csv.decode('utf-8-sig') and '6,30' in csv.decode('utf-8-sig')
    assert call('data')[1] == {'data':value,'version':current}, 'Reports are read-only'
    # Exercise multi-page output and spreadsheet formula protection with real
    # user-entered text; exporting must not lose the final total or mutate stock.
    report_case=deepcopy(value)
    report_case['inventory'][0]['articleNumber']='=HYPERLINK("https://example.com")'
    report_case['inventory'][0]['positions'][0]['location']='@SUM(A1:A2)'
    report_case['inventory'][0]['name']='Öl und Zubehör ' + 'sehr lange Artikelbezeichnung ' * 25
    assert call('data','PUT',{'data':report_case,'version':current})[0] == 200
    current += 1
    exported=call('inventory-report',params={'format':'csv'})[1].decode('utf-8-sig')
    import csv, io
    cells=[cell for row in csv.reader(io.StringIO(exported),delimiter=';') for cell in row]
    assert "'=HYPERLINK(\"https://example.com\")" in cells and "'@SUM(A1:A2)" in cells
    long_pdf=call('inventory-report',params={'format':'pdf'})[1]
    assert long_pdf.count(b'/Type /Page ') > 1 and b'Erfasster Gesamtwert: 6,30 EUR' in long_pdf
    assert call('data')[1]['data'] == report_case
    assert call('data','PUT',{'data':value,'version':current})[0] == 200
    current += 1
    # Editing a service keeps the old material movement and does not debit again.
    edited=deepcopy(value);edited['history'][-1]['notes']='Nachtrag zum Service'
    assert call('data','PUT',{'data':edited,'version':current})[0] == 200
    assert call('data')[1]['data']['inventory'][0]['quantity'] == 2.3
    print('PASS: new equipment, bicycle fields, multi-role contacts, stock migration, service journal integrity, PDF/CSV reports and concurrent saves.')
    return edited
