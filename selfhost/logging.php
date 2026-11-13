<?php
declare(strict_types=1);

// Structured diagnostics live alongside private data, never inside public/.
function gt_log_id(): string {
    if (!isset($GLOBALS['gt_request_id'])) {
        $candidate=$_SERVER['HTTP_X_GARAGE_REQUEST_ID']??'';
        $GLOBALS['gt_request_id']=gt_log_safe_id($candidate)??bin2hex(random_bytes(16));
    }
    return $GLOBALS['gt_request_id'];
}
function gt_log_module(string $route=''): string {
    $hint=$_SERVER['HTTP_X_GARAGE_MODULE']??'';
    $allowed=['dashboard','bikes','inventory','contacts','workshop','documents','administration','strava','system','auth','api','php','updates','admin'];
    if (in_array($hint,$allowed,true)) return $hint;
    return ['strava'=>'strava','security'=>'auth','auth'=>'auth','account'=>'auth','files'=>'documents','biography'=>'bikes','inventory-report'=>'inventory','updates'=>'updates','system'=>'system'][$route]??'api';
}
function gt_log_secrets(): array {
    // Exact secrets are removed even if an exception does not label them.
    static $secrets=null;
    if ($secrets===null) {
        $secrets=[];
        try {
            $scan=function($value,$key='')use(&$scan,&$secrets){
                if(is_array($value)){foreach($value as $k=>$v)$scan($v,(string)$k);}
                elseif(is_string($value)&&strlen($value)>=4&&preg_match('/password|secret|token|installation_key|recovery|session/i',$key))$secrets[]=$value;
            };
            $scan(gt_config());
            $file=rtrim(gt_config()['storage_path']??__DIR__.'/data','/').'/strava-config.json';
            if(is_file($file)&&!is_link($file))$scan(json_decode((string)file_get_contents($file),true));
        } catch(Throwable $ignored) {}
    }
    return $secrets;
}
function gt_log_safe_id($value): ?string {
    if(!is_string($value)||!preg_match('/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/iD',$value))return null;
    foreach(gt_log_secrets() as $secret)if(str_contains($value,$secret))return null;
    return $value;
}
function gt_log_redact(string $text): string {
    foreach(gt_log_secrets() as $secret)$text=str_replace($secret,'[REDACTED]',$text);
    $text=preg_replace('~https?://[^\s<>"\x27]+~i','[URL]',$text);
    $text=preg_replace('/\bBearer\s+\S+/i','Bearer [REDACTED]',$text);
    $text=preg_replace('/\b(?:password|passwd|secret|client_secret|access_token|refresh_token|authorization|cookie|installation_key|code|state|session|recovery_code)["\x27]?\s*[:=]\s*["\x27]?[^\s,;&"\x27]+/i','[REDACTED]',$text);
    $text=preg_replace('/\b[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b|\b(?:ghp_|github_pat_)[A-Za-z0-9_]+|\b[a-f0-9]{32,}\b/i','[REDACTED]',$text);
    $text=preg_replace('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i','[EMAIL]',$text);
    return substr(str_replace(["\r","\n","\0"],[' ',' ',''],$text??''),0,1500);
}
function gt_log_url(string $url): string {
    $p=parse_url($url);
    if(!is_array($p)||!in_array($p['scheme']??'',['https','http'],true)||empty($p['host']))return '[INVALID URL]';
    $path=$p['path']??'';
    $path=preg_replace('~(/strava-webhook/)[^/]+~','$1[REDACTED]',$path);
    return substr($p['scheme'].'://'.$p['host'].(isset($p['port'])?':'.$p['port']:'').$path,0,600);
}
function gt_log_context(array $values): void {
    $GLOBALS['gt_log_context']=array_merge($GLOBALS['gt_log_context']??[],$values);
}
function gt_log_directory(): string { return dirname(rtrim(gt_storage(),'/')).'/logs'; }
function gt_log_limits(): array {
    $c=gt_config()['logging']??[];
    $file=max(65536,min(10*1024*1024,(int)($c['max_file_bytes']??2*1024*1024)));
    return ['file'=>$file,'total'=>max($file,min(200*1024*1024,(int)($c['max_total_bytes']??20*1024*1024))),'days'=>max(1,min(90,(int)($c['retention_days']??14)))];
}
function gt_log(string $level,string $source,string $message,array $details=[]): bool {
    static $writing=false;
    if($writing)return false;
    $writing=true;$lock=null;
    try {
        $dir=gt_log_directory();
        if(is_link($dir)||(!is_dir($dir)&&!mkdir($dir,0700,true))||!is_writable($dir))throw new RuntimeException('Log directory unavailable');
        chmod($dir,0700);
        $lockPath=$dir.'/.writer.lock';if(is_link($lockPath))throw new RuntimeException('Invalid lock');
        $lock=fopen($lockPath,'c');if(!$lock||!flock($lock,LOCK_EX))throw new RuntimeException('Log lock unavailable');chmod($lockPath,0600);clearstatcache();
        $context=array_merge($GLOBALS['gt_log_context']??[],$details);
        $module=preg_match('/^[a-z][a-z0-9_-]{0,39}$/D',(string)($context['module']??''))?$context['module']:gt_log_module();
        $source=preg_match('/^[a-z][a-z0-9_-]{0,39}$/D',$source)?$source:'backend';
        $releaseFile=__DIR__.'/release.json';$release=is_file($releaseFile)?json_decode((string)file_get_contents($releaseFile),true):[];
        $record=['timestamp'=>(new DateTimeImmutable('now',new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z'),'instance'=>gt_config()['installation_name']??'Garage','version'=>$release['version']??'unknown','release_name'=>$release['name']??'','level'=>in_array($level,['info','warning','error','critical'],true)?$level:'error','module'=>$module,'source'=>$source,'http_request_id'=>gt_log_id(),'request_id'=>gt_log_id(),'message'=>gt_log_redact($message)];
        foreach(['operation','route','method','provider','provider_field','provider_resource','error_type','error_code','client_id','previous_client_id','connection','http_status','file','line','attempt_id','expires_at','count','first_seen','last_seen','reason'] as $key) {
            if(!isset($context[$key])||!is_scalar($context[$key]))continue;
            $record[$key]=is_string($context[$key])?gt_log_redact($context[$key]):$context[$key];
        }
        if(isset($context['request_id'])&&gt_log_safe_id($context['request_id'])!==null)$record['request_id']=$context['request_id'];
        foreach(['redirect_uri','base_url','previous_base_url'] as $key)if(isset($context[$key])&&is_string($context[$key]))$record[$key]=gt_log_url($context[$key]);
        if(isset($context['stack'])&&is_array($context['stack']))$record['stack']=array_map(fn($s)=>substr(gt_log_redact((string)$s),0,240),array_slice($context['stack'],0,12));
        $line=json_encode($record,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE|JSON_THROW_ON_ERROR)."\n";
        $limits=gt_log_limits();if(strlen($line)>$limits['file'])throw new RuntimeException('Oversized diagnostic');$files=[];$size=0;
        foreach(glob($dir.'/*.jsonl')?:[] as $p){
            if(is_link($p)||!is_file($p))continue;
            if(filemtime($p)<time()-86400*$limits['days']){unlink($p);continue;}
            $files[$p]=filemtime($p);$size+=filesize($p);
        }
        asort($files);
        foreach($files as $p=>$mtime){if($size+strlen($line)<=$limits['total'])break;$size-=filesize($p);unlink($p);}
        $stem=$dir.'/'.$module.'--'.$source.'--'.gmdate('Y-m-d');$path=$stem.'.jsonl';$i=0;
        while(is_file($path)&&filesize($path)+strlen($line)>$limits['file']){if(++$i>10000)throw new RuntimeException('Rotation unavailable');$path=$stem.'-'.$i.'.jsonl';}
        if(is_link($path))throw new RuntimeException('Invalid log file');
        $handle=fopen($path,'ab');if(!$handle)throw new RuntimeException('Log file unavailable');
        try{chmod($path,0600);if(fwrite($handle,$line)!==strlen($line)||!fflush($handle))throw new RuntimeException('Log write failed');}finally{fclose($handle);}
        if(!is_link(gt_storage().'/logging-status.json')){@file_put_contents(gt_storage().'/logging-status.json',json_encode(['healthy'=>true,'checked_at'=>gmdate('c')]),LOCK_EX);@chmod(gt_storage().'/logging-status.json',0600);}
        return true;
    } catch(Throwable $ignored) {
        @error_log('Gravelbike Garage: structured logger unavailable.');
        try{if(!is_link(gt_storage().'/logging-status.json')){@file_put_contents(gt_storage().'/logging-status.json',json_encode(['healthy'=>false,'checked_at'=>gmdate('c'),'error'=>'Protokollablage nicht beschreibbar oder Größenbegrenzung nicht durchsetzbar.']),LOCK_EX);@chmod(gt_storage().'/logging-status.json',0600);}}catch(Throwable $ignoredAgain){}
        return false;
    } finally {if(is_resource($lock)){flock($lock,LOCK_UN);fclose($lock);}$writing=false;}
}
function gt_log_exception(Throwable $error,string $source='backend',array $details=[]): void {
    $stack=[];foreach($error->getTrace() as $frame)$stack[]=basename($frame['file']??'internal').':'.($frame['line']??0).' '.($frame['class']??'').($frame['function']??'');
    gt_log('error',$source,$error instanceof PDOException?'Datenbankoperation fehlgeschlagen.':$error->getMessage(),$details+['error_type'=>get_class($error),'error_code'=>(string)$error->getCode(),'file'=>basename($error->getFile()),'line'=>$error->getLine(),'stack'=>$stack]);
}
function gt_log_install(): void {
    set_error_handler(function($severity,$message,$file,$line){if(!(error_reporting()&$severity))return false;gt_log(in_array($severity,[E_WARNING,E_USER_WARNING,E_NOTICE,E_USER_NOTICE,E_DEPRECATED,E_USER_DEPRECATED],true)?'warning':'error','php',$message,['module'=>'php','file'=>basename($file),'line'=>$line]);return true;});
    set_exception_handler(function(Throwable $e){gt_log_exception($e,'php',['module'=>'php']);if(PHP_SAPI==='cli'){fwrite(STDERR,"Gravelbike Garage: unbehandelter Fehler; privates Fehlerprotokoll prüfen.\n");exit(1);}gt_json(['error'=>'Die Anfrage konnte nicht verarbeitet werden.'],500);});
    register_shutdown_function(function(){ $e=error_get_last();if($e&&in_array($e['type'],[E_ERROR,E_PARSE,E_CORE_ERROR,E_COMPILE_ERROR],true))gt_log('critical','php',$e['message'],['module'=>'php','file'=>basename($e['file']),'line'=>$e['line']]); });
}
