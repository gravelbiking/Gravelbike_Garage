<?php
require $argv[1].'/backend.php';
require_once $argv[1].'/biography.php';
try {
$garage=['bikes'=>[['id'=>'km-test','name'=>'Test','km'=>135.427,'components'=>[]]],'history'=>[],'contacts'=>[],'plans'=>[],'orders'=>[]];
$state=['rides'=>[],'maps'=>['b1'=>['bike'=>'km-test','from'=>'2026-01-01']],'dates'=>[],'from'=>'2026-01-01'];$rides=[];
for($i=1;$i<=100;$i++){
 $rides[$i]=['date'=>'2026-01-01','start'=>1767225600,'meters'=>1,'gear'=>'b1'];
 gt_strava_apply($garage,$state,$rides);
 if(round($garage['bikes'][0]['km']*1000)!=135427+$i)throw new RuntimeException('Short ride rounding drift');
 gt_strava_apply($garage,$state,$rides); // replay
}
$rides[1]['meters']=101;gt_strava_apply($garage,$state,$rides);
if($garage['bikes'][0]['km']!=135.627)throw new RuntimeException('Correction rounding drift');
foreach(['seller','workshop'] as $kind){$result=gt_bio($garage,'km-test',$kind);if(!str_contains($result['html'],'135,6 km')||str_contains($result['html'],'135,627'))throw new RuntimeException('Biography precision');}
echo "PASS #100 PHP: precise meter accumulation, replay/correction and one-decimal biographies.\n";

} catch (Throwable $e) { fwrite(STDERR, get_class($e).": ".$e->getMessage()." at line ".$e->getLine()."\n"); exit(1); }
