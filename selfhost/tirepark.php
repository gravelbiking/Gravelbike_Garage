<?php
declare(strict_types=1);
// Reifenpark is a projection of existing physical tire instances, not a second stock ledger.
function gt_tp_clear_serials(array &$node,bool $tire=false): void {
    $tire=$tire||($node['category']??'')==='Reifen'||in_array($node['name']??'', ['Vorderreifen','Hinterreifen'],true);
    if($tire&&array_key_exists('serial',$node))$node['serial']='';
    foreach($node as $key=>&$child)if(is_array($child))gt_tp_clear_serials($child,$key==='tire'||($key==='component'&&$tire));unset($child);
}
function gt_tp_enabled(): bool { return (gt_config()['features']['tirepark']??true)!==false; }
function gt_tp_id(array $b,array $c,int $index): string { return $c['tireId']??'legacy-'.substr(hash('sha256',$b['id'].':'.gt_component_key($c,$index)),0,24); }
function gt_tp_dimensions(array $p,array $c=[]): string {
    if(($p['dimensionFormat']??'')==='text')return $p['dimensionLabel']??'';
    if(isset($p['dimensionSize']))return implode(' × ',array_values(array_filter([$p['dimensionSize'],$p['width']??''],fn($v)=>$v!=='')));
    if(!empty($p['dimensionLabel']))return $p['dimensionLabel'];
    return implode(' × ',array_values(array_filter([$p['diameter']??'', $p['width']??(isset($c['tireWidth'])?(string)$c['tireWidth']:'')],fn($v)=>$v!=='')));
}
function gt_tp_profiles(array $g): array {return array_column($g['tireProfiles']??[],null,'id');}
function gt_tp_records(array $g): array {
    require_once __DIR__.'/biography.php';$rows=[];$profiles=gt_tp_profiles($g);
    $add=function(string $id,array $c,array $history,?array $mount,?array $stock,bool $archived=false)use(&$rows,$profiles){
        $old=$rows[$id]??null;
        if($old&&($old['mount']||(!$mount&&count($old['history'])>count($history))))return;
        $p=$profiles[$id]??[];
        $rows[$id]=['id'=>$id,'manufacturer'=>$p['manufacturer']??$c['manufacturer']??'','type'=>$p['type']??'','model'=>$p['model']??$c['model']??'','manufactureYear'=>$p['manufactureYear']??'','purpose'=>$p['purpose']??'','tread'=>$p['tread']??'','tubeless'=>$p['tubeless']??null,'dimensionSize'=>$p['dimensionSize']??null,'dimensionFormat'=>$p['dimensionFormat']??'','dimensions'=>gt_tp_dimensions($p,$c),'dimensionLabel'=>$p['dimensionLabel']??'','width'=>$p['width']??(isset($c['tireWidth'])?(string)$c['tireWidth']:''),'diameter'=>$p['diameter']??'','unit'=>$p['unit']??$c['tireUnit']??'mm','photo'=>$p['photo']??null,'pairId'=>$p['pairId']??'','pairRole'=>$p['pairRole']??'','location'=>$stock['location']??'','usageState'=>$p['usageState']??'unknown','initialMileage'=>$p['initialMileage']??null,'history'=>$history,'mount'=>$mount,'stock'=>$stock,'archived'=>$archived];
    };
    foreach($g['inventory']??[] as $s)foreach($s['positions']??[] as $p)if(isset($p['tire']))$add($p['tire']['id'],$p['tire']['component'],$p['tire']['history'],null,['inventoryId'=>$s['id'],'positionId'=>$p['id'],'available'=>$p['quantity']==1,'location'=>$p['location']]);
    foreach($g['bikes'] as $b){
        foreach($b['componentArchive']??[] as $a){$c=$a['component'];if(gt_bio_category($c)!=='Reifen')continue;$id=$c['tireId']??'archive-'.substr(hash('sha256',$b['id'].':'.$a['componentKey']),0,24);if(isset($rows[$id]))continue;$h=$c['tireHistory']??[];$h[]=['bikeId'=>$b['id'],'bikeName'=>$b['name'],'position'=>$c['name'],'installedDate'=>$c['installedDate']??'','installedKm'=>$c['installedKm']??null,'removedDate'=>$a['removedDate'],'removedKm'=>$a['removedKm'],'mileage'=>$a['mileage']];$add($id,$c,$h,null,null,true);}
        foreach($b['components'] as $i=>$c)if(gt_bio_category($c)==='Reifen'){
            try{$current=gt_component_frozen_mileage($c,$b,$g['history']??[],(float)$b['km']);}catch(RuntimeException $e){$current=null;}
            $add(gt_tp_id($b,$c,$i),$c,$c['tireHistory']??[],['bikeId'=>$b['id'],'bikeName'=>$b['name'],'componentKey'=>gt_component_key($c,$i),'position'=>$c['name'],'installedDate'=>$c['installedDate']??'','installedKm'=>$c['installedKm']??null,'currentKm'=>$b['km'],'mileage'=>$current],null);
        }
    }
    foreach($rows as &$row){
        $ever=$row['mount']!==null||count($row['history'])>0||$row['archived'];
        $row['everMounted']=$ever;$row['isNew']=!$ever&&$row['usageState']==='new';if($ever)$row['usageState']='used';
        $known=0.;$unknown=$row['initialMileage']===null&&!$row['isNew'];
        foreach($row['history'] as $h){if(($h['mileage']??null)===null)$unknown=true;else $known+=(float)$h['mileage'];}
        if($row['mount']){if($row['mount']['mileage']===null)$unknown=true;else $known+=(float)$row['mount']['mileage'];}
        $row['knownMileage']=round($known+(float)($row['initialMileage']??0),1);$row['totalMileage']=$unknown?null:$row['knownMileage'];
        $row['available']=!$row['mount']&&!$row['archived']&&($row['stock']['available']??false);
        $row['status']=$row['mount']?'mounted':($row['available']?'stored':'archived');
    }unset($row);return array_values($rows);
}
function gt_tp_profile(array $body,array $record=[]): array {
    $p=[];
    foreach(['manufacturer'=>200,'type'=>200,'model'=>200,'manufactureYear'=>4,'purpose'=>500,'tread'=>500,'dimensionSize'=>80,'dimensionLabel'=>200,'width'=>80,'diameter'=>80,'unit'=>40,'usageState'=>20,'pairRole'=>10] as $k=>$limit){$v=$body[$k]??(in_array($k,['type','manufactureYear','tread','usageState'],true)?($record[$k]??($k==='usageState'?'unknown':'')):'');if(!is_string($v)||strlen($v)>$limit)throw new InvalidArgumentException('Bitte die Reifenangaben prüfen.');$p[$k]=trim($v);}
    if(array_key_exists('dimensionLabel',$body)&&!array_key_exists('dimensionSize',$body)){
        // A single free-text size takes precedence over legacy structured dimensions.
        unset($p['dimensionSize']);$p['dimensionFormat']='text';
        foreach(['width','diameter','unit'] as $key)$p[$key]=$record[$key]??($body[$key]??'');
    }elseif(($body['dimensionsEdited']??false)===true){
        $p['dimensionLabel']=implode(' × ',array_values(array_filter([$p['dimensionSize'],$p['width']],fn($v)=>$v!=='')));
        $p['diameter']=$record['diameter']??'';
    }elseif($record){
        if(isset($record['dimensionFormat']))$p['dimensionFormat']=$record['dimensionFormat'];
        foreach(['dimensionLabel','width','diameter','unit'] as $key)$p[$key]=$record[$key]??'';
        if(($record['dimensionSize']??null)===null)unset($p['dimensionSize']);else $p['dimensionSize']=$record['dimensionSize'];
    }elseif(!array_key_exists('dimensionSize',$body))unset($p['dimensionSize']);
    if($p['manufactureYear']!==''&&(!ctype_digit($p['manufactureYear'])||(int)$p['manufactureYear']<1900||(int)$p['manufactureYear']>2100))throw new InvalidArgumentException('Bitte ein gültiges Baujahr angeben.');
    if(!in_array($p['usageState'],['new','used','unknown'],true)||!in_array($p['pairRole'],['','front','rear'],true))throw new InvalidArgumentException('Bitte Zustand und Paarrolle prüfen.');
    if(!empty($record['everMounted'])&&$p['usageState']==='new')throw new InvalidArgumentException('Ein bereits montierter Reifen ist nicht neu.');
    $p['tubeless']=$body['tubeless']??null;if($p['tubeless']!==null&&!is_bool($p['tubeless']))throw new InvalidArgumentException('Tubeless bitte mit Ja, Nein oder nicht angegeben erfassen.');
    $p['initialMileage']=$body['initialMileage']??null;if($p['initialMileage']!==null&&!gt_supply_number($p['initialMileage']))throw new InvalidArgumentException('Bitte eine gültige bisherige Laufleistung angeben.');
    if($p['usageState']==='new'){if(($p['initialMileage']??0)>0)throw new InvalidArgumentException('Ein neuer Reifen kann keine gefahrenen Kilometer haben.');$p['initialMileage']=0;}
    $p['photo']=$body['photo']??null;
    if($p['photo']!==null){if(!is_string($p['photo'])||!preg_match('/^[a-f0-9]{32}$/D',$p['photo']))throw new InvalidArgumentException('Bitte ein gültiges Reifenfoto hochladen.');$mime=gt_query('SELECT mime FROM {{files}} WHERE id=?',[$p['photo']])->fetchColumn();if(!is_string($mime)||!str_starts_with($mime,'image/'))throw new InvalidArgumentException('Die Datei ist kein Reifenfoto.');}
    return $p;
}
function gt_tp_item(array &$g,array $c): int {
    $g['inventory']??=[];
    // Reuse an exact catalogue match, but never count a mounted tire as warehouse stock.
    foreach($g['inventory'] as $i=>$s)if($s['category']==='Reifen'&&$s['unit']==='Stück'&&$s['manufacturer']===($c['manufacturer']??'')&&$s['name']===($c['model']??'Reifen')&&($s['tireDimension']??'')===($c['dimensionLabel']??''))return $i;
    $g['inventory'][]=['id'=>bin2hex(random_bytes(16)),'name'=>($c['model']??'')?:'Reifen','manufacturer'=>$c['manufacturer']??'','category'=>'Reifen','kind'=>'Original','articleNumber'=>'','quantity'=>0,'unit'=>'Stück','minStock'=>0,'unitPrice'=>null,'purchaseDate'=>'','location'=>'','notes'=>'Einzelreifen im Reifenpark','invoices'=>[],'datasheets'=>[],'positions'=>[],'movements'=>[],'tireDimension'=>$c['dimensionLabel']??''];return count($g['inventory'])-1;
}
function gt_tp_movement(array &$s,int $pi,float $change,string $type,string $day,array $ctx=[]): string {
    $p=&$s['positions'][$pi];$before=$p['quantity'];$p['quantity']+=$change;
    $id=bin2hex(random_bytes(16));$s['movements'][]=['id'=>$id,'positionId'=>$p['id'],'type'=>$type,'change'=>$change,'before'=>$before,'after'=>$p['quantity'],'at'=>(new DateTimeImmutable('now',new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z'),'date'=>$day,'historyId'=>'','serviceTitle'=>$ctx['title']??'Reifenpark','bikeId'=>$ctx['bikeId']??'','bikeName'=>$ctx['bikeName']??'','shoppingId'=>'','reason'=>$ctx['reason']??'Reifenpark','unitPrice'=>$p['unitPrice']??null]+$ctx;
    $s['quantity']=array_sum(array_column($s['positions'],'quantity'));return $id;
}
function gt_tp_position(array &$s,array $tire,string $location,string $day,array $ctx=[]): int {
    $s['positions'][]=['id'=>bin2hex(random_bytes(16)),'label'=>'Reifenpark','location'=>$location,'quantity'=>0,'unitPrice'=>null,'purchaseDate'=>'','supplierId'=>'','supplier'=>'','notes'=>'Physisches Reifenexemplar','packageType'=>'Einzelbestand','packageSize'=>1,'invoices'=>[],'tire'=>$tire];$i=count($s['positions'])-1;gt_tp_movement($s,$i,1,'receipt',$day,$ctx);return $i;
}
function gt_tp_find(array $g,string $id): ?array {foreach(gt_tp_records($g) as $r)if($r['id']===$id)return $r;return null;}
function gt_tp_save(array &$g,array $body): string {
    $id=$body['id']??'';if(!is_string($id)||strlen($id)>200)throw new InvalidArgumentException('Ungültige Reifenkennung.');
    $record=$id!==''?gt_tp_find($g,$id):null;if($id!==''&&!$record)throw new InvalidArgumentException('Der Reifen ist nicht mehr vorhanden.');
    if(!is_array($body['profile']??null))throw new InvalidArgumentException('Bitte gültige Reifenangaben senden.');
    $profile=gt_tp_profile($body['profile'],$record??[]);$id=$record['id']??bin2hex(random_bytes(16));$profile['id']=$id;
    $profiles=gt_tp_profiles($g);$existing=$profiles[$id]??[];
    if($record&&array_key_exists('initialMileage',$existing)&&$profile['initialMileage']!==$existing['initialMileage'])throw new InvalidArgumentException('Die bisherige Laufleistung bleibt als historischer Ausgangswert erhalten.');
    $partner=$body['partnerId']??'';if(!is_string($partner)||$partner===$id)throw new InvalidArgumentException('Bitte einen anderen Partnerreifen wählen.');
    $pairRecord=$partner!==''?gt_tp_find($g,$partner):null;if($partner!==''&&!$pairRecord)throw new InvalidArgumentException('Der Partnerreifen ist nicht vorhanden.');
    $oldPair=$existing['pairId']??'';foreach($profiles as &$x)if($oldPair!==''&&($x['pairId']??'')===$oldPair){$x['pairId']='';$x['pairRole']='';}unset($x);
    $profile['pairId']='';
    if($pairRecord){$otherPair=$profiles[$partner]['pairId']??'';foreach($profiles as &$x)if($otherPair!==''&&($x['pairId']??'')===$otherPair){$x['pairId']='';$x['pairRole']='';}unset($x);
        $pair=bin2hex(random_bytes(16));$profile['pairId']=$pair;$profile['pairRole']=$profile['pairRole']?:'front';
        $other=$profiles[$partner]??array_intersect_key($pairRecord,array_flip(['id','manufacturer','type','model','manufactureYear','purpose','tread','tubeless','dimensionSize','dimensionLabel','dimensionFormat','width','diameter','unit','photo','usageState','initialMileage']));$other['pairId']=$pair;$other['pairRole']=$profile['pairRole']==='front'?'rear':'front';$profiles[$partner]=$other;
    }else $profile['pairRole']='';
    if(!$record){
        $sourceStock=$body['inventoryId']??'';$sourcePosition=$body['positionId']??'';$si=null;
        if($sourceStock!==''||$sourcePosition!==''){
            foreach($g['inventory']??[] as $i=>$stock)if($stock['id']===$sourceStock)$si=$i;
            if($si===null||$g['inventory'][$si]['category']!=='Reifen'||$g['inventory'][$si]['unit']!=='Stück')throw new InvalidArgumentException('Bitte einen vorhandenen Reifenbestand auswählen.');
            $pi=null;foreach($g['inventory'][$si]['positions'] as $i=>$pos)if($pos['id']===$sourcePosition)$pi=$i;
            if($pi===null||isset($g['inventory'][$si]['positions'][$pi]['tire'])||$g['inventory'][$si]['positions'][$pi]['quantity']<1)throw new InvalidArgumentException('Dieser Bestand ist nicht verfügbar oder bereits einem Reifen zugeordnet.');
            gt_tp_movement($g['inventory'][$si],$pi,-1,'adjustment',date('Y-m-d'),['reason'=>'Als Einzelreifen im Reifenpark erfasst']);
        }else $si=gt_tp_item($g,$profile);
        $component=['id'=>bin2hex(random_bytes(16)),'name'=>'Reifen','category'=>'Reifen','manufacturer'=>$profile['manufacturer'],'model'=>$profile['model']];
        gt_tp_position($g['inventory'][$si],['id'=>$id,'component'=>$component,'history'=>[]],trim((string)($body['location']??'')),date('Y-m-d'));
    }elseif($record['available']){
        foreach($g['inventory'] as &$s)if($s['id']===$record['stock']['inventoryId'])foreach($s['positions'] as &$pos)if($pos['id']===$record['stock']['positionId'])$pos['location']=trim((string)($body['location']??$pos['location']));unset($s,$pos);
    }
    if($record&&$record['mount']){
        foreach($g['bikes'] as &$b)if($b['id']===$record['mount']['bikeId'])foreach($b['components'] as $ci=>&$c)if(gt_component_key($c,$ci)===$record['mount']['componentKey']){
            // Pin an imported legacy instance before a normal component edit assigns a new ID.
            $c['id']=$c['id']??bin2hex(random_bytes(16));$c['tireId']=$id;$c['tireHistory']=$c['tireHistory']??[];
            $c['manufacturer']=$profile['manufacturer'];$c['model']=$profile['model'];$c['tireDimensions']=gt_tp_dimensions($profile,$c);
        }unset($b,$c);
    }
    $profiles[$id]=$profile;$g['tireProfiles']=array_values($profiles);return $id;
}
function gt_tp_assign_position(array &$g,array $body): string {
    $id=$body['id']??'';$bikeId=$body['bikeId']??'';$slot=$body['position']??'';
    if(!is_string($id)||!is_string($bikeId)||!in_array($slot,['Vorderreifen','Hinterreifen'],true))throw new InvalidArgumentException('Bitte Reifen und Montageposition auswählen.');
    $record=gt_tp_find($g,$id);
    if(!$record||!$record['mount']||$record['mount']['bikeId']!==$bikeId)throw new InvalidArgumentException('Dieser Reifen ist nicht an diesem Fahrrad montiert.');
    if(in_array($record['mount']['position'],['Vorderreifen','Hinterreifen'],true))throw new InvalidArgumentException('Die Reifenposition wurde bereits zugeordnet. Bitte neu laden.');
    foreach(gt_tp_records($g) as $t)if($t['mount']&&$t['mount']['bikeId']===$bikeId&&$t['mount']['position']===$slot)throw new InvalidArgumentException('Diese Montageposition ist bereits belegt.');
    foreach($g['bikes'] as &$b)if($b['id']===$bikeId){
        if(!empty($b['archived']))throw new InvalidArgumentException('Bitte ein aktives Fahrrad auswählen.');
        foreach($b['components'] as $ci=>&$c)if(gt_component_key($c,$ci)===$record['mount']['componentKey']){
            $c['id']=$c['id']??bin2hex(random_bytes(16));$c['tireId']=$id;$c['name']=$slot;
            return $id;
        }
    }
    throw new InvalidArgumentException('Der montierte Reifen wurde inzwischen geändert. Bitte neu laden.');
}

function gt_tp_swap(array &$g,array $body): string {
    $bikeId=$body['bikeId']??'';$slot=$body['position']??'';$out=$body['outgoingId']??'';$in=$body['incomingId']??'';$day=$body['date']??'';
    if(!is_string($bikeId)||!is_string($out)||!is_string($in)||!in_array($slot,['Vorderreifen','Hinterreifen'],true)||!is_string($day)||!gt_supply_date($day)||$day===''||$day>date('Y-m-d')||($out===''&&$in==='')||($out!==''&&$out===$in))throw new InvalidArgumentException('Bitte Reifenwechsel und Datum prüfen.');
    $bi=null;foreach($g['bikes'] as $i=>$b)if($b['id']===$bikeId&&empty($b['archived']))$bi=$i;if($bi===null)throw new InvalidArgumentException('Bitte ein aktives Fahrrad auswählen.');$b=&$g['bikes'][$bi];
    foreach(gt_tp_records($g) as $t)if($t['mount']&&$t['mount']['bikeId']===$bikeId&&!in_array($t['mount']['position'],['Vorderreifen','Hinterreifen'],true))throw new InvalidArgumentException('Bitte zuerst die Montageposition der bereits verbauten Reifen zuordnen.');
    $row=null;foreach(gt_tp_records($g) as $r)if($r['mount']&&$r['mount']['bikeId']===$bikeId&&$r['mount']['position']===$slot){if($row)throw new InvalidArgumentException('An dieser Position sind mehrere Reifen erfasst. Bitte zuerst die Fahrradkonfiguration prüfen.');$row=$r;}
    if(($row['id']??'')!==$out)throw new InvalidArgumentException('Der montierte Reifen wurde inzwischen geändert. Bitte neu laden.');
    $incoming=$in!==''?gt_tp_find($g,$in):null;if($in!==''&&(!$incoming||!$incoming['available']))throw new InvalidArgumentException('Der ausgewählte Reifen ist bereits montiert oder nicht verfügbar.');
    $oldMileage=null;$oldName='Kein Reifen';$newName='Kein Reifen';
    if($row){
        if(($row['mount']['installedKm']??0)>$b['km'])throw new InvalidArgumentException('Der Fahrrad-Kilometerstand liegt unter den Einbau-km. Bitte zuerst korrigieren.');
        if($row['mount']['installedDate']!==''&&$day<$row['mount']['installedDate'])throw new InvalidArgumentException('Der Ausbau darf nicht vor dem Einbau liegen.');
        $ci=null;foreach($b['components'] as $i=>$c)if(gt_component_key($c,$i)===$row['mount']['componentKey'])$ci=$i;
        if($ci===null)throw new InvalidArgumentException('Der ausgebaute Reifen fehlt.');$c=$b['components'][$ci];$oldMileage=$row['mount']['mileage'];$oldName=trim($row['manufacturer'].' '.$row['model'])?:$slot;
        $h=$c['tireHistory']??[];$h[]=['bikeId'=>$b['id'],'bikeName'=>$b['name'],'position'=>$slot,'installedDate'=>$c['installedDate']??'','installedKm'=>$c['installedKm']??null,'removedDate'=>$day,'removedKm'=>$b['km'],'mileage'=>$oldMileage];
        $si=gt_tp_item($g,$row);gt_tp_position($g['inventory'][$si],['id'=>$out,'component'=>gt_tire_base($c),'history'=>$h],trim((string)($body['location']??'')),$day,['bikeId'=>$bikeId,'bikeName'=>$b['name'],'reason'=>'Schnellwechsel: Reifen eingelagert']);
        array_splice($b['components'],$ci,1);
    }
    if($incoming){
        $last=end($incoming['history']);if($last&&($last['removedDate']??'')>$day)throw new InvalidArgumentException('Der Einbau darf nicht vor dem letzten Ausbau liegen.');
        $si=$pi=null;foreach($g['inventory'] as $i=>$s)if($s['id']===$incoming['stock']['inventoryId'])$si=$i;
        foreach($g['inventory'][$si]['positions'] as $i=>$p)if($p['id']===$incoming['stock']['positionId'])$pi=$i;
        $s=&$g['inventory'][$si];$p=&$s['positions'][$pi];if($p['quantity']!=1)throw new InvalidArgumentException('Dieser Reifen ist nicht mehr auf Lager.');
        $movement=gt_tp_movement($s,$pi,-1,'withdrawal',$day,['bikeId'=>$bikeId,'bikeName'=>$b['name'],'reason'=>'Schnellwechsel: Reifen montiert']);
        $component=$p['tire']['component'];$component['id']=bin2hex(random_bytes(16));$component['name']=$slot;$component['category']='Reifen';$component['tireId']=$in;$component['tireHistory']=$p['tire']['history'];$component['tireInstallMovementId']=$movement;$component['installedDate']=$day;$component['installedKm']=$b['km'];$component['tireDimensions']=$incoming['dimensions'];
        foreach(['manufacturer','model'] as $key)$component[$key]=$incoming[$key];
        if($incoming['width']!==''&&is_numeric($incoming['width'])&&(float)$incoming['width']>0){$component['tireWidth']=(float)$incoming['width'];$component['tireUnit']=in_array($incoming['unit'],['mm','Zoll'],true)?$incoming['unit']:'mm';}
        $b['components'][]=$component;$s['movements'][count($s['movements'])-1]['tireInstallId']=$component['id'];
        foreach($g['tireProfiles']??[] as $i=>$profile)if($profile['id']===$in)$g['tireProfiles'][$i]['usageState']='used';
        $newName=trim($incoming['manufacturer'].' '.$incoming['model'])?:'Reifen';unset($s,$p);
    }
    $g['history'][]=['id'=>bin2hex(random_bytes(16)),'bikeId'=>$bikeId,'title'=>($out===''?'Reifen montiert':($in===''?'Reifen ausgebaut':'Reifenwechsel')).' · '.$slot,'date'=>$day,'km'=>$b['km'],'cost'=>0,'contactId'=>'','workshop'=>'Selbst','part'=>$newName,'partSerial'=>'','notes'=>'Ausgebaut: '.$oldName.'. Eingebaut: '.$newName.'. Laufleistung der ausgebauten Montage: '.($oldMileage===null?'unbekannt':$oldMileage.' km').'.','attachments'=>[],'materials'=>[],'tireChange'=>['outgoingId'=>$out,'incomingId'=>$in,'position'=>$slot,'removedMileage'=>$oldMileage,'incomingMileage'=>$incoming['totalMileage']??null]];
    unset($b);return $in?:$out;
}
function gt_tp_save_mount(array &$g,array $body): string {
    // Create/serialize and mount in the same transaction; an occupied slot rolls everything back.
    $body['id']='';$id=gt_tp_save($g,$body);
    gt_tp_swap($g,['bikeId'=>$body['bikeId']??'','position'=>$body['position']??'','outgoingId'=>'','incomingId'=>$id,'date'=>$body['date']??'','location'=>'']);
    return $id;
}
function gt_tp_guard(array $before,array $after): bool {
    require_once __DIR__ . '/biography.php';
    $bikes=array_column($after['bikes']??[],null,'id');
    foreach($before['bikes']??[] as $b)foreach($b['components'] as $i=>$c){
        if(gt_bio_category($c)!=='Reifen')continue;
        if(!isset($bikes[$b['id']]))return false;
        $still=null;foreach($bikes[$b['id']]['components'] as $j=>$n)if(gt_component_key($n,$j)===gt_component_key($c,$i))$still=$n;
        if($still&&gt_bio_category($still)!=='Reifen')return false;
        if($still&&isset($c['tireId']))foreach(['name','installedDate','installedKm'] as $key)if(($still[$key]??null)!==($c[$key]??null))return false;
    }
    return ($before['tireProfiles']??[])===($after['tireProfiles']??[])&&($before['tireParkOperations']??[])===($after['tireParkOperations']??[]);
}
function gt_tp_route(string $method): never {
    if(!gt_tp_enabled())gt_json(['error'=>'Reifenpark ist für diese Instanz deaktiviert.'],403);
    $db=gt_db();
    if($method==='GET'){$row=gt_query('SELECT data,version FROM {{garage}} WHERE id=1')->fetch(PDO::FETCH_ASSOC);$g=$row?json_decode($row['data'],true,64,JSON_THROW_ON_ERROR):['bikes'=>[]];gt_json(['tires'=>gt_tp_records($g),'version'=>(int)($row['version']??0)]);}
    if($method!=='POST')gt_json(['error'=>'Methode nicht erlaubt.'],405);
    $body=gt_body();if(!is_int($body['version']??null)||!is_string($body['operationId']??null)||!preg_match('/^[a-f0-9-]{16,64}$/D',$body['operationId']))gt_json(['error'=>'Bitte die Seite neu laden.'],400);
    foreach(['id','partnerId','location','inventoryId','positionId','bikeId','position','outgoingId','incomingId','date'] as $key)if(isset($body[$key])&&(!is_string($body[$key])||strlen($body[$key])>1200))gt_json(['error'=>'Ungültige Reifenpark-Angabe.'],400);
    $hashBody=$body;unset($hashBody['version']);$hash=hash('sha256',json_encode($hashBody));
    try{
        $db->beginTransaction();gt_query('INSERT INTO {{garage}}(id,data,version) VALUES(1,?,0) ON DUPLICATE KEY UPDATE id=id',['{"bikes":[],"plans":[],"history":[],"documents":[],"inventory":[]}']);
        $row=gt_query('SELECT data,version FROM {{garage}} WHERE id=1 FOR UPDATE')->fetch(PDO::FETCH_ASSOC);$g=json_decode($row['data'],true,64,JSON_THROW_ON_ERROR);
        foreach($g['tireParkOperations']??[] as $op)if($op['id']===$body['operationId']){if($op['hash']!==$hash)throw new InvalidArgumentException('Diese Vorgangs-ID wurde bereits für andere Angaben verwendet.');$db->commit();gt_json(['ok'=>true,'id'=>$op['tireId'],'version'=>(int)$row['version'],'replayed'=>true]);}
        if((int)$row['version']!==$body['version']){$db->rollBack();gt_json(['error'=>'Auf einem anderen Gerät wurden Daten geändert. Bitte neu laden.'],409);}
        $g['history']??=[];$g['inventory']??=[];gt_tp_clear_serials($g);
        $id=match($body['action']??''){'assignPosition'=>gt_tp_assign_position($g,$body),'save'=>gt_tp_save($g,$body),'swap'=>gt_tp_swap($g,$body),'saveMount'=>gt_tp_save_mount($g,$body),default=>throw new InvalidArgumentException('Unbekannte Reifenpark-Aktion.')};
        $g['tireParkOperations'][]=['id'=>$body['operationId'],'hash'=>$hash,'tireId'=>$id,'action'=>$body['action'],'at'=>gmdate('c')];
        gt_tp_clear_serials($g);if(!gt_validate_data($g))throw new InvalidArgumentException('Die Reifenangaben sind ungültig. Es wurde nichts gespeichert.');
        gt_query('UPDATE {{garage}} SET data=?,version=version+1 WHERE id=1',[json_encode($g,JSON_THROW_ON_ERROR)]);$db->commit();gt_log('info','backend','Reifenpark-Aktion gespeichert.',['module'=>'bikes','operation'=>'tirepark.'.$body['action']]);gt_json(['ok'=>true,'id'=>$id,'version'=>(int)$row['version']+1]);
    }catch(InvalidArgumentException $e){if($db->inTransaction())$db->rollBack();gt_json(['error'=>$e->getMessage()],400);}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
