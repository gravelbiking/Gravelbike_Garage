<?php
// Private command-line check. Never expose diagnostics as a public web endpoint.
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__.'/backend.php';
$failed=false;
function check_result(string $label,bool $ok,string $note=''):void {global $failed;echo ($ok?'OK   ':'FEHLER ').$label.($note!==''?' · '.$note:'').PHP_EOL;if(!$ok)$failed=true;}
echo "Gravelbike Garage · Uberspace-Vorprüfung\n";
check_result('PHP 8.2 oder neuer',PHP_VERSION_ID>=80200,'empfohlen: 8.4');
foreach(['pdo_mysql','fileinfo','openssl'] as $ext)check_result('PHP-Erweiterung '.$ext,extension_loaded($ext));
$config=gt_config();$origin=$config['origin']??'';
check_result('Fester HTTPS-Origin ohne Pfad',is_string($origin)&&preg_match('~^https://[a-zA-Z0-9.-]+(?::[0-9]+)?$~D',$origin)===1);
$proxies=$config['trusted_proxies']??[];
check_result('Proxy-Vertrauen auf konkrete IPs begrenzt',is_array($proxies)&&count(array_filter($proxies,fn($ip)=>!is_string($ip)||filter_var($ip,FILTER_VALIDATE_IP)===false))===0);
try {$storage=realpath(gt_storage());$public=realpath(__DIR__.'/../public');check_result('Privater Speicher beschreibbar',true);check_result('Private Daten außerhalb public/',$storage!==false&&$public!==false&&$storage!==$public&&!str_starts_with($storage,$public.DIRECTORY_SEPARATOR));}catch(Throwable $e){check_result('Privater Speicher beschreibbar',false);}
try {
 $db=gt_db();$version=$db->query('SELECT VERSION()')->fetchColumn();
 check_result('Datenbank verbunden',true,str_contains(strtolower($version),'mariadb')?'MariaDB erkannt':'MySQL-kompatibler Server erkannt');
 $db->beginTransaction();
 gt_query('SELECT version FROM {{meta}} WHERE id=1 FOR UPDATE');
 gt_query('INSERT INTO {{attempts}}(client_key,count,since) VALUES(?,1,?) ON DUPLICATE KEY UPDATE count=count+1',[hash('sha256','hosting-check-'.random_bytes(16)),time()]);
 $db->rollBack();check_result('InnoDB-Transaktion und Schreibzugriff',true);
 gt_mfa_db();$state=gt_mfa_state();check_result('2FA-Tabellen verfügbar',true,$state['enabled']?'2FA aktiviert':'2FA optional, noch deaktiviert');
 if($state['totp']){try{gt_mfa_decrypt($state['totp']['secret']);check_result('Authenticator-Schlüssel passt zur Datenbank',true);}catch(Throwable $e){check_result('Authenticator-Schlüssel passt zur Datenbank',false,'private/data/mfa-key.php aus passender Sicherung wiederherstellen');}}
}catch(Throwable $e){if(isset($db)&&$db->inTransaction())$db->rollBack();check_result('Datenbank-/Tabelleneinrichtung',false,'Zugangsdaten, vorhandene Datenbank, CREATE-Rechte und PHP-Fehlerprotokoll prüfen');}
foreach(['vendor/webauthn/src/WebAuthn.php','mfa.php','biography.php'] as $file)check_result('Laufzeitdatei '.$file,is_file(__DIR__.'/'.$file));
echo "Hinweis: Die Prüfung kann fehlende App-Tabellen anlegen. Sie ändert keine Fahrräder oder 2FA-Aktivierung.\n";
echo "Noch im Browser prüfen: HTTPS-Erkennung, Cookies, privater Dateizugriff, Uploads, Passkey/YubiKey und Authenticator.\n";
exit($failed?1:0);
