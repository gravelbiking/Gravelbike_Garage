<?php
declare(strict_types=1);
require $argv[1].'/backend.php';
function verify(bool $ok,string $message):void{if(!$ok)throw new RuntimeException($message);}
$settingsPath=gt_storage().'/strava-config.json';$savedSettings=is_file($settingsPath)?file_get_contents($settingsPath):null;
$states=gt_strava_accounts();$garage=gt_query('SELECT data,version FROM {{garage}} WHERE id=1')->fetch(PDO::FETCH_ASSOC);$events=gt_query('SELECT * FROM {{strava_events}}')->fetchAll(PDO::FETCH_ASSOC);
try{
 $legacy=gt_strava_config();verify($legacy!==null,'legacy fixture configured');
 $flowState=gt_strava_state(2);$flowState['flow']=['expires'=>time()-10,'attempt_id'=>'expired-test','request_id'=>str_repeat('b',32)];gt_strava_save($flowState);
 gt_strava_sync_accounts(null,fn()=>[]);gt_strava_sync_accounts(null,fn()=>[]);
 $expiry=[];foreach(glob(gt_log_directory().'/*.jsonl') as $file)foreach(file($file) as $line){$record=json_decode($line,true);if(($record['operation']??'')==='oauth.expired'&&($record['attempt_id']??'')==='expired-test')$expiry[]=$record;}
 verify(count($expiry)===1&&$expiry[0]['request_id']===str_repeat('b',32),'expired callback logs once with original correlation');

 $oldToken=gt_strava_token($legacy,['access_token'=>'legacy-access','refresh_token'=>'legacy-refresh','expires_at'=>time()+3600]);
 $document=gt_strava_settings_document();
 verify(!isset($document['connections'][1]['scope']),'legacy crypto domain is preserved');
 $document['connections'][2]=['client_id'=>'22222','client_secret'=>str_repeat('second-client-',3),'base_url'=>$legacy['base'],'scope'=>'connection-2-client-22222'];
 file_put_contents($settingsPath,json_encode($document,JSON_THROW_ON_ERROR));
 verify(gt_strava_config(1)===$legacy,'migration preserves connection one config');
 verify(gt_strava_token(gt_strava_config(1),$oldToken)['refresh_token']==='legacy-refresh','migration preserves first token decryption');
 $second=gt_strava_config(2);verify($second['id']==='22222'&&$second['secret']!==$legacy['secret'],'distinct clients');
 $one=['account'=>1,'owner'=>'601','name'=>'One','token'=>$oldToken,'maps'=>[],'rides'=>[],'dates'=>[],'gear'=>[],'lastScan'=>0,'lastSync'=>0,'retry'=>0,'error'=>''];
 $two=['account'=>2,'owner'=>'602','name'=>'Two','token'=>gt_strava_token($second,['access_token'=>'two-access','refresh_token'=>'two-refresh','expires_at'=>time()-10]),'maps'=>[],'rides'=>[],'dates'=>[],'gear'=>[],'lastScan'=>0,'lastSync'=>0,'retry'=>0,'error'=>''];
 gt_strava_save($one);gt_strava_save($two);
 $refreshes=[];
 $renew=function($path,$token,$form)use(&$refreshes,$second):array{verify($path==='/oauth/token'&&$form['client_id']===$second['id']&&$form['client_secret']===$second['secret']&&$form['refresh_token']==='two-refresh','refresh uses only the second client credentials');$refreshes[]=$form;return ['access_token'=>'two-renewed','refresh_token'=>'two-rotated','expires_at'=>time()+3600];};
 verify(gt_strava_access($second,$two,$renew)==='two-renewed'&&count($refreshes)===1,'second token renewal');
 verify(gt_strava_state(1)===$one,'renewal leaves first account untouched');
 try{gt_strava_token($legacy,$two['token']);throw new LogicException('Cross-client decryption must fail');}catch(RuntimeException $e){}
 $before=gt_strava_state(1);$callback=$second['base'].'/api.php/strava-webhook/'.gt_strava_key($second,'callback');
 gt_strava_register($second,$two,fn($path,$token=null,$form=null)=>str_contains($path,'?')?[]:['id'=>202,'callback_url'=>$callback]);
 verify(gt_strava_state(1)===$before&&!isset(gt_strava_state(1)['subscription']),'second webhook registration leaves first subscription unchanged');
 verify(gt_strava_state(2)['subscription']==='202','own subscription retained');
 verify(gt_strava_key($legacy,'callback')!==gt_strava_key($second,'callback'),'independent webhook keys');
 $equalSecret=['id'=>'22222','secret'=>$legacy['secret'],'base'=>$legacy['base'],'scope'=>'connection-2-client-22222'];
 verify(gt_strava_key($legacy,'token')!==gt_strava_key($equalSecret,'token'),'crypto isolation also holds if secrets accidentally match');
 $day=gt_strava_day();
 $one['token']=gt_strava_token($legacy,['access_token'=>'one-access','refresh_token'=>'one-refresh','expires_at'=>time()-10]);
 $one['maps']=['b501'=>['bike'=>'independent-a','from'=>$day]];$one['from']=$day;$one['scanRequested']=true;
 $two['maps']=['b502'=>['bike'=>'independent-b','from'=>$day]];$two['from']=$day;$two['scanRequested']=true;
 gt_strava_save($one);gt_strava_save($two);
 gt_query('DELETE FROM {{strava_events}}');
 gt_query('UPDATE {{garage}} SET data=? WHERE id=1',[json_encode(['bikes'=>[['id'=>'independent-a','km'=>10],['id'=>'independent-b','km'=>20]]])]);
 $meters=2500;
 $request=function($path,$token,$form=null,$missing=false)use($legacy,$second,$day,&$meters):array{
  if($path==='/oauth/token'){verify($form['client_id']===$legacy['id']&&$form['client_secret']===$legacy['secret'],'first refresh keeps own credentials');throw new RuntimeException('First client unavailable',401);}
  verify($token==='two-renewed','second sync uses second token');
  if($path==='/api/v3/athlete')return ['id'=>602,'bikes'=>[['id'=>'b502','name'=>'Two bike']]];
  parse_str(parse_url($path,PHP_URL_QUERY)??'',$q);
  return ($q['page']??'')==='1'?[['id'=>777,'sport_type'=>'Ride','gear_id'=>'b502','distance'=>$meters,'start_date'=>$day.'T08:00:00Z','start_date_local'=>$day.'T09:00:00']]:[];
 };
 try{gt_strava_sync_accounts(null,$request);throw new LogicException('Expected failure of connection one');}catch(RuntimeException $e){verify(str_contains($e->getMessage(),'Verbindung 1'),'failure scoped to first client');}
 $current=json_decode(gt_query('SELECT data FROM {{garage}} WHERE id=1')->fetchColumn(),true);
 verify($current['bikes'][0]['km']===10&&$current['bikes'][1]['km']==22.5,'second sync succeeds while first refresh fails');
 verify(gt_strava_state(2)['error']===''&&gt_strava_state(1)['retry']>time(),'independent retry limits');
 $lock=gt_strava_lock(1);verify((bool)$lock,'test lock');
 try{$two=gt_strava_state(2);$two['scanRequested']=true;gt_strava_save($two);$meters=4500;gt_strava_sync_accounts(null,$request);}finally{flock($lock,LOCK_UN);fclose($lock);}
 $current=json_decode(gt_query('SELECT data FROM {{garage}} WHERE id=1')->fetchColumn(),true);
 verify($current['bikes'][1]['km']==24.5,'busy first client does not block second and correction is not duplicated');
 $before=gt_strava_state(1);$two=gt_strava_state(2);gt_strava_clear($two);
 verify(gt_strava_state(1)===$before,'clearing second client leaves first byte-for-byte unchanged');
 // The second connection must also work if no first API application is configured.
 $document['connections'][1]=[];file_put_contents($settingsPath,json_encode($document));
 verify(gt_strava_config(1)===null&&gt_strava_config(2)!==null,'second application does not depend on the first configuration');
 $two=gt_strava_state(2);$two['owner']='602';$two['from']=$day;$two['token']=gt_strava_token($second,['access_token'=>'two-renewed','refresh_token'=>'two-rotated','expires_at'=>time()+3600]);$two['scanRequested']=true;gt_strava_save($two);
 gt_strava_sync_accounts(null,$request);verify(gt_strava_state(2)['lastSync']>0&&gt_strava_state(2)['error']==='','worker operates second connection with no first API credentials');
 echo "PASS independent Strava applications: legacy migration, separate secrets and crypto domains, token refresh, webhook registration, failure/retry/lock isolation and disconnection.\n";
}finally{
 if($savedSettings===null)unlink($settingsPath);else file_put_contents($settingsPath,$savedSettings);
 foreach($states as $state)gt_strava_save($state);
 gt_query('DELETE FROM {{strava_events}}');foreach($events as $e)gt_query('INSERT INTO {{strava_events}}(account_id,object_id,marker) VALUES(?,?,?)',[$e['account_id'],$e['object_id'],$e['marker']]);
 gt_query('UPDATE {{garage}} SET data=?,version=? WHERE id=1',[$garage['data'],$garage['version']]);
}
