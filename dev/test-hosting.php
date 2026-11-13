<?php
declare(strict_types=1);
require __DIR__.'/../selfhost/backend.php';
function expect_proxy(array $server,mixed $trusted,bool $expected):void{if(gt_trusted_https_proxy($server,$trusted)!==$expected)throw new RuntimeException('Unsafe proxy detection');}
expect_proxy(['REMOTE_ADDR'=>'203.0.113.10','HTTP_X_FORWARDED_PROTO'=>'https'],[],false);
expect_proxy(['REMOTE_ADDR'=>'203.0.113.10','HTTP_X_FORWARDED_PROTO'=>'https'],['127.0.0.1'],false);
expect_proxy(['REMOTE_ADDR'=>'127.0.0.1','HTTP_X_FORWARDED_PROTO'=>'https'],['127.0.0.1'],true);
foreach(['http','https,http','https, https','HTTPS',' https'] as $value)expect_proxy(['REMOTE_ADDR'=>'127.0.0.1','HTTP_X_FORWARDED_PROTO'=>$value],['127.0.0.1'],false);
expect_proxy(['REMOTE_ADDR'=>'127.0.0.1','HTTP_X_FORWARDED_PROTO'=>'https'],['*'],false);
expect_proxy(['REMOTE_ADDR'=>'::1','HTTP_X_FORWARDED_PROTO'=>'https'],['::1'],true);
expect_proxy(['HTTP_X_FORWARDED_PROTO'=>'https'],[''],false);
echo "PASS: HTTPS proxy detection accepts exact configured peers only; spoofed, wildcard and ambiguous headers rejected.\n";
