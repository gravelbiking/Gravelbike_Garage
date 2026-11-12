<?php
declare(strict_types=1);

function gt_guide_links(mixed $links, array $guides): bool {
    if (!is_array($links) || !array_is_list($links) || count($links) > 200) return false;
    $seen = [];
    foreach ($links as $id) {
        if (!is_string($id) || !isset($guides[$id]) || isset($seen[$id])) return false;
        $seen[$id] = true;
    }
    return true;
}

function gt_workshop_attachments(mixed $files): bool {
    if (!gt_invoices($files)) return false;
    return count(array_unique(array_column($files, 'fileId'))) === count($files);
}

function gt_catalog_document(mixed $doc, array &$ids): bool {
    if (!gt_workshop_attachments([$doc])
        || !gt_feature_text($doc['id'] ?? null, 200) || $doc['id'] === '' || isset($ids[$doc['id']])
        || !gt_feature_text($doc['title'] ?? null, 1000) || trim($doc['title']) === ''
        || !gt_feature_text($doc['category'] ?? null, 800) || trim($doc['category']) === ''
        || !gt_supply_date($doc['date'] ?? null)) return false;
    $ids[$doc['id']] = true;
    return true;
}

function gt_validate_workshop(array $data, array $bikes): bool {
    $guides = $data['guides'] ?? [];
    $unassigned = $data['unassignedDocuments'] ?? [];
    $types = $data['documentTypes'] ?? [];
    $orders = $data['orders'] ?? [];
    foreach ([$guides,$unassigned,$types,$orders] as $list) {
        if (!is_array($list) || !array_is_list($list)) return false;
    }
    $documentIds = array_fill_keys(array_column($data['documents'], 'id'), true);
    foreach ($unassigned as $document) if (!gt_catalog_document($document, $documentIds)) return false;
    $typeNames = [];
    foreach ($types as $type) {
        if (!gt_feature_text($type, 800) || trim($type) === '' || isset($typeNames[$type])) return false;
        $typeNames[$type] = true;
    }
    $guideIds = [];
    foreach ($guides as $guide) {
        if (!is_array($guide) || !gt_feature_text($guide['id'] ?? null, 200) || $guide['id'] === ''
            || isset($guideIds[$guide['id']]) || !gt_feature_text($guide['title'] ?? null, 800) || trim($guide['title']) === ''
            || !is_array($guide['documents'] ?? null) || !array_is_list($guide['documents'])
            || !gt_workshop_attachments($guide['attachments'] ?? [])) return false;
        $guideIds[$guide['id']] = true;
        foreach ($guide['documents'] as $document) if (!gt_catalog_document($document, $documentIds)) return false;
    }
    foreach ($data['bikes'] as $bike) if (!gt_workshop_attachments($bike['attachments'] ?? [])) return false;
    foreach ($data['plans'] as $plan) {
        if (!gt_guide_links($plan['guideIds'] ?? [], $guideIds) || !gt_workshop_attachments($plan['attachments'] ?? [])) return false;
    }
    foreach($data['plans'] as $plan){
        if(($plan['wizardVersion']??0)!==2)continue;
        if(!in_array($plan['source']??'', ['Herstellervorgabe','Leasingvertrag','Servicevertrag','Eigene Wartung'],true)||!in_array($plan['performer']??'',['self','workshop','custom'],true))return false;
        if(($plan['performer']??'')==='custom'&&(!gt_feature_text($plan['performerName']??null,800)||trim($plan['performerName'])===''))return false;
        $hasDate=!empty($plan['nextDate']);$hasKm=isset($plan['nextKm']);
        if($hasDate===$hasKm||!gt_supply_date($plan['nextDate']??'')||($hasKm&&!gt_supply_number($plan['nextKm'])))return false;
        foreach(['months','intervalKm'] as $field)if(isset($plan[$field])&&(!gt_supply_number($plan[$field])||$plan[$field]<=0))return false;
        if(isset($plan['months'])&&(!is_int($plan['months'])||$plan['months']>120))return false;
        if(($hasDate&&isset($plan['intervalKm']))||($hasKm&&isset($plan['months'])))return false;
    }
    $inventory = array_column($data['inventory'] ?? [], null, 'id');
    $units = ['Stück','Paar','Set','Liter','Milliliter','Meter','Zentimeter','Kilogramm','Gramm'];
    $orderIds = [];
    foreach ($orders as $order) {
        if (!is_array($order) || !gt_feature_text($order['id'] ?? null, 200) || $order['id'] === '' || isset($orderIds[$order['id']])) return false;
        foreach (['title'=>800,'description'=>40000,'bikeId'=>200,'externalBike'=>800] as $key=>$limit) {
            if (!gt_feature_text($order[$key] ?? null, $limit)) return false;
        }
        if (trim($order['title']) === '' || !in_array($order['type'] ?? '', ['service','repair'], true)) return false;
        if ($order['bikeId'] === '') {
            if (trim($order['externalBike']) === '') return false;
        } elseif (!isset($bikes[$order['bikeId']]) || $order['externalBike'] !== '') return false;
        if (!gt_guide_links($order['guideIds'] ?? [], $guideIds) || !gt_workshop_attachments($order['attachments'] ?? [])) return false;
        if (isset($order['replacementSnapshot'])) {
            $snapshot = $order['replacementSnapshot'];
            if (!is_array($snapshot) || !array_is_list($snapshot) || count($snapshot) > 500 || empty($order['completedAt'])) return false;
            foreach ($snapshot as $row) {
                if (!is_array($row) || !gt_feature_text($row['key'] ?? null, 400) || !is_array($row['component'] ?? null)) return false;
                foreach (['name','manufacturer','serial'] as $field) if (!gt_feature_text($row['component'][$field] ?? null, 800)) return false;
            }
        }
        if(isset($order['plannedDate'])&&!gt_supply_date($order['plannedDate']))return false;
        if(($order['wizardVersion']??0)===2&&empty($order['plannedDate']))return false;
        foreach(['planId','planOccurrence'] as $field)if(isset($order[$field])&&!gt_feature_text($order[$field],2000))return false;
        $orderIds[$order['id']] = true;
        foreach (['replacementKeys','componentCategories'] as $key) {
            if (isset($order[$key]) && (!is_array($order[$key]) || !array_is_list($order[$key]))) return false;
        }
        $steps = $order['steps'] ?? null;
        $parts = $order['parts'] ?? null;
        if (!is_array($steps) || !array_is_list($steps) || !is_array($parts) || !array_is_list($parts)) return false;
        $stepIds = [];
        foreach ($steps as $step) {
            if (!is_array($step) || !gt_feature_text($step['id'] ?? null, 200) || $step['id'] === '' || isset($stepIds[$step['id']])
                || !gt_feature_text($step['title'] ?? null, 800) || trim($step['title']) === ''
                || !is_bool($step['done'] ?? null) || !gt_guide_links($step['guideIds'] ?? [], $guideIds)) return false;
            if (isset($step['componentKey']) && !gt_feature_text($step['componentKey'], 400)) return false;
            if (isset($step['category']) && !in_array($step['category'], array_merge(['none'],gt_component_categories($data)), true)) return false;
            if (!empty($step['componentKey']) && !in_array($step['componentKey'], $order['replacementKeys'] ?? [], true)) return false;
            $stepIds[$step['id']] = true;
        }
        $partIds = [];
        foreach ($parts as $part) {
            if (!is_array($part) || !gt_feature_text($part['id'] ?? null, 200) || $part['id'] === '' || isset($partIds[$part['id']])
                || !gt_feature_text($part['name'] ?? null, 800) || trim($part['name']) === ''
                || !gt_feature_text($part['inventoryId'] ?? null, 200) || !in_array($part['unit'] ?? '', $units, true)
                || !gt_supply_number($part['quantity'] ?? null) || $part['quantity'] <= 0) return false;
            if (array_key_exists('available', $part) && !is_bool($part['available'])) return false;
            if ($part['inventoryId'] !== '' && ($inventory[$part['inventoryId']]['unit'] ?? null) !== $part['unit']) return false;
            if (isset($part['stepId']) && (!gt_feature_text($part['stepId'], 200) || ($part['stepId'] !== '' && !isset($stepIds[$part['stepId']])))) return false;
            if (isset($part['positionId']) && (!gt_feature_text($part['positionId'], 200)
                || ($part['positionId'] !== '' && !in_array($part['positionId'], array_column($inventory[$part['inventoryId']]['positions'] ?? [], 'id'), true)))) return false;
            if (isset($part['booking'])) {
                $booking = $part['booking'];
                if (!is_array($booking) || !gt_feature_text($booking['movementId'] ?? null, 200)
                    || !gt_feature_text($booking['location'] ?? null, 1200) || !gt_supply_date($booking['date'] ?? null)
                    || $booking['date'] === '') return false;
            }
            $partIds[$part['id']] = true;
        }
    }
    return true;
}

function gt_component_key(array $component,int $index): string {return $component['id']??'legacy:'.$index;}
function gt_component_frozen_mileage(array $component,array $bike,array $history,float $km): ?float {
    $baseline=$component['installedKm']??null;
    if ($baseline===null || $baseline==='') {
        $values=[];$date=$component['installedDate']??'';
        if ($date!=='') {
            $readings=$bike['readings']??[];
            foreach ($history as $h) if (($h['bikeId']??'')===$bike['id']) $readings[]=$h;
            if (($bike['kmDate']??'')===$date) $readings[]=['date'=>$date,'km'=>$bike['km']];
            foreach ($readings as $r) if (($r['date']??'')===$date && is_numeric($r['km']??null) && $r['km']>=0) $values[(string)(float)$r['km']]=(float)$r['km'];
        }
        $baseline=count($values)===1?array_values($values)[0]:null;
    }
    if ($baseline===null) return null;
    if (!is_numeric($baseline) || $baseline<0 || $baseline>$km) throw new RuntimeException('Ungültige Einbau-km.');
    return round(($km-(float)$baseline)*10)/10;
}
function gt_workshop_installations(array $before,array $after): bool {
    $oldOrders=array_column($before['orders']??[],null,'id');$bikes=array_column($after['bikes'],null,'id');
    $oldBikes=array_column($before['bikes'],null,'id');$stocks=array_column($after['inventory']??[],null,'id');
    foreach($after['orders']??[] as $o){
        $records=$o['installations']??[];
        if(!is_array($records)||!array_is_list($records)||count($records)>500)return false;
        $old=$oldOrders[$o['id']]??null;
        if(!empty($old['completedAt'])){if($records!==($old['installations']??[]))return false;continue;}
        if(!$records)continue;
        $b=$bikes[$o['bikeId']]??null;$original=$oldBikes[$o['bikeId']]??null;
        if(!$old||!$b||!$original||empty($o['completedAt'])||$old['bikeId']!==$o['bikeId'])return false;
        $parts=array_column($o['parts'],null,'id');$components=[];$seenParts=[];$seenKeys=[];
        foreach($original['components'] as $i=>$c)$components[gt_component_key($c,$i)]=$c;
        foreach($records as $record){
            if(!is_array($record)||!is_string($record['partId']??null)||!is_string($record['replacedKey']??null))return false;
            $part=$parts[$record['partId']]??null;$key=$record['replacedKey'];$oldComponent=$components[$key]??null;
            if(!$part||empty($part['booking'])||!$oldComponent||!in_array($key,$o['removedKeys']??[],true)||isset($seenParts[$part['id']])||isset($seenKeys[$key]))return false;
            $stock=$stocks[$part['inventoryId']]??null;$position=array_column($stock['positions']??[],null,'id')[$part['positionId']??'']??null;
            if(isset($position['tire']))return false;
            $component=['id'=>'installed:'.$o['id'].':'.$part['id'],'name'=>$oldComponent['name'],'category'=>gt_bio_category($oldComponent),'manufacturer'=>$stock['manufacturer']??'','model'=>$stock['name']??$part['name'],'serial'=>'',
                'originalPartNumber'=>$stock['articleNumber']??'','price'=>$position['unitPrice']??$stock['unitPrice']??null,'lastPurchasedAt'=>$position['supplier']??'','installedDate'=>$o['completedAt'],'installedKm'=>$o['completedKm'],
                'sourceOrderId'=>$o['id'],'sourceOrderPartId'=>$part['id'],'sourceInventoryId'=>$part['inventoryId']];
            if(($record['component']??null)!=$component)return false;
            $matches=array_values(array_filter($b['components'],fn($c)=>($c['id']??'')===$component['id']));
            if(count($matches)!==1||$matches[0]!=$component)return false;
            $seenParts[$part['id']]=true;$seenKeys[$key]=true;
        }
    }
    return true;
}

function gt_component_archive_transition(array $before,array $after): bool {
    require_once __DIR__.'/biography.php';
    $same=fn($a,$b)=>json_encode($a,JSON_THROW_ON_ERROR)===json_encode($b,JSON_THROW_ON_ERROR);
    if(!gt_workshop_installations($before,$after))return false;
    // Explicit maps preserve complete snapshots, including optional legacy fields.
    $oldBikes=array_column($before['bikes'],null,'id');$newBikes=array_column($after['bikes'],null,'id');
    $oldOrders=array_column($before['orders']??[],null,'id');$newOrders=array_column($after['orders']??[],null,'id');
    foreach ($oldOrders as $id=>$order) if ((!empty($order['completedAt']) || !empty($order['cancelledAt'])) && !$same($newOrders[$id]??null,$order)) return false;
    $expected=[];
    foreach ($newOrders as $id=>$o) {
        $categories=$o['componentCategories']??[];$keys=$o['replacementKeys']??[];$removed=$o['removedKeys']??[];
        foreach ([$categories,$keys,$removed] as $list) if (!is_array($list)||!array_is_list($list)||count($list)>500||count(array_unique($list,SORT_REGULAR))!==count($list)) return false;
        foreach ($categories as $c) if (!in_array($c,['Antrieb','Bremsen','Räder','Reifen','none'],true)) return false;
        foreach (array_merge($keys,$removed) as $key) if (!gt_feature_text($key,400)||$key==='') return false;
        if (empty($o['completedAt']) || !empty($oldOrders[$id]['completedAt'])) continue;
        $old=$oldOrders[$id]??null;
        if (!$old || $o['bikeId']!==$old['bikeId'] || $categories!=($old['componentCategories']??[]) || $keys!=($old['replacementKeys']??[])) return false;
        if (!gt_supply_date($o['completedAt'])||$o['completedAt']===''||$o['completedAt']>date('Y-m-d')) return false;
        $b=$oldBikes[$o['bikeId']]??null;
        if (!$b) {if ($removed||$o['completedKm']!==null) return false;continue;}
        $km=$o['completedKm']??null;
        if (!is_numeric($km)||!is_finite((float)$km)||$km<$b['km']) return false;
        $components=[];foreach ($b['components'] as $i=>$c) $components[gt_component_key($c,$i)]=$c;
        foreach ($removed as $key) {
            if (!in_array($key,$keys,true)||!isset($components[$key])) return false;
            $c=$components[$key];
            if ($categories && !in_array('none',$categories,true) && !in_array(gt_bio_category($c),$categories,true)) return false;
            try {$mileage=gt_component_frozen_mileage($c,$b,$before['history'],(float)$km);} catch (Throwable $e) {return false;}
            if(gt_bio_category($c)==='Reifen'){
                $choice=$o['tireReturns'][$key]??null;
                if(!is_array($choice)||!in_array($choice['mode']??'', ['stock','archive'],true))return false;
                if($choice['mode']==='stock')continue;
            }
            $expected[$b['id']][$id.':'.$key]=['id'=>$id.':'.$key,'orderId'=>$id,'componentKey'=>$key,'component'=>$c,'removedDate'=>$o['completedAt'],'removedKm'=>$km,'mileage'=>$mileage];
        }
        $remaining=array_values(array_filter($b['components'],fn($c,$i)=>!in_array(gt_component_key($c,$i),$removed,true),ARRAY_FILTER_USE_BOTH));
        $installedIds=array_column(array_column($o['installations']??[],'component'),'id');
        if (array_values(array_filter($newBikes[$b['id']]['components']??[],fn($c)=>!in_array($c['id']??'', $installedIds,true)&&(!isset($c['tireInstallMovementId'])||in_array($c['id']??'',array_column($b['components'],'id'),true))))!=$remaining || ($newBikes[$b['id']]['km']??null)!=$km) return false;
    }
    foreach ($oldBikes as $id=>$b) if (!empty($b['componentArchive'])&&!isset($newBikes[$id])) return false;
    foreach ($newBikes as $id=>$b) {
        $archives=$b['componentArchive']??[];if (!is_array($archives)||!array_is_list($archives)||count($archives)>5000) return false;
        $old=array_column($oldBikes[$id]['componentArchive']??[],null,'id');$seen=[];
        foreach ($archives as $entry) {
            if (!is_array($entry)||!is_string($entry['id']??null)||isset($seen[$entry['id']])) return false;
            $key=$entry['id'];$seen[$key]=true;
            if (isset($old[$key])) {if (!$same($old[$key],$entry)) return false;unset($old[$key]);}
            elseif (isset($expected[$id][$key])&&$same($expected[$id][$key],$entry)) unset($expected[$id][$key]);
            else return false;
        }
        if ($old||!empty($expected[$id])) return false;
    }
    return true;
}

function gt_workshop_categories(): array {
    return ['none','Antrieb','Bremsen','Räder','Reifen','Cockpit','Sattel','Licht','Zubehör'];
}

function gt_workshop_booking_transition(array $before, array $after): bool {
    $oldOrders = array_column($before['orders'] ?? [], null, 'id');
    $orders = array_column($after['orders'] ?? [], null, 'id');
    $oldStocks = array_column($before['inventory'] ?? [], null, 'id');
    $stocks = array_column($after['inventory'] ?? [], null, 'id');
    $newMovements = [];
    foreach ($stocks as $stockId => $stock) {
        $known = array_column($oldStocks[$stockId]['movements'] ?? [], null, 'id');
        foreach ($stock['movements'] ?? [] as $movement) {
            if (!isset($movement['orderId']) || isset($known[$movement['id']])) continue;
            $newMovements[$stockId][$movement['id']] = $movement;
        }
    }
    foreach ($oldOrders as $id => $old) {
        if (!isset($orders[$id]) && (!empty($old['workLog']) || !empty($old['pausedAt']))) return false;
    }
    $occurrences=[];$plans=array_column($after['plans'],null,'id');
    foreach($orders as $candidate){
        if(empty($candidate['planId'])||!empty($candidate['cancelledAt']))continue;
        $key=$candidate['planId'].':'.$candidate['planOccurrence'];
        if(isset($occurrences[$key]))return false;$occurrences[$key]=true;
        if(!isset($oldOrders[$candidate['id']])){
            $p=$plans[$candidate['planId']]??null;$occ=json_decode($candidate['planOccurrence'],true);
            if(!$p||$p['bikeId']!==$candidate['bikeId']||$occ!=[$p['id'],$p['nextDate']??'',$p['nextKm']??null])return false;
        }
    }
    foreach ($orders as $id => $order) {
        $old = $oldOrders[$id] ?? [];
        if($old)foreach(['planId','planOccurrence','planSnapshot'] as $field)if(($order[$field]??null)!==($old[$field]??null))return false;
        $log = $order['workLog'] ?? [];
        $oldLog = $old['workLog'] ?? [];
        if (!is_array($log) || !array_is_list($log) || count($log) > count($oldLog)+1
            || array_slice($log, 0, count($oldLog)) !== $oldLog) return false;
        $hasEvent = count($log) > count($oldLog);
        $event = $hasEvent ? $log[count($oldLog)] : null;
        $oldParts = array_column($old['parts'] ?? [], null, 'id');
        $parts = array_column($order['parts'], null, 'id');
        foreach ($oldParts as $partId => $part) {
            if (isset($part['booking']) && ($parts[$partId] ?? null) !== $part) return false;
        }
        if (!$hasEvent) {
            foreach ($parts as $partId => $part) {
                if (isset($part['booking']) && !isset($oldParts[$partId]['booking'])) return false;
            }
            if (($order['pausedAt'] ?? null) !== ($old['pausedAt'] ?? null)
                || ($order['cancelledAt'] ?? null) !== ($old['cancelledAt'] ?? null)) return false;
            if (!empty($order['completedAt']) && empty($old['completedAt'])
                && array_filter($oldParts, fn($part) => !empty($part['available']) && !isset($part['booking']))) return false;
            continue;
        }
        if (!$old || !empty($old['completedAt']) || !empty($old['cancelledAt']) || !is_array($event)) return false;
        $action = $event['action'] ?? '';
        $date = $event['date'] ?? null;
        if (!in_array($action, ['complete','pause','cancel','resume'], true)
            || !gt_supply_date($date) || $date === '' || $date > date('Y-m-d')
            || !gt_feature_text($event['comment'] ?? null, 4000)) return false;
        if (($action === 'resume' && empty($old['pausedAt'])) || ($action === 'pause' && !empty($old['pausedAt']))) return false;
        foreach (['pausedAt'=>'pause','cancelledAt'=>'cancel','completedAt'=>'complete'] as $field => $expected) {
            if (($order[$field] ?? null) !== ($action === $expected ? $date : null)) return false;
        }
        foreach (['title','bikeId','externalBike','steps','type','replacementKeys'] as $field) {
            if (($order[$field] ?? null) !== ($old[$field] ?? null)) return false;
        }
        if (array_keys($parts) !== array_keys($oldParts)) return false;
        $used = $event['used'] ?? null;
        $returned = $event['returned'] ?? null;
        if (!is_array($used) || !array_is_list($used) || !is_array($returned) || !array_is_list($returned)) return false;
        $selected = array_merge($used, $returned);
        foreach ($selected as $partId) if (!is_string($partId)) return false;
        $available = array_column(array_filter($oldParts, fn($part) => !empty($part['available']) && !isset($part['booking'])), 'id');
        sort($selected);
        sort($available);
        if ($selected !== ($action === 'resume' ? [] : $available) || ($action === 'complete' && $returned)) return false;
        foreach ($oldParts as $partId => $original) {
            $partId = $original['id'];
            $part = $parts[$partId];
            if (in_array($partId, $returned, true)) {
                $original['available'] = false;
            } elseif (in_array($partId, $used, true)) {
                $booking = $part['booking'] ?? null;
                if (!$booking || $booking['date'] !== $date) return false;
                $stockId = $original['inventoryId'];
                if ($stockId !== '') {
                    $stock = $stocks[$stockId];
                    $positionId = $original['positionId'] ?? '';
                    if ($positionId === '' && count($stock['positions'] ?? []) === 1) $positionId = $stock['positions'][0]['id'];
                    $position = array_column($stock['positions'] ?? [], null, 'id')[$positionId] ?? null;
                    $movement = $newMovements[$stockId][$booking['movementId']] ?? null;
                    if (!$position || !$movement || $booking['location'] !== $position['location']
                        || $movement['orderId'] !== $order['id'] || $movement['orderPartId'] !== $partId
                        || (isset($movement['stepId'])&&$movement['stepId']!==($original['stepId']??''))
                        || $movement['positionId'] !== $positionId || $movement['date'] !== $date
                        || $movement['bikeId'] !== $old['bikeId'] || $movement['serviceTitle'] !== $old['title']
                        || (int)round(-$movement['change']*1000) !== (int)round($original['quantity']*1000)) return false;
                    unset($newMovements[$stockId][$booking['movementId']]);
                    $original['positionId'] = $positionId;
                } elseif ($booking['movementId'] !== '' || $booking['location'] !== '') return false;
                $original['booking'] = $booking;
            }
            if ($part != $original) return false;
        }
    }
    foreach ($newMovements as $movements) if ($movements) return false;
    return true;
}

function gt_tire_base(array $component): array {
    unset($component['tireHistory'],$component['tireId'],$component['priorMileage'],$component['tireInstallMovementId']);
    return $component;
}
function gt_tire_transition(array $before,array $after): bool {
    require_once __DIR__.'/biography.php';
    $oldBikes=array_column($before['bikes'],null,'id');$bikes=array_column($after['bikes'],null,'id');
    $oldStocks=array_column($before['inventory']??[],null,'id');$orders=array_column($after['orders']??[],null,'id');
    $active=[];$installs=[];$returns=[];
    foreach($after['bikes'] as $b){
        foreach($b['components'] as $c){
            if(!isset($c['tireId']))continue;
            if(!gt_feature_text($c['tireId'],200)||$c['tireId']===''||isset($active[$c['tireId']])||gt_bio_category($c)!=='Reifen')return false;
            $active[$c['tireId']]=true;
            $old=array_column($oldBikes[$b['id']]['components']??[],null,'id')[$c['id']]??null;
            if($old&&isset($old['tireId'])){
                if($c['tireId']!==$old['tireId']||($c['tireHistory']??[])!==($old['tireHistory']??[])||($c['tireInstallMovementId']??'')!==($old['tireInstallMovementId']??''))return false;
            }else{
                $movement=$c['tireInstallMovementId']??'';
                if(!is_string($movement)||$movement===''||isset($installs[$movement]))return false;
                $installs[$movement]=[$b,$c];
            }
        }
    }
    foreach($after['inventory']??[] as $stock){
        $known=array_column($oldStocks[$stock['id']]['positions']??[],null,'id');
        $oldMoves=array_column($oldStocks[$stock['id']]['movements']??[],null,'id');
        foreach($stock['positions']??[] as $p){
            if(!isset($p['tire']))continue;
            $t=$p['tire'];if(!is_array($t)||!gt_feature_text($t['id']??null,200)||!is_array($t['component']??null)||!is_array($t['history']??null)||!array_is_list($t['history'])||$stock['unit']!=='Stück'||$stock['category']!=='Reifen'||!in_array($p['quantity'],[0,1],false))return false;
            if($p['quantity']>0){if(isset($active[$t['id']]))return false;$active[$t['id']]=true;}
            if(isset($known[$p['id']])){
                if(($known[$p['id']]['tire']??null)!==$t)return false;
                if($p['quantity']!=$known[$p['id']]['quantity']){
                    if($known[$p['id']]['quantity']!=1||$p['quantity']!=0)return false;
                    $debits=array_filter($stock['movements'],fn($m)=>!isset($oldMoves[$m['id']])&&$m['positionId']===$p['id']&&isset($m['tireInstallId'])&&$m['change']==-1);
                    if(count($debits)!==1)return false;
                }
            }
            else $returns[$stock['id'].':'.$p['id']]=[$stock,$p];
        }
        foreach($stock['movements']??[] as $m){
            if(isset($oldMoves[$m['id']]))continue;
            if(isset($m['tireReturnOrderId'])){
                $key=$stock['id'].':'.$m['positionId'];$entry=$returns[$key]??null;if(!$entry)return false;
                [, $p]=$entry;$o=$orders[$m['tireReturnOrderId']]??null;$b=$oldBikes[$m['bikeId']]??null;
                if(!$o||!$b||empty($o['completedAt'])||$m['type']!=='receipt'||$m['change']!=1||$m['before']!=0||$o['bikeId']!==$b['id'])return false;
                $component=null;foreach($b['components'] as $i=>$c)if(gt_component_key($c,$i)===($m['componentKey']??''))$component=$c;
                if(!$component||gt_bio_category($component)!=='Reifen'||!in_array($m['componentKey'],$o['removedKeys']??[],true))return false;
                $choice=$o['tireReturns'][$m['componentKey']]??[];
                if($choice!==['mode'=>'stock','inventoryId'=>$stock['id'],'positionId'=>$p['id']])return false;
                $history=$component['tireHistory']??[];
                $history[]=['bikeId'=>$b['id'],'bikeName'=>$b['name'],'installedDate'=>$component['installedDate']??'','installedKm'=>$component['installedKm']??null,'removedDate'=>$o['completedAt'],'removedKm'=>$o['completedKm'],'mileage'=>gt_component_frozen_mileage($component,$b,$before['history'],(float)$o['completedKm'])];
                if($p['tire']['component']!==gt_tire_base($component)||$p['tire']['history']!=$history||(($component['tireId']??$p['tire']['id'])!==$p['tire']['id'])||trim($p['location'])==='')return false;
                unset($returns[$key]);
            }
            if(isset($m['tireInstallId'])){
                [$b,$c]=$installs[$m['id']]??[null,null];$p=$known[$m['positionId']]??null;
                if(!$b||count(array_filter($b['components'],fn($part)=>$part['name']===($c['name']??'')))!==1||$m['date']>date('Y-m-d')||!isset($p['tire'])||$p['quantity']!=1||$m['type']!=='withdrawal'||$m['change']!=-1||$m['bikeId']!==$b['id']||$m['tireInstallId']!==$c['id']||$c['tireId']!==$p['tire']['id']||$c['tireHistory']!==$p['tire']['history']||$c['installedDate']!==$m['date']||$c['installedKm']!=$b['km']||!in_array($c['name'],['Vorderreifen','Hinterreifen'],true))return false;
                foreach($p['tire']['component'] as $field=>$value)if(!in_array($field,['id','name','category','installedDate','installedKm'],true)&&($c[$field]??null)!==$value)return false;
                unset($installs[$m['id']]);
            }
        }
    }
    // A mounted tire is removed only through an explicitly completed workshop job.
    foreach($before['bikes'] as $b){
        if(!isset($bikes[$b['id']]))continue;
        foreach($b['components'] as $i=>$c){
            if(gt_bio_category($c)!=='Reifen')continue;
            $key=gt_component_key($c,$i);
            $still=array_filter($bikes[$b['id']]['components'],fn($n)=>isset($c['id'])?($n['id']??'')===$c['id']:$n['name']===$c['name']);
            if($still)continue;
            $removed=array_filter($orders,fn($o)=>$o['bikeId']===$b['id']&&!empty($o['completedAt'])&&isset($o['tireReturns'][$key])&&in_array($key,$o['removedKeys']??[],true));
            if(!$removed)return false;
        }
    }
    return !$returns&&!$installs;
}
