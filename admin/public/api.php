<?php
declare(strict_types=1);
require dirname(__DIR__).'/private/admin.php';
try{ga_route();}catch(Throwable $e){gt_log_exception($e,'admin',['module'=>'admin']);try{if(gt_db()->inTransaction())gt_db()->rollBack();}catch(Throwable $ignored){}$safe=$e instanceof lbuchs\WebAuthn\WebAuthnException?'Die Passkey-Prüfung ist fehlgeschlagen. Bitte erneut versuchen.':($e instanceof PDOException?'Datenbankaktion fehlgeschlagen. Privates Protokoll prüfen.':$e->getMessage());gt_json(['error'=>$safe],400);}
