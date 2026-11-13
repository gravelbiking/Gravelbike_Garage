<?php
declare(strict_types=1);
require __DIR__.'/../selfhost/backend.php';
// SHA-1 vectors from RFC 6238, reduced to the interoperable six-digit format.
$secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
foreach ([59=>'287082',1111111109=>'081804',1111111111=>'050471',1234567890=>'005924',2000000000=>'279037',20000000000=>'353130'] as $time=>$code) if (gt_totp($secret,intdiv($time,30))!==$code) throw new RuntimeException('RFC 6238 vector failed');
$step=intdiv(time(),30);$code=gt_totp($secret,$step);
if(gt_totp_verify($secret,$code)!==$step)throw new RuntimeException('Verification failed');
try{gt_totp_verify($secret,$code,$step+1);throw new LogicException('Replay accepted');}catch(RuntimeException $e){}
try{gt_totp_verify($secret,'1234567');throw new LogicException('Malformed code accepted');}catch(RuntimeException $e){}
echo "PASS: RFC 6238 TOTP vectors, malformed codes and replay protection.\n";
