<?php
declare(strict_types=1);
require __DIR__.'/../selfhost/strava.php';
function check($ok,$msg){if(!$ok)throw new RuntimeException($msg);}
$components=[];foreach(['Antrieb','Bremsen','Räder','Reifen','Cockpit','Sattel','Licht','Zubehör'] as $cat)$components[]=['category'=>$cat,'installedDate'=>'2026-11-20','installedKm'=>0];
$g=['bikes'=>[['id'=>'b','km'=>0,'kmDate'=>'2026-11-20','components'=>$components,'readings'=>[['date'=>'2026-11-20','km'=>0]]]],'history'=>[]];
$s=['rides'=>[],'maps'=>['gear'=>['bike'=>'b','from'=>'2026-11-01']],'from'=>'2026-11-01','dates'=>[]];
$r=[1=>['date'=>'2026-11-13','meters'=>24325,'gear'=>'gear'],2=>['date'=>'2026-11-14','meters'=>59975,'gear'=>'gear']];
check(gt_strava_apply($g,$s,$r),'apply old rides');check($g['bikes'][0]['km']===84.3,'bike sum');
foreach($g['bikes'][0]['components'] as $c)check($c['installedKm']===84.3,'every category stays at zero mileage');
check($g['bikes'][0]['readings'][0]['km']===84.3,'dated baseline reading');
$first=$g;check(!gt_strava_apply($g,$s,$r)&&$g===$first,'replay has no effect');
$r[3]=['date'=>'2026-11-21','meters'=>10000,'gear'=>'gear'];gt_strava_apply($g,$s,$r);check(round($g['bikes'][0]['km']-$g['bikes'][0]['components'][0]['installedKm'],1)===10.0,'new rides belong to part');
$r[1]['meters']=25325;gt_strava_apply($g,$s,$r);check(round($g['bikes'][0]['km']-$g['bikes'][0]['components'][0]['installedKm'],1)===10.0,'old ride correction');
unset($r[2]);gt_strava_apply($g,$s,$r);check(round($g['bikes'][0]['km']-$g['bikes'][0]['components'][0]['installedKm'],1)===10.0,'old ride deletion');
$h=['bikes'=>[['id'=>'b','km'=>100,'components'=>[['installedDate'=>'','installedKm'=>null]],'componentArchive'=>[['component'=>['installedDate'=>'2026-11-10','installedKm'=>0],'removedDate'=>'2026-11-20','removedKm'=>100,'mileage'=>100]]]],'inventory'=>[['positions'=>[['quantity'=>1,'tire'=>['component'=>['installedDate'=>'2026-11-10','installedKm'=>0],'history'=>[['bikeId'=>'b','installedDate'=>'2026-11-10','installedKm'=>0,'removedDate'=>'2026-11-20','removedKm'=>100,'mileage'=>100]]]]]]]];
$rides=[['bike'=>'b','date'=>'2026-11-12','meters'=>20000]];gt_strava_rebase_odometer($h,[],$rides);
check($h['bikes'][0]['componentArchive'][0]['mileage']===120.0,'archived period includes ride in interval');check($h['inventory'][0]['positions'][0]['tire']['history'][0]['mileage']===120.0,'stored tire history corrected');check($h['bikes'][0]['components'][0]['installedKm']===null,'unknown baseline stays unknown');check($h['inventory'][0]['positions'][0]['quantity']===1,'stock unchanged');
$before=$h;gt_strava_rebase_odometer($h,[],[['bike'=>'other','date'=>'2026-11-01','meters'=>1000]]);check($h===$before,'other bicycle isolated');
echo "PASS Strava component baselines: all categories, late import, replay, new rides, correction/deletion, frozen archive, tire history, unknown and isolation.\n";
