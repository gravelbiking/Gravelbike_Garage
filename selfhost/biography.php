<?php
declare(strict_types=1);

function gt_bio(array $garage, string $bikeId, string $kind, bool $archive = false): array {
    $bikes = array_values(array_filter($garage['bikes'], fn($b) => $b['id'] === $bikeId));
    if (!$bikes || !in_array($kind, ['seller','workshop'], true)) throw new RuntimeException('Fahrrad oder Lebenslauf nicht gefunden.');
    $b = $bikes[0]; $seller = $kind === 'seller'; $files = []; $warnings = [];
    $history = array_values(array_filter($garage['history'], fn($h) => $h['bikeId'] === $bikeId));
    usort($history, fn($a,$b) => strcmp($a['date'] ?? '', $b['date'] ?? ''));
    $names = array_column($garage['contacts'] ?? [], 'name');
    foreach ($history as $h) if (!empty($h['workshop']) && !preg_match('/^(selbst|eigenarbeit|selbst durchgeführt)$/iu', trim($h['workshop']))) $names[] = $h['workshop'];
    $names = array_values(array_filter(array_unique($names), fn($s) => is_string($s) && trim($s) !== ''));
    usort($names, fn($a,$b) => strlen($b) <=> strlen($a));
    $clean = function($s) use ($seller, $names) { $value=(string)($s ?? ''); if (!$seller) foreach ($names as $name) $value=preg_replace('/'.preg_quote($name,'/').'/iu','[Betrieb ausgeblendet]',$value); return $value; };
    $e = fn($s) => htmlspecialchars($clean($s), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $date = fn($s) => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$s) ? substr($s,8,2).'.'.substr($s,5,2).'.'.substr($s,0,4) : '–';
    $number = fn($v) => is_numeric($v) ? rtrim(rtrim(number_format((float)$v, 3, ',', '.'),'0'),',') : '–';
    $kmNumber = fn($v) => is_numeric($v) ? rtrim(rtrim(number_format((float)$v, 1, ',', '.'),'0'),',') : '–';
    $readings = $b['readings'] ?? [];
    $lastReading = end($readings);
    if (empty($b['kmDate']) && $lastReading && ($lastReading['km'] ?? null) == $b['km']) {
        $b['kmDate'] = $lastReading['date'] ?? '';
    }
    $title = $seller ? 'Verkaufs-Lebenslauf' : 'Werkstatt-Lebenslauf';
    $previewCss = $archive ? '' : '<link rel="stylesheet" href="document-preview.css">';
    $closeReport = $archive ? '' : '<a class="close-report" href="./#bike/'.rawurlencode($bikeId).'">Schließen</a> ';
    $html = '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>'.$e($title.' · '.$b['name']).'</title>'.$previewCss.'<style>html{overflow-wrap:anywhere}body{font:14px/1.55 -apple-system,Arial,sans-serif;color:#233e32;max-width:960px;margin:40px auto;padding:0 24px}h1{font-size:30px}h2{margin-top:32px;border-bottom:2px solid #dce5d6;padding-bottom:8px}h3{margin-bottom:8px}table{width:100%;border-collapse:collapse;margin:12px 0 20px}td,th{padding:9px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f3f5ef}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}dt{font-size:11px;color:#666}dd{margin:0}article{border-bottom:1px solid #ddd;padding:8px 0 18px}.muted{color:#666;font-size:12px}.toolbar{padding:15px;background:#f3f5ef}.close-report{display:inline-block;padding:10px;margin-right:5px;background:#233e32;color:white;text-decoration:none;border-radius:6px}a{color:inherit}button{padding:10px;cursor:pointer}a,button{min-height:44px;min-width:44px;box-sizing:border-box}a{display:inline-flex;align-items:center}.toolbar{padding-top:calc(15px + env(safe-area-inset-top,0px))}body{padding-bottom:env(safe-area-inset-bottom,0px)}table{table-layout:fixed}@media(max-width:600px){dl{grid-template-columns:minmax(0,1fr)}body{margin:16px auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}}@media print{.toolbar{display:none}body{margin:0;padding:0;color:#111}h2,h3{break-after:avoid}tr,dl{break-inside:avoid}a{text-decoration:none}@page{size:A4;margin:18mm}}</style><body><div class="toolbar">'.$closeReport.'<button data-print>Drucken / als PDF speichern</button> <span>Für die Weitergabe: '.$e($seller?'Lebenslauf mit Anlagen als ZIP herunterladen.':'Druckdialog öffnen und als PDF speichern.').'</span></div><p class="muted">GRAVELBIKE GARAGE · Erstellt am '.date('d.m.Y').'</p><h1>'.$e($title).'</h1><h2>'.$e($b['name']).'</h2><dl>';
    foreach (['brand'=>'Hersteller','model'=>'Modell','type'=>'Fahrradtyp','serial'=>'Rahmen-Seriennummer','size'=>'Rahmengröße','year'=>'Baujahr','modelYear'=>'Modelljahr','frameColor'=>'Rahmenfarbe','frameMaterial'=>'Rahmenmaterial','weightKg'=>'Fahrradgewicht (kg)','km'=>'Aktueller Kilometerstand','kmDate'=>'Stand der Ablesung','purchaseDate'=>'Kaufdatum'] as $key=>$label) {
        $v = $b[$key] ?? '–'; if ($key === 'km') $v = $kmNumber($v).' km'; if (in_array($key,['kmDate','purchaseDate'])) $v = $date($v); if ($key === 'kmDate' && $v === '–') $v = 'Unbekannt';
        $html .= '<div><dt>'.$label.'</dt><dd>'.$e($v === '' ? '–' : $v).'</dd></div>';
    }
    $html .= '</dl>';
    if ($seller && !$archive) $html .= '<p><a href="api.php?route=biography&amp;bike='.rawurlencode($bikeId).'&amp;kind=seller&amp;download=1">Lebenslauf mit Anlagen herunterladen (ZIP)</a></p>';
    $partArchive = function(array $part) use ($b,$e,$date,$number,$kmNumber): string {
        $entries=array_filter($b['componentArchive']??[],fn($entry)=>strtolower(trim($entry['component']['name']))===strtolower(trim($part['name'])) && gt_bio_category($entry['component'])===gt_bio_category($part));
        if (!$entries) return '';
        $out='<details class="parts-archive"><summary role="button">Teilearchiv · '.$e($part['name']).' ('.count($entries).')</summary><table><thead><tr><th>Ausgebautes Teil</th><th>Einbau / Ausbau</th><th>Ausbau-Kilometerstand</th><th>Eingefrorene Laufleistung</th></tr></thead><tbody>';
        foreach ($entries as $entry) {
            $c=$entry['component'];
            $out.='<tr><td>'.$e(implode(' · ',array_filter([$c['name'],$c['manufacturer']??'',$c['model']??'',$c['serial']??'']))).'</td><td>'.$date($c['installedDate']??'').' / '.$date($entry['removedDate']).'</td><td>'.$kmNumber($entry['removedKm']).' km</td><td>'.($entry['mileage']===null?'Unbekannt (Einbau-km fehlen)':$kmNumber($entry['mileage']).' km').'</td></tr>';
        }
        return $out.'</tbody></table></details>';
    };
    $html .= '<h2>Aktuell verbaute Komponenten</h2><p class="muted">Ausstattung zum Erstellungszeitpunkt, keine Liste früher ausgebauter Teile.</p>';
    $categories = array_merge(['Antrieb','Bremsen','Räder','Reifen','Cockpit','Sattel','Licht','Zubehör'],$garage['customComponentCategories']??[]);
    foreach ($categories as $category) {
        $parts = array_filter($b['components'], fn($c) => gt_bio_category($c) === $category);
        if (!$parts) continue;
        $html .= '<h3>'.$category.'</h3>';
        foreach ($parts as $c) {
            $html .= '<article><strong>'.$e($c['name']).'</strong><dl>';
            foreach (['manufacturer'=>'Hersteller','model'=>'Modell','serial'=>'Seriennummer','originalPartNumber'=>'Original-Teilenummer','installedDate'=>'Einbaudatum','installedKm'=>'Kilometerstand beim Einbau'] as $key=>$label) {
                $v = $c[$key] ?? ''; if ($v === '' || $v === null) continue;
                if ($key === 'installedDate') $v = $date($v); if ($key === 'installedKm') $v = $kmNumber($v).' km';
                $html .= '<div><dt>'.$label.'</dt><dd>'.$e($v).'</dd></div>';
            }
            if (isset($c['installedKm']) && $b['km'] >= $c['installedKm']) $html .= '<div><dt>Laufleistung seit Einbau</dt><dd>'.$kmNumber($b['km']-$c['installedKm']).' km</dd></div>';
            foreach (['axleDimension'=>'Achsdimension','brakeMount'=>'Bremsaufnahme','rimHeight'=>'Felgenhöhe (mm)','internalWidth'=>'Innenmaulweite (mm)','rimMaterial'=>'Felgenmaterial','bearingServiceDate'=>'Lagerservicedatum','freehub'=>'Freilaufkörper'] as $key=>$label) if (isset($c['wheel'][$key]) && $c['wheel'][$key] !== '') $html .= '<div><dt>'.$label.'</dt><dd>'.$e($key === 'bearingServiceDate' ? $date($c['wheel'][$key]) : $c['wheel'][$key]).'</dd></div>';
            if (!empty($c['tireDimensions'])) $html .= '<div><dt>Dimensionen</dt><dd>'.$e($c['tireDimensions']).'</dd></div>';
            if (isset($c['tireWidth'])) $html .= '<div><dt>Reifenbreite</dt><dd>'.$e($number($c['tireWidth']).' '.($c['tireUnit'] ?? 'mm')).'</dd></div>';
            $html .= '</dl>'.$partArchive($c).'</article>';
        }
    }
    if (!$b['components']) $html .= '<p>Keine Komponenten dokumentiert.</p>';
    $slots=[];foreach ($b['components'] as $c) $slots[gt_bio_category($c).':'.strtolower(trim($c['name']))]=true;
    $unused='';foreach ($b['componentArchive']??[] as $entry) {
        $c=$entry['component'];$key=gt_bio_category($c).':'.strtolower(trim($c['name']));
        if (!isset($slots[$key])) {$unused.=$partArchive($c);$slots[$key]=true;}
    }
    if ($unused!=='') $html.='<h2>Teilearchiv – aktuell nicht verbaute Bauteile</h2>'.$unused;
    if(function_exists('gt_tp_records')&&gt_tp_enabled()){
        $tireHtml='';foreach(gt_tp_records($garage) as $t){
            $periods=array_values(array_filter($t['history'],fn($h)=>$h['bikeId']===$bikeId));
            if(($t['mount']['bikeId']??'')===$bikeId)array_unshift($periods,$t['mount']+['current'=>true]);
            if(!$periods)continue;
            $tireHtml.='<article><h3>'.$e(trim($t['manufacturer'].' '.$t['model'])?:'Reifen '.$t['id']).'</h3><p>Dimensionen: '.$e($t['dimensions']?:'Nicht angegeben').'</p><p>Gesamtlaufleistung Reifen: '.($t['totalMileage']===null?'Unbekannt; '.$kmNumber($t['knownMileage']).' km dokumentiert':$kmNumber($t['totalMileage']).' km').'</p><ul>';
            foreach($periods as $h)$tireHtml.='<li>'.$e($h['position']??'Position nicht dokumentiert').' · angebaut '.$date($h['installedDate']??'').' bei '.$kmNumber($h['installedKm']??null).' km · '.(!empty($h['current'])?'noch montiert, aktueller Stand '.$kmNumber($h['currentKm']).' km':'abgebaut '.$date($h['removedDate']??'').' bei '.$kmNumber($h['removedKm']??null).' km').' · in dieser Montage '.(($h['mileage']??null)===null?'Laufleistung unbekannt':$kmNumber($h['mileage']).' km').'</li>';
            $tireHtml.='</ul></article>';
        }if($tireHtml!=='')$html.='<h2>Reifenpark · Montagehistorie dieses Fahrrads</h2>'.$tireHtml;
    }
    $planned=array_values(array_filter($garage['plans'],fn($p)=>$p['bikeId']===$bikeId&&empty($p['completed'])));
    if($planned){$html.='<h2>Geplante Serviceintervalle</h2><p class="muted">Künftige Planung, kein Durchführungsnachweis.</p><ul>';
        foreach($planned as $p){$next=!empty($p['nextDate'])?$date($p['nextDate']):$kmNumber($p['nextKm']??null).' km';$repeat=!empty($p['months'])?'alle '.$number($p['months']).' Monate':(!empty($p['intervalKm'])?'alle '.$kmNumber($p['intervalKm']).' km':'einmalig');$html.='<li>'.$e($p['title']).' · '.$e($p['source']??'Eigenes Intervall').' · '.$e($repeat).' · nächste Fälligkeit: '.$e($next).' · '.(($p['performer']??'self')==='custom'?$e($p['performerName']??'Eigene Angabe'):(($p['performer']??'self')==='workshop'?'Werkstatt':'Selbst')).'</li>';}
        $html.='</ul>';
    }
    $completed=array_values(array_filter($garage['orders']??[],fn($o)=>$o['bikeId']===$bikeId&&!empty($o['completedAt'])));
    usort($completed,fn($a,$b)=>strcmp($a['completedAt'],$b['completedAt']));
    if($completed){$html.='<h2>Durchgeführte Werkstattaufträge</h2>';
        foreach($completed as $o){$html.='<article><h3>'.$e($o['title']).'</h3><p>'.$date($o['completedAt']).' · '.$kmNumber($o['completedKm']).' km</p><ul>';
            foreach($o['steps'] as $step)$html.='<li>'.$e($step['title']).'</li>';
            $html.='</ul><h4>Verwendete Materialien</h4><ul>';
            foreach($o['parts'] as $part)if(!empty($part['booking']))$html.='<li>'.$e($part['name']).' · '.$number($part['quantity']).' '.$e($part['unit']).'</li>';
            $html.='</ul>';
            if(!empty($o['installations'])){$html.='<h4>Dokumentierte Bauteilwechsel</h4><ul>';foreach($o['installations'] as $record){$c=$record['component'];$html.='<li>'.$e(implode(' · ',array_filter([$c['name'],$c['manufacturer'],$c['model'],$c['originalPartNumber']]))).'</li>';}$html.='</ul>';}
            $html.='</article>';
        }
    }
    $html .= '<h2>Durchgeführte Services</h2>';
    if (!$history) $html .= '<p>Keine durchgeführten Services dokumentiert.</p>';
    foreach ($history as $index=>$h) {
        $external = !empty($h['contactId']) || (!empty($h['workshop']) && !preg_match('/^(selbst|eigenarbeit|selbst durchgeführt)$/iu', trim($h['workshop'])));
        $provider = $h['workshop'] ?? '';
        foreach ($garage['contacts'] ?? [] as $contact) if ($contact['id'] === ($h['contactId'] ?? '')) $provider = $contact['name'];
        $html .= '<article><h3>'.($index+1).'. '.$e($h['title']).'</h3><p>'.$date($h['date'] ?? '').' · '.$kmNumber($h['km'] ?? null).' km</p>';
        if ($seller) $html .= '<p>'.($external ? 'Durchgeführt bei: '.$e($provider ?: 'Externer Betrieb (Name nicht dokumentiert)') : 'Eigenarbeit / keine externe Werkstatt dokumentiert').'</p>';
        if (!empty($h['part'])) $html .= '<p>Ausgetauscht / eingebaut: '.$e($h['part']).(!empty($h['partSerial'])?' · Seriennummer '.$e($h['partSerial']):'').'</p>';
        if (!empty($h['materials'])) {
            $html .= '<table><thead><tr><th>Material / Teil</th><th>Artikelnummer</th><th>Menge</th></tr></thead><tbody>';
            foreach ($h['materials'] as $m) $html .= '<tr><td>'.$e($m['name']).'</td><td>'.$e($m['articleNumber'] ?? '–').'</td><td>'.$number($m['quantity']).' '.$e($m['unit']).'</td></tr>';
            $html .= '</tbody></table>';
        } elseif (!$external && empty($h['part'])) $html .= '<p class="muted">Keine Materialien dokumentiert.</p>';
        // Notes may contain unrelated personal details or workshop names; do not export them.
        if ($seller && $external) {
            $attachments = $h['attachments'] ?? [];
            if (!$attachments) $html .= '<p class="muted">Keine Dokumente ausdrücklich diesem Service zugeordnet.</p>';
            foreach ($attachments as $doc) {
                $id = $doc['fileId'];
                $file = gt_query('SELECT name,mime FROM {{files}} WHERE id = ?', [$id])->fetch(PDO::FETCH_ASSOC);
                if (!$file || !is_file(gt_storage().'/uploads/'.$id.'.bin')) { $warnings[] = 'Beleg zu Service '.($index+1).' fehlt: '.$doc['name']; continue; }
                $extensions = ['application/pdf'=>'pdf','image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','image/heic'=>'heic','image/heif'=>'heif'];
                $path = 'Anlagen/Service-'.($index+1).'-'.(count($files)+1).'.'.($extensions[$file['mime']] ?? 'bin');
                $files[$path] = gt_storage().'/uploads/'.$id.'.bin';
                $href = $archive ? $path : 'api.php?route=files%2F'.rawurlencode($id);
                $preview = $archive ? '' : ' data-document-preview="'.$e($doc['name']).'"';
                $html .= '<p>Anlage: <a href="'.htmlspecialchars($href, ENT_QUOTES).'"'.$preview.'>'.$e($doc['name']).'</a></p>';
            }
        }
        $html .= '</article>';
    }
    if ($warnings) $html .= '<h2>Fehlende Anlagen</h2><ul>'.implode('', array_map(fn($w)=>'<li>'.$e($w).'</li>', $warnings)).'</ul>';
    $html .= '<p class="muted">Dieser Lebenslauf gibt die in der Garage dokumentierten Angaben wieder. Fehlende Einträge sind kein Nachweis, dass eine Wartung nicht stattgefunden hat.</p><script src="report.js"></script>'.($archive ? '' : '<script src="resilience.js"></script><script src="document-preview.js" defer></script>').'</body></html>';
    return ['html'=>$html,'files'=>$files];
}
function gt_bio_category(array $c): string {
    $categories = ['Antrieb'=>['Schaltwerk','Umwerfer','Kassette','Kurbel','Zahnkranz','Innenlager','Kette'],'Bremsen'=>['Schalt-/Bremshebel','Bremsscheibe','Bremsklotz','Bremsbelag','Bremskolben'],'Räder'=>['Vorderrad','Hinterrad'],'Reifen'=>['Vorderreifen','Hinterreifen'],'Cockpit'=>['Vorbau','Lenker'],'Sattel'=>['Sattel','Sattelstütze'],'Licht'=>['Vorderlicht','Rücklicht'],'Zubehör'=>[]];
    if (isset($c['category']) && is_string($c['category']) && trim($c['category'])!=='') return $c['category'];
    foreach ($categories as $key=>$names) if (in_array($c['name'], $names, true)) return $key;
    return 'Zubehör';
}
// Store-only ZIP writer: streams files and needs no PHP extension on shared hosting.
function gt_bio_zip(array $entries): never {
    header('Content-Type: application/zip'); header('Content-Disposition: attachment; filename="Fahrrad-Lebenslauf.zip"');
    $central = ''; $offset = 0; $count = 0;
    foreach ($entries as $name=>$entry) {
        $path = $entry['path'] ?? null; $text = $entry['text'] ?? '';
        $size = $path ? filesize($path) : strlen($text); $crc = hexdec($path ? hash_file('crc32b',$path) : hash('crc32b',$text));
        $header = pack('VvvvvvVVVvv',0x04034b50,20,0,0,0,33,$crc,$size,$size,strlen($name),0).$name;
        echo $header;
        if ($path) { $f=fopen($path,'rb'); fpassthru($f); fclose($f); } else echo $text;
        $central .= pack('VvvvvvvVVVvvvvvVV',0x02014b50,20,20,0,0,0,33,$crc,$size,$size,strlen($name),0,0,0,0,0,$offset).$name;
        $offset += strlen($header)+$size; $count++;
    }
    echo $central.pack('VvvvvVVv',0x06054b50,0,0,$count,$count,strlen($central),$offset,0); exit;
}
