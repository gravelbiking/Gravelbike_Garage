<?php
declare(strict_types=1);
require dirname(__DIR__) . '/private/backend.php';
gt_headers();
if (!gt_https() && !gt_dev()) {
    http_response_code(426);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Gravelbike Garage – HTTPS erforderlich</title><h1>Bitte HTTPS aktivieren</h1><p>Öffne diese App über https://. Bei einem vorgeschalteten TLS-Proxy prüfe die Hostingkonfiguration gemäß INSTALLATION.md.</p></html>';
    exit;
}
header('Content-Type: text/html; charset=utf-8');
$installationName = gt_config()['installation_name'] ?? 'Prod1';
if (!is_string($installationName) || trim($installationName) === '') $installationName = 'Prod1';
$escapedName = htmlspecialchars(trim($installationName), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
echo str_replace(
    ['<strong id="installationName">Prod1</strong>', '<span id="workspaceName">Prod1</span>'],
    ['<strong id="installationName">' . $escapedName . '</strong>', '<span id="workspaceName">' . $escapedName . '</span>'],
    file_get_contents(__DIR__ . '/app.html')
);
