<?php
declare(strict_types=1);

function gt_feature_text(mixed $v, int $max = 2000): bool { return is_string($v) && strlen($v) <= $max; }
function gt_feature_price(mixed $v): bool { return $v === null || gt_supply_number($v); }
function gt_feature_url(mixed $v): bool {
    return is_string($v) && strlen($v) <= 8000 && ($v === '' || (filter_var($v, FILTER_VALIDATE_URL) && in_array(strtolower(parse_url($v, PHP_URL_SCHEME) ?? ''), ['http','https'], true) && parse_url($v, PHP_URL_USER) === null && parse_url($v, PHP_URL_PASS) === null));
}
function gt_validate_features(array $data): bool {
    $preferences = $data['preferences'] ?? [];
    if (!is_array($preferences)
        || (isset($preferences['theme']) && !in_array($preferences['theme'], ['wald','meer','stein'], true))
        || (isset($preferences['notifications']) && !is_bool($preferences['notifications']))) return false;
    $tools = $data['tools'] ?? []; $computers = $data['computers'] ?? [];
    if (!is_array($tools) || !array_is_list($tools) || !is_array($computers) || !array_is_list($computers)) return false;
    if (isset($data['bikeTypes'])) {
        if (!is_array($data['bikeTypes'])||!array_is_list($data['bikeTypes'])||count($data['bikeTypes'])>1000) return false;
        $types=[];foreach($data['bikeTypes'] as $type){if(!gt_feature_text($type,800)||trim($type)==='')return false;$key=strtolower(strtr(trim($type),['Ä'=>'ä','Ö'=>'ö','Ü'=>'ü']));if(isset($types[$key]))return false;$types[$key]=true;}
    }
    $ids = [];
    foreach ($tools as $t) {
        if (!is_array($t) || !gt_feature_text($t['id'] ?? null, 200) || $t['id'] === '' || isset($ids[$t['id']])) return false;
        foreach (['name','manufacturer','model','articleNumber','dimensions','compatibility','notes'] as $k) if (!gt_feature_text($t[$k] ?? null)) return false;
        if (trim($t['name']) === '') return false;
        $ids[$t['id']] = true;
    }
    $computerIds = [];
    foreach ($computers as $c) {
        if (!is_array($c) || !gt_feature_text($c['id'] ?? null, 200) || $c['id'] === '' || isset($computerIds[$c['id']])) return false;
        foreach (['manufacturer','model','software'] as $k) if (!gt_feature_text($c[$k] ?? null, 800)) return false;
        if (trim($c['manufacturer']) === '' || trim($c['model']) === '' || !gt_supply_date($c['purchaseDate'] ?? null) || !gt_feature_price($c['price'] ?? null)) return false;
        foreach (['serial'=>100,'infos'=>400] as $key=>$limit) if (isset($c[$key])&&!gt_feature_text($c[$key],$limit)) return false;
        $computerIds[$c['id']] = true;
    }
    foreach ($data['bikes'] as $b) {
        if (isset($b['archived']) && !is_bool($b['archived'])) return false;
        foreach (['frameColor','frameMaterial'] as $k) if (isset($b[$k]) && !gt_feature_text($b[$k], 800)) return false;
        if (isset($b['modelYear']) && (!is_int($b['modelYear']) || $b['modelYear'] < 1900 || $b['modelYear'] > 2100)) return false;
        if (isset($b['weightKg']) && (!gt_supply_number($b['weightKg']) || $b['weightKg'] <= 0 || $b['weightKg'] > 1000)) return false;
        if (isset($b['leasing'])) {
            $l = $b['leasing']; if (!is_array($l)) return false;
            foreach (['monthly','buyout'] as $k) if (!gt_feature_price($l[$k] ?? null)) return false;
            foreach (['insurance','insuranceNumber','documentId'] as $k) if (!gt_feature_text($l[$k] ?? null)) return false;
            if (!gt_feature_url($l['insuranceUrl'] ?? null) || !is_bool($l['purchased'] ?? null)) return false;
            if ($l['documentId'] !== '') foreach ($data['documents'] as $d) if ($d['id'] === $l['documentId'] && $d['bikeId'] !== $b['id']) return false;
        }
        foreach ($b['components'] as $c) {
            if(isset($c['tireHistory'])&&(!isset($c['tireId'])||!is_array($c['tireHistory'])||!array_is_list($c['tireHistory'])||count($c['tireHistory'])>1000))return false;
            if(isset($c['tireId'])&&(!gt_feature_text($c['tireId'],200)||$c['tireId']===''))return false;
            if (isset($c['tireWidth']) && (!gt_supply_number($c['tireWidth']) || $c['tireWidth'] <= 0 || $c['tireWidth'] > 1000)) return false;
            if (isset($c['tireUnit']) && !in_array($c['tireUnit'], ['mm','Zoll'], true)) return false;
            if (isset($c['toolIds'])) {
                if (!is_array($c['toolIds']) || !array_is_list($c['toolIds']) || count($c['toolIds']) !== count(array_unique($c['toolIds'], SORT_REGULAR))) return false;
                foreach ($c['toolIds'] as $id) if (!is_string($id) || !isset($ids[$id])) return false;
            }
        }
    }
    foreach ($data['contacts'] ?? [] as $c) {
        if (isset($c['roles'])) {
            if (!is_array($c['roles']) || !array_is_list($c['roles']) || count($c['roles']) < 1 || count($c['roles']) > 3 || count($c['roles']) !== count(array_unique($c['roles'], SORT_REGULAR))) return false;
            foreach ($c['roles'] as $role) if (!in_array($role, ['Händler','Werkstatt','Lieferant'], true)) return false;
        }
        foreach (['appointmentUrl','accountUrl'] as $k) if (isset($c[$k]) && !gt_feature_url($c[$k])) return false;
    }
    $contacts = array_column($data['contacts'] ?? [], null, 'id');
    foreach ($data['inventory'] ?? [] as $s) {
        if (!gt_invoices($s['datasheets']??[])) return false;
        if (isset($s['ean']) && !gt_feature_text($s['ean'], 160)) return false;
        if (isset($s['productUrl']) && (!gt_feature_url($s['productUrl']) || ($s['productUrl'] !== '' && !in_array(parse_url($s['productUrl'], PHP_URL_HOST), ['bike24.de','www.bike24.de'], true)))) return false;
        if (!array_key_exists('positions', $s)) continue; // Old backups are migrated by the client on first save.
        if (!is_array($s['positions']) || !array_is_list($s['positions']) || !is_array($s['movements'] ?? null) || !array_is_list($s['movements'])) return false;
        $positions = []; $balances = []; $movementIds = []; $total = 0;
        foreach ($s['positions'] as $p) {
            if (!is_array($p) || !gt_feature_text($p['id'] ?? null, 200) || $p['id'] === '' || isset($positions[$p['id']])) return false;
            foreach (['label'=>800,'location'=>1200,'supplierId'=>200,'supplier'=>1200,'notes'=>40000] as $k=>$limit) if (!gt_feature_text($p[$k] ?? null, $limit)) return false;
            if (trim($p['label']) === '' || !gt_supply_number($p['quantity'] ?? null) || !gt_feature_price($p['unitPrice'] ?? null) || !gt_supply_date($p['purchaseDate'] ?? null) || !gt_invoices($p['invoices'] ?? [])) return false;
            if (!in_array($p['packageType'] ?? '', ['Einzelbestand','Kiste','Packung','Flasche','Rolle','Sonstiges'], true) || !gt_supply_number($p['packageSize'] ?? null) || $p['packageSize'] <= 0) return false;
            if ($p['supplierId'] !== '' && !isset($contacts[$p['supplierId']])) return false;
            $positions[$p['id']] = $p; $balances[$p['id']] = 0; $total += (int) round($p['quantity'] * 1000);
        }
        if ($total !== (int) round($s['quantity'] * 1000)) return false;
        foreach ($s['movements'] as $m) {
            if (!is_array($m) || !gt_feature_text($m['id'] ?? null, 200) || $m['id'] === '' || isset($movementIds[$m['id']])) return false;
            foreach (['positionId'=>200,'historyId'=>200,'serviceTitle'=>2000,'bikeId'=>200,'bikeName'=>2000,'shoppingId'=>200,'reason'=>4000] as $k=>$limit) if (!gt_feature_text($m[$k] ?? null, $limit)) return false;
            if (isset($m['orderId']) || isset($m['orderPartId'])) {
                if ($m['type'] !== 'withdrawal' || !gt_feature_text($m['orderId'] ?? null, 200) || $m['orderId'] === ''
                    || !gt_feature_text($m['orderPartId'] ?? null, 200) || $m['orderPartId'] === '') return false;
            }
            if (!isset($positions[$m['positionId']]) || !in_array($m['type'] ?? '', ['opening','receipt','withdrawal','adjustment'], true)) return false;
            if (!gt_supply_number($m['before'] ?? null) || !gt_supply_number($m['after'] ?? null) || !gt_feature_price($m['unitPrice'] ?? null)) return false;
            if ((!is_int($m['change'] ?? null) && !is_float($m['change'] ?? null)) || !gt_supply_number(abs($m['change']))) return false;
            if (!gt_feature_text($m['at'] ?? null, 40) || !preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/D', $m['at']) || !gt_supply_date(substr($m['at'],0,10)) || !gt_supply_date($m['date'] ?? null) || $m['date'] === '') return false;
            if ((int) round($m['before'] * 1000) !== $balances[$m['positionId']] || (int) round(($m['before'] + $m['change']) * 1000) !== (int) round($m['after'] * 1000)) return false;
            if (($m['type'] === 'withdrawal' && $m['change'] >= 0) || (in_array($m['type'],['opening','receipt'],true) && $m['change'] < 0) || ($m['type'] === 'adjustment' && ($m['change'] == 0 || trim($m['reason']) === ''))) return false;
            $balances[$m['positionId']] = (int) round($m['after'] * 1000); $movementIds[$m['id']] = true;
        }
        foreach ($positions as $id=>$p) if ($balances[$id] !== (int) round($p['quantity'] * 1000)) return false;
    }
    return true;
}

// Once a journal exists, later saves may only append movements. Version-CAS in
// the caller prevents stale clients from racing this transition check.
function gt_inventory_transition(array $old, array $new): bool {
    $stocks = array_column($new['inventory'] ?? [], null, 'id');
    $history = array_column($new['history'], null, 'id');
    foreach ($old['inventory'] ?? [] as $s) {
        $n = $stocks[$s['id']] ?? null;
        if (isset($s['positions'])) {
            if (!$n) { if ($s['positions'] || $s['movements']) return false; else continue; }
            if (!isset($n['positions']) || (($s['positions'] || $s['movements']) && $n['unit'] !== $s['unit']) || array_slice($n['movements'],0,count($s['movements'])) != $s['movements']) return false;
            $positions = array_column($n['positions'], null, 'id');
            foreach ($s['positions'] as $p) if (!isset($positions[$p['id']]) || $positions[$p['id']]['packageSize'] != $p['packageSize']) return false;
        } elseif ($n && isset($n['positions'])) {
            $opening = array_sum(array_map(fn($m)=>$m['type']==='opening'?$m['change']:0, $n['movements']));
            if ((int) round($opening*1000) !== (int) round($s['quantity']*1000) || $s['unit'] !== $n['unit']) return false;
        }
    }
    $oldStocks = array_column($old['inventory'] ?? [], null, 'id');
    foreach ($stocks as $id=>$s) {
        $known = array_column($oldStocks[$id]['movements'] ?? [], null, 'id');
        foreach ($s['movements'] ?? [] as $m) {
            if (isset($known[$m['id']]) || $m['type'] !== 'withdrawal' || isset($m['orderId']) || isset($m['tireInstallId'])) continue;
            $h = $history[$m['historyId']] ?? null;
            if (!$h || $h['bikeId'] !== $m['bikeId'] || $h['title'] !== $m['serviceTitle'] || ($h['date'] ?? '') !== $m['date']) return false;
            $matches = array_filter($h['materials'] ?? [], fn($v)=>($v['movementId'] ?? '')===$m['id'] && $v['inventoryId']===$id && ($v['positionId'] ?? '')===$m['positionId'] && (int)round($v['quantity']*1000)===(int)round(-$m['change']*1000));
            if (count($matches) !== 1) return false;
        }
    }
    return true;
}

function gt_computer_transition(array $before,array $after): bool {
    $old=array_column($before['computers']??[],null,'id');
    foreach($after['computers']??[] as $computer){
        foreach(['manufacturer'=>25,'model'=>25,'serial'=>25,'software'=>25,'infos'=>100] as $key=>$limit){
            $value=$computer[$key]??'';
            if(!is_string($value))return false;
            if($value===($old[$computer['id']][$key]??null))continue;
            if(preg_match_all('/./us',$value)>$limit)return false;
        }
    }
    return true;
}
