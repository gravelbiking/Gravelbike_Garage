<?php
declare(strict_types=1);

function gt_policy_init(): void {
    static $ready = false;
    if ($ready) return;
    gt_query('CREATE TABLE IF NOT EXISTS {{password_policy}} (id TINYINT UNSIGNED PRIMARY KEY, changed_at BIGINT UNSIGNED NULL, must_change TINYINT NOT NULL DEFAULT 1, history TEXT NOT NULL, failed_count INT UNSIGNED NOT NULL DEFAULT 0, blocked_until BIGINT UNSIGNED NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    // Existing accounts have an unknown password age/policy. Retain their current hash,
    // require a change and never invent a history for passwords we have not seen.
    gt_query("INSERT IGNORE INTO {{password_policy}} (id,changed_at,must_change,history) SELECT id,NULL,1,JSON_ARRAY(password_hash) FROM {{accounts}}");
    $ready = true;
}

function gt_password_error(mixed $password): ?string {
    if (!is_string($password) || str_contains($password, "\0") || strlen($password)>72 || preg_match('//u',$password)!==1)
        return 'Das Passwort darf höchstens 72 UTF-8-Bytes enthalten und muss gültigen Text enthalten.';
    if (preg_match_all('/./us',$password)<15) return 'Das Passwort muss mindestens 15 Zeichen enthalten.';
    $groups=0;
    foreach (['/\p{Lu}/u','/\p{Ll}/u','/\p{N}/u','/[^\p{L}\p{N}\s]/u'] as $pattern) $groups += preg_match($pattern,$password)===1 ? 1 : 0;
    return $groups<3 ? 'Verwende mindestens drei Gruppen: Großbuchstaben, Kleinbuchstaben, Zahlen und Sonderzeichen.' : null;
}

function gt_password_status(): array {
    gt_policy_init();
    $row=gt_query('SELECT changed_at,must_change FROM {{password_policy}} WHERE id=1')->fetch(PDO::FETCH_ASSOC);
    $changed=$row && $row['changed_at']!==null ? (int)$row['changed_at'] : null;
    $expires=$changed===null ? null : strtotime('+1 year',$changed);
    $required=!$row || (bool)$row['must_change'] || $expires===null || $expires<=time();
    return ['required'=>$required,'reason'=>$changed===null||!empty($row['must_change'])?'initial':($required?'expired':null),
        'changedAt'=>$changed,'expiresAt'=>$expires,'daysRemaining'=>$expires===null?null:max(0,(int)ceil(($expires-time())/86400))];
}

function gt_login_check(): void {
    gt_policy_init();
    $until=(int)gt_query('SELECT blocked_until FROM {{password_policy}} WHERE id=1')->fetchColumn();
    if ($until>time()) {
        header('Retry-After: '.($until-time()));
        gt_json(['error'=>'Zu viele Fehlversuche. Das Konto ist für zehn Minuten gesperrt.','retryAfter'=>$until-time()],429);
    }
}

function gt_login_failed(): void {
    $db=gt_db();$own=!$db->inTransaction();
    if ($own) $db->beginTransaction();
    try {
        $row=gt_query('SELECT failed_count,blocked_until FROM {{password_policy}} WHERE id=1 FOR UPDATE')->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            $count=(int)$row['blocked_until']>0 && (int)$row['blocked_until']<=time() ? 1 : (int)$row['failed_count']+1;
            $until=(int)$row['blocked_until']>time() ? (int)$row['blocked_until'] : ($count>=10 ? time()+600 : 0);
            gt_query('UPDATE {{password_policy}} SET failed_count=?,blocked_until=? WHERE id=1',[$count,$until]);
        }
        if ($own) $db->commit();
    } catch (Throwable $e) { if ($own && $db->inTransaction()) $db->rollBack(); throw $e; }
    gt_login_check();
}

function gt_change_password(): never {
    $body=gt_body();$current=$body['current']??null;$next=$body['next']??null;
    if (!is_string($current)||$current===''||strlen($current)>72||str_contains($current,"\0")) gt_json(['error'=>'Bitte das aktuelle Passwort eingeben.'],400);
    if ($error=gt_password_error($next)) gt_json(['error'=>$error],400);
    if (!is_string($body['confirmation']??null)||!hash_equals($next,$body['confirmation'])) gt_json(['error'=>'Die neuen Passwörter stimmen nicht überein.'],400);
    gt_policy_init();gt_login_check();gt_mfa_db();
    $db=gt_db();$db->beginTransaction();
    try {
        gt_mfa_state(true);
        $account=gt_query('SELECT password_hash FROM {{accounts}} WHERE id=1 FOR UPDATE')->fetchColumn();
        $policy=gt_query('SELECT history FROM {{password_policy}} WHERE id=1 FOR UPDATE')->fetch(PDO::FETCH_ASSOC);
        if (!gt_session()||!$account||!password_verify($current,$account)) {
            $db->rollBack();gt_login_failed();gt_json(['error'=>'Das aktuelle Passwort ist falsch oder die Sitzung ist abgelaufen.'],403);
        }
        $history=json_decode($policy['history'],true,8,JSON_THROW_ON_ERROR);
        foreach (array_unique([$account,...array_slice($history,0,3)]) as $hash) {
            if (password_verify($next,$hash)) { $db->rollBack();gt_json(['error'=>'Die letzten drei Passwörter dürfen nicht wiederverwendet werden.'],400); }
        }
        $hash=password_hash($next,PASSWORD_DEFAULT);
        // Keep current plus its two immediate predecessors, using salted hashes only.
        $history=[$hash,$account,...array_slice($history,1,1)];
        gt_query('UPDATE {{accounts}} SET password_hash=? WHERE id=1',[$hash]);
        gt_query('UPDATE {{password_policy}} SET changed_at=?,must_change=0,history=?,failed_count=0,blocked_until=0 WHERE id=1',[time(),json_encode($history,JSON_THROW_ON_ERROR)]);
        gt_query('DELETE FROM {{sessions}}');gt_query('DELETE FROM {{mfa_flows}}');
        gt_query('DELETE FROM {{attempts}} WHERE client_key=?',[gt_attempt_key()]);
        $db->commit();
    } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
    gt_cookie('',time()-3600);gt_mfa_cookie('');gt_json(['ok'=>true]);
}

function gt_directory_bytes(array $roots): int {
    $bytes = 0;
    $seen = [];
    $scan = function (string $path) use (&$scan, &$bytes, &$seen): void {
        if (is_link($path) || isset($seen[$path])) return;
        $seen[$path] = true;
        if (is_dir($path)) {
            foreach (new FilesystemIterator($path) as $entry) $scan($entry->getPathname());
        } elseif (is_file($path)) {
            $size = @filesize($path);
            if ($size !== false) $bytes += $size;
        }
    };
    foreach ($roots as $root) $scan($root);
    return $bytes;
}

function gt_system_status(): never {
    $root = dirname(__DIR__);
    $config = gt_config();
    $dbName = $config['database']['name'];
    $storage = realpath(gt_storage());
    $configFile = realpath(__DIR__ . '/config.php');
    $releases = dirname($root);
    $marker = $releases . '/.garage-releases.json';
    $deployment = is_file($marker) ? json_decode(file_get_contents($marker), true) : null;
    $project = $deployment['project'] ?? '';
    $base = dirname($releases);
    $shared = $base . '/' . $project . '.shared';
    $roots = [$root];
    if ($storage) $roots[] = $storage;
    if ($configFile) $roots[] = $configFile;
    if (is_string($project) && preg_match('/^[a-z][a-z0-9-]{2,49}$/D', $project)
        && basename($releases) === $project . '.releases' && $configFile === $shared . '/config.php') {
        $roots = [$releases, $shared, $base . '/' . $project . '.backups'];
        if ($storage) $roots[] = $storage;
    }
    $dbVersion = (string)gt_db()->query('SELECT VERSION()')->fetchColumn();
    $dbBytes = null;
    try {
        $size = gt_query('SELECT SUM(DATA_LENGTH + INDEX_LENGTH) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [$dbName])->fetchColumn();
        if (is_numeric($size)) $dbBytes = (int)$size;
    } catch (PDOException) {
        // Some hosting plans restrict access to this statistic.
    }
    gt_json([
        'release' => json_decode(file_get_contents(__DIR__ . '/release.json'), true, 8, JSON_THROW_ON_ERROR),
        'url' => rtrim($config['origin'] ?: gt_mfa_origin(), '/') . gt_base_path(),
        'path' => $root,
        'php' => PHP_VERSION,
        'database' => ['name' => $dbName, 'version' => $dbVersion],
        'storage' => ['files' => gt_directory_bytes($roots), 'database' => $dbBytes],
    ]);
}
