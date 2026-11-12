<?php
declare(strict_types=1);

function gt_update_dir(): ?string {
    $config = realpath(__DIR__ . '/config.php');
    if (!$config) return null;
    $dir = dirname($config) . '/updates';
    return is_file($dir . '/enabled') ? $dir : null;
}

function gt_release_order(string $version): array {
    $parts = explode('.', $version);
    return [(int)$parts[0], (int)$parts[1], (int)$parts[2], isset($parts[3]) ? ord($parts[3]) - 96 : 0];
}

function gt_update_route(string $method): never {
    $release = json_decode(file_get_contents(__DIR__ . '/release.json'), true, 8, JSON_THROW_ON_ERROR);
    $dir = gt_update_dir();
    if ($method === 'GET') {
        $result = $dir && is_file($dir . '/result.json') ? json_decode(file_get_contents($dir . '/result.json'), true) : null;
        $request = $dir && is_file($dir . '/request.json') ? json_decode((string)@file_get_contents($dir . '/request.json'), true) : null;
        gt_json(['installed' => $release, 'enabled' => $dir !== null, 'job' => $request ?: null, 'result' => $result]);
    }
    if ($method !== 'POST') gt_json(['error' => 'Methode nicht erlaubt.'], 405);
    if (!$dir) gt_json(['error' => 'Der Update-Dienst ist auf diesem Server noch nicht eingerichtet.'], 409);

    $body = gt_body();
    $action = $body['action'] ?? null;
    $version = $body['version'] ?? null;
    if (!in_array($action, ['check','install','rollback'], true) ||
        ($action === 'install' && (!is_string($version) || !preg_match('/^(?:0|[1-9]\d{0,3})(?:\.(?:0|[1-9]\d{0,3})){2}(?:\.[a-z])?$/D', $version)
            || gt_release_order($version) <= gt_release_order($release['version'])))) {
        gt_json(['error' => 'Ungültiger Update-Auftrag.'], 400);
    }

    $lock = fopen($dir . '/queue.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB) || is_file($dir . '/request.json')) {
        gt_json(['error' => 'Es läuft bereits ein Update-Auftrag.'], 409);
    }
    $request = ['id' => bin2hex(random_bytes(16)), 'action' => $action, 'version' => $action === 'install' ? $version : null];
    $temp = $dir . '/request.tmp';
    if (file_put_contents($temp, json_encode($request, JSON_THROW_ON_ERROR)) === false || !rename($temp, $dir . '/request.json')) {
        throw new RuntimeException('Update-Auftrag konnte nicht gespeichert werden.');
    }
    gt_json(['job' => $request], 202);
}

function gt_update_write_guard() {
    $dir = gt_update_dir();
    if (!$dir) return null;
    $lock = fopen($dir . '/writes.lock', 'c');
    if (!$lock || !flock($lock, LOCK_SH | LOCK_NB)) {
        gt_json(['error' => 'Die Garage wird aktualisiert. Bitte warte kurz und versuche es erneut.'], 503);
    }
    return $lock;
}
