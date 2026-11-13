<?php
require __DIR__.'/../private/monitoring.php';
$n=str_repeat('a',48);$body='<html><script>window.grafanaBootData={ok:true};</script><script nonce="old" src="public/test.js"></script></html>';$html=ga_grafana_html($body,$n);
if(substr_count($html,'nonce="'.$n.'"')!==2||str_contains($html,'nonce="old"')||!str_contains($html,'window.grafanaBootData={ok:true};'))throw new Exception('Nonce injection failed');
$t=["SELECT value FROM ga_metrics WHERE instance_id='\${instanz:raw}'"];
if(!ga_monitor_sql_allowed("SELECT value FROM ga_metrics WHERE instance_id='test1'",$t,['test1','test2']))throw new Exception('Known instance rejected');
foreach(["SELECT * FROM gt_accounts","SELECT value FROM ga_metrics WHERE instance_id='test1\' OR 1=1 --'","SELECT value FROM ga_metrics WHERE instance_id='unknown'"] as $sql)if(ga_monitor_sql_allowed($sql,$t,['test1','test2']))throw new Exception('Unsafe query accepted');
echo "PASS: Grafana boot-script nonces, known instance filters, rejected unknown SQL and injection.\n";

$base='apis/userstorage.grafana.app/v0alpha1/namespaces/default/user-storage/';$data=['metadata'=>['name'=>'grafana-page-history:viewer123','labels'=>['user'=>'viewer123','service'=>'grafana-page-history']],'spec'=>['data'=>['history'=>'{}']]];
$result=ga_grafana_history_body('POST',$base,$data,'viewer123');if($result['metadata']['name']!=='grafana-page-history:viewer123')throw new Exception('History binding failed');
try{ga_grafana_history_body('POST',$base,$data,'other');throw new LogicException('Cross-profile write accepted');}catch(RuntimeException $expected){}
echo "PASS: Grafana navigation history is restricted to its viewer profile; unrelated writes rejected.\n";
