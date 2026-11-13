"""Forward Python worker diagnostics to the same private PHP logger."""
import json,pathlib,subprocess,traceback

def write_job(root,php,module,error,operation='',request_id=''):
 root=pathlib.Path(root)
 core=root/'private/core/backend.php' if (root/'private/core/backend.php').is_file() else root/'private/backend.php'
 if not core.is_file():return False
 php_code='''$r=json_decode(stream_get_contents(STDIN),true,32,JSON_THROW_ON_ERROR);require $argv[1];if(!function_exists('gt_log'))exit(2);exit(gt_log('error','background',$r['message'],['module'=>$r['module'],'operation'=>$r['operation'],'error_type'=>$r['kind'],'stack'=>$r['stack'],'request_id'=>$r['request_id']?:gt_log_id()])?0:1);'''
 stack=[pathlib.Path(f.filename).name+':'+str(f.lineno)+' '+f.name for f in traceback.extract_tb(error.__traceback__)][-12:]
 payload={'message':str(error),'module':module,'operation':operation,'request_id':request_id,'kind':type(error).__name__,'stack':stack}
 try:return subprocess.run([php,'-r',php_code,str(core)],input=json.dumps(payload),capture_output=True,text=True,timeout=10).returncode==0
 except (OSError,subprocess.SubprocessError):return False
