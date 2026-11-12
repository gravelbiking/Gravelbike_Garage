<?php
// Local PHP server: preserve the same private-file restrictions as Apache.
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)??'/');
if(str_contains($path,'..')||preg_match('~(?:^|/)(?:private|\.git|\.local)(?:/|$)|(?:^|/)\.[^/]+|/app\.html$~',$path)){
    http_response_code(403);exit;
}
return false;
