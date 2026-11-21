<?php
declare(strict_types=1);
$root=$argv[2]??sys_get_temp_dir().'/garage-log-'.bin2hex(random_bytes(5));
if(!is_dir($root))mkdir($root,0700,true);
$configuration=['installation_name'=>'Testgarage','storage_path'=>$root.'/data','database'=>['password'=>'never-log-this-password'],'installation_key'=>'private-installation-key','strava'=>['client_secret'=>'private-client-secret'],'logging'=>['max_file_bytes'=>65536,'max_total_bytes'=>131072,'retention_days'=>7]];
if(!is_dir($root.'/data'))mkdir($root.'/data',0700);
function gt_config():array{return $GLOBALS['configuration'];}
function gt_storage():string{return $GLOBALS['root'].'/data';}
require dirname(__DIR__).'/selfhost/logging.php';
function verify($condition,$message){if(!$condition)throw new RuntimeException($message);}
if(($argv[1]??'')==='writer'){
 $configuration['logging']['max_total_bytes']=20*1024*1024;
 for($i=0;$i<50;$i++)verify(gt_log('error','backend','Concurrent diagnostic',['module'=>'workshop','count'=>$i]),'writer failed');exit;
}
if(($argv[1]??'')==='unhandled'){gt_log_install();trigger_error('password=never-log-this-password',E_USER_WARNING);throw new RuntimeException('secret=private-client-secret');}
try{
 verify(gt_log_level()==='info','default logging level');
 verify(gt_log('debug','backend','hidden debug'),'filtered debug success');
 verify(!(glob($root.'/logs/*.jsonl')?:[]),'debug disabled by default');
 file_put_contents($root.'/data/logging-level.json','{"level":"debug"}');
 verify(gt_log_level()==='debug','instance debug override');
 verify(gt_log('debug','backend','Diagnostic test',['module'=>'bikes']),'debug logging');
 $debugFiles=glob($root.'/logs/*.jsonl');verify(count($debugFiles)===1,'debug file');
 verify(json_decode(trim(file_get_contents($debugFiles[0])),true)['level']==='debug','debug severity retained');
 unlink($debugFiles[0]);unlink($root.'/data/logging-level.json');
 verify(gt_log_diagnostic('bike.basics.invalid')==='Bitte zuerst die Fahrrad-Grunddaten prüfen.','known safe diagnostic');
 verify(gt_log_diagnostic('password=private')===null,'untrusted diagnostics rejected');
 verify(gt_log_level()==='info','override removed');
 verify(gt_log('error','external-api','Failure password=never-log-this-password Bearer top-secret-token code=secret-code state=private-state https://user:pass@example.org/x?secret=abc',['module'=>'strava','connection'=>2,'client_id'=>'295633','error_code'=>'invalid','provider_field'=>'redirect_uri','redirect_uri'=>'https://user:pass@example.org/api.php/callback?code=secret-code&state=private-state','request_id'=>'1234567890abcdef1234567890abcdef','password'=>'never-log-this-password','response_body'=>'PRIVATE DOCUMENT']),'initial write');
 $files=glob($root.'/logs/*.jsonl');verify(count($files)===1,'stream file');$raw=file_get_contents($files[0]);$r=json_decode(trim($raw),true,512,JSON_THROW_ON_ERROR);
 foreach(['never-log-this-password','top-secret-token','secret-code','private-state','PRIVATE DOCUMENT','user:pass'] as $secret)verify(!str_contains($raw,$secret),'secret leaked');
 verify($r['error_code']==='invalid'&&$r['provider_field']==='redirect_uri','provider error fields preserved');
 verify($r['redirect_uri']==='https://example.org/api.php/callback'&&$r['request_id']==='1234567890abcdef1234567890abcdef'&&$r['connection']===2,'context and safe redirect');
 $old=$root.'/logs/old--backend--2000-01-01.jsonl';file_put_contents($old,"{}\n");touch($old,time()-86400*30);
 for($i=0;$i<230;$i++)verify(gt_log('error','backend',str_repeat('x',1000),['module'=>'inventory','count'=>$i]),'rotation write');
 verify(!file_exists($old),'retention');$bytes=0;foreach(glob($root.'/logs/*.jsonl') as $f){verify(filesize($f)<=65536,'file size');$bytes+=filesize($f);foreach(file($f) as $line)json_decode($line,true,512,JSON_THROW_ON_ERROR);}verify($bytes<=131072,'total quota');
 foreach(glob($root.'/logs/*.jsonl') as $f)unlink($f);
 $workers=[];for($i=0;$i<4;$i++)$workers[]=proc_open([PHP_BINARY,__FILE__,'writer',$root],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
 foreach($workers as $p)verify(proc_close($p)===0,'parallel writer');
 $count=0;foreach(glob($root.'/logs/*.jsonl') as $f)foreach(file($f) as $line){json_decode($line,true,512,JSON_THROW_ON_ERROR);$count++;}verify($count===200,'parallel records lost');
 // A symlink must never be followed or changed.
 $victim=$root.'/victim';file_put_contents($victim,'KEEP');$link=$root.'/logs/strava--strava--'.gmdate('Y-m-d').'.jsonl';symlink($victim,$link);verify(!gt_log('error','strava','test',['module'=>'strava']),'symlink rejected');verify(file_get_contents($victim)==='KEEP','symlink target intact');unlink($link);
 verify(gt_log('info','backend','Recovered',['module'=>'system']),'recover logger');verify(json_decode(file_get_contents($root.'/data/logging-status.json'),true)['healthy']===true,'health recovered');
 $p=proc_open([PHP_BINARY,__FILE__,'unhandled',$root],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);$stderr=stream_get_contents($pipes[2]);verify(proc_close($p)===1,'unhandled exception exit');verify(!str_contains($stderr,'private-client-secret'),'stderr redacted');
 $all='';foreach(glob($root.'/logs/*.jsonl') as $f)$all.=file_get_contents($f);verify(str_contains($all,'RuntimeException')&&!str_contains($all,'private-client-secret'),'unhandled logged safely');
 echo "PASS #106 PHP: structured streams, correlation, secret masking, safe OAuth URL, retention, quotas, concurrency, symlink protection, health and unhandled errors.\n";
}finally{
 $remove=function($p)use(&$remove){if(is_link($p)||is_file($p)){unlink($p);return;}foreach(scandir($p) as $n)if($n!=='.'&&$n!=='..')$remove($p.'/'.$n);rmdir($p);};$remove($root);
}
