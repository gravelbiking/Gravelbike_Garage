<?php
declare(strict_types=1);
spl_autoload_register(function($class){$prefix='lbuchs\\WebAuthn\\';if(str_starts_with($class,$prefix)){ $path=__DIR__.'/vendor/webauthn/src/'.str_replace('\\','/',substr($class,strlen($prefix))).'.php';if(is_file($path))require_once $path; }});
function gt_mfa_db(): void {
    static $ready=false;if($ready)return;
    gt_query('CREATE TABLE IF NOT EXISTS {{security}} (id TINYINT PRIMARY KEY,data MEDIUMTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    gt_query('CREATE TABLE IF NOT EXISTS {{mfa_flows}} (token CHAR(64) PRIMARY KEY,session_token CHAR(64) NOT NULL,kind VARCHAR(20) NOT NULL,data MEDIUMTEXT NOT NULL,expires BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    gt_query('INSERT IGNORE INTO {{security}} VALUES(1,?)',[json_encode(['enabled'=>false,'credentials'=>[],'totp'=>null,'recovery'=>[]])]);
    gt_query('DELETE FROM {{mfa_flows}} WHERE expires < ?',[time()]);$ready=true;
}
function gt_mfa_state(bool $lock=false): array {gt_mfa_db();return json_decode(gt_query('SELECT data FROM {{security}} WHERE id=1'.($lock?' FOR UPDATE':''))->fetchColumn(),true,64,JSON_THROW_ON_ERROR);}
function gt_mfa_save(array $s): void {gt_query('UPDATE {{security}} SET data=? WHERE id=1',[json_encode($s,JSON_THROW_ON_ERROR)]);}
function gt_b64(string $s): string {return rtrim(strtr(base64_encode($s),'+/','-_'),'=');}
function gt_unb64(mixed $s): string {if(!is_string($s)||strlen($s)>200000||!preg_match('/^[A-Za-z0-9_-]*$/D',$s))throw new RuntimeException('Ungültige Sicherheitsantwort.');$b=base64_decode(strtr($s,'-_','+/'),true);if($b===false)throw new RuntimeException('Ungültige Sicherheitsantwort.');return $b;}
function gt_mfa_origin(): string {return rtrim(gt_config()['origin']?:((gt_https()?'https://':'http://').($_SERVER['HTTP_HOST']??'')),'/');}
function gt_mfa_rp(): string {$o=gt_mfa_origin();$host=parse_url($o,PHP_URL_HOST);if(!is_string($host)||($host!=='localhost'&&parse_url($o,PHP_URL_SCHEME)!=='https'))throw new RuntimeException('Passkeys benötigen HTTPS oder localhost.');return $host;}
function gt_mfa_session(): string {return hash('sha256',$_COOKIE[gt_cookie_name('session')]??'');}
function gt_mfa_flow(string $kind,array $data=[],bool $bound=true): string {$t=bin2hex(random_bytes(32));gt_query('INSERT INTO {{mfa_flows}} VALUES(?,?,?,?,?)',[hash('sha256',$t),$bound?gt_mfa_session():'',$kind,json_encode($data,JSON_THROW_ON_ERROR),time()+300]);return $t;}
function gt_mfa_get(mixed $token,string $kind,bool $bound=true): array {
 if(!is_string($token)||!preg_match('/^[a-f0-9]{64}$/D',$token))throw new RuntimeException('Die Sicherheitsfreigabe ist abgelaufen. Bitte erneut anmelden.');
 $r=gt_query('SELECT * FROM {{mfa_flows}} WHERE token=? AND kind=? AND expires>=? FOR UPDATE',[hash('sha256',$token),$kind,time()])->fetch(PDO::FETCH_ASSOC);
 if(!$r||($bound&&(!gt_session()||!hash_equals($r['session_token'],gt_mfa_session()))))throw new RuntimeException('Die Sicherheitsfreigabe ist abgelaufen. Bitte erneut anmelden.');
 $r['payload']=json_decode($r['data'],true,64,JSON_THROW_ON_ERROR);return $r;
}
function gt_mfa_update(array $flow,array $data): void {gt_query('UPDATE {{mfa_flows}} SET data=? WHERE token=?',[json_encode($data,JSON_THROW_ON_ERROR),$flow['token']]);}
function gt_mfa_cookie(string $token): void {setcookie(gt_cookie_name('pending'),$token,['expires'=>$token===''?time()-3600:time()+300,'path'=>gt_base_path(),'secure'=>!gt_dev(),'httponly'=>true,'samesite'=>'Strict']);}
function gt_mfa_pending(): never {gt_mfa_db();$old=$_COOKIE[gt_cookie_name('session')]??'';if(is_string($old)&&$old!=='')gt_query('DELETE FROM {{sessions}} WHERE token=?',[hash('sha256',$old)]);$token=gt_mfa_flow('login',[],false);gt_mfa_cookie($token);if(gt_db()->inTransaction())gt_db()->commit();gt_json(['mfaRequired'=>true]);}
function gt_mfa_key(): string {
 $path=gt_storage().'/mfa-key.php';$f=fopen($path,'c+');if(!$f||!flock($f,LOCK_EX))throw new RuntimeException('Der 2FA-Schlüssel ist nicht lesbar.');chmod($path,0600);$raw=stream_get_contents($f);
 if($raw===''){$key=random_bytes(32);$raw="<?php exit; ?>\n".base64_encode($key);if(fwrite($f,$raw)!==strlen($raw)){flock($f,LOCK_UN);fclose($f);throw new RuntimeException('Der 2FA-Schlüssel konnte nicht gespeichert werden.');}fflush($f);}flock($f,LOCK_UN);fclose($f);$key=base64_decode(substr($raw,strpos($raw,"\n")+1),true);if($key===false||strlen($key)!==32)throw new RuntimeException('Der private 2FA-Schlüssel fehlt oder ist beschädigt.');return $key;
}
function gt_mfa_encrypt(string $plain): string {$iv=random_bytes(12);$tag='';$out=openssl_encrypt($plain,'aes-256-gcm',gt_mfa_key(),OPENSSL_RAW_DATA,$iv,$tag,'Gravelbike Garage TOTP');if($out===false)throw new RuntimeException('2FA-Verschlüsselung fehlgeschlagen.');return base64_encode($iv.$tag.$out);}
function gt_mfa_decrypt(string $cipher): string {$b=base64_decode($cipher,true);if($b===false||strlen($b)<28)throw new RuntimeException('Ungültiger 2FA-Schlüssel.');$p=openssl_decrypt(substr($b,28),'aes-256-gcm',gt_mfa_key(),OPENSSL_RAW_DATA,substr($b,0,12),substr($b,12,16),'Gravelbike Garage TOTP');if($p===false)throw new RuntimeException('Der private 2FA-Schlüssel passt nicht zur Datenbank.');return $p;}
function gt_totp_secret(): string {$alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';$out='';for($i=0;$i<32;$i++)$out.=$alphabet[random_int(0,31)];return $out;}
function gt_totp(string $secret,int $step): string {
 $alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';$bits='';foreach(str_split($secret) as $c){$n=strpos($alphabet,$c);if($n===false)throw new RuntimeException('Ungültiger Authenticator-Schlüssel.');$bits.=str_pad(decbin($n),5,'0',STR_PAD_LEFT);}$key='';for($i=0;$i+8<=strlen($bits);$i+=8)$key.=chr(bindec(substr($bits,$i,8)));
 $hash=hash_hmac('sha1',pack('N2',intdiv($step,4294967296),$step%4294967296),$key,true);$offset=ord($hash[19])&15;$n=unpack('N',substr($hash,$offset,4))[1]&0x7fffffff;return str_pad((string)($n%1000000),6,'0',STR_PAD_LEFT);
}
function gt_totp_verify(string $secret,string $code,int $last=-1): int {if(!preg_match('/^\d{6}$/D',$code))throw new RuntimeException('Bitte einen gültigen sechsstelligen Code eingeben.');$step=intdiv(time(),30);for($i=-1;$i<=1;$i++)if($step+$i>$last&&hash_equals(gt_totp($secret,$step+$i),$code))return $step+$i;throw new RuntimeException('Der Code ist ungültig oder bereits verwendet. Bitte den nächsten Code abwarten.');}
function gt_mfa_proof(array &$s,array $body,array &$flowData): void {
 if(isset($body['credential'])){
  $challenge=$flowData['challenge']??'';unset($flowData['challenge']);if(!$challenge)throw new RuntimeException('Die Passkey-Anfrage ist abgelaufen.');
  $c=$body['credential'];$id=$c['id']??'';$found=null;foreach($s['credentials'] as $i=>$key)if($key['id']===$id&&$key['origin']===gt_mfa_origin())$found=$i;
  if($found===null)throw new RuntimeException('Dieser Passkey ist nicht für diese Domain registriert.');
  $json=gt_unb64($c['clientDataJSON']??null);gt_mfa_client($json);$lib=new lbuchs\WebAuthn\WebAuthn('Gravelbike Garage',gt_mfa_rp(),['none'],true);
  $key=$s['credentials'][$found];$lib->processGet($json,gt_unb64($c['authenticatorData']??null),gt_unb64($c['signature']??null),$key['publicKey'],gt_unb64($challenge),$key['counter'],true,true);
  $s['credentials'][$found]['counter']=$lib->getSignatureCounter()??0;$s['credentials'][$found]['lastUsed']=date('c');return;
 }
 $code=trim($body['code']??'');if(!is_string($body['code']??''))throw new RuntimeException('Ungültiger Code.');
 if(preg_match('/^\d{6}$/D',$code)&&$s['totp']){$s['totp']['last']=gt_totp_verify(gt_mfa_decrypt($s['totp']['secret']),$code,$s['totp']['last']);return;}
 $normalized=strtoupper(str_replace(['-',' '],'',$code));foreach($s['recovery'] as $i=>$hash)if(hash_equals($hash,hash('sha256',$normalized))){array_splice($s['recovery'],$i,1);return;}
 throw new RuntimeException('Ungültiger Authenticator- oder Wiederherstellungscode.');
}
function gt_mfa_client(string $json): void {$c=json_decode($json,true);if(!is_array($c)||($c['origin']??'')!==gt_mfa_origin()||($c['crossOrigin']??false)!==false)throw new RuntimeException('Die Passkey-Antwort stammt nicht von dieser Website.');}
function gt_mfa_status(array $s): array {return ['enabled'=>$s['enabled'],'totp'=>(bool)$s['totp'],'recoveryCount'=>count($s['recovery']),'origin'=>gt_mfa_origin(),'credentials'=>array_map(fn($c)=>array_intersect_key($c,array_flip(['id','name','origin','created','lastUsed'])),$s['credentials'])];}
function gt_mfa_route(string $route,string $method): never {
 gt_policy_init();gt_mfa_db();$body=$method==='POST'?gt_body():[];$action=substr($route,9);
 if($method==='GET'&&$action==='status'){if(!gt_session())gt_json(['error'=>'Bitte anmelden.'],401);gt_json(gt_mfa_status(gt_mfa_state()));}
 if($method!=='POST')gt_json(['error'=>'Nicht gefunden.'],404);
 if(in_array($action,['unlock','verify'],true))gt_rate_limit();
 if(in_array($action,['options','verify'],true)&&!isset($body['token']))gt_login_check();
 $db=gt_db();$db->beginTransaction();
 try{
  $s=gt_mfa_state(true);
  if($action==='unlock'){
   if(!gt_session())throw new RuntimeException('Bitte anmelden.');$a=gt_account();if(!is_string($body['password']??null)||!password_verify($body['password'],$a['password_hash']))throw new RuntimeException('Das Passwort ist falsch.');
   $kind=$s['enabled']?'manage':'grant';$token=gt_mfa_flow($kind);$db->commit();gt_json(['token'=>$token,'mfaRequired'=>$s['enabled']]);
  }
  if($action==='options'||$action==='verify'){
   $manage=isset($body['token']);$flow=gt_mfa_get($manage?$body['token']:($_COOKIE[gt_cookie_name('pending')]??''),$manage?'manage':'login',$manage);$fd=$flow['payload'];
   if($action==='options'){$keys=array_values(array_filter($s['credentials'],fn($k)=>$k['origin']===gt_mfa_origin()));if(!$keys)throw new RuntimeException('Kein Passkey für diese Domain hinterlegt.');$lib=new lbuchs\WebAuthn\WebAuthn('Gravelbike Garage',gt_mfa_rp(),['none'],true);$options=$lib->getGetArgs(array_map(fn($c)=>gt_unb64($c['id']),$keys),120,true,true,true,true,true,true);$fd['challenge']=gt_b64($lib->getChallenge()->getBinaryString());gt_mfa_update($flow,$fd);$db->commit();gt_json(['options'=>$options]);}
   // Consume challenges even on an invalid assertion; codes have independent replay protection.
   gt_mfa_proof($s,$body,$fd);gt_mfa_save($s);gt_query('DELETE FROM {{mfa_flows}} WHERE token=?',[$flow['token']]);
   if($manage){$grant=gt_mfa_flow('grant');$db->commit();gt_query('DELETE FROM {{attempts}} WHERE client_key=?',[gt_attempt_key()]);gt_json(['token'=>$grant]);}
   gt_mfa_cookie('');gt_issue_session();
  }
  if(!gt_session())throw new RuntimeException('Bitte anmelden.');$flow=gt_mfa_get($body['token']??null,'grant');$fd=$flow['payload'];
  if($action==='register/options'){
   if(count($s['credentials'])>=20)throw new RuntimeException('Maximal 20 Passkeys möglich.');$a=gt_account();$userId=$s['userId']??bin2hex(random_bytes(32));$s['userId']=$userId;
   $lib=new lbuchs\WebAuthn\WebAuthn('Gravelbike Garage',gt_mfa_rp(),['none'],true);$options=$lib->getCreateArgs(hex2bin($userId),$a['username'],$a['username'],120,'preferred',true,($body['hardware']??false)?true:null,array_map(fn($k)=>gt_unb64($k['id']),$s['credentials']));
   $fd['registerChallenge']=gt_b64($lib->getChallenge()->getBinaryString());gt_mfa_update($flow,$fd);gt_mfa_save($s);$db->commit();gt_json(['options'=>$options]);
  }
  if($action==='register/finish'){
   if(count($s['credentials'])>=20)throw new RuntimeException('Maximal 20 Passkeys möglich.');
   $challenge=$fd['registerChallenge']??'';unset($fd['registerChallenge']);if(!$challenge)throw new RuntimeException('Bitte die Registrierung erneut starten.');$c=$body['credential']??[];$json=gt_unb64($c['clientDataJSON']??null);gt_mfa_client($json);
   $lib=new lbuchs\WebAuthn\WebAuthn('Gravelbike Garage',gt_mfa_rp(),['none'],true);$result=$lib->processCreate($json,gt_unb64($c['attestationObject']??null),gt_unb64($challenge),true,true);
   $id=gt_b64($result->credentialId);foreach($s['credentials'] as $k)if($k['id']===$id)throw new RuntimeException('Dieser Passkey ist bereits registriert.');$name=trim($body['name']??'');if($name===''||strlen($name)>200)throw new RuntimeException('Bitte einen Namen für den Passkey eingeben.');
   $s['credentials'][]=['id'=>$id,'name'=>$name,'origin'=>gt_mfa_origin(),'publicKey'=>$result->credentialPublicKey,'counter'=>$result->signatureCounter??0,'created'=>date('c'),'lastUsed'=>null];
  }elseif($action==='totp/start'){$secret=gt_totp_secret();$fd['totpPending']=gt_mfa_encrypt($secret);gt_mfa_update($flow,$fd);$db->commit();gt_json(['secret'=>$secret,'uri'=>'otpauth://totp/'.rawurlencode('Gravelbike Garage:'.gt_account()['username']).'?secret='.$secret.'&issuer=Gravelbike%20Garage&algorithm=SHA1&digits=6&period=30']);
  }elseif($action==='totp/finish'){if(empty($fd['totpPending']))throw new RuntimeException('Bitte den Authenticator erneut einrichten.');$secret=gt_mfa_decrypt($fd['totpPending']);$last=gt_totp_verify($secret,trim($body['code']??''));$s['totp']=['secret'=>$fd['totpPending'],'last'=>$last];unset($fd['totpPending']);
  }elseif($action==='recovery/new'){$codes=[];$s['recovery']=[];for($i=0;$i<10;$i++){$code=strtoupper(bin2hex(random_bytes(10)));$s['recovery'][]=hash('sha256',$code);$codes[]=implode('-',str_split($code,5));}gt_mfa_save($s);$db->commit();gt_json(['codes'=>$codes]);
  }elseif($action==='enable'){if(!$s['totp']&&!array_filter($s['credentials'],fn($k)=>$k['origin']===gt_mfa_origin()))throw new RuntimeException('Bitte zunächst einen Faktor bestätigen.');if(count($s['recovery'])<1||($body['recoverySaved']??false)!==true)throw new RuntimeException('Bitte zuerst Wiederherstellungscodes sichern.');$s['enabled']=true;gt_query('DELETE FROM {{sessions}} WHERE token<>?',[gt_mfa_session()]);gt_query('DELETE FROM {{mfa_flows}} WHERE token<>?',[$flow['token']]);
  }elseif($action==='disable'){$s['enabled']=false;gt_query('DELETE FROM {{sessions}} WHERE token<>?',[gt_mfa_session()]);gt_query('DELETE FROM {{mfa_flows}} WHERE token<>?',[$flow['token']]);
  }elseif($action==='remove'){
   if(($body['id']??'')==='totp')$s['totp']=null;else $s['credentials']=array_values(array_filter($s['credentials'],fn($c)=>$c['id']!==($body['id']??'')));
   if($s['enabled']&&!$s['totp']&&!array_filter($s['credentials'],fn($c)=>$c['origin']===gt_mfa_origin()))throw new RuntimeException('Der letzte nutzbare Faktor kann bei aktiver 2FA nicht entfernt werden.');
  }else throw new RuntimeException('Unbekannte Sicherheitsfunktion.');
  gt_mfa_save($s);gt_mfa_update($flow,$fd);if(in_array($action,['enable','disable'],true))gt_query('DELETE FROM {{mfa_flows}}');$db->commit();gt_json(gt_mfa_status($s));
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();if(isset($flow)&&in_array($action,['verify','register/finish'],true)){ $p=$flow['payload'];unset($p['challenge'],$p['registerChallenge']);gt_mfa_update($flow,$p); }if($action==='verify'&&!isset($body['token'])&&isset($flow))gt_login_failed();$message=$e instanceof lbuchs\WebAuthn\WebAuthnException?'Die Passkey-Prüfung ist fehlgeschlagen. Bitte erneut versuchen.':($e instanceof RuntimeException?$e->getMessage():'Die Sicherheitsanfrage ist fehlgeschlagen.');gt_json(['error'=>$message],400);}
}
