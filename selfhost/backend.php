<?php
declare(strict_types=1);

// Included by the two public PHP entry points; never installed in the public directory.
ini_set('display_errors', '0');
umask(0027);
require_once __DIR__ . '/updates.php';
require_once __DIR__ . '/logging.php';
require_once __DIR__ . '/tirepark.php';
gt_log_install();

function gt_json(array $value, int $status = 200): never {
    if($status>=400&&isset($value['error'])){gt_log($status>=500?'error':'warning','backend',is_string($value['error'])?$value['error']:'Fehlerantwort',['http_status'=>$status]);$value['requestId']=gt_log_id();}
    header('X-Garage-Request-Id: '.gt_log_id());
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function gt_headers(): void {
    header('X-Garage-Request-Id: '.gt_log_id());
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header('X-Frame-Options: DENY');
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
}

function gt_https(): bool {
    if ((!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') || (string)($_SERVER['SERVER_PORT'] ?? '') === '443') return true;
    // Never trust a forwarded header from an arbitrary visitor. Exact peers only;
    // this setting is opt-in after checking the provider's actual proxy setup.
    $trusted = gt_config()['trusted_proxies'] ?? [];
    return gt_trusted_https_proxy($_SERVER,$trusted);
}

function gt_trusted_https_proxy(array $server,mixed $trusted): bool {
    $peer=$server['REMOTE_ADDR']??'';
    return is_array($trusted) && is_string($peer) && filter_var($peer,FILTER_VALIDATE_IP)!==false && in_array($peer,$trusted,true) && ($server['HTTP_X_FORWARDED_PROTO']??'')==='https';
}

function gt_dev(): bool {
    return PHP_SAPI === 'cli-server' && getenv('GRAVELTUBE_DEV') === '1';
}

function gt_require_https(): void {
    if (!gt_https() && !gt_dev()) {
        gt_json(['error' => 'Bitte diese App über https:// öffnen und ein gültiges SSL-Zertifikat für die Domain aktivieren.'], 426);
    }
}

function gt_base_path(): string {
    $dir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php'));
    return ($dir === '/' || $dir === '.') ? '/' : rtrim($dir, '/') . '/';
}

function gt_config(): array {
    return require __DIR__ . '/config.php';
}

function gt_storage(): string {
    $config = gt_config();
    $path = $config['storage_path'] ?? (__DIR__ . '/data');
    if (!is_dir($path) && !mkdir($path, 0750, true) && !is_dir($path)) {
        throw new RuntimeException('Das private Datenverzeichnis kann nicht angelegt werden.');
    }
    if (!is_writable($path)) {
        throw new RuntimeException('Das private Datenverzeichnis ist nicht beschreibbar.');
    }
    return $path;
}

function gt_table(string $name): string {
    $prefix = gt_config()['database']['table_prefix'] ?? 'gt_';
    if (!is_string($prefix) || !preg_match('/^[a-z][a-z0-9_]{0,19}$/D', $prefix)) {
        throw new RuntimeException('Bitte einen gültigen Tabellenpräfix in private/config.php eintragen, zum Beispiel gt_.');
    }
    return '`' . $prefix . $name . '`';
}

function gt_sql(string $sql): string {
    return preg_replace_callback('/\{\{(accounts|garage|sessions|attempts|files|meta|password_policy|security|mfa_flows|strava|strava_events)\}\}/', fn(array $m) => gt_table($m[1]), $sql);
}

function gt_db(): PDO {
    static $db = null;
    if ($db instanceof PDO) return $db;
    $config = gt_config()['database'] ?? [];
    foreach (['host','name','user','password'] as $field) {
        if (!is_string($config[$field] ?? null) || $config[$field] === '') {
            throw new RuntimeException('Bitte zuerst die MariaDB-/MySQL-Zugangsdaten in private/config.php unter database eintragen (host, name, user, password).');
        }
    }
    if (!preg_match('/^[a-zA-Z0-9.\-_:]+$/D', $config['host']) || !preg_match('/^[a-zA-Z0-9_$-]+$/D', $config['name'])) {
        throw new RuntimeException('Bitte Datenbankserver und Datenbankname in private/config.php prüfen.');
    }
    $port = $config['port'] ?? 3306;
    if (!is_int($port) || $port < 1 || $port > 65535) throw new RuntimeException('Ungültiger MySQL-Port in private/config.php.');
    if (!extension_loaded('pdo_mysql')) throw new RuntimeException('PDO_MySQL fehlt. Bitte PHP 8.2 oder neuer mit PDO_MySQL aktivieren.');
    if (!extension_loaded('fileinfo')) throw new RuntimeException('Die PHP-Erweiterung fileinfo fehlt. Bitte im Hosting aktivieren.');
    gt_storage();
    // unix_socket is only needed for local development; Uberspace supports host localhost; a configured socket also works.
    $socket = $config['unix_socket'] ?? '';
    if (!is_string($socket) || strpbrk($socket, ";\r\n") !== false) throw new RuntimeException('Ungültiger MySQL-Socket.');
    $dsn = 'mysql:' . ($socket !== '' ? 'unix_socket=' . $socket : 'host=' . $config['host'] . ';port=' . $port) . ';dbname=' . $config['name'] . ';charset=utf8mb4';
    try {
        $connection = new PDO($dsn, $config['user'], $config['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 10,
            PDO::MYSQL_ATTR_MULTI_STATEMENTS => false,
        ]);
    } catch (PDOException $e) {
        // Do not expose connection details or credentials to visitors.
        throw new RuntimeException('MySQL-Verbindung fehlgeschlagen. Bitte Server, Datenbankname, Benutzer und Passwort in private/config.php mit den Angaben deines Hosters vergleichen.');
    }
    try {
        $schemaVersion = (int) $connection->query(gt_sql('SELECT version FROM {{meta}} WHERE id = 1'))->fetchColumn();
    } catch (PDOException $e) {
        if (($e->errorInfo[1] ?? 0) !== 1146) throw $e;
        $schemaVersion = 0;
    }
    if ($schemaVersion > 1) throw new RuntimeException('Die Datenbank ist neuer als diese App-Version. Bitte die neueste App hochladen.');
    if ($schemaVersion === 0) {
        // MySQL DDL commits implicitly: each statement is idempotent and the version
        // marker is written last, so an interrupted initial setup can be retried.
        $schema = file_get_contents(__DIR__ . '/schema.sql');
        if ($schema === false) throw new RuntimeException('Das Datenbankschema fehlt. Bitte das Paket vollständig hochladen.');
        foreach (explode(';', $schema) as $statement) {
            if (trim($statement) !== '') $connection->exec(gt_sql($statement));
        }
    }
    $db = $connection;
    return $db;
}

function gt_query(string $sql, array $values = []): PDOStatement {
    $stmt = gt_db()->prepare(gt_sql($sql));
    $stmt->execute($values);
    return $stmt;
}

function gt_body(): array {
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 2100000) gt_json(['error' => 'Daten sind zu groß.'], 413);
    $raw = file_get_contents('php://input', false, null, 0, 2100001);
    if ($raw === false || strlen($raw) > 2100000) gt_json(['error' => 'Daten sind zu groß.'], 413);
    try { $body = json_decode($raw, true, 64, JSON_THROW_ON_ERROR); }
    catch (JsonException $e) { gt_json(['error' => 'Ungültiges JSON.'], 400); }
    if (!is_array($body)) gt_json(['error' => 'Ungültige Anfrage.'], 400);
    return $body;
}

function gt_origin(): void {
    $config = gt_config();
    $expected = rtrim($config['origin'] ?? '', '/');
    if ($expected === '') $expected = (gt_https() ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? '');
    if (!hash_equals($expected, $_SERVER['HTTP_ORIGIN'] ?? '')) gt_json(['error' => 'Ungültiger Ursprung der Anfrage.'], 403);
}

function gt_cookie_name(string $kind): string {
    $prefix = gt_config()['cookie_prefix'] ?? 'garage_';
    if (!is_string($prefix) || !preg_match('/^[a-z][a-z0-9_]{0,79}$/D', $prefix)) throw new RuntimeException('Ungültiger Cookie-Präfix.');
    return $prefix . $kind;
}

function gt_cookie(string $token, int $expires): void {
    setcookie(gt_cookie_name('session'), $token, ['expires' => $expires, 'path' => gt_base_path(), 'secure' => !gt_dev(), 'httponly' => true, 'samesite' => 'Lax']);
}

function gt_account(): array|false {
    return gt_query('SELECT * FROM {{accounts}} WHERE id = 1')->fetch(PDO::FETCH_ASSOC);
}

function gt_session(): bool {
    $token = $_COOKIE[gt_cookie_name('session')] ?? '';
    return is_string($token) && preg_match('/^[a-f0-9]{64}$/D', $token) &&
        (bool) gt_query('SELECT 1 FROM {{sessions}} WHERE token = ? AND expires > ?', [hash('sha256', $token), time()])->fetchColumn();
}

function gt_attempt_key(): string {
    // Do not trust proxy headers supplied by the visitor.
    return hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

function gt_rate_limit(): void {
    $now = time();
    gt_query('DELETE FROM {{attempts}} WHERE since < ?', [$now - 86400]);
    $row = gt_query('SELECT count, since FROM {{attempts}} WHERE client_key = ?', [gt_attempt_key()])->fetch(PDO::FETCH_ASSOC);
    if ($row && $now - (int) $row['since'] < 900 && (int) $row['count'] >= 10) {
        header('Retry-After: ' . max(1, 900 - ($now - (int) $row['since'])));
        gt_json(['error' => 'Zu viele Versuche. Bitte nach 15 Minuten erneut versuchen.'], 429);
    }
    gt_query('INSERT INTO {{attempts}}(client_key,count,since) VALUES(?,1,?) ON DUPLICATE KEY UPDATE count=CASE WHEN since < ? THEN 1 ELSE count+1 END, since=CASE WHEN since < ? THEN ? ELSE since END', [gt_attempt_key(), $now, $now-900, $now-900, $now]);
}

function gt_auth(): never {
    $body = gt_body();
    gt_policy_init();
    gt_login_check();
    $account = gt_account();
    if (!$account) gt_rate_limit();
    $username = $body['username'] ?? null;
    $password = $body['password'] ?? null;
    if (!is_string($username) || !is_string($password) || strlen(trim($username)) < 3 || strlen($username) > 80 || strlen($password) > 72 || str_contains($password, "\0")) {
        gt_json(['error' => 'Bitte gültige Zugangsdaten eingeben. Das Passwort darf höchstens 72 UTF-8-Bytes enthalten.'], 400);
    }
    if (!$account) {
        $setup = require __DIR__ . '/setup-key.php';
        $configuredKey = gt_config()['installation_key'] ?? '';
        if (is_string($configuredKey) && strlen($configuredKey) >= 32) $setup = hash('sha256', $configuredKey);
        if (!is_string($setup) || strlen($setup) !== 64) gt_json(['error' => 'Bitte vor der Ersteinrichtung einen eigenen zufälligen Installationsschlüssel (mindestens 32 Zeichen) in private/config.php unter installation_key eintragen.'], 503);
        $key = $body['setupKey'] ?? '';
        if (!is_string($key) || !hash_equals($setup, hash('sha256', $key))) gt_json(['error' => 'Der Installationsschlüssel ist ungültig. Verwende den privat in deiner Konfiguration hinterlegten Schlüssel.'], 403);
        if ($error = gt_password_error($password)) gt_json(['error' => $error], 400);
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $db = gt_db();
        $db->beginTransaction();
        gt_query('SELECT version FROM {{meta}} WHERE id = 1 FOR UPDATE');
        try {
            if (gt_account()) { $db->rollBack(); gt_json(['error' => 'Die Einrichtung ist bereits abgeschlossen. Bitte anmelden.'], 409); }
            gt_query('INSERT INTO {{accounts}}(id,username,password_hash) VALUES(1,?,?)', [trim($username), $hash]);
            gt_query('INSERT INTO {{password_policy}} (id,changed_at,must_change,history) VALUES(1,?,0,?)', [time(), json_encode([$hash])]);
            $db->commit();
        } catch (Throwable $e) { $db->rollBack(); throw $e; }
    } else {
        // Verify the password even when the username does not match.
        $valid = password_verify($password, $account['password_hash']);
        if (!$valid || !hash_equals($account['username'], trim($username))) { gt_login_failed(); gt_json(['error' => 'Benutzername oder Passwort ist falsch.'], 401); }
    }
    gt_mfa_db();
    gt_db()->beginTransaction();
    $mfa = gt_mfa_state(true);
    if ($account) {
        $lockedHash = gt_query('SELECT password_hash FROM {{accounts}} WHERE id = 1 FOR UPDATE')->fetchColumn();
        if ($lockedHash !== $account['password_hash']) {
            gt_db()->rollBack();
            gt_json(['error' => 'Das Passwort wurde geändert. Bitte erneut anmelden.'], 409);
        }
        if (password_needs_rehash($lockedHash, PASSWORD_DEFAULT)) {
            gt_query('UPDATE {{accounts}} SET password_hash = ? WHERE id = 1', [password_hash($password, PASSWORD_DEFAULT)]);
        }
    }
    if ($mfa['enabled']) gt_mfa_pending();
    gt_issue_session();
}

function gt_issue_session(): never {
    gt_login_check();
    gt_query('UPDATE {{password_policy}} SET failed_count=0,blocked_until=0 WHERE id=1');
    gt_query('DELETE FROM {{attempts}} WHERE client_key = ?', [gt_attempt_key()]);
    gt_query('DELETE FROM {{sessions}} WHERE expires < ?', [time()]);
    $old = $_COOKIE[gt_cookie_name('session')] ?? '';
    if (is_string($old) && $old !== '') gt_query('DELETE FROM {{sessions}} WHERE token = ?', [hash('sha256', $old)]);
    $token = bin2hex(random_bytes(32));
    $expires = time() + 30 * 86400;
    gt_query('INSERT INTO {{sessions}}(token,expires) VALUES(?,?)', [hash('sha256', $token), $expires]);
    gt_cookie($token, $expires);
    if (gt_db()->inTransaction()) gt_db()->commit();
    gt_json(['ok' => true, 'passwordChangeRequired'=>gt_password_status()['required']]);
}

function gt_supply_number(mixed $v): bool {
    return (is_int($v) || is_float($v)) && is_finite((float) $v) && $v >= 0 && $v <= 100000000 && abs($v * 1000 - round($v * 1000)) < 0.00001;
}
function gt_supply_date(mixed $v): bool {
    if ($v === '') return true;
    if (!is_string($v)) return false;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $v);
    return $date && $date->format('Y-m-d') === $v;
}
function gt_invoices(mixed $rows): bool {
    if (!is_array($rows) || !array_is_list($rows) || count($rows) > 100) return false;
    foreach ($rows as $r) {
        if (!is_array($r) || !is_string($r['fileId'] ?? null) || !preg_match('/^[a-f0-9]{32}$/D', $r['fileId']) || !is_string($r['name'] ?? null) || strlen($r['name']) > 1000 || !is_int($r['size'] ?? null) || $r['size'] < 1 || $r['size'] > 20 * 1024 * 1024) return false;
    }
    return true;
}
function gt_component_categories(array $data): array {
    return array_merge(['Antrieb','Bremsen','Räder','Reifen','Cockpit','Sattel','Licht','Zubehör'],$data['customComponentCategories']??[]);
}
function gt_validate_supplies(array $data, array $bikes): bool {
    $inventory = $data['inventory'] ?? []; $shopping = $data['shopping'] ?? [];
    if (!is_array($inventory) || !array_is_list($inventory) || !is_array($shopping) || !array_is_list($shopping)) return false;
    $stock = []; $purchases = []; $plans = array_column($data['plans'], null, 'id');
    $units = ['Stück','Paar','Set','Liter','Milliliter','Meter','Zentimeter','Kilogramm','Gramm'];
    foreach ($inventory as $item) {
        if (!is_array($item) || !is_string($item['id'] ?? null) || $item['id'] === '' || isset($stock[$item['id']])) return false;
        foreach (['name'=>800,'manufacturer'=>800,'articleNumber'=>800,'location'=>1200,'notes'=>40000] as $key=>$limit) if (!is_string($item[$key] ?? null) || strlen($item[$key]) > $limit) return false;
        if (trim($item['name']) === '' || !in_array($item['category'] ?? '', gt_component_categories($data), true) || !in_array($item['kind'] ?? '', ['Original','Zubehör'], true) || !in_array($item['unit'] ?? '', $units, true)) return false;
        foreach (['quantity','minStock'] as $key) if (!gt_supply_number($item[$key] ?? null)) return false;
        if (!gt_feature_price($item['unitPrice'] ?? null)) return false;
        if (!gt_supply_date($item['purchaseDate'] ?? '') || !gt_invoices($item['invoices'] ?? [])) return false;
        $stock[$item['id']] = $item;
    }
    foreach ($shopping as $item) {
        if (!is_array($item) || !is_string($item['id'] ?? null) || $item['id'] === '' || isset($purchases[$item['id']])) return false;
        foreach (['name'=>800,'manufacturer'=>800,'articleNumber'=>800,'dealer'=>1200,'url'=>8000,'notes'=>40000] as $key=>$limit) if (!is_string($item[$key] ?? null) || strlen($item[$key]) > $limit) return false;
        if (trim($item['name']) === '' || !in_array($item['unit'] ?? '', $units, true) || !in_array($item['source'] ?? '', ['stock','online','local'], true) || !in_array($item['status'] ?? '', ['needed','purchased'], true)) return false;
        foreach (['quantity','unitPrice','usedQuantity'] as $key) if (!gt_supply_number($item[$key] ?? null)) return false;
        if ($item['quantity'] <= 0 || $item['usedQuantity'] > $item['quantity']) return false;
        foreach (['bikeId','planId','inventoryId'] as $key) if (!is_string($item[$key] ?? null)) return false;
        if ($item['bikeId'] !== '' && !isset($bikes[$item['bikeId']])) return false;
        if ($item['planId'] !== '' && (!isset($plans[$item['planId']]) || $plans[$item['planId']]['bikeId'] !== $item['bikeId'])) return false;
        if ($item['inventoryId'] !== '' && !isset($stock[$item['inventoryId']])) return false;
        if ($item['source'] === 'stock' || !empty($item['receivedAt'])) {
            if ($item['status'] !== 'purchased' || !isset($stock[$item['inventoryId']]) || $stock[$item['inventoryId']]['unit'] !== $item['unit']) return false;
        }
        if ($item['url'] !== '' && (!filter_var($item['url'], FILTER_VALIDATE_URL) || !in_array(strtolower(parse_url($item['url'], PHP_URL_SCHEME) ?? ''), ['http','https'], true))) return false;
        if (!gt_supply_date($item['purchaseDate'] ?? '') || !gt_supply_date($item['receivedAt'] ?? '') || !gt_invoices($item['invoices'] ?? [])) return false;
        $purchases[$item['id']] = true;
    }
    foreach ($data['history'] as $entry) {
        if (isset($entry['attachments']) && !gt_invoices($entry['attachments'])) return false;
        if (!isset($entry['materials'])) continue;
        if (!is_array($entry['materials']) || !array_is_list($entry['materials'])) return false;
        foreach ($entry['materials'] as $m) {
            if (!is_array($m) || !is_string($m['name'] ?? null) || !is_string($m['articleNumber'] ?? null) || !is_string($m['shoppingId'] ?? null) || !is_string($m['inventoryId'] ?? null) || !in_array($m['unit'] ?? '', $units, true) || !gt_supply_number($m['quantity'] ?? null) || $m['quantity'] <= 0 || !gt_supply_number($m['unitPrice'] ?? null)) return false;
        }
    }
    return true;
}

function gt_validate_contacts(array $data): bool {
    $contacts = $data['contacts'] ?? []; $appointments = $data['appointments'] ?? [];
    if (!is_array($contacts) || !array_is_list($contacts) || !is_array($appointments) || !array_is_list($appointments)) return false;
    $ids = []; $appointmentIds = []; $bikes = array_column($data['bikes'], null, 'id'); $plans = array_column($data['plans'], null, 'id'); $history = array_column($data['history'], null, 'id');
    foreach ($contacts as $c) {
        if (!is_array($c) || !is_string($c['id'] ?? null) || $c['id'] === '' || isset($ids[$c['id']])) return false;
        foreach (['name'=>800,'address'=>8000,'person'=>800,'customerNumber'=>800,'phone'=>400,'email'=>1200,'notes'=>40000] as $key=>$limit) if (!is_string($c[$key] ?? null) || strlen($c[$key]) > $limit) return false;
        if (trim($c['name']) === '' || !in_array($c['type'] ?? '', ['Händler','Werkstatt','Lieferant'], true) || ($c['email'] !== '' && !filter_var($c['email'], FILTER_VALIDATE_EMAIL))) return false;
        $docs = $c['documents'] ?? [];
        if (!gt_invoices($docs)) return false;
        $docIds = [];
        foreach ($docs as $d) {
            if (!is_string($d['id'] ?? null) || isset($docIds[$d['id']]) || !is_string($d['title'] ?? null) || strlen($d['title']) > 1000 || !in_array($d['category'] ?? '', ['Rechnung','Lieferschein','Gutschein','Sonstiges'], true) || !gt_supply_date($d['date'] ?? null) || $d['date'] === '') return false;
            $docIds[$d['id']] = true;
        }
        $ids[$c['id']] = true;
    }
    foreach (array_merge($data['plans'], $data['history']) as $entry) {
        $id = $entry['contactId'] ?? '';
        if (!is_string($id) || ($id !== '' && !isset($ids[$id]))) return false;
    }
    foreach ($appointments as $a) {
        if (!is_array($a) || !is_string($a['id'] ?? null) || $a['id'] === '' || isset($appointmentIds[$a['id']])) return false;
        foreach (['title'=>800,'contactId'=>200,'bikeId'=>200,'planId'=>200,'notes'=>40000] as $key=>$limit) if (!is_string($a[$key] ?? null) || strlen($a[$key]) > $limit) return false;
        if (trim($a['title']) === '' || !isset($ids[$a['contactId']]) || !isset($bikes[$a['bikeId']]) || !gt_supply_date($a['date'] ?? null) || $a['date'] === '' || !is_string($a['time'] ?? null) || !preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/D', $a['time']) || !in_array($a['status'] ?? '', ['planned','confirmed','completed','cancelled'], true)) return false;
        if ($a['planId'] !== '' && (!isset($plans[$a['planId']]) || $plans[$a['planId']]['bikeId'] !== $a['bikeId'])) return false;
        if (isset($a['historyId']) && (!is_string($a['historyId']) || !isset($history[$a['historyId']]) || $history[$a['historyId']]['bikeId'] !== $a['bikeId'] || ($history[$a['historyId']]['contactId'] ?? '') !== $a['contactId'] || $a['status'] !== 'completed')) return false;
        $appointmentIds[$a['id']] = true;
    }
    foreach (array_merge($data['inventory'] ?? [],is_array($data['computers']??[])?($data['computers']??[]):[]) as $item) {
        if (!isset($item['photo'])) continue;
        if (!is_string($item['photo']) || !preg_match('/^[a-f0-9]{32}$/D', $item['photo'])) return false;
        $mime = gt_query('SELECT mime FROM {{files}} WHERE id = ?', [$item['photo']])->fetchColumn();
        if (!is_string($mime) || !str_starts_with($mime, 'image/')) return false;
    }
    return true;
}

function gt_validate_data(mixed $data): bool {
    if (!is_array($data)) return false;
    foreach (['bikes', 'plans', 'history', 'documents'] as $key) {
        if (!isset($data[$key]) || !is_array($data[$key]) || !array_is_list($data[$key])) return false;
    }
    $custom=$data['customComponentCategories']??[];
    if(!is_array($custom)||!array_is_list($custom)||count($custom)>100)return false;
    foreach($custom as $name)if(!is_string($name)||trim($name)===''||strlen($name)>800)return false;
    $ids = [];
    foreach ($data['bikes'] as $b) {
        if (!is_array($b) || !is_string($b['id'] ?? null) || !is_string($b['name'] ?? null) || trim($b['name']) === '' || isset($ids[$b['id']]) || !is_numeric($b['km'] ?? null) || !is_finite((float) $b['km']) || $b['km'] < 0 || !is_array($b['components'] ?? null)) return false;
        $ids[$b['id']] = true;
        foreach ($b['components'] as $component) {
            if (!is_array($component) || !is_string($component['name'] ?? null)) return false;
            if (isset($component['manufacturer']) && (!is_string($component['manufacturer']) || strlen($component['manufacturer']) > 800)) return false;
            foreach (['originalPartNumber' => 800, 'lastPurchasedAt' => 2000] as $key => $limit) {
                if (isset($component[$key]) && (!is_string($component[$key]) || strlen($component[$key]) > $limit)) return false;
            }
            foreach (['partNumber','sprocketRange','toothCount','powerManufacturer','powerModel','powerSerial'] as $key) {
                if (isset($component[$key]) && !gt_feature_text($component[$key], 800)) return false;
            }
            foreach (['sprocketCount','linkCount','crankLength'] as $key) {
                $value = $component[$key] ?? null;
                if ($value !== null && (!gt_supply_number($value) || $value <= 0 || $value > 10000
                    || ($key !== 'crankLength' && !is_int($value)))) return false;
            }
            if (isset($component['powerMeter']) && !is_bool($component['powerMeter'])) return false;
            $price = $component['price'] ?? null;
            if ($price !== null && ((!is_int($price) && !is_float($price)) || !is_finite((float) $price) || $price < 0)) return false;
            if (isset($component['wheel'])) {
                if (!is_array($component['wheel'])) return false;
                foreach (['axleDimension','brakeMount','rimMaterial','freehub'] as $key) {
                    if (isset($component['wheel'][$key]) && (!is_string($component['wheel'][$key]) || strlen($component['wheel'][$key]) > 800)) return false;
                }
                foreach (['rimHeight','internalWidth'] as $key) {
                    $value = $component['wheel'][$key] ?? null;
                    if ($value !== null && ((!is_int($value) && !is_float($value)) || !is_finite((float) $value) || $value < 0)) return false;
                }
                $serviceDate = $component['wheel']['bearingServiceDate'] ?? '';
                if (!is_string($serviceDate)) return false;
                if ($serviceDate !== '') {
                    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $serviceDate);
                    if (!$date || $date->format('Y-m-d') !== $serviceDate) return false;
                }
            }
            if (isset($component['category']) && !in_array($component['category'], gt_component_categories($data), true)) return false;
            if (isset($component['installedKm']) && (!is_int($component['installedKm']) && !is_float($component['installedKm']) || !is_finite((float) $component['installedKm']) || $component['installedKm'] < 0)) return false;
            if (isset($component['installedDate']) && $component['installedDate'] !== '') {
                if (!is_string($component['installedDate'])) return false;
                $date = DateTimeImmutable::createFromFormat('!Y-m-d', $component['installedDate']);
                if (!$date || $date->format('Y-m-d') !== $component['installedDate']) return false;
            }
        }
    }
    foreach (['plans','history','documents'] as $key) {
        foreach ($data[$key] as $item) {
            if (!is_array($item) || !is_string($item['id'] ?? null) || !is_string($item['bikeId'] ?? null) || !isset($ids[$item['bikeId']]) || !is_string($item['title'] ?? null)) return false;
        }
    }
    return gt_validate_supplies($data, $ids) && gt_validate_contacts($data) && gt_validate_features($data) && gt_validate_workshop($data, $ids);
}

function gt_upload(): never {
    $file = $_FILES['file'] ?? null;
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        gt_json(['error' => 'Upload fehlgeschlagen. Maximal 20 MB pro Datei. Bitte upload_max_filesize (20M) und post_max_size (24M) im Hosting prüfen.'], 400);
    }
    if (!is_uploaded_file($file['tmp_name']) || $file['size'] <= 0 || $file['size'] > 20 * 1024 * 1024) gt_json(['error' => 'Bitte eine Datei bis 20 MB auswählen.'], 413);
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $allowed = ['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'];
    if (!in_array($mime, $allowed, true)) gt_json(['error' => 'Erlaubt sind echte PDF-, JPG-, PNG-, WebP- und HEIC-Dateien.'], 400);
    $id = bin2hex(random_bytes(16));
    $directory = gt_storage() . '/uploads';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) throw new RuntimeException('Die Dateiablage ist nicht beschreibbar.');
    $path = $directory . '/' . $id . '.bin';
    if (!move_uploaded_file($file['tmp_name'], $path)) throw new RuntimeException('Die Datei konnte nicht gespeichert werden.');
    chmod($path, 0640);
    $name = preg_replace('/[\x00-\x1f\x7f]/u', '', basename(str_replace('\\', '/', $file['name'])));
    $name = $name === null ? 'Dokument' : substr($name, 0, 200);
    while ($name !== '' && preg_match('//u', $name) !== 1) $name = substr($name, 0, -1);
    if ($name === '') $name = 'Dokument';
    try { gt_query('INSERT INTO {{files}}(id,name,mime,size) VALUES(?,?,?,?)', [$id, $name, $mime, $file['size']]); }
    catch (Throwable $e) { unlink($path); throw $e; }
    gt_json(['id' => $id, 'name' => $name, 'type' => $mime, 'size' => (int) $file['size']]);
}

function gt_file(string $id): never {
    if (!preg_match('/^[a-f0-9]{32}$/D', $id)) gt_json(['error' => 'Ungültige Datei.'], 400);
    $file = gt_query('SELECT * FROM {{files}} WHERE id = ?', [$id])->fetch(PDO::FETCH_ASSOC);
    $path = gt_storage() . '/uploads/' . $id . '.bin';
    if (!$file || !is_file($path)) gt_json(['error' => 'Datei nicht gefunden.'], 404);
    // Uploaded documents cannot execute scripts, even when a PDF contains active content.
    header("Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'");
    header('Content-Type: ' . $file['mime']);
    header('Content-Length: ' . filesize($path));
    header("Content-Disposition: inline; filename*=UTF-8''" . rawurlencode($file['name']));
    readfile($path);
    exit;
}

function gt_api(): never {
    gt_headers();
    gt_require_https();
    try {
        $method = $_SERVER['REQUEST_METHOD'];
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
        if (is_string($path) && preg_match('~/api\.php/strava-webhook/([a-f0-9]{64})$~D', $path, $matches)) {
            gt_strava_webhook($method, $matches[1]);
        }
        $route = is_string($path) && str_ends_with($path, '/api.php/strava-callback') ? 'strava/callback' : ($_GET['route'] ?? '');
        if(is_string($route))gt_log_context(['module'=>gt_log_module(explode('/',$route)[0]),'route'=>explode('/',$route)[0],'method'=>$method]);
        if (!is_string($route)) gt_json(['error' => 'Ungültige Route.'], 400);
        if ($method !== 'GET') {
            gt_origin();
            $writeGuard = gt_update_write_guard();
        }
        if ($route === 'auth' && $method === 'GET') {
            $account = gt_account();
            $active = $account && gt_session();
            gt_json(['setup' => !$account, 'mfaPending' => !$active && isset($_COOKIE[gt_cookie_name('pending')]), 'authenticated' => $active, 'username' => $active ? $account['username'] : null, 'passwordStatus'=>$active ? gt_password_status() : null,'tireparkEnabled'=>$active?gt_tp_enabled():false]);
        }
        if ($route === 'auth' && $method === 'POST') gt_auth();
        gt_policy_init();
        if (gt_session() && gt_password_status()['required'] && !in_array($route,['account/password','account/status','logout'],true)) gt_json(['error'=>'Bitte zuerst dein Passwort ändern.', 'passwordChangeRequired'=>true],428);
        if (str_starts_with($route,'security/')) gt_mfa_route($route,$method);
        if (!gt_session()) gt_json(['error' => 'Bitte mit deinem Benutzernamen und Passwort anmelden.'], 401);
        if ($route === 'tirepark') gt_tp_route($method);
        if ($route === 'client-error' && $method === 'POST') {
            $body=gt_body();$entries=$body['entries']??[$body];
            if(!is_array($entries)||count($entries)>25)gt_json(['error'=>'Ungültiger Fehlerbericht.'],400);
            $accepted=0;
            foreach($entries as $entry){
                if(!is_array($entry)||!is_string($entry['context']??null)||!preg_match('/^[a-zA-Z0-9_-]{1,40}$/D',$entry['context'])||!in_array($entry['kind']??'', ['Error','TypeError','SyntaxError','TimeoutError','AbortError'],true))gt_json(['error'=>'Ungültiger Fehlerbericht.'],400);
                $module=match($entry['page']??''){ 'parking','bike','service','history','plan','entry','archive','computers','computer'=>'bikes','stock','shopping','purchase'=>'inventory','orders','order','guides','guide','tools'=>'workshop','contact'=>'contacts','configuration','settings','info','backup'=>'administration','users'=>'auth','inventory'=>'inventory','contacts'=>'contacts','documents'=>'documents','strava'=>'strava','dashboard'=>'dashboard',default=>gt_log_module((string)($entry['page']??''))};
                $diagnostic=gt_log_level()==='debug'?gt_log_diagnostic($entry['diagnosticCode']??null):null;
                if(!gt_log((int)($entry['httpStatus']??0)>=400&&(int)($entry['httpStatus']??0)<500?'warning':'error','frontend',$diagnostic??($entry['kind'].' in '.$entry['context']),['error_code'=>$diagnostic?($entry['diagnosticCode']??''):'','module'=>$module,'operation'=>$entry['context'],'error_type'=>$entry['kind'],'request_id'=>$entry['requestId']??gt_log_id(),'http_status'=>(int)($entry['httpStatus']??0),'count'=>max(1,min(1000000,(int)($entry['count']??1))),'stack'=>is_array($entry['stack']??null)?array_slice(array_filter($entry['stack'],'is_string'),0,12):[],'first_seen'=>isset($entry['at'])?gmdate('c',min(time(),(int)($entry['at']/1000))):gmdate('c')]))gt_json(['error'=>'Fehlerprotokoll momentan nicht verfügbar.'],503);
                $accepted++;
            }
            gt_json(['ok'=>true,'accepted'=>$accepted]);
        }
        if ($route === 'strava' || $route === 'strava/callback') gt_strava_route($route, $method);
        if ($route === 'updates') gt_update_route($method);
        if ($route === 'system' && $method === 'GET') gt_system_status();
        if ($route === 'account/status' && $method === 'GET') gt_json(gt_password_status());
        if ($route === 'account/password' && $method === 'POST') gt_change_password();
        if ($route === 'logout' && $method === 'POST') {
            gt_query('DELETE FROM {{sessions}} WHERE token = ?', [hash('sha256', $_COOKIE[gt_cookie_name('session')])]);
            gt_cookie('', time() - 3600);
            gt_json(['ok' => true]);
        }
        if ($route === 'data' && $method === 'GET') {
            $row = gt_query('SELECT data,version FROM {{garage}} WHERE id = 1')->fetch(PDO::FETCH_ASSOC);
            gt_json($row ? ['data' => json_decode($row['data'], true, 64, JSON_THROW_ON_ERROR), 'version' => (int) $row['version']] : ['data' => ['bikes' => [],'plans' => [],'history' => [],'documents' => []], 'version' => 0]);
        }
        if ($route === 'data' && $method === 'PUT') {
            $body = gt_body();
            if(is_array($body['data']??null))gt_tp_clear_serials($body['data']);
            if (!is_int($body['version'] ?? null) || !gt_validate_data($body['data'] ?? null)) gt_json(['error' => 'Ungültige Fahrraddaten.'], 400);
            gt_query('INSERT INTO {{garage}}(id,data,version) VALUES(1,?,0) ON DUPLICATE KEY UPDATE id = id', ['{"bikes":[],"plans":[],"history":[],"documents":[]}']);
            $previous = gt_query('SELECT data,version FROM {{garage}} WHERE id = 1')->fetch(PDO::FETCH_ASSOC);
            if ((int)$previous['version'] !== $body['version']) gt_json(['error'=>'Auf einem anderen Gerät wurden Daten geändert. Bitte neu laden.'],409);
            $oldData = json_decode($previous['data'],true,64,JSON_THROW_ON_ERROR);gt_tp_clear_serials($oldData);
            if (!gt_tp_guard($oldData,$body['data'])) gt_json(['error'=>'Reifen-Steckbriefe und Wechsel bitte über den Reifenpark speichern.'],400);
            if (!gt_tire_transition($oldData,$body['data'])) gt_json(['error'=>'Reifen bitte über einen Werkstattauftrag ausbauen oder aus dem Lager wieder einbauen. Reifenhistorie und Lagerzuordnung müssen zusammenpassen.'],400);
            if (!gt_computer_transition($oldData,$body['data'])) gt_json(['error'=>'Radcomputer: maximal 25 Zeichen je Feld und 100 Zeichen bei Infos. Bestehende längere Texte dürfen unverändert bleiben.'],400);
            if (!gt_component_archive_transition($oldData,$body['data'])) gt_json(['error'=>'Teilearchiv oder Auftragsabschluss ist inkonsistent. Archivierte Laufleistungen bleiben unveränderlich.'],400);
            if (!gt_workshop_booking_transition($oldData,$body['data'])) gt_json(['error'=>'Auftragsstatus oder Ersatzteilbuchung ist inkonsistent.'],400);
            if (!gt_inventory_transition($oldData,$body['data'])) gt_json(['error'=>'Lagerhistorie oder Servicezuordnung ist inkonsistent. Bereits gebuchte Bewegungen bleiben erhalten.'],400);
            $stmt = gt_query('UPDATE {{garage}} SET data = ?, version = version + 1 WHERE id = 1 AND version = ?', [json_encode($body['data'], JSON_THROW_ON_ERROR), $body['version']]);
            if ($stmt->rowCount() !== 1) gt_json(['error' => 'Auf einem anderen Gerät wurden Daten geändert. Bitte neu laden, bevor du speicherst.'], 409);
            gt_json(['version' => $body['version'] + 1]);
        }
        if ($route === 'inventory-report' && $method === 'GET') {
            require_once __DIR__.'/inventory-report.php';
            $row=gt_query('SELECT data FROM {{garage}} WHERE id = 1')->fetch(PDO::FETCH_ASSOC);
            $format=$_GET['format'] ?? 'pdf';if(!is_string($format))gt_json(['error'=>'Ungültiges Exportformat.'],400);
            gt_inventory_report($row?json_decode($row['data'],true,64,JSON_THROW_ON_ERROR):['inventory'=>[]],$format);
        }
        if ($route === 'biography' && $method === 'GET') {
            require_once __DIR__.'/biography.php';
            $bikeId = $_GET['bike'] ?? ''; $kind = $_GET['kind'] ?? ''; $archive = ($_GET['download'] ?? '') === '1';
            if (!is_string($bikeId) || !is_string($kind) || !in_array($kind, ['seller','workshop'], true)) gt_json(['error'=>'Ungültiger Lebenslauf.'],400);
            $row = gt_query('SELECT data FROM {{garage}} WHERE id=1')->fetchColumn();
            $garage = $row ? json_decode($row,true,64,JSON_THROW_ON_ERROR) : ['bikes'=>[]];
            if (!array_filter($garage['bikes'], fn($b)=>$b['id']===$bikeId)) gt_json(['error'=>'Fahrrad nicht gefunden.'],404);
            $report = gt_bio($garage,$bikeId,$kind,$archive);
            if ($archive && $kind === 'seller') {
                $entries=['Lebenslauf.html'=>['text'=>$report['html']], 'report.js'=>['text'=>"document.querySelector('[data-print]')?.addEventListener('click',()=>window.print());"]];
                foreach ($report['files'] as $name=>$path) $entries[$name]=['path'=>$path];
                gt_bio_zip($entries);
            }
            header('Content-Type: text/html; charset=utf-8'); echo $report['html']; exit;
        }
        if ($route === 'files' && $method === 'POST') gt_upload();
        if (str_starts_with($route, 'files/') && $method === 'GET') gt_file(substr($route, 6));
        gt_json(['error' => 'Nicht gefunden.'], 404);
    } catch (Throwable $e) {
        gt_log_exception($e);
        // Installation failures give actionable, non-secret diagnostics.
        $message = ($e instanceof RuntimeException && !($e instanceof PDOException)) ? $e->getMessage() : 'Die Anfrage konnte nicht verarbeitet werden. Bitte Schreibrechte und PHP-Fehlerprotokoll im Hosting prüfen.';
        gt_json(['error' => $message], 500);
    }
}

require_once __DIR__.'/mfa.php';
require_once __DIR__.'/features.php';

require_once __DIR__.'/administration.php';

require_once __DIR__.'/workshop.php';

require_once __DIR__.'/strava.php';
