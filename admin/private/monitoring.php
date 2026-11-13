<?php
declare(strict_types=1);
function ga_grafana_html(string $html,string $nonce):string{
 if(!preg_match('/^[a-f0-9]{48}$/D',$nonce))throw new RuntimeException('Ungültige Monitoring-Nonce.');
 return preg_replace_callback('/<script\b([^>]*)>/i',function($m)use($nonce){$attrs=preg_replace('/\snonce\s*=\s*(?:"[^"]*"|\x27[^\x27]*\x27)/i','',$m[1]);return '<script nonce="'.$nonce.'"'.$attrs.'>';},$html);
}
function ga_monitor_sql_allowed(string $query,array $templates,array $ids):bool{
 foreach(array_merge(['__all__'],$ids) as $id){if(!is_string($id)||!preg_match('/^(?:__all__|[a-z][a-z0-9-]{1,49})$/D',$id))continue;foreach($templates as $template)if($query===str_replace('${instanz:raw}',$id,$template))return true;}
 return false;
}
function ga_grafana_uid():string{
 if(isset($_SESSION['grafanaUid']))return $_SESSION['grafanaUid'];
 $ch=curl_init('http://127.0.0.1:'.ga_config()['grafana_port'].ga_config()['base_path'].'/grafana/api/user');curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>2,CURLOPT_TIMEOUT=>5,CURLOPT_HTTPHEADER=>['X-Garage-Admin: garage-monitor']]);$raw=curl_exec($ch);$status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);$user=json_decode($raw?:'{}',true);$uid=(string)($user['uid']??$user['id']??'');if($status!==200||!preg_match('/^[a-zA-Z0-9_-]{1,64}$/D',$uid))throw new RuntimeException('Grafana-Oberflächenprofil nicht verfügbar.');return $_SESSION['grafanaUid']=$uid;
}
function ga_grafana_history_body(string $method,string $path,array $input,string $uid):array{
 $base='apis/userstorage.grafana.app/v0alpha1/namespaces/default/user-storage/';$name='grafana-page-history:'.$uid;
 if(($method==='POST'&&$path!==$base)||($method==='PATCH'&&$path!==$base.$name))throw new RuntimeException('Ungültiges Grafana-Oberflächenprofil.');
 if(!is_array($input['spec']['data']??null)||strlen(json_encode($input,JSON_THROW_ON_ERROR))>100000)throw new RuntimeException('Ungültige Grafana-Oberflächendaten.');
 if($method==='POST'&&(($input['metadata']['name']??'')!==$name||($input['metadata']['labels']['user']??'')!==$uid||($input['metadata']['labels']['service']??'')!=='grafana-page-history'))throw new RuntimeException('Ungültige Grafana-Profilzuordnung.');
 $clean=['spec'=>['data'=>$input['spec']['data']]];
 if($method==='POST')$clean['metadata']=['name'=>$name,'labels'=>['user'=>$uid,'service'=>'grafana-page-history']];
 if(isset($input['metadata']['resourceVersion'])){if(!is_string($input['metadata']['resourceVersion'])||strlen($input['metadata']['resourceVersion'])>100)throw new RuntimeException('Ungültige Profilversion.');$clean['metadata']['resourceVersion']=$input['metadata']['resourceVersion'];}
 return $clean;
}
