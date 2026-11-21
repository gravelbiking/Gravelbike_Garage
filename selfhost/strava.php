<?php
declare(strict_types=1);

function gt_strava_site_url(): string {
    $config = gt_config();
    $origin = rtrim($config['origin'] ?? '', '/');
    if ($origin === '') $origin = (gt_https() ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? '');
    return $origin . (PHP_SAPI === 'cli' ? '' : rtrim(gt_base_path(), '/'));
}

function gt_strava_settings_document(): array {
    $path = gt_storage() . '/strava-config.json';
    if (is_file($path)) {
        $settings = json_decode((string)file_get_contents($path), true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($settings)) throw new RuntimeException('Die gespeicherte Strava-Konfiguration ist nicht lesbar.');
        if (array_key_exists('connections', $settings)) {
            if (($settings['version'] ?? null) !== 2 || !is_array($settings['connections'])) throw new RuntimeException('Die Strava-Konfiguration hat ein ungültiges Format.');
            return $settings;
        }
    } else $settings = gt_config()['strava'] ?? [];
    // Snapshot both legacy slots. Their tokens, keys and callback URLs must not change.
    return ['version'=>2, 'connections'=>[1=>$settings, 2=>$settings]];
}

function gt_strava_settings(int $account = 1): array {
    if (!in_array($account,[1,2],true)) throw new RuntimeException('Ungültige Strava-Verbindung.');
    $settings = gt_strava_settings_document()['connections'][$account] ?? [];
    if (!is_array($settings)) throw new RuntimeException('Die Strava-Verbindung ist nicht lesbar.');
    return $settings;
}

function gt_strava_setup(int $account = 1): array {
    $settings = gt_strava_settings($account);
    $base = gt_strava_site_url();
    return [
        'account'=>$account, 'sharedClient'=>($settings['client_id'] ?? '') !== '' && ($settings['client_id'] ?? '') === (gt_strava_settings($account === 1 ? 2 : 1)['client_id'] ?? ''), 'name'=>gt_config()['installation_name'] ?? 'Prod1',
        'clientId'=>(string)($settings['client_id'] ?? ''),
        'secretSaved'=>is_string($settings['client_secret'] ?? null) && $settings['client_secret'] !== '',
        'website'=>$base, 'callbackDomain'=>parse_url($base, PHP_URL_HOST) ?: '',
        'callbackUrl'=>$base . '/api.php/strava-callback',
    ];
}

function gt_strava_config(int $account = 1): ?array {
    $config = gt_config();
    $s = gt_strava_settings($account);
    $origin = rtrim($config['origin'] ?? '', '/');
    $base = rtrim(($s['base_url'] ?? '') ?: (PHP_SAPI === 'cli' ? $origin : gt_strava_site_url()), '/');
    $parts = parse_url($base);
    $local = gt_dev() && in_array($parts['host'] ?? '', ['localhost','127.0.0.1'], true);
    if (!filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN) || !extension_loaded('openssl') ||
        !preg_match('/^[1-9][0-9]{0,15}$/D', (string)($s['client_id'] ?? '')) ||
        !is_string($s['client_secret'] ?? null) || strlen($s['client_secret']) < 24 ||
        (($parts['scheme'] ?? '') !== 'https' && !($local && ($parts['scheme'] ?? '') === 'http')) || !isset($parts['host']) ||
        array_intersect_key($parts, array_flip(['user','pass','query','fragment'])) ||
        ($origin !== '' && $base !== $origin && !str_starts_with($base, $origin.'/'))) return null;
    return ['id'=>(string)$s['client_id'], 'secret'=>$s['client_secret'], 'base'=>$base] + (isset($s['scope']) ? ['scope'=>(string)$s['scope']] : []);
}

function gt_strava_configure(array $body): never {
    gt_mfa_db();
    gt_db()->beginTransaction();
    try {
        gt_mfa_get($body['token'] ?? null, 'grant');
        gt_db()->commit();
    } catch (RuntimeException $e) {
        if (gt_db()->inTransaction()) gt_db()->rollBack();
        gt_json(['error'=>'Bestätige deinen Zugang erneut, bevor du die Strava-API-Daten speicherst.'], 403);
    }
    $account = $body['account'] ?? 1;
    if (!is_int($account) || !in_array($account,[1,2],true)) gt_json(['error'=>'Ungültige Strava-Verbindung.'],400);
    $previous = gt_strava_settings($account);
    $id = $body['clientId'] ?? null;
    $secret = $body['clientSecret'] ?? '';
    if (!is_string($id) || !preg_match('/^[1-9][0-9]{0,15}$/D', $id) || !is_string($secret)) {
        gt_json(['error'=>'Bitte eine gültige numerische Client ID und das Client Secret eingeben.'], 400);
    }
    if ($secret === '' && $id === (string)($previous['client_id'] ?? '')) $secret = $previous['client_secret'] ?? '';
    if (!preg_match('/^[a-zA-Z0-9_-]{24,256}$/D', $secret)) gt_json(['error'=>'Bitte das vollständige Client Secret aus Strava eingeben.'], 400);
    $base = gt_strava_site_url();
    $parts = parse_url($base);
    if (($parts['scheme'] ?? '') !== 'https' && !(gt_dev() && in_array($parts['host'] ?? '', ['localhost','127.0.0.1'], true))) {
        gt_json(['error'=>'Für die Strava-Einrichtung wird eine HTTPS-App-Adresse benötigt.'], 400);
    }
    $settings = ['client_id'=>$id, 'client_secret'=>$secret, 'base_url'=>$base];
    $state = gt_strava_state($account);
    $current = gt_strava_config($account);
    $changed = !$current || array_intersect_key($current,array_flip(['id','secret','base'])) !== ['id'=>$id,'secret'=>$secret,'base'=>$base];
    $otherConfig = gt_strava_config($account === 1 ? 2 : 1);
    if (($changed || ($account === 2 && $state['token'] === '')) && $otherConfig && $otherConfig['id'] === $id) gt_json(['error'=>'Verwende für diese Verbindung eine eigene, andere Client ID. Die andere Strava-Verbindung bleibt unverändert.'],409);
    if ($changed && $state['token'] !== '') gt_json(['error'=>'Trenne zuerst Strava-Verbindung '.$account.', bevor du deren API-Zugangsdaten änderst. Die andere Verbindung bleibt aktiv.'], 409);
    $document = gt_strava_settings_document();
    // Add a distinct key domain only for new/changed credentials, never to legacy tokens.
    $settings['scope'] = $changed ? 'connection-'.$account.'-client-'.$id : ($previous['scope'] ?? null);
    if ($settings['scope'] === null) unset($settings['scope']);
    $document['connections'][$account] = $settings;
    // Atomic data file in this installation's private shared storage, also read by the CLI job.
    $path = gt_storage() . '/strava-config.json';
    $temporary = $path . '.' . bin2hex(random_bytes(8)) . '.tmp';
    try {
        if (file_put_contents($temporary, json_encode($document, JSON_THROW_ON_ERROR)) === false ||
            !chmod($temporary, 0600) || !rename($temporary, $path)) {
            throw new RuntimeException('Die Strava-API-Daten konnten nicht gespeichert werden.');
        }
    } finally {
        if (is_file($temporary)) unlink($temporary);
    }
    gt_log_context(['module'=>'strava','connection'=>$account]);
    gt_log('info','strava','Strava-API-Konfiguration gespeichert.',['operation'=>'configuration.changed','client_id'=>$id,'previous_client_id'=>(string)($previous['client_id']??''),'base_url'=>$base,'previous_base_url'=>$previous['base_url']??'']);
    if ($changed) {
        unset($state['flow'],$state['subscription'],$state['registrationError']);
        $state['error']='';$state['retry']=0;
        gt_strava_save($state);
        gt_query('DELETE FROM {{strava_events}} WHERE account_id = ?',[$account]);
    }
    gt_query('DELETE FROM {{attempts}} WHERE client_key = ?', [gt_attempt_key()]);
    gt_json(gt_strava_status($state));
}

function gt_strava_init(): void {
    gt_query('CREATE TABLE IF NOT EXISTS {{strava}} (id TINYINT PRIMARY KEY, data MEDIUMTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    gt_query('CREATE TABLE IF NOT EXISTS {{strava_events}} (
        account_id TINYINT NOT NULL DEFAULT 1, object_id BIGINT UNSIGNED NOT NULL, marker CHAR(32) NOT NULL, PRIMARY KEY (account_id,object_id)
    ) ENGINE=InnoDB');
    // Keep queued events from installations that previously supported one account.
    if (!gt_query("SHOW COLUMNS FROM {{strava_events}} LIKE 'account_id'")->fetch()) {
        $migration = gt_table('strava_events').'-accounts';
        if ((int)gt_query('SELECT GET_LOCK(?, 10)', [$migration])->fetchColumn() !== 1) throw new RuntimeException('Strava wird gerade aktualisiert.');
        try {
            if (!gt_query("SHOW COLUMNS FROM {{strava_events}} LIKE 'account_id'")->fetch()) {
                gt_query('ALTER TABLE {{strava_events}} ADD account_id TINYINT NOT NULL DEFAULT 1, DROP PRIMARY KEY, ADD PRIMARY KEY(account_id,object_id)');
            }
        } finally {
            gt_query('SELECT RELEASE_LOCK(?)', [$migration]);
        }
    }
}

function gt_strava_accounts(): array {
    return [gt_strava_state(1), gt_strava_state(2)];
}

function gt_strava_state(int $account = 1): array {
    if (!in_array($account, [1,2], true)) throw new RuntimeException('Ungültiges Strava-Konto.');
    $data = gt_query('SELECT data FROM {{strava}} WHERE id = ?', [$account])->fetchColumn();
    return ($data === false ? [] : json_decode($data, true, 64, JSON_THROW_ON_ERROR)) +
        ['account'=>$account, 'name'=>'', 'owner'=>'', 'token'=>'', 'maps'=>[], 'rides'=>[], 'dates'=>[], 'gear'=>[], 'lastScan'=>0, 'lastSync'=>0, 'retry'=>0, 'error'=>''];
}

function gt_strava_save(array $state): void {
    $encoded = json_encode($state, JSON_THROW_ON_ERROR);
    gt_query('INSERT INTO {{strava}}(id,data) VALUES(?,?) ON DUPLICATE KEY UPDATE data = ?', [$state['account'] ?? 1, $encoded, $encoded]);
}

function gt_strava_lock(int $account = 0) {
    if (!in_array($account,[0,1,2],true)) throw new RuntimeException('Ungültige Strava-Sperre.');
    $lock = fopen(gt_storage().($account ? '/strava-'.$account.'.lock' : '/strava.lock'), 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        if ($lock) fclose($lock);
        return null;
    }
    return $lock;
}

function gt_strava_key(array $config, string $purpose, bool $binary = false): string {
    return hash_hmac('sha256', 'Gravelbike Garage Strava '.$purpose.(isset($config['scope']) ? ' '.$config['scope'] : ''), $config['secret'], $binary);
}

function gt_strava_token(array $config, array|string $token): array|string {
    $key = gt_strava_key($config, 'token', true);
    $context = 'Gravelbike Garage Strava tokens';
    if (is_array($token)) {
        foreach (['access_token', 'refresh_token'] as $field) {
            if (!is_string($token[$field] ?? null) || $token[$field] === '') throw new RuntimeException('Strava hat keinen gültigen Zugriffsschlüssel geliefert.');
        }
        if (!is_int($token['expires_at'] ?? null)) throw new RuntimeException('Der Strava-Zugriffsschlüssel hat keine gültige Laufzeit.');
        $nonce = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt(json_encode(array_intersect_key($token, array_flip(['access_token','refresh_token','expires_at'])), JSON_THROW_ON_ERROR),
            'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag, $context);
        if ($cipher === false) throw new RuntimeException('Strava-Schlüssel konnte nicht geschützt werden.');
        return base64_encode($nonce.$tag.$cipher);
    }
    $raw = base64_decode($token, true);
    $plain = $raw === false || strlen($raw) < 29 ? false :
        openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16), $context);
    if ($plain === false) throw new RuntimeException('Strava-Schlüssel konnte nicht gelesen werden. Bitte erneut verbinden.');
    return json_decode($plain, true, 8, JSON_THROW_ON_ERROR);
}

function gt_strava_http_status(string $line): int {
    return preg_match('~^HTTP/\S+ ([0-9]{3})(?: |$)~D', $line, $matches) ? (int)$matches[1] : 0;
}

function gt_strava_request(string $path, ?string $token = null, ?array $form = null, bool $allowMissing = false): ?array {
    $headers = ['Accept: application/json'];
    if ($token !== null) $headers[] = 'Authorization: Bearer '.$token;
    $options = ['method'=>'GET','timeout'=>12,'follow_location'=>0,'ignore_errors'=>true];
    if ($form !== null) {
        $options['method'] = 'POST';
        $options['content'] = http_build_query($form);
        $headers[] = 'Content-Type: application/x-www-form-urlencoded';
    }
    $options['header'] = $headers;
    $context = stream_context_create(['http'=>$options,'ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]]);
    $payload = @file_get_contents('https://www.strava.com'.$path, false, $context, 0, 8000001);
    $status = gt_strava_http_status($http_response_header[0] ?? '');
    if($payload===false||$status<200||$status>=300){
        $parsed=is_string($payload)?json_decode($payload,true):null;$codes=[];$fields=[];$resources=[];
        foreach(array_slice(is_array($parsed)?($parsed['errors']??[]):[],0,8) as $e)if(is_array($e))foreach(['resource','field','code'] as $k)if(is_string($e[$k]??null)&&preg_match('/^[a-zA-Z0-9_.-]{1,60}$/D',$e[$k])){if($k==='code')$codes[]=$e[$k];elseif($k==='field')$fields[]=$e[$k];else $resources[]=$e[$k];}
        gt_log($status>=400&&$status<500?'warning':'error','external-api','Strava-Anfrage fehlgeschlagen.',['module'=>'strava','provider'=>'strava','operation'=>explode('?',$path)[0],'method'=>$options['method'],'http_status'=>$status,'error_code'=>implode(' ',$codes),'provider_field'=>implode(' ',$fields),'provider_resource'=>implode(' ',$resources)]);
    }
    if ($payload !== false && $allowMissing && $status === 404) return null;
    if ($payload === false || strlen($payload) > 8000000 || $status === 0) throw new RuntimeException('Strava ist vorübergehend nicht erreichbar.');
    if ($status === 429) throw new RuntimeException('Strava hat das Anfragelimit erreicht. Der Abgleich wird später wiederholt.', 429);
    if ($status < 200 || $status >= 300) throw new RuntimeException('Strava hat die Anfrage abgelehnt (HTTP '.$status.').', $status);
    $result = json_decode($payload, true);
    if (!is_array($result)) throw new RuntimeException('Strava hat eine unerwartete Antwort geliefert.');
    return $result;
}

function gt_strava_client_fields(array $config): array {
    return ['client_id'=>$config['id'], 'client_secret'=>$config['secret']];
}

function gt_strava_access(array $config, array &$state, callable $request): string {
    $token = gt_strava_token($config, $state['token']);
    if ($token['expires_at'] <= time()+90) {
        $token = $request('/oauth/token', null, gt_strava_client_fields($config) +
            ['grant_type'=>'refresh_token', 'refresh_token'=>$token['refresh_token']]);
        $state['token'] = gt_strava_token($config, $token);
        gt_strava_save($state);
    }
    return $token['access_token'];
}

function gt_strava_id(mixed $id): bool {
    return (is_int($id) || is_string($id)) && preg_match('/^[1-9][0-9]{0,18}$/D', (string)$id) === 1;
}

function gt_strava_gear_id(mixed $id): bool {
    return is_string($id) && preg_match('/^b[0-9]{1,19}$/D', $id) === 1;
}

function gt_strava_gear(array $athlete, string $owner): array {
    if ((string)($athlete['id'] ?? '') !== $owner) throw new RuntimeException('Das Strava-Konto passt nicht zur Verbindung.');
    $bikes = [];
    foreach ($athlete['bikes'] ?? [] as $gear) {
        if (gt_strava_gear_id($gear['id'] ?? null)) $bikes[$gear['id']] = (string)($gear['name'] ?? $gear['id']);
    }
    return $bikes;
}

function gt_strava_day(int $offset = 0): string {
    return (new DateTimeImmutable('today', new DateTimeZone('Europe/Berlin')))->modify($offset.' days')->format('Y-m-d');
}

function gt_strava_ride(array $activity): ?array {
    if (!in_array($activity['sport_type'] ?? $activity['type'] ?? null, ['Ride','MountainBikeRide','GravelRide','EBikeRide','EMountainBikeRide','VirtualRide','Handcycle','Velomobile'], true)) return null;
    $date = substr((string)($activity['start_date_local'] ?? ''), 0, 10);
    $start = strtotime((string)($activity['start_date'] ?? ''));
    $distance = $activity['distance'] ?? null;
    if ($start === false || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date) || !is_numeric($distance) ||
        !is_finite((float)$distance) || $distance < 0 || $distance > 100000000) {
        throw new RuntimeException('Strava hat eine Fahrt mit ungültigem Datum oder ungültiger Distanz geliefert.');
    }
    $gear = $activity['gear_id'] ?? '';
    return ['date'=>$date, 'start'=>$start, 'meters'=>(int)round((float)$distance), 'gear'=>gt_strava_gear_id($gear) ? $gear : ''];
}

function gt_strava_collect(array $state, array $events, bool $scan, int $now, callable $get): array {
    $rides = $state['rides'];
    if ($scan) {
        $days = 30 * 86400;
        $after = min($now, $state['lastScan'] ?: $now) - $days - 86400;
        $firstDate = min(array_merge([$state['from']], array_column($state['maps'], 'from')));
        $after = max($after, strtotime($firstDate.'T00:00:00Z') - 86400);
        foreach ($rides as $id=>$ride) {
            if ($ride['start'] > $after && $ride['start'] < $now) unset($rides[$id]);
        }
        for ($page=1; ; $page++) {
            $items = $get('/api/v3/athlete/activities?'.http_build_query(['after'=>$after,'before'=>$now,'page'=>$page,'per_page'=>100]));
            if (!array_is_list($items)) throw new RuntimeException('Strava hat keine Aktivitätenliste geliefert.');
            foreach ($items as $activity) {
                if (!is_array($activity) || !gt_strava_id($activity['id'] ?? null)) throw new RuntimeException('Strava hat eine Aktivität ohne gültige ID geliefert.');
                $ride = gt_strava_ride($activity);
                if ($ride !== null) $rides[$activity['id']] = $ride;
            }
            // Strava can return a short page before the end of a collection.
            if (!$items) break;
            if ($page === 20) throw new RuntimeException('Zu viele Aktivitäten für einen vollständigen Strava-Abgleich.');
        }
    }
    foreach ($events as $event) {
        $id = (string)$event['object_id'];
        if ($id === '0') continue;
        $activity = $get('/api/v3/activities/'.$id, true);
        unset($rides[$id]);
        if ($activity !== null) {
            if ((string)($activity['id'] ?? '') !== $id) throw new RuntimeException('Strava hat eine andere Aktivität als angefragt geliefert.');
            $ride = gt_strava_ride($activity);
            if ($ride !== null) $rides[$id] = $ride;
        }
    }
    return $rides;
}

// Keep dated odometer baselines on the same scale as the bicycle when old rides
// arrive, change, disappear or are reassigned. No category-specific exceptions.
function gt_strava_rebase_odometer(array &$garage,array $oldRides,array $newRides): bool {
    $days=[];
    foreach([[$oldRides,-1],[$newRides,1]] as [$rides,$sign])foreach($rides as $r){
        $id=$r['bike']??'';$day=$r['date']??'';
        if($id!==''&&preg_match('/^\d{4}-\d{2}-\d{2}$/D',$day))$days[$id][$day]=($days[$id][$day]??0)+$sign*$r['meters'];
    }
    foreach($days as $id=>$rows){$days[$id]=array_filter($rows,fn($meters)=>$meters!==0);if(!$days[$id])unset($days[$id]);}
    if(!$days)return false;
    $before=static function(string $id,$date)use($days):int{
        if(!is_string($date)||!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date))return 0;
        $sum=0;foreach($days[$id]??[] as $day=>$meters)if($day<$date)$sum+=$meters;
        return $sum;
    };
    $changed=false;
    $walk=function(array &$node,string $bikeId='',bool $bikeRoot=false)use(&$walk,&$changed,$before):void{
        if(is_string($node['bikeId']??null))$bikeId=$node['bikeId'];
        if(isset($node['component'],$node['history'])&&$node['history'])$bikeId=$node['history'][array_key_last($node['history'])]['bikeId']??$bikeId;
        $oldStart=$node['installedKm']??$node['component']['installedKm']??null;$oldEnd=$node['removedKm']??null;
        $keys=['installedKm'=>'installedDate','removedKm'=>'removedDate','completedKm'=>'completedAt'];
        // The live bicycle total is updated separately by gt_strava_apply.
        if(!$bikeRoot)$keys['km']='date';
        foreach($keys as $kmKey=>$dateKey){
            if(!isset($node[$kmKey])||!is_numeric($node[$kmKey]))continue;
            $delta=$before($bikeId,$node[$dateKey]??null);if(!$delta)continue;
            $value=round((float)$node[$kmKey]+$delta/1000,3);
            if($value<0)throw new RuntimeException('Der Strava-Abgleich ergäbe negative historische Kilometerstände. Bitte die Einbau-km prüfen.');
            $node[$kmKey]=$value;$changed=true;
        }
        if(isset($node['mileage'])&&is_numeric($node['mileage'])&&is_numeric($oldStart)&&is_numeric($oldEnd)){
            $startDelta=isset($node['component'])?$before($bikeId,$node['component']['installedDate']??null)/1000:((float)($node['installedKm']??$oldStart)-(float)$oldStart);
            $delta=(float)($node['removedKm']??$oldEnd)-(float)$oldEnd-$startDelta;
            if(abs($delta)>0.0000001){$m=round(((float)$node['mileage']+$delta)*10)/10;if($m<0)throw new RuntimeException('Die Strava-Korrektur widerspricht der dokumentierten Bauteillaufleistung.');$node['mileage']=$m;$changed=true;}
        }
        foreach($node as $key=>&$child)if(is_array($child)){
            if($key==='bikes')foreach($child as &$b)$walk($b,$b['id']??'',true);
            else $walk($child,$bikeId);
        }unset($child);
    };
    $walk($garage);return $changed;
}

function gt_strava_apply(array &$garage, array &$state, array $rides): bool {
    $bikes = [];
    foreach ($garage['bikes'] as $bike) $bikes[$bike['id']] = true;
    $deltas = $latest = [];
    foreach ($state['rides'] as $old) {
        if (!empty($old['bike'])) $deltas[$old['bike']] = ($deltas[$old['bike']] ?? 0) - $old['meters'];
    }
    foreach ($rides as $id=>&$ride) {
        $map = $state['maps'][$ride['gear']] ?? null;
        $ride['bike'] = '';
        if ($map && isset($bikes[$map['bike']]) && $ride['date'] >= $map['from']) {
            $bikeId = $ride['bike'] = $map['bike'];
            $deltas[$bikeId] = ($deltas[$bikeId] ?? 0) + $ride['meters'];
            $latest[$bikeId] = max($latest[$bikeId] ?? '', $ride['date']);
        } elseif ($map || $ride['date'] < $state['from']) {
            unset($rides[$id]);
        }
    }
    unset($ride);
    $changed = gt_strava_rebase_odometer($garage,$state['rides'],$rides);
    foreach ($garage['bikes'] as &$bike) {
        $id = $bike['id'];
        if (!isset($deltas[$id]) && !isset($state['dates'][$id])) continue;
        $current = $bike['kmDate'] ?? '';
        $base = $state['dates'][$id] ?? ['manual'=>$current,'applied'=>$current];
        if ($current !== $base['applied']) $base['manual'] = $current;
        $km = round((float)$bike['km'] + ($deltas[$id] ?? 0)/1000, 3);
        if ($km < 0) throw new RuntimeException('Der Strava-Abgleich ergäbe einen negativen Kilometerstand. Bitte den manuell erfassten Stand prüfen.');
        $date = max($base['manual'], $latest[$id] ?? '');
        if (abs((float)$bike['km'] - $km) > 0.0000001 || $current !== $date) {
            $bike['km'] = $km;
            $bike['kmDate'] = $date;
            $changed = true;
        }
        $state['dates'][$id] = ['manual'=>$base['manual'],'applied'=>$date];
    }
    unset($bike);
    $state['rides'] = $rides;
    return $changed;
}

function gt_strava_sync(array $config, array &$state, bool $force, ?callable $request = null): void {
    gt_log_context(['module'=>'strava','connection'=>$state['account']??1,'client_id'=>$config['id']]);
    $request ??= 'gt_strava_request';
    $events = gt_query('SELECT object_id,marker FROM {{strava_events}} WHERE account_id = ? ORDER BY object_id LIMIT 50', [$state['account'] ?? 1])->fetchAll(PDO::FETCH_ASSOC);
    if ($events && (string)$events[0]['object_id'] === '0') {
        gt_strava_clear($state);
        return;
    }
    if ($state['token'] === '') return;
    $now = time();
    if ($state['retry'] > $now) {
        if ($force) throw new RuntimeException($state['error']);
        return;
    }
    $scan = $force || !empty($state['scanRequested']) || $state['lastScan'] + 86400 <= $now;
    if (!$scan && !$events) return;
    try {
        $token = gt_strava_access($config, $state, $request);
        $get = fn(string $path, bool $missing = false) => $request($path, $token, null, $missing);
        $rides = gt_strava_collect($state, $events, $scan, $now, $get);
        $next = $state;
        if ($scan) {
            $athlete = $get('/api/v3/athlete');
            $next['gear'] = gt_strava_gear($athlete, $state['owner']);
            $next['name'] = trim(($athlete['firstname'] ?? '').' '.($athlete['lastname'] ?? '')) ?: $next['name'];
            $next['lastScan'] = $now;
            unset($next['scanRequested']);
        }
        $db = gt_db();
        $db->beginTransaction();
        try {
            $row = gt_query('SELECT data FROM {{garage}} WHERE id = 1 FOR UPDATE')->fetchColumn();
            $garage = $row === false ? ['bikes'=>[]] : json_decode($row, true, 64, JSON_THROW_ON_ERROR);
            if (gt_strava_apply($garage, $next, $rides)) {
                gt_query('UPDATE {{garage}} SET data = ?, version = version + 1 WHERE id = 1', [json_encode($garage, JSON_THROW_ON_ERROR)]);
            }
            $next['lastSync'] = $now;
            $next['error'] = '';
            $next['retry'] = 0;
            gt_strava_save($next);
            foreach ($events as $event) gt_query('DELETE FROM {{strava_events}} WHERE account_id = ? AND object_id = ? AND marker = ?', [$state['account'] ?? 1,$event['object_id'],$event['marker']]);
            $db->commit();
            $state = $next;
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    } catch (Throwable $e) {
        $state['error'] = $e instanceof RuntimeException && !($e instanceof PDOException) ? $e->getMessage() : 'Der Strava-Abgleich konnte nicht gespeichert werden.';
        $state['retry'] = $now + ($e->getCode() === 429 ? 900 : 300);
        gt_strava_save($state);
        throw new RuntimeException($state['error']);
    }
}

function gt_strava_sync_accounts(?array $unusedLegacyConfig = null, ?callable $request = null): void {
    $errors = [];
    foreach ([1,2] as $account) {
        $lock = gt_strava_lock($account);
        if (!$lock) continue;
        try {
            gt_log_context(['module'=>'strava','connection'=>$account,'client_id'=>null,'attempt_id'=>null,'request_id'=>null]);
            $state = gt_strava_state($account);
            $flow=$state['flow']??[];
            if(isset($flow['expires'])&&$flow['expires']<time()&&empty($flow['logged_expired'])){
                gt_log('warning','strava','OAuth-Versuch ohne Rückkehr abgelaufen.',['module'=>'strava','operation'=>'oauth.expired','connection'=>$account,'attempt_id'=>$flow['attempt_id']??'','request_id'=>$flow['request_id']??gt_log_id()]);
                $state['flow']['logged_expired']=true;gt_strava_save($state);
            }
            $config = gt_strava_config($account);
            if (!$config) continue;
            if (($state['worker'] ?? 0) < time()-300) {
                $state['worker'] = time(); gt_strava_save($state);
            }
            gt_strava_sync($config,$state,false,$request);
        } catch (Throwable $e) {
            gt_log_exception($e,'background',['module'=>'strava','connection'=>$account,'operation'=>'sync']);
            $errors[] = 'Verbindung '.$account.': '.($e instanceof RuntimeException && !($e instanceof PDOException) ? $e->getMessage() : 'Abgleich fehlgeschlagen.');
        } finally { flock($lock,LOCK_UN); fclose($lock); }
    }
    if ($errors) throw new RuntimeException(implode(' ', $errors));
}

function gt_strava_clear(array &$state): void {
    $state = array_intersect_key($state, ['account'=>true, 'subscription'=>true, 'worker'=>true]);
    gt_strava_save($state);
    gt_query('DELETE FROM {{strava_events}} WHERE account_id = ?', [$state['account'] ?? 1]);
    $state = gt_strava_state($state['account'] ?? 1);
}

function gt_strava_connect(array $config, array $state, string $code, ?callable $request = null): array {
    $request ??= 'gt_strava_request';
    $token = $request('/oauth/token', null, gt_strava_client_fields($config) +
        ['grant_type'=>'authorization_code', 'code'=>$code]);
    $owner = $token['athlete']['id'] ?? null;
    if (!gt_strava_id($owner)) throw new RuntimeException('Strava hat kein gültiges Konto geliefert.');
    if ($state['owner'] !== '' && $state['owner'] !== (string)$owner) throw new RuntimeException('Bitte wieder mit dem bisherigen Strava-Konto verbinden.');

    foreach (gt_strava_accounts() as $other) {
        if ($other['account'] !== $state['account'] && $other['owner'] === (string)$owner) {
            throw new RuntimeException('Dieses Strava-Konto ist bereits in der Garage verbunden. Wähle das Konto der zweiten Person.');
        }
    }
    $state['name'] = trim(($token['athlete']['firstname'] ?? '').' '.($token['athlete']['lastname'] ?? ''));
    $state['token'] = gt_strava_token($config, $token);
    $state['owner'] = (string)$owner;
    $state['from'] ??= gt_strava_day();
    $state['scanRequested'] = true;
    $state['retry'] = 0;
    $state['error'] = '';
    try {
        $state['gear'] = gt_strava_gear($request('/api/v3/athlete', $token['access_token']), $state['owner']);
    } catch (RuntimeException $e) {
        $state['error'] = 'Die Strava-Räder konnten gerade nicht geladen werden. Versuche es über „Jetzt abgleichen“.';
        if ($e->getCode() === 429) $state['retry'] = time() + 900;
    }
    return $state;
}

function gt_strava_register(array $config, array &$state, ?callable $request = null): void {
    $request ??= 'gt_strava_request';
    $callback = $config['base'].'/api.php/strava-webhook/'.gt_strava_key($config,'callback');
    $fields = gt_strava_client_fields($config);
    $subscriptions = $request('/api/v3/push_subscriptions?'.http_build_query($fields));
    $subscription = $subscriptions[0] ?? null;
    if ($subscription && ($subscription['callback_url'] ?? '') !== $callback) {
        throw new RuntimeException('Diese Strava-API-Anwendung ist bereits mit einer anderen Umgebung verbunden. Verwende die API-Anwendung dieser Umgebung.');
    }
    $subscription ??= $request('/api/v3/push_subscriptions', null, $fields +
        ['callback_url'=>$callback,'verify_token'=>gt_strava_key($config,'verify')]);
    if (!gt_strava_id($subscription['id'] ?? null)) throw new RuntimeException('Strava hat den automatischen Import nicht bestätigt.');
    foreach (gt_strava_accounts() as $account) {
        if (gt_strava_config($account['account']) !== $config) continue;
        $account['subscription'] = (string)$subscription['id'];
        unset($account['registrationError']);
        gt_strava_save($account);
    }
    $state['subscription'] = (string)$subscription['id'];
    unset($state['registrationError']);
    gt_strava_save($state);
}

function gt_strava_callback(array $config, array $state): never {
    $flow = $state['flow'] ?? [];
    $nonce = $_GET['state'] ?? '';
    if (!is_string($nonce) || $nonce === '' || ($flow['expires'] ?? 0) < time() ||
        !hash_equals($flow['nonce'], hash('sha256', $nonce)) ||
        !hash_equals($flow['session'], hash('sha256', $_COOKIE[gt_cookie_name('session')]))) {
        gt_json(['error'=>'Der Strava-Verbindungsversuch ist ungültig oder abgelaufen. Bitte in der Garage neu starten.'], 400);
    }
    gt_log_context(['module'=>'strava','connection'=>$state['account']??1,'attempt_id'=>$flow['attempt_id']??'','request_id'=>$flow['request_id']??gt_log_id()]);
    gt_log('info','strava','OAuth-Rückkehr empfangen.',['operation'=>'oauth.callback']);
    unset($state['flow']);
    gt_strava_save($state);
    $code = $_GET['code'] ?? '';
    $scope = $_GET['scope'] ?? '';
    $status = 'denied';
    if (is_string($code) && $code !== '' && is_string($scope) &&
        in_array('activity:read_all', explode(',', $scope), true) &&
        in_array('profile:read_all', explode(',', $scope), true)) {
        try {
            $state = gt_strava_connect($config, $state, $code);
            gt_strava_save($state);
            try {
                gt_strava_register($config, $state);
            } catch (RuntimeException $e) {
                gt_log_exception($e,'strava',['module'=>'strava','operation'=>'webhook.register']);
                $state['registrationError'] = $e instanceof PDOException ? 'Der automatische Import konnte nicht gespeichert werden.' : $e->getMessage();
                gt_strava_save($state);
            }
            $status = 'connected';
        } catch (RuntimeException $e) {
            $status = 'failed';
            gt_log_exception($e,'strava',['module'=>'strava','operation'=>'oauth.exchange']);
            $state['error'] = $e instanceof PDOException ? 'Die Strava-Verbindung konnte nicht gespeichert werden.' : $e->getMessage();
            gt_strava_save($state);
        }
    }
    header('Referrer-Policy: no-referrer');
    header('Location: '.$config['base'].'/#strava/strava-'.$status, true, 303);
    exit;
}

function gt_strava_status(array $state): array {
    $pending = [];
    foreach ($state['rides'] as $ride) {
        if ($ride['bike'] === '') $pending[] = array_intersect_key($ride, ['date'=>true,'meters'=>true,'gear'=>true]);
    }
    usort($pending, fn($a,$b)=>$b['date'] <=> $a['date']);
    return [
        'account'=>$state['account'], 'name'=>$state['name'], 'owner'=>$state['owner'],
        'configured'=>gt_strava_config($state['account']) !== null, 'setup'=>gt_strava_setup($state['account']), 'connected'=>$state['token'] !== '', 'maps'=>(object)$state['maps'],
        'gear'=>(object)$state['gear'], 'pending'=>array_slice($pending, 0, 20), 'pendingCount'=>count($pending),
        'lastSync'=>$state['lastSync'], 'registered'=>isset($state['subscription']),
        'worker'=>$state['worker'] ?? 0, 'error'=>implode(' ', array_filter([$state['error'], $state['registrationError'] ?? ''])), 'today'=>gt_strava_day(),
        'earliest'=>gt_strava_day(-30), 'tomorrow'=>gt_strava_day(1),
    ];
}

function gt_strava_route(string $route, string $method): never {
    gt_strava_init();
    if ($route === 'strava' && $method === 'GET') {
        $accounts = array_map('gt_strava_status',gt_strava_accounts());
        gt_json(array_merge($accounts[0],['configured'=>(bool)array_filter($accounts,fn($a)=>$a['configured']), 'accounts'=>$accounts]));
    }
    if ($method !== 'POST' && !($method === 'GET' && $route === 'strava/callback')) gt_json(['error'=>'Methode nicht erlaubt.'], 405);
    if ($method === 'GET') $updateLock = gt_update_write_guard();
    $body = $method === 'POST' ? gt_body() : [];
    $action = $body['action'] ?? '';
    $account = $body['account'] ?? 1;
    if (!is_int($account) || !in_array($account,[1,2],true)) gt_json(['error'=>'Ungültige Strava-Verbindung.'],400);
    if ($route === 'strava/callback') {
        $nonce = $_GET['state'] ?? '';
        $matched = [];
        if (is_string($nonce) && $nonce !== '') foreach (gt_strava_accounts() as $candidate) {
            if (isset($candidate['flow']['nonce']) && hash_equals($candidate['flow']['nonce'],hash('sha256',$nonce))) $matched[] = $candidate['account'];
        }
        if (count($matched) !== 1) gt_json(['error'=>'Der Strava-Verbindungsversuch ist ungültig oder abgelaufen.'],400);
        $account = $matched[0];
    }
    $lock = gt_strava_lock($account);
    if (!$lock) gt_json(['error'=>'Diese Strava-Verbindung wird gerade bearbeitet. Bitte gleich erneut versuchen.'],409);
    if ($route === 'strava' && $action === 'configure') {
        $settingsLock = gt_strava_lock();
        if (!$settingsLock) gt_json(['error'=>'Strava-Einstellungen werden gerade gespeichert. Bitte erneut versuchen.'],409);
        gt_strava_configure($body);
    }
    gt_log_context(['module'=>'strava','connection'=>$account]);
    $config = gt_strava_config($account);
    if (!$config) gt_json(['error'=>'Richte zuerst die eigenen API-Zugangsdaten für Strava-Verbindung '.$account.' ein.'],409);
    $state = gt_strava_state($account);
    if ($route === 'strava/callback') gt_strava_callback($config, $state);

    if ($action === 'register') {
        gt_strava_register($config, $state);
        gt_json(gt_strava_status($state));
    }
    if ($action === 'connect') {
        $nonce = bin2hex(random_bytes(32));
        $state['flow'] = ['nonce'=>hash('sha256',$nonce),'session'=>hash('sha256',$_COOKIE[gt_cookie_name('session')]),'expires'=>time()+600,'attempt_id'=>bin2hex(random_bytes(8)),'request_id'=>gt_log_id()];
        gt_strava_save($state);
        gt_log('info','strava','Strava-Verbindungsversuch gestartet.',['module'=>'strava','operation'=>'oauth.start','connection'=>$account,'client_id'=>$config['id'],'redirect_uri'=>$config['base'].'/api.php/strava-callback','attempt_id'=>$state['flow']['attempt_id'],'expires_at'=>$state['flow']['expires']]);
        gt_json(['url'=>'https://www.strava.com/oauth/authorize?'.http_build_query([
            'client_id'=>$config['id'], 'redirect_uri'=>$config['base'].'/api.php/strava-callback',
            'response_type'=>'code', 'scope'=>'activity:read,activity:read_all,profile:read_all',
            'approval_prompt'=>'force','state'=>$nonce,
        ])]);
    }
    if ($action === 'disconnect') {
        if ($state['token'] !== '') {
            try {
                $token = gt_strava_access($config, $state, 'gt_strava_request');
                gt_strava_request('/oauth/deauthorize', $token, []);
            } catch (RuntimeException $e) {
                if (!in_array($e->getCode(), [400,401,403], true)) throw $e;
            }
        }
        gt_strava_clear($state);
        gt_json(gt_strava_status($state));
    }
    if ($state['token'] === '') gt_json(['error'=>'Verbinde zuerst dein Strava-Konto.'], 409);
    if ($action === 'map') {
        $gear = $body['gear'] ?? null;
        $id = $body['bike'] ?? null;
        $from = $body['from'] ?? null;
        if (!gt_strava_gear_id($gear) || !isset($state['gear'][$gear]) || !is_string($id) ||
            !is_string($from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D',$from) ||
            !checkdate((int)substr($from,5,2),(int)substr($from,8,2),(int)substr($from,0,4)) ||
            $from < gt_strava_day(-30) || $from > gt_strava_day(1)) gt_json(['error'=>'Fahrrad und gültiges Startdatum auswählen.'], 400);
        $row = gt_query('SELECT data,version FROM {{garage}} WHERE id = 1')->fetch(PDO::FETCH_ASSOC);
        $garage = $row ? json_decode($row['data'],true,64,JSON_THROW_ON_ERROR) : ['bikes'=>[]];
        if (!$row || (int)$row['version'] !== ($body['version'] ?? null)) gt_json(['error'=>'Der Kilometerstand wurde inzwischen geändert. Lade die Garage neu und bestätige den Startstand erneut.'], 409);
        $valid = array_filter($garage['bikes'], fn($bike)=>$bike['id'] === $id && empty($bike['archived']));
        if (!$valid || isset($state['maps'][$gear]) || in_array($id,array_merge(...array_map(fn($account)=>array_column($account['maps'],'bike'),gt_strava_accounts())),true)) {
            gt_json(['error'=>'Das Fahrrad ist nicht verfügbar oder bereits zugeordnet.'], 409);
        }
        $state['maps'][$gear] = ['bike'=>$id,'from'=>$from];
        $state['from'] = min($state['from'], $from);
        $state['scanRequested'] = true;
        gt_strava_save($state);
        gt_json(gt_strava_status($state));
    }
    if ($action === 'sync') {
        gt_strava_sync($config, $state, true);
        gt_json(gt_strava_status($state));
    }
    gt_json(['error'=>'Unbekannte Strava-Aktion.'], 400);
}

function gt_strava_webhook(string $method, string $key): never {
    header('Referrer-Policy: no-referrer');
    $candidates = [];
    foreach ([1,2] as $slot) {
        $candidate = gt_strava_config($slot);
        if ($candidate && hash_equals(gt_strava_key($candidate,'callback'),$key)) $candidates[$slot]=$candidate;
    }
    if (!$candidates) gt_json(['error'=>'Nicht gefunden.'],404);
    $config = reset($candidates);
    if ($method === 'GET') {
        $verify = $_GET['hub_verify_token'] ?? '';
        $challenge = $_GET['hub_challenge'] ?? null;
        if (($_GET['hub_mode'] ?? '') !== 'subscribe' || !is_string($verify) || !hash_equals(gt_strava_key($config,'verify'),$verify) ||
            !is_string($challenge) || $challenge === '' || strlen($challenge) > 200) gt_json(['error'=>'Ungültige Webhook-Bestätigung.'], 403);
        gt_json(['hub.challenge'=>$challenge]);
    }
    if ($method !== 'POST') gt_json(['error'=>'Methode nicht erlaubt.'], 405);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) gt_json(['error'=>'Webhook zu groß.'], 413);
    $event = gt_body();
    gt_strava_init();
    $state = null;
    foreach (gt_strava_accounts() as $account) {
        if (!isset($candidates[$account['account']])) continue;
        if ((string)($event['owner_id'] ?? '') === $account['owner'] && $account['owner'] !== '') $state = $account;
    }
    if ($state === null || $state['owner'] === '' || !gt_strava_id($event['owner_id'] ?? null) || (string)$event['owner_id'] !== $state['owner'] ||
        !isset($state['subscription']) || !gt_strava_id($event['subscription_id'] ?? null) || (string)$event['subscription_id'] !== $state['subscription']) gt_json(['ok'=>true]);
    $type = $event['object_type'] ?? '';
    $aspect = $event['aspect_type'] ?? '';
    $id = $event['object_id'] ?? null;
    if ($type === 'athlete' && $aspect === 'update' && gt_strava_id($id) && (string)$id === $state['owner'] &&
        in_array($event['updates']['authorized'] ?? null, ['false', false], true)) $id = '0';
    elseif ($type !== 'activity' || !gt_strava_id($id) || !in_array($aspect,['create','update','delete'],true)) gt_json(['ok'=>true]);
    $marker = bin2hex(random_bytes(16));
    gt_query('INSERT INTO {{strava_events}} (account_id,object_id,marker) VALUES (?,?,?) ON DUPLICATE KEY UPDATE marker = ?', [$state['account'],(string)$id,$marker,$marker]);
    gt_json(['ok'=>true]);
}
