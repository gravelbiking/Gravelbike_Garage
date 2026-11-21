<?php
declare(strict_types=1);
require __DIR__.'/../selfhost/tirepark.php';
function gt_supply_number($n): bool {return is_numeric($n)&&is_finite((float)$n)&&$n>=0;}
function check($ok,$message){if(!$ok)throw new RuntimeException($message);}
$old=['type'=>'Faltreifen','manufactureYear'=>'2024','tread'=>'Stollen','usageState'=>'used','dimensionSize'=>'700','dimensionLabel'=>'700 × 45','width'=>'45','diameter'=>'622','unit'=>'mm'];
$p=gt_tp_profile(['type'=>'Drahtreifen','model'=>'Marathon','dimensionLabel'=>'28 x 1.75','initialMileage'=>50,'tubeless'=>false],$old);
check($p['type']==='Drahtreifen'&&$p['model']==='Marathon','Separate type/model');
check(gt_tp_dimensions($p)==='28 x 1.75'&&!isset($p['dimensionSize']),'Free text must override old split fields');
check($p['manufactureYear']==='2024'&&$p['tread']==='Stollen'&&$p['diameter']==='622'&&$p['usageState']==='used','Preserve hidden legacy metadata');
check(gt_tp_profile(['manufacturer'=>'Edit'],$old)['type']==='Faltreifen','Preserve type for older clients');
$p=gt_tp_profile(['dimensionLabel'=>'700 × 40','type'=>'Tubular','initialMileage'=>0]);
check(gt_tp_dimensions($p)==='700 × 40'&&$p['usageState']==='unknown','No fabricated new-tire provenance');
$p=gt_tp_profile(['dimensionLabel'=>''],$old);check(gt_tp_dimensions($p)==='','Clearing size must not revive old width/diameter');
echo "PASS tire profile backend: single size, separate type, old data retained and unknown provenance.\n";

$g=['bikes'=>[['serial'=>'FRAME-KEEP','components'=>[['name'=>'Vorderreifen','category'=>'Reifen','serial'=>'REMOVE'],['name'=>'Schaltwerk','category'=>'Antrieb','serial'=>'KEEP']]]],'inventory'=>[['positions'=>[['tire'=>['component'=>['name'=>'Reifen','serial'=>'REMOVE']]]]]]];
gt_tp_clear_serials($g);check($g['bikes'][0]['serial']==='FRAME-KEEP'&&$g['bikes'][0]['components'][0]['serial']===''&&$g['bikes'][0]['components'][1]['serial']==='KEEP'&&$g['inventory'][0]['positions'][0]['tire']['component']['serial']==='','Only tire serials removed');
echo "PASS tire serial removal preserves bicycle/other parts and warehouse quantities.\n";
