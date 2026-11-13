<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__.'/backend.php';

try {
    $command = $argv[1] ?? 'sync';
    if (!in_array($command, ['sync','register'], true)) throw new RuntimeException('Aufruf: php strava-job.php [sync|register]');
    $dir = gt_update_dir();
    $updateLock = $dir ? fopen($dir.'/writes.lock', 'c') : null;
    if ($dir && (!$updateLock || !flock($updateLock, LOCK_SH | LOCK_NB))) {
        if ($command === 'sync') exit;
        throw new RuntimeException('Die Garage wird gerade aktualisiert.');
    }
    gt_strava_init();
    $selected = $argv[2] ?? null;
    if ($selected !== null && !in_array($selected,['1','2'],true)) throw new RuntimeException('Verbindung muss 1 oder 2 sein.');
    if ($command === 'sync' && $selected === null) {
        gt_strava_sync_accounts();
    } else {
        $errors=[];
        foreach ($selected === null ? [1,2] : [(int)$selected] as $account) {
            $lock=gt_strava_lock($account);
            if (!$lock) { $errors[]='Verbindung '.$account.' wird gerade bearbeitet.'; continue; }
            try {
                $config=gt_strava_config($account);
                if (!$config) { if($selected !== null)$errors[]='API-Daten für Verbindung '.$account.' fehlen.'; continue; }
                $state=gt_strava_state($account);
                if ($command === 'register') {
                    gt_strava_register($config,$state);
                    echo 'Strava-Webhook für Verbindung '.$account." ist eingerichtet.\n";
                } else gt_strava_sync($config,$state,false);
            } catch (Throwable $e) { $errors[]='Verbindung '.$account.': '.($e instanceof RuntimeException && !($e instanceof PDOException) ? $e->getMessage() : 'Auftrag fehlgeschlagen.'); }
            finally { flock($lock,LOCK_UN);fclose($lock); }
        }
        if($errors)throw new RuntimeException(implode(' ',$errors));
    }
} catch (Throwable $e) {
    gt_log_exception($e,'background',['module'=>'strava','operation'=>$command??'sync']);
    fwrite(STDERR, ($e instanceof RuntimeException && !($e instanceof PDOException) ? $e->getMessage() : 'Der Strava-Hintergrundjob ist fehlgeschlagen.')."\n");
    exit(1);
}
