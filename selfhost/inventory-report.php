<?php
declare(strict_types=1);

function gt_inventory_snapshot(array $garage): array {
    $rows = []; $cents = 0; $missing = 0;
    foreach ($garage['inventory'] ?? [] as $s) {
        $positions = $s['positions'] ?? [['id'=>'legacy-'.$s['id'],'label'=>'Übernommener Bestand','quantity'=>$s['quantity'],'unitPrice'=>$s['unitPrice'] ?? null,'location'=>$s['location'] ?? '','packageSize'=>1,'packageType'=>'Einzelbestand']];
        $subtotal = 0; $unknown = 0;
        foreach ($positions as $p) {
            $value = $p['unitPrice'] === null && $p['quantity'] > 0 ? null : (int) round($p['quantity'] * ($p['unitPrice'] ?? 0) * 100);
            if ($value === null) { $missing++; $unknown++; } else { $subtotal += $value; $cents += $value; }
            $rows[] = ['kind'=>'position','article'=>$s['name'],'manufacturer'=>$s['manufacturer'],'articleNumber'=>$s['articleNumber'],'ean'=>$s['ean'] ?? '','position'=>$p['label'],'location'=>$p['location'],'quantity'=>$p['quantity'],'unit'=>$s['unit'],'unitPrice'=>$p['unitPrice'],'cents'=>$value];
        }
        $rows[] = ['kind'=>'subtotal','article'=>$s['name'],'quantity'=>$s['quantity'],'unit'=>$s['unit'],'cents'=>$subtotal,'missing'=>$unknown];
    }
    return ['rows'=>$rows,'cents'=>$cents,'missing'=>$missing,'created'=>(new DateTimeImmutable('now',new DateTimeZone('Europe/Berlin')))->format('d.m.Y H:i:s T')];
}
function gt_inventory_csv(array $snapshot): string {
    $f = fopen('php://temp','r+'); fwrite($f, "\xEF\xBB\xBF");
    $put = function(array $row) use ($f) { $safe=array_map(fn($v)=>preg_match('/^[=+\-@\t\r]/u',(string)$v)?"'".$v:(string)$v,$row); fputcsv($f,$safe,';','"','',"\r\n"); };
    $num = fn($v,$places=3)=>number_format((float)$v,$places,',','');
    $put(['Inventurstand',$snapshot['created']]);
    $put(['Artikel','Hersteller','Artikelnummer','EAN / GTIN','Lagerposition','Lagerort','Sollbestand','Einheit','Einzelpreis EUR','Positionswert EUR','Gezählt','Notizen']);
    foreach ($snapshot['rows'] as $r) {
        if ($r['kind']==='subtotal') { $put(['Summe '.$r['article'],'','','','','',$num($r['quantity']),$r['unit'],'',$num($r['cents']/100,2),'',($r['missing']?'Preisangaben unvollständig':'')]); continue; }
        $put([$r['article'],$r['manufacturer'],$r['articleNumber'],$r['ean'],$r['position'],$r['location'],$num($r['quantity']),$r['unit'],$r['unitPrice']===null?'Preis fehlt':$num($r['unitPrice'],2),$r['cents']===null?'offen':$num($r['cents']/100,2),'','']);
    }
    $put(['Erfasster Gesamtwert EUR','','','','','','','','',$num($snapshot['cents']/100,2),'',$snapshot['missing']?$snapshot['missing'].' Position(en) ohne Preis: Gesamtwert unvollständig':'']);
    rewind($f);$result=stream_get_contents($f);fclose($f);return $result;
}
// A small, dependency-free PDF writer for a landscape A4 inventory count sheet.
// Text uses the standard PDF WinAnsi font; user text is escaped as PDF strings.
function gt_inventory_pdf(array $snapshot): string {
    $encode = function(string $s): string {
        $s = str_replace(["\r","\t"],[' ',' '],$s);
        $s = preg_replace('/[\x00-\x08\x0B-\x1F\x7F]/',' ',$s);
        $s = str_replace(['–','—','‑','…'],['-','-','-','...'],$s);
        // Avoid a dependency on iconv/mbstring on shared hosting. WinAnsi covers
        // German and Western European letters, currency and common punctuation.
        static $map=null;
        if($map===null){$map=[];for($i=160;$i<=255;$i++)$map[json_decode('"\\u'.sprintf('%04x',$i).'"')]=chr($i);foreach(['€'=>128,'‚'=>130,'ƒ'=>131,'„'=>132,'†'=>134,'‡'=>135,'ˆ'=>136,'‰'=>137,'Š'=>138,'‹'=>139,'Œ'=>140,'Ž'=>142,'‘'=>145,'’'=>146,'“'=>147,'”'=>148,'•'=>149,'˜'=>152,'™'=>153,'š'=>154,'›'=>155,'œ'=>156,'ž'=>158,'Ÿ'=>159] as $letter=>$byte)$map[$letter]=chr($byte);}
        return preg_replace_callback('/[^\x00-\x7F]/u',fn($m)=>$map[$m[0]]??'?', $s);
    };
    $literal = fn(string $s)=>str_replace(['\\','(',')',"\n"],['\\\\','\\(','\\)',' '],$s);
    $pages=[];$stream='';$y=0;$page=0;
    $text=function(float $x,float $y,string $s,int $size=9,bool $bold=false) use (&$stream,$encode,$literal) {$stream.="BT /".($bold?'F2':'F1')." $size Tf 1 0 0 1 $x $y Tm (".$literal($encode($s)).") Tj ET\n";};
    $line=function(float $y) use (&$stream){$stream.="0.85 G 36 $y m 806 $y l S 0 G\n";};
    $start=function() use (&$pages,&$stream,&$y,&$page,$text,$line,$snapshot){if($page)$pages[]=$stream;$stream='';$page++;$text(36,555,'GRAVELBIKE GARAGE - INVENTURLISTE',18,true);$text(36,534,'Bestand am '.$snapshot['created'],10);$text(36,516,'Gezählte Mengen und Notizen dienen dem Abgleich. Der Export verändert keine Bestände.',9);$text(745,555,'Seite '.$page,9);$stream.="0.94 0.96 0.93 rg 36 482 770 24 re f 0 g\n";foreach([[42,'Artikel / Lagerposition'],[260,'Lagerort'],[360,'Sollbestand'],[442,'Einzelpreis'],[532,'Wert'],[622,'Gezählt / Notiz']] as [$x,$s])$text($x,490,$s,9,true);$line(482);$y=482;};
    $start();
    $num=fn($n)=>rtrim(rtrim(number_format((float)$n,3,',','.'),'0'),',');
    $eur=fn($c)=>number_format($c/100,2,',','.').' EUR';
    foreach($snapshot['rows'] as $r){
        if($r['kind']==='subtotal'){
            $names=explode("\n",wordwrap($encode('Summe: '.$r['article']),43,"\n",true));
            foreach(array_chunk($names,16) as $chunk){$height=count($chunk)*12+20;if($y-$height<65)$start();foreach($chunk as $j=>$name){$ty=$y-17-$j*12;$safe=$literal($name);$stream.="BT /F2 9 Tf 1 0 0 1 42 $ty Tm ($safe) Tj ET\n";}$text(360,$y-17,$num($r['quantity']).' '.$r['unit']);$text(532,$y-17,$eur($r['cents']),9,true);if($r['missing'])$text(622,$y-17,'Preisangaben unvollständig',8);$y-=$height;$line($y);}continue;
        }
        $cells=[$r['article']."\n".$r['manufacturer'].' / '.$r['articleNumber']."\n".$r['position'],$r['location']?:'-',$num($r['quantity']).' '.$r['unit'],$r['unitPrice']===null?'Preis fehlt':$eur((int)round($r['unitPrice']*100)),$r['cents']===null?'offen':$eur($r['cents']),'________________________'];
        $widths=[43,19,15,16,16,31];$wrapped=[];
        foreach($cells as $i=>$s){$raw=$encode((string)$s);$wrapped[]=explode("\n",wordwrap($raw,$widths[$i],"\n",true));}
        // Split exceptionally long names across rows/pages instead of clipping.
        $count=max(array_map('count',$wrapped));
        for($offset=0;$offset<$count;$offset+=16){$rows=min(16,$count-$offset);$height=max(43,12*$rows+14);if($y-$height<65)$start();
            foreach([42,260,360,442,532,622] as $i=>$x)foreach(array_slice($wrapped[$i],$offset,16) as $j=>$s){$escaped=$literal($s);$ty=$y-16-$j*12;$stream.="BT /F1 9 Tf 1 0 0 1 $x $ty Tm ($escaped) Tj ET\n";}
            $y-=$height;$line($y);
        }
    }
    if($y<140)$start();$y-=28;$text(36,$y,'Erfasster Gesamtwert: '.$eur($snapshot['cents']),14,true);$y-=22;
    if($snapshot['missing']){$text(36,$y,$snapshot['missing'].' Position(en) ohne Preis. Der Gesamtwert ist unvollständig.',10,true);$y-=18;}
    $text(36,$y,'Bewertung: Restbestand x Einkaufspreis der jeweiligen Lagerposition.',9);
    $pages[]=$stream;
    $objects=[1=>'<< /Type /Catalog /Pages 2 0 R >>',3=>'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',4=>'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];$kids=[];
    foreach($pages as $i=>$content){$id=5+$i*2;$cid=$id+1;$kids[]="$id 0 R";$objects[$id]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents $cid 0 R >>";$objects[$cid]='<< /Length '.strlen($content)." >>\nstream\n".$content."endstream";}
    $objects[2]='<< /Type /Pages /Count '.count($pages).' /Kids ['.implode(' ',$kids).'] >>';ksort($objects);
    $pdf="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";$offsets=[0];foreach($objects as $id=>$o){$offsets[$id]=strlen($pdf);$pdf.="$id 0 obj\n$o\nendobj\n";}$xref=strlen($pdf);$size=count($objects)+1;$pdf.="xref\n0 $size\n0000000000 65535 f \n";for($i=1;$i<$size;$i++)$pdf.=sprintf('%010d 00000 n ',$offsets[$i])."\n";$pdf.="trailer\n<< /Size $size /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n";return $pdf;
}
function gt_inventory_report(array $garage,string $format): never {
    if(!in_array($format,['pdf','csv'],true))gt_json(['error'=>'Unbekanntes Exportformat.'],400);
    $snapshot=gt_inventory_snapshot($garage);$body=$format==='csv'?gt_inventory_csv($snapshot):gt_inventory_pdf($snapshot);
    header('Cache-Control: private, no-store');header('Content-Type: '.($format==='csv'?'text/csv; charset=utf-8':'application/pdf'));header('Content-Disposition: attachment; filename="Gravelbike-Garage-Inventur-'.date('Y-m-d').'.'.$format.'"');header('Content-Length: '.strlen($body));echo $body;exit;
}
