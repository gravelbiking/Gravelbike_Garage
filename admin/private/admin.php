<?php
declare(strict_types=1);
require __DIR__.'/core/backend.php';
require __DIR__.'/monitoring.php';
function ga_config():array{return gt_config()['admin'];}
function ga_init():void{
 gt_db()->exec('CREATE TABLE IF NOT EXISTS ga_state(id TINYINT PRIMARY KEY,data MEDIUMTEXT NOT NULL) ENGINE=InnoDB');
 gt_db()->exec("INSERT IGNORE INTO ga_state VALUES(1,'{}')");
 gt_db()->exec('CREATE TABLE IF NOT EXISTS ga_attempts(k CHAR(64) PRIMARY KEY,n INT NOT NULL,until_at BIGINT NOT NULL) ENGINE=InnoDB');
 $path=gt_storage().'/sessions';if(!is_dir($path))mkdir($path,0700,true);
 ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');ini_set('session.gc_maxlifetime','7200');
 session_save_path($path);session_name('garage_admin');session_set_cookie_params(['lifetime'=>0,'path'=>ga_config()['base_path'].'/','secure'=>!gt_dev(),'httponly'=>true,'samesite'=>'Strict']);session_start();
 if(!isset($_SESSION['csrf']))$_SESSION['csrf']=bin2hex(random_bytes(32));
 foreach(['enrollment','login'] as $k)if(isset($_SESSION[$k])&&$_SESSION[$k]['expires']<time())unset($_SESSION[$k]);
}
function ga_state(bool $lock=false):array{return json_decode(gt_db()->query('SELECT data FROM ga_state WHERE id=1'.($lock?' FOR UPDATE':''))->fetchColumn(),true,64,JSON_THROW_ON_ERROR);}
function ga_save(array $s):void{$q=gt_db()->prepare('UPDATE ga_state SET data=? WHERE id=1');$q->execute([json_encode($s,JSON_THROW_ON_ERROR)]);}
function ga_error(string $message,int $status=400):never{gt_json(['error'=>$message],$status);}
function ga_authenticated(array $s):bool{return isset($s['passwordHash'],$s['credentials'])&&count($s['credentials'])>0&&($_SESSION['until']??0)>time()&&isset($_SESSION['auth'])&&hash_equals($_SESSION['auth'],hash('sha256',$s['passwordHash']));}
function ga_require(array $s,bool $recent=false):void{if(!ga_authenticated($s))ga_error('Bitte mit Passwort und Passkey / YubiKey anmelden.',401);if($recent&&($_SESSION['verifiedAt']??0)<time()-300)gt_json(['error'=>'Bitte diese Verwaltungsaktion erneut mit Passkey / YubiKey bestätigen.','reauthRequired'=>true],403);}
function ga_limit():void{
 $key=hash('sha256',$_SERVER['REMOTE_ADDR']??'unknown');$q=gt_db()->prepare('SELECT n,until_at FROM ga_attempts WHERE k=?');$q->execute([$key]);$r=$q->fetch(PDO::FETCH_ASSOC);if($r&&$r['until_at']>time()&&$r['n']>=5)ga_error('Zu viele Versuche. Bitte zehn Minuten warten.',429);
 $q=gt_db()->prepare('INSERT INTO ga_attempts VALUES(?,1,?) ON DUPLICATE KEY UPDATE n=IF(until_at<? ,1,n+1),until_at=IF(until_at<? ,VALUES(until_at),until_at)');$q->execute([$key,time()+600,time(),time()]);
}
function ga_clear_attempts():void{$q=gt_db()->prepare('DELETE FROM ga_attempts WHERE k=?');$q->execute([hash('sha256',$_SERVER['REMOTE_ADDR']??'unknown')]);}
function ga_lib():lbuchs\WebAuthn\WebAuthn{return new lbuchs\WebAuthn\WebAuthn('Gravelbike Garage Admin',gt_mfa_rp(),['none'],true);}
function ga_session(array $s):void{session_regenerate_id(true);$_SESSION=['csrf'=>bin2hex(random_bytes(32)),'auth'=>hash('sha256',$s['passwordHash']),'until'=>time()+7200,'verifiedAt'=>time()];}
function ga_worker(string $action,array $args=[]):array{
 $args['request_id']=gt_log_id();
 $cmd=[ga_config()['python'],__DIR__.'/worker.py',$action];$p=proc_open($cmd,[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);if(!is_resource($p))throw new RuntimeException('Verwaltungsdienst nicht erreichbar.');
 fwrite($pipes[0],json_encode($args,JSON_THROW_ON_ERROR));fclose($pipes[0]);$out=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);$rc=proc_close($p);$r=json_decode($out,true);
 if($rc!==0||!is_array($r)||!($r['ok']??false))throw new RuntimeException(is_array($r)?($r['error']??'Verwaltungsaktion fehlgeschlagen.'):'Verwaltungsaktion fehlgeschlagen. Privates Protokoll prüfen.');return $r;
}
function ga_client(array $c):string{$json=gt_unb64($c['clientDataJSON']??null);gt_mfa_client($json);return $json;}
function ga_proxy(array $s):never{
 ga_require($s);header('X-Frame-Options: SAMEORIGIN');$path=$_GET['path']??'';if(!is_string($path)||strlen($path)>1000||preg_match('/[\\\\%\x00-\x20]/',$path)||str_contains($path,'..'))ga_error('Ungültiger Monitoring-Pfad.');
 $method=$_SERVER['REQUEST_METHOD'];
 $allowed=$path===''||preg_match('~^(?:public/|d/garage-monitor(?:/|$)|d-solo/garage-monitor(?:/|$))~',$path)||in_array($path,['api/frontend/settings','api/dashboards/uid/garage-monitor','api/datasources','api/plugins/mysql/settings','api/plugins/garage-sizeunits-app/settings','api/user','api/user/preferences','api/org','api/org/preferences','api/access-control/user/permissions','api/annotations','api/health','api/login/ping','api/prometheus/grafana/api/v1/rules','apis/dashboard.grafana.app/','apis/dashboard.grafana.app/v2/namespaces/default/dashboards/garage-monitor/dto','apis/dashboard.grafana.app/v2beta1/namespaces/default/dashboards/garage-monitor/dto','apis/dashboard.grafana.app/v1beta1/namespaces/default/dashboards/garage-monitor/dto','apis/preferences.grafana.app/v1/namespaces/default/preferences/merged'],true);
 if($method==='GET'&&preg_match('~^apis/userstorage\.grafana\.app/v0alpha1/namespaces/default/user-storage/grafana-page-history:[a-z0-9]+$~D',$path)&&$path==='apis/userstorage.grafana.app/v0alpha1/namespaces/default/user-storage/grafana-page-history:'.ga_grafana_uid())$allowed=true;
 $body=null;$upstreamContentType='application/json';if($method==='POST'&&$path==='api/ds/query'){
  gt_origin();$b=gt_body();$queries=$b['queries']??[];$sql=json_decode(file_get_contents(__DIR__.'/queries.json'),true,8,JSON_THROW_ON_ERROR);if(!is_array($queries)||count($queries)>10)ga_error('Ungültige Monitoring-Abfrage.');
  $registry=json_decode(file_get_contents((ga_config()['registry_path']??dirname(gt_storage()).'/registry.json')),true,32,JSON_THROW_ON_ERROR);$ids=array_column($registry,'id');foreach($queries as $q)if(($q['datasource']['uid']??'')!=='garage-metrics'||!is_string($q['rawSql']??null)||!ga_monitor_sql_allowed($q['rawSql'],$sql,$ids))ga_error('Diese Monitoring-Abfrage ist nicht freigegeben.',403);
  foreach(['from','to'] as $k)if(!is_string($b[$k]??null)||!preg_match('/^\d{10,16}$/D',$b[$k]))ga_error('Ungültiger Zeitraum.');
  $clean=[];foreach($queries as $i=>$q)$clean[]=['refId'=>preg_match('/^[A-Za-z0-9_]{1,20}$/D',(string)($q['refId']??''))?$q['refId']:'Q'.$i,'datasource'=>['uid'=>'garage-metrics','type'=>'mysql'],'rawSql'=>$q['rawSql'],'format'=>($q['format']??'')==='time_series'?'time_series':'table','rawQuery'=>true,'editorMode'=>'code','intervalMs'=>60000,'maxDataPoints'=>1000];$body=json_encode(['queries'=>$clean,'from'=>$b['from'],'to'=>$b['to']],JSON_THROW_ON_ERROR);$allowed=true;
 }elseif(in_array($method,['POST','PATCH'],true)&&str_starts_with($path,'apis/userstorage.grafana.app/v0alpha1/namespaces/default/user-storage/')){gt_origin();$clean=ga_grafana_history_body($method,$path,gt_body(),ga_grafana_uid());$body=json_encode($clean,JSON_THROW_ON_ERROR);if($method==='PATCH')$upstreamContentType='application/merge-patch+json';$allowed=true;}elseif($method==='POST'&&$path==='ofrep/v1/evaluate/flags'){gt_origin();$body='{}';$allowed=true;}elseif($method==='POST'&&$path==='api/frontend-metrics'){gt_origin();http_response_code(204);exit;}elseif($method!=='GET')ga_error('Monitoring ist nur lesend.',403);
 if(!$allowed)ga_error('Monitoring-Endpunkt nicht freigegeben.',403);
 $query=$_SERVER['QUERY_STRING']??'';parse_str($query,$params);unset($params['route'],$params['path']);$url='http://127.0.0.1:'.ga_config()['grafana_port'].ga_config()['base_path'].'/grafana/'.$path.($params?'?'.http_build_query($params):'');
 $ch=curl_init($url);curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_ENCODING=>'',CURLOPT_CONNECTTIMEOUT=>3,CURLOPT_TIMEOUT=>30,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_HTTPHEADER=>['X-Garage-Admin: garage-monitor','Host: '.parse_url(gt_mfa_origin(),PHP_URL_HOST),'X-Forwarded-Proto: '.parse_url(gt_mfa_origin(),PHP_URL_SCHEME),'Content-Type: '.$upstreamContentType],CURLOPT_CUSTOMREQUEST=>$method]);if($body!==null)curl_setopt($ch,CURLOPT_POSTFIELDS,$body);
 $response=curl_exec($ch);$status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);$type=curl_getinfo($ch,CURLINFO_CONTENT_TYPE);if($response===false||$status>=400||!$status)gt_log('error','external-api','Monitoring-Anfrage fehlgeschlagen.',['module'=>'admin','provider'=>'grafana','operation'=>$path,'http_status'=>$status,'method'=>$method]);if($response===false||!$status)ga_error('Grafana ist gerade nicht erreichbar.',503);http_response_code($status);header('Content-Type: '.($type?:'application/octet-stream'));if(str_starts_with(strtolower($type?:''),'text/html')){$nonce=bin2hex(random_bytes(24));$response=ga_grafana_html($response,$nonce);header("Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-".$nonce."' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");}echo $response;exit;
}
function ga_route():never{
 gt_require_https();gt_headers();header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
 ga_init();$route=$_GET['route']??'status';$method=$_SERVER['REQUEST_METHOD'];gt_log_context(['module'=>'admin','route'=>is_string($route)?explode('/',$route)[0]:'invalid','method'=>$method]);$s=ga_state();
 if($route==='grafana')ga_proxy($s);
 if($method==='POST'){
  gt_origin();$body=gt_body();if(!is_string($body['csrf']??null)||!hash_equals($_SESSION['csrf'],$body['csrf']))ga_error('Sicherheitsfreigabe abgelaufen. Bitte neu laden.',403);
 }else{$body=[];}
 if($route==='status'&&$method==='GET'){
  if(!isset($s['passwordHash']))unset($_SESSION['enrollment'],$_SESSION['register']);
  gt_json(['setup'=>!isset($s['passwordHash']),'authenticated'=>ga_authenticated($s),'csrf'=>$_SESSION['csrf'],'username'=>ga_authenticated($s)?$s['username']:null,'basePath'=>ga_config()['base_path']]);
 }
 if($method!=='POST')ga_error('Nicht gefunden.',404);
 if($route==='setup/cancel'){unset($_SESSION['enrollment'],$_SESSION['register']);gt_json(['ok'=>true]);}
 if($route==='setup/start'){
  if(isset($s['passwordHash']))ga_error('Admin ist bereits eingerichtet.',409);ga_limit();
  if(!is_string($body['key']??null)||!hash_equals(hash('sha256',gt_config()['installation_key']),hash('sha256',$body['key'])))ga_error('Installationsschlüssel ungültig.',403);
  $name=$body['username']??'';if(!is_string($name)||!preg_match('/^[\p{L}\p{N}_.@-]{3,80}$/uD',$name))ga_error('Benutzername: 3–80 Zeichen, Buchstaben, Zahlen, Punkt, @, _ oder -.');if($error=gt_password_error($body['password']??null))ga_error($error);
  unset($_SESSION['register']);$_SESSION['enrollment']=['username'=>$name,'passwordHash'=>password_hash($body['password'],defined('PASSWORD_ARGON2ID')?PASSWORD_ARGON2ID:PASSWORD_DEFAULT),'expires'=>time()+300,'userId'=>bin2hex(random_bytes(32))];gt_json(['ok'=>true]);
 }
 if($route==='setup/options'||$route==='keys/options'){
  if($route==='keys/options')ga_require($s,true);else if(isset($s['passwordHash'])||!isset($_SESSION['enrollment']))ga_error('Einrichtung abgelaufen. Bitte neu beginnen.',409);
  $e=$route==='keys/options'?$s:$_SESSION['enrollment'];$lib=ga_lib();$opts=$lib->getCreateArgs(hex2bin($e['userId']),$e['username'],$e['username'],120,'preferred',true,($body['hardware']??false)?true:null,array_map(fn($k)=>gt_unb64($k['id']),$s['credentials']??[]));
  $_SESSION['register']=['challenge'=>gt_b64($lib->getChallenge()->getBinaryString()),'expires'=>time()+180,'setup'=>$route==='setup/options'];gt_json(['options'=>$opts]);
 }
 if($route==='setup/finish'||$route==='keys/finish'){
  $flow=$_SESSION['register']??null;unset($_SESSION['register']);$setup=$route==='setup/finish';if(!$flow||$flow['expires']<time()||$flow['setup']!==$setup)ga_error('Passkey-Anfrage abgelaufen.');
  if(!$setup)ga_require($s,true);elseif(isset($s['passwordHash'])||!isset($_SESSION['enrollment']))ga_error('Einrichtung abgelaufen. Bitte neu beginnen.',409);
  $c=$body['credential']??[];$lib=ga_lib();$r=$lib->processCreate(ga_client($c),gt_unb64($c['attestationObject']??null),gt_unb64($flow['challenge']),true,true,false);
  if(!hash_equals(gt_b64($r->credentialId),$c['id']??''))ga_error('Passkey-ID ist inkonsistent.');
  $credential=['id'=>gt_b64($r->credentialId),'publicKey'=>$r->credentialPublicKey,'counter'=>$r->signatureCounter??0,'name'=>substr((string)($body['name']??'Passkey / YubiKey'),0,100),'created'=>date('c')];
  $db=gt_db();$db->beginTransaction();try{$locked=ga_state(true);if($setup){if(isset($locked['passwordHash']))throw new RuntimeException('Die Einrichtung wurde bereits abgeschlossen.');$e=$_SESSION['enrollment'];$locked=['username'=>$e['username'],'passwordHash'=>$e['passwordHash'],'userId'=>$e['userId'],'credentials'=>[]];}elseif(!ga_authenticated($locked))throw new RuntimeException('Bitte erneut anmelden.');
  if(count($locked['credentials'])>=10)throw new RuntimeException('Maximal zehn Schlüssel.');foreach($locked['credentials'] as $key)if($key['id']===$credential['id'])throw new RuntimeException('Schlüssel bereits vorhanden.');$locked['credentials'][]=$credential;ga_save($locked);$db->commit();}catch(Throwable $error){if($db->inTransaction())$db->rollBack();throw $error;}
  ga_session($locked);ga_clear_attempts();gt_json(['ok'=>true,'csrf'=>$_SESSION['csrf']]);
 }
 if($route==='login'){
  ga_limit();$valid=is_string($body['password']??null)&&password_verify($body['password'],$s['passwordHash']??'$2y$10$.....................................................');if(!$valid||!is_string($body['username']??null)||!hash_equals($s['username']??'', $body['username']))ga_error('Benutzername oder Passwort falsch.',401);
  unset($_SESSION['auth']);$_SESSION['login']=['expires'=>time()+180,'hash'=>hash('sha256',$s['passwordHash'])];gt_json(['mfaRequired'=>true]);
 }
 if($route==='login/options'||$route==='reauth/options'){
  if($route==='reauth/options')ga_require($s);elseif(!isset($_SESSION['login']))ga_error('Bitte zuerst Benutzername und Passwort eingeben.',401);
  $lib=ga_lib();$opts=$lib->getGetArgs(array_map(fn($c)=>gt_unb64($c['id']),$s['credentials']),120,true,true,true,true,true,true);$_SESSION['assert']=['challenge'=>gt_b64($lib->getChallenge()->getBinaryString()),'expires'=>time()+180,'reauth'=>$route==='reauth/options'];gt_json(['options'=>$opts]);
 }
 if($route==='login/finish'||$route==='reauth/finish'){
  ga_limit();$flow=$_SESSION['assert']??null;unset($_SESSION['assert']);$reauth=$route==='reauth/finish';if(!$flow||$flow['expires']<time()||$flow['reauth']!==$reauth)ga_error('Anfrage abgelaufen.');if($reauth)ga_require($s);elseif(!isset($_SESSION['login'])||!hash_equals($_SESSION['login']['hash'],hash('sha256',$s['passwordHash']??'')))ga_error('Bitte erneut anmelden.',401);
  $c=$body['credential']??[];$db=gt_db();$db->beginTransaction();try{$locked=ga_state(true);$index=null;foreach($locked['credentials'] as $i=>$key)if($key['id']===($c['id']??''))$index=$i;if($index===null)throw new RuntimeException('Unbekannter Passkey.');$key=$locked['credentials'][$index];$lib=ga_lib();$lib->processGet(ga_client($c),gt_unb64($c['authenticatorData']??null),gt_unb64($c['signature']??null),$key['publicKey'],gt_unb64($flow['challenge']),$key['counter'],true,true);$locked['credentials'][$index]['counter']=$lib->getSignatureCounter()??0;ga_save($locked);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
  ga_session($locked);ga_clear_attempts();gt_json(['ok'=>true,'csrf'=>$_SESSION['csrf']]);
 }
 if($route==='logout'){$_SESSION=[];session_destroy();gt_json(['ok'=>true]);}
 ga_require($s,in_array($route,['create','delete','key','reset-password','unlock'],true));
 if($route==='client-error'){
  $entries=$body['entries']??[];if(!is_array($entries)||count($entries)>25)ga_error('Ungültiger Fehlerbericht.');
  foreach($entries as $e){if(!is_array($e)||!in_array($e['kind']??'', ['Error','TypeError','SyntaxError','TimeoutError','AbortError'],true))ga_error('Ungültiger Fehlerbericht.');
   if(!gt_log('error','frontend',($e['kind']??'Error').' in der Administration.',['module'=>'admin','request_id'=>$e['requestId']??gt_log_id(),'operation'=>substr((string)($e['context']??'admin'),0,40),'error_type'=>$e['kind'],'http_status'=>(int)($e['httpStatus']??0),'stack'=>is_array($e['stack']??null)?array_slice(array_filter($e['stack'],'is_string'),0,12):[],'first_seen'=>isset($e['at'])?gmdate('c',min(time(),(int)($e['at']/1000))):gmdate('c'),'count'=>max(1,min(1000000,(int)($e['count']??1)))]))ga_error('Fehlerprotokoll nicht verfügbar.',503);}
  gt_json(['ok'=>true]);
 }
 if($route==='keys'){gt_json(['keys'=>array_map(fn($k)=>array_intersect_key($k,array_flip(['name','created'])),$s['credentials'])]);}
 if(in_array($route,['snapshot','logs','create','delete','key','reset-password','unlock'],true)){
  $args=['actor'=>$s['username']];foreach(['id','name','confirmation','log','module','source','level','query','correlation','from','to','offset','limit'] as $key)if(isset($body[$key])){if(!is_string($body[$key])||strlen($body[$key])>200)ga_error('Ungültige Eingabe.');$args[$key]=$body[$key];}
  if(isset($args['correlation'])){$args['request_id_filter']=$args['correlation'];unset($args['correlation']);}
  if(isset($body['export'])){if(!is_bool($body['export']))ga_error('Ungültiger Export.');$args['export']=$body['export'];}
  $result=ga_worker($route,$args);gt_json($result);
 }
 ga_error('Nicht gefunden.',404);
}
