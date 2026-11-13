<?php
declare(strict_types=1);
require $argv[1].'/backend.php';

function check(bool $ok, string $what): void {
    if (!$ok) throw new RuntimeException($what);
}

$config = gt_strava_config();
check($config !== null, 'fixture configuration');
$settingsFile = gt_storage().'/strava-config.json';
check(!is_file($settingsFile),'isolated settings fixture');
file_put_contents($settingsFile,json_encode(['client_id'=>$config['id'],'client_secret'=>$config['secret'],'base_url'=>$config['base']],JSON_THROW_ON_ERROR));
chmod($settingsFile,0600);
check(gt_strava_config()===$config,'CLI reads the same private settings file as the app');
check(gt_strava_http_status('HTTP/1.1 200 OK')===200, 'successful HTTP response status');
check(gt_strava_http_status('HTTP/1.1 429 Too Many Requests')===429, 'rate limit response status');
check(gt_strava_http_status('HTTP/2 401')===401 && gt_strava_http_status('')===0, 'HTTP/2 and missing status');
// Upgrade the legacy single-account queue without losing a pending event.
gt_query('DROP TABLE {{strava_events}}');
gt_query('CREATE TABLE {{strava_events}} (object_id BIGINT UNSIGNED PRIMARY KEY, marker CHAR(32) NOT NULL) ENGINE=InnoDB');
gt_query('INSERT INTO {{strava_events}} VALUES (999,?)',[str_repeat('a',32)]);
gt_strava_init();
check((int)gt_query('SELECT account_id FROM {{strava_events}} WHERE object_id=999')->fetchColumn()===1,'legacy queue migrated to account one');
gt_query('DELETE FROM {{strava_events}}');
$state = gt_strava_state();
$registration = $state;
$callback = $config['base'].'/api.php/strava-webhook/'.gt_strava_key($config,'callback');
$registrations = 0;
$registerRequest = function(string $path, ?string $access = null, ?array $form = null) use ($callback, &$registrations): array {
    if (str_starts_with($path,'/api/v3/push_subscriptions?')) return [];
    check($path==='/api/v3/push_subscriptions' && $form['callback_url']===$callback,'environment webhook URL');
    $registrations++;
    return ['id'=>77];
};
gt_strava_register($config,$registration,$registerRequest);
check($registrations===1 && $registration['subscription']==='77','register webhook from app');
gt_strava_register($config,$registration,fn()=>[['id'=>77,'callback_url'=>$callback]]);
check($registrations===1,'registration retry reuses existing webhook');
try {
    gt_strava_register($config,$registration,fn()=>[['id'=>88,'callback_url'=>'https://another.example/callback']]);
    throw new LogicException('Expected a conflicting environment to be rejected');
} catch (RuntimeException $e) {
    check(str_contains($e->getMessage(),'anderen Umgebung'),'foreign environment webhook retained');
}
gt_strava_save($state);
$connectRequest = function(string $path, ?string $access, ?array $form = null): array {
    if ($path === '/oauth/token') {
        check($form['code']==='code' && $form['grant_type']==='authorization_code','OAuth code exchange');
        return ['athlete'=>['id'=>42],'access_token'=>'first-access','refresh_token'=>'first-refresh','expires_at'=>time()+3600];
    }
    check($path==='/api/v3/athlete' && $access==='first-access','read gear after consent');
    return ['id'=>42,'bikes'=>[['id'=>'b10','name'=>'Gravel']]];
};
$connected = gt_strava_connect($config,$state,'code',$connectRequest);
check($connected['owner']==='42' && $connected['gear']===['b10'=>'Gravel'] && $connected['token']!=='' && $connected['scanRequested'],'first connection provides bikes immediately');
$offline = gt_strava_connect($config,$state,'code',fn($path,$access,$form=null) => $path==='/api/v3/athlete'
    ? throw new RuntimeException('Temporary failure')
    : $connectRequest($path,$access,$form));
check($offline['token']!=='' && $offline['error']!=='' && $offline['scanRequested'],'gear failure retains consent for retry');
$state['owner'] = '42';
$state['from'] = gt_strava_day();
$state['gear'] = ['b10'=>'Gravel','b11'=>'Rennrad'];
$state['maps'] = ['b10'=>['bike'=>'strava-gravel','from'=>$state['from']], 'b11'=>['bike'=>'strava-road','from'=>$state['from']]];
$state['token'] = gt_strava_token($config,['access_token'=>'old','refresh_token'=>'refresh','expires_at'=>0]);
gt_strava_save($state);

$row = gt_query('SELECT data,version FROM {{garage}} WHERE id=1')->fetch(PDO::FETCH_ASSOC);
$original = json_decode($row['data'],true,64,JSON_THROW_ON_ERROR);
$garage = $original;
$garage['bikes'][] = ['id'=>'strava-gravel','name'=>'Gravel','km'=>1800,'kmDate'=>gt_strava_day(-1),'components'=>[]];
$garage['bikes'][] = ['id'=>'strava-road','name'=>'Rennrad','km'=>900,'components'=>[]];
gt_query('UPDATE {{garage}} SET data=? WHERE id=1',[json_encode($garage,JSON_THROW_ON_ERROR)]);
$stamp = time()-5;
$ride = fn(int $id, ?string $gear, float $meters)=>['id'=>$id,'sport_type'=>'GravelRide','distance'=>$meters,'gear_id'=>$gear,
    'start_date'=>gmdate('c',$stamp),'start_date_local'=>gt_strava_day().'T13:00:00'];
$activities = [$ride(123,'b10',42500.4), $ride(124,null,900)];
$request = function(string $path, ?string $token, ?array $form, bool $missing = false) use (&$activities): ?array {
    if ($path === '/oauth/token') {
        check($form['refresh_token']==='refresh','refresh rotation');
        return ['access_token'=>'access','refresh_token'=>'rotated','expires_at'=>time()+3600];
    }
    check($token==='access','authenticated read');
    if ($path === '/api/v3/athlete') return ['id'=>42,'bikes'=>[['id'=>'b10','name'=>'Gravel'],['id'=>'b11','name'=>'Rennrad']]];
    if (str_starts_with($path,'/api/v3/athlete/activities?')) {
        parse_str(parse_url($path,PHP_URL_QUERY),$query);
        return $query['page']==='1' ? $activities : [];
    }
    foreach ($activities as $activity) if ($path==='/api/v3/activities/'.$activity['id']) return $activity;
    check($missing,'deleted activity lookup');
    return null;
};
$read = fn()=>array_slice(json_decode(gt_query('SELECT data FROM {{garage}} WHERE id=1')->fetchColumn(),true,64,JSON_THROW_ON_ERROR)['bikes'],-2);
$version = fn()=>(int)gt_query('SELECT version FROM {{garage}} WHERE id=1')->fetchColumn();
$event = fn(int $id)=>gt_query('INSERT INTO {{strava_events}} (object_id,marker) VALUES (?,?)',[$id,str_repeat('a',32)]);

gt_strava_sync($config,$state,true,$request);
check($read()[0]['km']===1842.5 && $read()[0]['kmDate']===gt_strava_day(),'distance and date');
check(gt_strava_status($state)['pendingCount']===1 && !str_contains(json_encode(gt_strava_status($state)),'rotated'),'pending ride and private token');
$firstVersion = $version();
$event(123);
gt_strava_sync($config,$state,false,$request);
check($read()[0]['km']===1842.5 && $version()===$firstVersion,'duplicate event');
$activities[0] = $ride(123,'b11',43000);
gt_strava_sync($config,$state,true,$request);
check($read()[0]['km']==1800 && $read()[0]['kmDate']===gt_strava_day(-1) && $read()[1]['km']==943,'gear and distance correction');
array_shift($activities);
$event(123);
gt_strava_sync($config,$state,false,$request);
check($read()[1]['km']==900,'deletion');
check((int)gt_query('SELECT COUNT(*) FROM {{strava_events}}')->fetchColumn()===0,'event drained');
$event(124);
try {
    gt_strava_sync($config,$state,true,fn()=>throw new RuntimeException('Temporary failure'));
    throw new LogicException('Expected failure');
} catch (RuntimeException $e) {
    check($e->getMessage()==='Temporary failure' && $read()[1]['km']==900,'network failure leaves mileage unchanged');
}
check((int)gt_query('SELECT COUNT(*) FROM {{strava_events}}')->fetchColumn()===1,'failed event retained');
$event(0);
gt_strava_sync($config,$state,false,$request);
check($state['token']==='' && $state['rides']===[] && $state['maps']===[],'deauthorization');
// Two independently authorized people import into separate garage bicycles.
$one = $connected;
$one['maps'] = ['b10'=>['bike'=>'strava-gravel','from'=>gt_strava_day()]];
gt_strava_save($one);
try {
    gt_strava_connect($config,gt_strava_state(2),'code',$connectRequest);
    throw new LogicException('Duplicate athlete must be rejected');
} catch (RuntimeException $e) {
    check(str_contains($e->getMessage(),'bereits'),'same athlete cannot occupy both slots');
}
$two = gt_strava_connect($config,gt_strava_state(2),'code',fn($path,$access,$form=null)=>$path==='/oauth/token'
    ? ['athlete'=>['id'=>43,'firstname'=>'Person','lastname'=>'Zwei'],'access_token'=>'second-access','refresh_token'=>'second-refresh','expires_at'=>time()+3600]
    : ['id'=>43,'bikes'=>[['id'=>'b20','name'=>'Zweites Rad']]]);
$two['maps'] = ['b20'=>['bike'=>'strava-road','from'=>gt_strava_day()]];
gt_strava_save($two);
check(gt_strava_state()['owner']==='42' && gt_strava_state(2)['owner']==='43','separate account storage');
check(gt_strava_status($two)['name']==='Person Zwei' && !str_contains(json_encode(gt_strava_status($two)),'second-refresh'),'account label and token privacy');
$multiRequest = function($path,$token,$form=null,$missing=false) use ($ride) {
    $second = $token==='second-access';
    check($second || $token==='first-access','separate access tokens');
    if ($path==='/api/v3/athlete') return ['id'=>$second?43:42,'bikes'=>[['id'=>$second?'b20':'b10','name'=>'Rad']]];
    if (str_starts_with($path,'/api/v3/athlete/activities?')) {
        parse_str(parse_url($path,PHP_URL_QUERY),$query);
        return $query['page']==='1'?[$ride(987,$second?'b20':'b10',$second?12000:5000)]:[];
    }
    return $ride(987,$second?'b20':'b10',$second?12000:5000);
};
foreach ([1,2] as $account) gt_query('INSERT INTO {{strava_events}} (account_id,object_id,marker) VALUES (?,987,?)',[$account,str_repeat('a',32)]);
gt_strava_sync($config,$one,true,$multiRequest);
check((int)gt_query('SELECT COUNT(*) FROM {{strava_events}} WHERE account_id=2')->fetchColumn()===1,'first account leaves second queue untouched');
gt_strava_sync($config,$two,true,$multiRequest);
check($read()[0]['km']==1805 && $read()[1]['km']==912,'both people update their own bicycles');
gt_strava_sync($config,$one,true,$multiRequest);
gt_strava_sync($config,$two,true,$multiRequest);
check($read()[0]['km']==1805 && $read()[1]['km']==912,'repeated imports do not double mileage');
$one['scanRequested']=true;
$two['scanRequested']=true;
gt_strava_save($one);
gt_strava_save($two);
try {
    gt_strava_sync_accounts($config,function($path,$token,$form=null,$missing=false) use ($multiRequest) {
        if ($token==='first-access') throw new RuntimeException('First account offline');
        return $multiRequest($path,$token,$form,$missing);
    });
    throw new LogicException('Expected aggregate error');
} catch (RuntimeException $e) {
    check(str_contains($e->getMessage(),'Verbindung 1') && gt_strava_state(2)['error']==='' && !isset(gt_strava_state(2)['scanRequested']),'worker continues second account after first fails');
}
$one=gt_strava_state();
$one['error']='';
$one['retry']=0;
gt_strava_save($one);
$two=gt_strava_state(2);
$two['retry']=0;
try { gt_strava_sync($config,$two,true,fn()=>throw new RuntimeException('Account two offline')); } catch (RuntimeException $e) {}
$one['retry']=0;
gt_strava_sync($config,$one,true,$multiRequest);
check(gt_strava_state()['error']==='' && gt_strava_state(2)['error']==='Account two offline','failure isolated to one account');
gt_query('INSERT INTO {{strava_events}} (account_id,object_id,marker) VALUES (1,0,?)',[str_repeat('a',32)]);
gt_strava_sync($config,$one,false,$multiRequest);
check($one['token']==='' && gt_strava_state(2)['token']!=='' && $read()[1]['km']==912,'revocation leaves second connection and mileage intact');
gt_strava_clear($two);
check($read()[0]['km']==1805 && $read()[1]['km']==912,'disconnect preserves imported mileage');
echo "PASS two Strava accounts: migration, distinct tokens, duplicate-account rejection, independent queues, mileage, replay, failures and revocation.\n";
gt_query('UPDATE {{garage}} SET data=?, version=? WHERE id=1',[$row['data'],$row['version']]);
unlink($settingsFile);
echo "PASS Strava sync: refresh, pagination, replay, corrections, deletes, retry, deauthorization.\n";
