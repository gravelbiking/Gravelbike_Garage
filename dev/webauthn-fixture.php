<?php
// Disposable software authenticator for protocol tests only. Never shipped.
declare(strict_types=1);
function b64($s){return rtrim(strtr(base64_encode($s),'+/','-_'),'=');}
function headCbor($major,$n){if($n<24)return chr(($major<<5)|$n);if($n<256)return chr(($major<<5)|24).chr($n);if($n<65536)return chr(($major<<5)|25).pack('n',$n);return chr(($major<<5)|26).pack('N',$n);}
function cb($v){if(is_int($v))return headCbor($v<0?1:0,$v<0?-$v-1:$v);if(is_array($v)){$s=headCbor(5,count($v));foreach($v as $k=>$x)$s.=cb($k).cb($x);return $s;}return headCbor(3,strlen($v)).$v;}
function bytes($s){return headCbor(2,strlen($s)).$s;}
$r=json_decode(stream_get_contents(STDIN),true,64,JSON_THROW_ON_ERROR);$p=$r['options']['publicKey'];$origin=$r['origin'];$type=$r['action']==='create'?'webauthn.create':'webauthn.get';$json=json_encode(['type'=>$type,'challenge'=>$p['challenge'],'origin'=>$origin,'crossOrigin'=>false],JSON_UNESCAPED_SLASHES);
if($r['action']==='create'){
 $key=openssl_pkey_new(['private_key_bits'=>2048,'private_key_type'=>OPENSSL_KEYTYPE_EC,'curve_name'=>'prime256v1','config'=>__DIR__.'/openssl-test.cnf']);openssl_pkey_export($key,$pem,null,['config'=>__DIR__.'/openssl-test.cnf']);$d=openssl_pkey_get_details($key);$id=random_bytes(32);
 $cose=headCbor(5,5).cb(1).cb(2).cb(3).cb(-7).cb(-1).cb(1).cb(-2).bytes($d['ec']['x']).cb(-3).bytes($d['ec']['y']);
 $auth=hash('sha256',$p['rp']['id'],true).chr($r['flags']??69).pack('N',0).str_repeat("\0",16).pack('n',strlen($id)).$id.$cose;
 $att=headCbor(5,3).cb('fmt').cb('none').cb('attStmt').headCbor(5,0).cb('authData').bytes($auth);
 echo json_encode(['credential'=>['id'=>b64($id),'clientDataJSON'=>b64($json),'attestationObject'=>b64($att)],'privateKey'=>$pem]);
}else{
 $auth=hash('sha256',$p['rpId'],true).chr($r['flags']??5).pack('N',$r['counter']??1);openssl_sign($auth.hash('sha256',$json,true),$signature,$r['privateKey'],OPENSSL_ALGO_SHA256);
 echo json_encode(['credential'=>['id'=>$r['id'],'clientDataJSON'=>b64($json),'authenticatorData'=>b64($auth),'signature'=>b64($signature)]]);
}
