<?php
declare(strict_types=1);

return [
    // Public name shown on the sign-in screen and in the app header. Set per installation.
    'installation_name' => 'Prod1',
    // For a fresh public download, choose a private random installation key
    // (at least 32 characters) before uploading. Never commit this filled file.
    'installation_key' => '',
    // Uberspace: MariaDB credentials from your private ~/.my.cnf.
    // Use host localhost and a dedicated database such as ACCOUNT_garage.
    'database' => [
        'host' => '',       // Uberspace: localhost
        'port' => 3306,
        'name' => '',       // Uberspace: ACCOUNT_garage
        'user' => '',       // Uberspace account name
        'password' => '',   // the database password, not your app password
        'table_prefix' => 'gt_',
    ],
    // On the server set the exact HTTPS URL without a path, e.g. https://graveltube.be.
    // Empty uses the HTTPS hostname of the current request.
    'origin' => '',
    // Optional read-only Strava import. Leave credentials empty in the package.
    'strava' => ['client_id' => '', 'client_secret' => '', 'base_url' => ''],
    // Only if the server does not already expose HTTPS correctly: exact IPs of
    // verified TLS proxies that overwrite X-Forwarded-Proto. Never use a wildcard.
    'trusted_proxies' => [],
    // Structured logs: private sibling logs/ directory, rotated per module/source.
    'logging' => ['retention_days'=>14, 'max_file_bytes'=>2097152, 'max_total_bytes'=>20971520],
    // Uploaded photos and contracts stay outside public/. Records are in MySQL.
    'storage_path' => __DIR__ . '/data',
];
