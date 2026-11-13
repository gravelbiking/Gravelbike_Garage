<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
$r=json_decode(stream_get_contents(STDIN),true,32,JSON_THROW_ON_ERROR);$action=$r['action'];$root=$r['root'];
require is_file($root.'/private/core/backend.php')?$root.'/private/core/backend.php':$root.'/private/backend.php';
try{
 if(isset($r['database'])&&gt_config()['database']['name']!==$r['database'])throw new RuntimeException('Datenbankzuordnung stimmt nicht.');
 if($action==='describe'){
  $c=gt_config();$s=gt_mfa_state();$accounts=gt_query('SELECT id,username FROM {{accounts}}')->fetchAll(PDO::FETCH_ASSOC);gt_policy_init();
  $policy=gt_query('SELECT id,blocked_until,must_change FROM {{password_policy}}')->fetchAll(PDO::FETCH_ASSOC);if(is_file($root.'/private/core/backend.php')){try{$admin=json_decode(gt_db()->query('SELECT data FROM ga_state WHERE id=1')->fetchColumn(),true);$accounts=isset($admin['username'])?[['id'=>1,'username'=>$admin['username']]]:[];$s['enabled']=!empty($admin['credentials']);}catch(Throwable $ignore){if(function_exists('gt_log_exception'))gt_log_exception($ignore,'background',['module'=>'admin','operation'=>'bridge.describe']);}}
  echo json_encode(['database'=>$c['database']['name'],'name'=>$c['installation_name']??basename($root),'release'=>json_decode(file_get_contents($root.'/private/release.json'),true),'accounts'=>$accounts,'policy'=>$policy,'mfaEnabled'=>(bool)$s['enabled']]);
 }elseif($action==='key'){echo json_encode(['installationKey'=>gt_config()['installation_key']??'']);
 }elseif(in_array($action,['unlock','reset-password'],true)){
  gt_policy_init();gt_mfa_db();$db=gt_db();$db->beginTransaction();
  $account=gt_query('SELECT password_hash FROM {{accounts}} WHERE id=1 FOR UPDATE')->fetchColumn();if(!$account)throw new RuntimeException('Die Instanz wurde vom Benutzer noch nicht eingerichtet.');
  if($action==='reset-password'){
   $password=$r['password'];if(gt_password_error($password))throw new RuntimeException('Übergangspasswort ungültig.');$hash=password_hash($password,PASSWORD_DEFAULT);$history=json_decode(gt_query('SELECT history FROM {{password_policy}} WHERE id=1')->fetchColumn(),true);
   gt_query('UPDATE {{accounts}} SET password_hash=? WHERE id=1',[$hash]);gt_query('UPDATE {{password_policy}} SET changed_at=?,must_change=1,history=?,failed_count=0,blocked_until=0 WHERE id=1',[time(),json_encode(array_slice([$hash,$account,...$history],0,5))]);
   gt_query('DELETE FROM {{sessions}}');gt_query('DELETE FROM {{mfa_flows}}');
  }else{gt_query('UPDATE {{password_policy}} SET failed_count=0,blocked_until=0 WHERE id=1');}
  gt_query('DELETE FROM {{attempts}}');$db->commit();echo json_encode(['ok'=>true]);
 }elseif($action==='metrics'){
  $c=gt_config();$q=gt_db()->prepare('SELECT COALESCE(SUM(DATA_LENGTH+INDEX_LENGTH),0) FROM information_schema.TABLES WHERE TABLE_SCHEMA=?');$q->execute([$c['database']['name']]);$bytes=(int)$q->fetchColumn();$start=microtime(true);gt_db()->query('SELECT 1');$ms=(microtime(true)-$start)*1000;
  echo json_encode(['databaseBytes'=>$bytes,'databaseLatencyMs'=>round($ms,3)]);
 }elseif($action==='store-metrics'){
  gt_db()->exec('CREATE TABLE IF NOT EXISTS ga_metrics(ts DATETIME NOT NULL,instance VARCHAR(80) NOT NULL,disk_bytes BIGINT NOT NULL,db_bytes BIGINT NOT NULL,quota_used BIGINT NULL,quota_limit BIGINT NULL,healthy TINYINT NOT NULL,ram_used BIGINT NULL,ram_limit BIGINT NULL,PRIMARY KEY(ts,instance)) ENGINE=InnoDB');
  $columns=gt_db()->query('SHOW COLUMNS FROM ga_metrics')->fetchAll(PDO::FETCH_COLUMN);if(!in_array('instance_id',$columns,true))gt_db()->exec("ALTER TABLE ga_metrics ADD COLUMN instance_id VARCHAR(80) NOT NULL DEFAULT ''");if(!in_array('db_latency_ms',$columns,true))gt_db()->exec('ALTER TABLE ga_metrics ADD COLUMN db_latency_ms DOUBLE NULL');
  $q=gt_db()->prepare('INSERT INTO ga_metrics(ts,instance,disk_bytes,db_bytes,quota_used,quota_limit,healthy,ram_used,ram_limit,instance_id,db_latency_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE disk_bytes=VALUES(disk_bytes),db_bytes=VALUES(db_bytes),quota_used=VALUES(quota_used),quota_limit=VALUES(quota_limit),healthy=VALUES(healthy),ram_used=VALUES(ram_used),ram_limit=VALUES(ram_limit),instance_id=VALUES(instance_id),db_latency_ms=VALUES(db_latency_ms)');
  gt_db()->beginTransaction();if($r['rows']){$delete=gt_db()->prepare('DELETE FROM ga_metrics WHERE ts=?');$delete->execute([$r['rows'][0][0]]);}foreach($r['rows'] as $v){$q->execute($v);$history=gt_db()->prepare("UPDATE ga_metrics SET instance_id=? WHERE instance=? AND instance_id=''");$history->execute([$v[9],$v[1]]);}gt_db()->exec('DELETE FROM ga_metrics WHERE ts<UTC_TIMESTAMP()-INTERVAL 14 DAY');gt_db()->commit();echo '{"ok":true}';
 }else throw new RuntimeException('Unbekannte Verwaltungsaktion.');
}catch(Throwable $e){if(function_exists('gt_log_exception'))gt_log_exception($e,'background',['module'=>'admin','operation'=>'bridge.'.$action]);try{if(gt_db()->inTransaction())gt_db()->rollBack();}catch(Throwable $ignored){}fwrite(STDERR,'Instanzaktion fehlgeschlagen.');exit(1);}
