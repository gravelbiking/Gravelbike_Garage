"""Read only registry-bound structured logs. No user-supplied filesystem paths."""
import datetime,heapq,json,os,pathlib,re,stat,urllib.parse
NAME=re.compile(r'([a-z][a-z0-9_-]{0,39})--([a-z][a-z0-9_-]{0,39})--\d{4}-\d{2}-\d{2}(?:-\d+)?\.jsonl\Z')
LEVELS={'info','warning','error','critical'}
def text_safe(value):
 text=str(value)
 text=re.sub(r'(?i)https?://[^\s<>"\x27]+','[URL]',text)
 text=re.sub(r'(?i)\bBearer\s+\S+','Bearer [REDACTED]',text)
 text=re.sub(r'(?i)\b(?:password|secret|client_secret|access_token|refresh_token|cookie|installation_key|code|state|session)["\x27]?\s*[:=]\s*["\x27]?[^\s,;&"\x27]+','[REDACTED]',text)
 text=re.sub(r'(?i)\b(?:ghp_|github_pat_)[A-Za-z0-9_]+|\b[a-f0-9]{32,}\b','[REDACTED]',text)
 text=re.sub(r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}','[EMAIL]',text,flags=re.I)
 return text[:1500]

def regular(path):
 st=path.lstat()
 if not stat.S_ISREG(st.st_mode) or st.st_uid!=os.getuid():raise ValueError('Unsichere Protokolldatei.')
 return st

def timestamp(value):
 if not value:return None
 if not isinstance(value,str) or len(value)>40:raise ValueError('Ungültiger Zeitraum.')
 try:
  parsed=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
  if parsed.tzinfo is None:raise ValueError()
  return parsed.timestamp()
 except ValueError:raise ValueError('Zeitraum muss einen Zeitstempel mit Zeitzone enthalten.')

def read_logs(shared,options):
 shared=pathlib.Path(shared);directory=shared/'logs'
 module=options.get('module','');source=options.get('source','');level=options.get('level','');query=options.get('query','');request=options.get('request_id_filter',options.get('correlation',''))
 for value in [module,source,level,query,request]:
  if not isinstance(value,str) or len(value)>200:raise ValueError('Ungültiger Protokollfilter.')
 for value in [module,source]:
  if value and not re.fullmatch('[a-z][a-z0-9_-]{0,39}',value):raise ValueError('Ungültige Protokollquelle.')
 if level and level not in LEVELS:raise ValueError('Ungültiger Schweregrad.')
 start=timestamp(options.get('from',''));end=timestamp(options.get('to',''))
 if start is not None and end is not None and start>end:raise ValueError('Ungültiger Zeitraum.')
 try:offset=int(options.get('offset',0));limit=int(options.get('limit',100))
 except (TypeError,ValueError):raise ValueError('Ungültige Seitenauswahl.')
 if not 0<=offset<=10000 or not 1<=limit<=500:raise ValueError('Ungültige Seitenauswahl.')
 export=options.get('export',False)
 if not isinstance(export,bool):raise ValueError('Ungültiger Export.')
 result={'ok':True,'entries':[],'total':0,'offset':offset,'limit':limit,'has_more':False,'modules':[],'sources':[],'truncated':False,'logger':None}
 marker=shared/'data/logging-status.json'
 if marker.exists():
  regular(marker)
  if marker.stat().st_size<4096:
   try:
    health=json.loads(marker.read_text());result['logger']={'healthy':health.get('healthy') is True,'checked_at':str(health.get('checked_at',''))[:40],'error':text_safe(health.get('error',''))}
   except (ValueError,AttributeError):result['logger']={'healthy':False,'error':'Logger-Status ist beschädigt.'}
 if directory.is_symlink():raise ValueError('Unsicheres Protokollverzeichnis.')
 if not directory.exists():result['text']='Noch keine strukturierten Protokolle vorhanden.';return result
 if directory.stat().st_uid!=os.getuid():raise ValueError('Unsicheres Protokollverzeichnis.')
 files=[];modules=set();sources=set()
 for path in directory.iterdir():
  match=NAME.fullmatch(path.name)
  if not match:continue
  regular(path);modules.add(match[1]);sources.add(match[2])
  if (not module or module==match[1]) and (not source or source==match[2]):files.append(path)
 result['modules']=sorted(modules);result['sources']=sorted(sources)
 heap=[];count=0;budget=50*1024*1024;seen_bytes=0;keep=1000 if export else offset+limit+1
 for path in sorted(files,key=lambda p:p.stat().st_mtime,reverse=True):
  with path.open('rb') as f:
   while True:
    raw=f.readline(65537)
    if not raw:break
    seen_bytes+=len(raw)
    if seen_bytes>budget:result['truncated']=True;break
    if len(raw)>65536 or not raw.endswith(b'\n'):result['truncated']=True;continue
    try:
     record=json.loads(raw)
     stamp=timestamp(record.get('timestamp'))
     if stamp is None:raise ValueError()
    except (ValueError,TypeError,AttributeError):result['truncated']=True;continue
    if level and record.get('level')!=level:continue
    if start is not None and stamp<start or end is not None and stamp>end:continue
    if request and record.get('request_id')!=request:continue
    # Whitelist the schema again; malformed or injected fields never become exports.
    allowed={'timestamp','instance','version','release_name','level','module','source','request_id','http_request_id','message','operation','route','method','provider','provider_field','provider_resource','error_type','error_code','client_id','previous_client_id','connection','http_status','file','line','attempt_id','expires_at','count','first_seen','last_seen','reason','redirect_uri','base_url','previous_base_url','stack'}
    clean={}
    for key,value in record.items():
     if key not in allowed:continue
     if key=='stack':
      if isinstance(value,list):clean[key]=[text_safe(x)[:240] for x in value[:12] if isinstance(x,str)]
     elif isinstance(value,(bool,int,float)) or value is None:clean[key]=value
     elif isinstance(value,str):
      if key in ['request_id','http_request_id']:
       if re.fullmatch(r'[A-Za-z0-9_-]{1,96}',value):clean[key]=value
      elif key in ['redirect_uri','base_url','previous_base_url']:
       try:
        parsed=urllib.parse.urlsplit(value)
        if parsed.scheme in ['http','https'] and parsed.hostname:
         clean[key]=urllib.parse.urlunsplit((parsed.scheme,parsed.hostname+(':'+str(parsed.port) if parsed.port else ''),parsed.path,'',''))[:600]
       except ValueError:pass
      else:clean[key]=text_safe(value)
    record=clean
    if query and query.casefold() not in json.dumps(record,ensure_ascii=False).casefold():continue
    count+=1;item=(stamp,count,record)
    if len(heap)<keep:heapq.heappush(heap,item)
    elif item[:2]>heap[0][:2]:heapq.heapreplace(heap,item)
   if seen_bytes>budget:break
 rows=[entry[2] for entry in sorted(heap,reverse=True)]
 result['total']=count;result['entries']=rows[:1000] if export else rows[offset:offset+limit]
 result['has_more']=count>offset+limit
 if export and count>1000:result['truncated']=True
 output=[];kept=[];length=0
 for record in result['entries']:
  line=json.dumps(record,ensure_ascii=False,sort_keys=True)
  length+=len(line.encode('utf-8'))+1
  if length>(1024*1024 if export else 4*1024*1024):result['truncated']=True;break
  output.append(line);kept.append(record)
 result['entries']=kept
 result['text']='\n'.join(output)
 if not result['entries']:result['text']='Keine passenden Protokolleinträge. Filter oder Zeitraum anpassen.'
 if result['truncated']:result['text']+='\n[Hinweis: Lese-/Exportgrenze oder unvollständige Zeile erreicht; Zeitraum weiter eingrenzen.]'
 result['download_name']='garage-errors-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.txt'
 return result
