"""Provisioned, read-only dashboard. Instance selection uses validated registry IDs."""
import json,pathlib

def build_dashboard(instances,queries):
 instances=[item for item in instances if item['id']!='admin']
 panels=[]
 def panel(id,title,typ,query,x,y,w,h,unit='garagebytes',timeseries=False):
  p={'id':id,'type':typ,'title':title,'gridPos':{'h':h,'w':w,'x':x,'y':y},'datasource':{'type':'mysql','uid':'garage-metrics'},'targets':[{'refId':'A','datasource':{'type':'mysql','uid':'garage-metrics'},'rawSql':queries[query],'format':'time_series' if timeseries else 'table','rawQuery':True,'editorMode':'code'}],'fieldConfig':{'defaults':{'unit':unit,'color':{'mode':'palette-classic' if timeseries else 'thresholds'},'thresholds':{'mode':'absolute','steps':[{'color':'green','value':None},{'color':'orange','value':80 if unit=='percent' else 1073741824},{'color':'red','value':95 if unit=='percent' else 2147483648}]},'noValue':'Keine Messdaten'},'overrides':[]},'options':{'orientation':'horizontal' if typ=='bargauge' else 'auto','reduceOptions':{'calcs':['lastNotNull'],'fields':'','values':typ=='bargauge'},'displayMode':'gradient','showUnfilled':True}}
  if id==3:p['options'].update({'textMode':'value_and_name','graphMode':'none','reduceOptions':{'calcs':['lastNotNull'],'fields':'','values':True}})
  if unit=='percent':p['fieldConfig']['defaults'].update({'min':0,'max':100})
  if timeseries:p['options']={'legend':{'displayMode':'list','placement':'bottom','showLegend':True},'tooltip':{'mode':'multi'}}
  if title.startswith('Erreichbarkeit'):p['fieldConfig']['defaults'].update({'min':0,'max':1,'mappings':[{'type':'value','options':{'0':{'text':'Nicht erreichbar'},'1':{'text':'Erreichbar'}}}]})
  panels.append(p)
 panel(1,'Festplatten-Quota · gesamtes Konto','gauge',2,0,0,4,5,'percent')
 panel(2,'Arbeitsspeicher · gesamtes Konto','gauge',3,4,0,4,5,'percent')
 panel(3,'Erreichbare Instanzen · Auswahl','stat',4,8,0,4,5,'none')
 panel(4,'MariaDB · Auswahl','stat',5,12,0,6,5)
 panel(5,'Dateien · Auswahl','stat',6,18,0,6,5)
 panel(6,'Dateien je Instanz','bargauge',0,0,5,12,8)
 panel(7,'MariaDB je Instanz','bargauge',1,12,5,12,8)
 panel(8,'Dateien · Verlauf','timeseries',7,0,13,12,8,timeseries=True)
 panel(9,'MariaDB · Verlauf','timeseries',8,12,13,12,8,timeseries=True)
 panel(10,'Erreichbarkeit · Verlauf','timeseries',9,0,21,12,8,'none',True)
 panel(11,'MariaDB-Antwortzeit · Verlauf','timeseries',10,12,21,12,8,'ms',True)
 choices=[{'text':x['name'],'value':x['id'],'selected':False} for x in instances]
 variable={'name':'instanz','label':'Instanz','type':'custom','query':','.join(x['text']+' : '+x['value'] for x in choices),'options':[{'text':'Alle','value':'$__all','selected':True},*choices],'current':{'text':'Alle','value':'$__all','selected':True},'includeAll':True,'allValue':'__all__','multi':False,'hide':0,'skipUrlSync':False}
 return {'uid':'garage-monitor','title':'Gravelbike Garage · Instanzen','schemaVersion':39,'version':4,'editable':False,'refresh':'1m','time':{'from':'now-6h','to':'now'},'timezone':'browser','panels':panels,'templating':{'list':[variable]},'annotations':{'list':[]},'links':[]}
if __name__=='__main__':
 root=pathlib.Path(__file__).resolve().parent;queries=json.loads((root/'private/queries.json').read_text());print(json.dumps(build_dashboard([],queries),ensure_ascii=False))
