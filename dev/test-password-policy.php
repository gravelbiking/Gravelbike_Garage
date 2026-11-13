<?php
declare(strict_types=1);
require __DIR__.'/../selfhost/backend.php';
foreach (['abcdefghijklmn1!','ABCDEFGHIJKLMN1!','Abcdefghijklmn!','Abcdefghijklmn1',str_repeat('ä',14).'A1',str_repeat('a',69).'A1!',str_repeat('ä',35).'A1'] as $value) {
    if (gt_password_error($value)!==null) throw new RuntimeException('A valid password was rejected');
}
foreach (['abcdefghijklmnop','abcdefghijklmn1','ABCDEFGHIJKLMNa',str_repeat('a',14).'!',str_repeat('a',11).'A1!',str_repeat('ä',36).'A1',"abcdefghijklmA1\0", "abcdefghijklmA1\xff",null,[],42] as $value) {
    if (gt_password_error($value)===null) throw new RuntimeException('An invalid password was accepted');
}
echo "PASS: all 3-of-4 combinations, Unicode character counts, 15-character and 72-byte boundaries, malformed input.\n";
