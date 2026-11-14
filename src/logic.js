// UI precision is independent of the meter-precise import journal.
export function kmInputValue(value) {
 if(value===null||value===undefined||value==='')return value;
 const n=Number(value);return Number.isFinite(n)?Math.round((n+Number.EPSILON*Math.max(1,Math.abs(n)))*10)/10:value;
}
export function kmFromInput(value,original) {
 const n=Number(value);
 // Opening/saving a rounded field must not silently correct the precise odometer.
 if(original!==null&&original!==undefined&&original!==''&&Number.isFinite(Number(original))&&n===kmInputValue(original))return Number(original);
 return kmInputValue(n);
}

export function due(plan,bike,today=new Date().toISOString().slice(0,10)) {
 const days=plan.nextDate?Math.ceil((Date.parse(plan.nextDate+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000):null;
 const km=plan.nextKm!==null&&plan.nextKm!==''&&plan.nextKm!==undefined?Number(plan.nextKm)-Number(bike?.km||0):null;
 return {days,km,status:(days!==null&&days<=0)||(km!==null&&km<=0)?'overdue':(days!==null&&days<=30)||(km!==null&&km<=200)?'soon':'ok'};
}
export function addMonths(date,months) {
 const [y,m,d]=date.split('-').map(Number), first=new Date(Date.UTC(y,m-1+Number(months),1));
 const max=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 first.setUTCDate(Math.min(d,max));return first.toISOString().slice(0,10);
}
export function completePlan(plan,date,km) {
 return {...plan,nextDate:plan.months?addMonths(date,plan.months):'',nextKm:plan.intervalKm?Number(km)+Number(plan.intervalKm):null};
}

export function componentCategories() {
 return {
  Antrieb:['Schaltwerk','Umwerfer','Kassette','Kurbel','Zahnkranz','Innenlager','Kette'],
  Bremsen:['Schalt-/Bremshebel','Bremsscheibe','Bremsklotz','Bremsbelag','Bremskolben'],
  Räder:['Vorderrad','Hinterrad'],
  Reifen:['Vorderreifen','Hinterreifen'],
  Cockpit:['Vorbau','Lenker'],
  Sattel:['Sattel','Sattelstütze'],
  Licht:['Vorderlicht','Rücklicht'],
  Zubehör:['Pedale','Schutzblech','Gepäckträger','Flaschenhalter','Sonstiges'],
  ...Object.fromEntries((typeof data!=='undefined'?(data.customComponentCategories||[]):[]).map(name=>[name,[]])),
 };
}

export function hasPurchaseFields(component) {
 return /^(bremsscheibe|bremsklotz|bremsklötze|bremsbelag|bremsbeläge|kette|kassette|kurbel|zahnkranz|innenlager)(?=$|[\s/\-])/u.test(String(component.name||'').trim().toLocaleLowerCase('de-DE'));
}

export function knownComponentCategory(name) {
 const value=String(name||'').trim().toLocaleLowerCase('de-DE');
 return Object.entries(componentCategories()).find(([,names])=>names.some(type=>type.toLocaleLowerCase('de-DE')===value))?.[0]||null;
}

export function upsertComponent(components,component,legacyIndex='') {
 let index=components.findIndex(c=>c.id===component.id);
 if(index<0&&legacyIndex!==''&&Number.isInteger(Number(legacyIndex))&&Number(legacyIndex)>=0&&!components[Number(legacyIndex)]?.id&&components[Number(legacyIndex)])index=Number(legacyIndex);
 return index<0?[...components,{...component}]:components.map((c,i)=>i===index?{...c,...component}:c);
}

export function componentCategory(component) {
 const categories=componentCategories();
 if(Object.hasOwn(categories,component.category))return component.category;
 const normalize=value=>String(value||'').toLocaleLowerCase('de-DE').replace(/[\s\-/]/g,'');
 const name=normalize(component.name);
 for(const [category,names] of Object.entries(categories))if(names.some(n=>normalize(n)===name))return category;
 if(['bremsbeläge','bremsbelagvorne','bremsbelaghinten','bremshebel','schalthebel','bremsscheibevorne','bremsscheibehinten'].includes(name))return 'Bremsen';
 if(['laufrad','felge','nabe','speiche','reifen','schlauch'].includes(name))return 'Räder';
 if(['lenkerband','griffe','steuersatz'].includes(name))return 'Cockpit';
 if(['scheinwerfer','dynamo'].includes(name))return 'Licht';
 return 'Zubehör';
}

export function wheelFields() {
 return [
  {key:'axleDimension',label:'Achsdimension',type:'text',placeholder:'z. B. 12 × 100 mm'},
  {key:'brakeMount',label:'Bremsaufnahme',type:'text',placeholder:'z. B. Center Lock oder 6-Loch'},
  {key:'rimHeight',label:'Felgenhöhe (mm)',type:'number'},
  {key:'internalWidth',label:'Innenmaulweite (mm)',type:'number'},
  {key:'rimMaterial',label:'Felgenmaterial',type:'text',placeholder:'z. B. Carbon oder Aluminium'},
  {key:'bearingServiceDate',label:'Lagerservicedatum',type:'date'},
 ];
}

export function validISODate(value) {
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}

export function installationKm(bike,date,history=[]) {
 if(!validISODate(date))return null;
 const candidates=[...(bike.readings||[]),...history.filter(h=>h.bikeId===bike.id)];
 if(bike.kmDate===date)candidates.push({date,km:bike.km});
 const values=[...new Set(candidates.filter(r=>r.date===date&&typeof r.km==='number'&&Number.isFinite(r.km)&&r.km>=0).map(r=>r.km))];
 // Different readings on the same day cannot identify the installation mileage.
 return values.length===1?values[0]:null;
}

export function componentMileage(component,bike,history=[]) {
 const explicit=component.installedKm!==null&&component.installedKm!==undefined&&component.installedKm!=='';
 const baseline=explicit?component.installedKm:installationKm(bike,component.installedDate,history);
 if(typeof baseline!=='number'||!Number.isFinite(baseline)||baseline<0)return {km:null,baseline:null,source:null,reason:'missing'};
 if(!Number.isFinite(bike.km)||bike.km<baseline)return {km:null,baseline,source:explicit?'manual':'reading',reason:'odometer'};
 return {km:Math.round((bike.km-baseline)*10)/10,baseline,source:explicit?'manual':'reading',reason:null};
}

// Quantities use up to three decimal places (pieces, litres, metres, etc.).
export function quantity(value) {
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>100000000||Math.abs(n*1000-Math.round(n*1000))>0.00001)throw Error('Mengen müssen Zahlen ab 0 mit höchstens drei Nachkommastellen sein.');
 return Math.round(n*1000)/1000;
}
export function purchaseNeeds(garage) {
 const shopping=garage.shopping||[],stock=garage.inventory||[];
 return [
  ...stock.filter(s=>s.quantity<=s.minStock&&!shopping.some(p=>p.inventoryId===s.id&&p.source!=='stock'&&!p.receivedAt&&p.usedQuantity<p.quantity)).map(s=>({key:'stock-'+s.id,inventoryId:s.id,name:s.name,manufacturer:s.manufacturer,articleNumber:s.articleNumber,reason:'Mindestbestand erreicht',quantity:quantity(Math.max(1,s.minStock-s.quantity+1)),unit:s.unit})),
  ...shopping.filter(p=>p.source!=='stock'&&p.status==='needed'&&p.usedQuantity<p.quantity).map(p=>({...p,key:'shopping-'+p.id,shoppingId:p.id,reason:p.planId?'Für Service einkaufen':'Auf der Einkaufsliste'})),
 ];
}
export function consumeSupplies(garage,requests,service={}) {
 const inventory=(garage.inventory||[]).map(normalizeStock),shopping=structuredClone(garage.shopping||[]),materials=[],seen=new Set();
 for(const request of requests){
  const key=(request.shoppingId?'shopping:'+request.shoppingId:'stock:'+request.inventoryId)+':'+(request.positionId||'');
  if(seen.has(key))throw Error('Ein Material wurde mehrfach ausgewählt.');seen.add(key);
  const amount=quantity(request.quantity);if(!amount)throw Error('Bitte eine Verbrauchsmenge größer als 0 angeben.');
  const purchase=request.shoppingId?shopping.find(p=>p.id===request.shoppingId):null;
  if(request.shoppingId&&!purchase)throw Error('Der Einkaufsartikel wurde nicht gefunden.');
  const stockId=purchase?(purchase.source==='stock'||purchase.receivedAt?purchase.inventoryId:null):request.inventoryId;
  const stock=stockId?inventory.find(s=>s.id===stockId):null;
  if(stockId&&!stock)throw Error('Der Lagerartikel wurde nicht gefunden.');
  if(purchase){
   if(purchase.source!=='stock'&&purchase.status!=='purchased')throw Error(purchase.name+' wurde noch nicht gekauft.');
   if(amount>quantity(purchase.quantity-purchase.usedQuantity))throw Error('Die Verbrauchsmenge für '+purchase.name+' übersteigt die verfügbare Einkaufsmenge.');
   purchase.usedQuantity=quantity(purchase.usedQuantity+amount);
  }
  let position=null,movement=null;
  if(stock){
   const positionId=request.positionId||purchase?.receivedPositionId;
   position=positionId?stock.positions.find(p=>p.id===positionId):stock.positions.find(p=>p.quantity>=amount);
   if(!position||amount>position.quantity)throw Error('Nicht genug Bestand in der ausgewählten Lagerposition für '+stock.name+'.');
   if(purchase?.receivedPositionId&&purchase.receivedPositionId!==position.id)throw Error('Bitte die Lagerposition dieses Einkaufs verwenden.');
   movement=stockMovement(stock,position,-amount,'withdrawal',{...service,shoppingId:purchase?.id||''});
  }
  if(!purchase&&!stock)throw Error('Bitte einen Lagerartikel auswählen.');
  const item=purchase||stock;
  materials.push({shoppingId:purchase?.id||'',inventoryId:stock?.id||'',positionId:position?.id||'',positionLabel:position?.label||'',movementId:movement?.id||'',name:item.name,articleNumber:item.articleNumber||'',quantity:amount,unit:item.unit,unitPrice:(position?position.unitPrice:item.unitPrice)??0});
 }
 return {inventory,shopping,materials};
}
export function receivePurchase(garage,id,inventoryId,date) {
 const inventory=(garage.inventory||[]).map(normalizeStock),shopping=structuredClone(garage.shopping||[]),p=shopping.find(p=>p.id===id),s=inventory.find(s=>s.id===inventoryId);
 if(!p||!s||p.source==='stock'||p.status!=='purchased'||p.receivedAt)throw Error('Dieser Einkauf kann nicht eingelagert werden.');
 if(p.unit!==s.unit)throw Error('Die Einheit von Einkauf und Lagerartikel muss übereinstimmen.');
 const remaining=quantity(p.quantity-p.usedQuantity);if(!remaining)throw Error('Dieser Einkauf wurde bereits vollständig verbraucht.');
 const position=addStockPosition(s,{label:'Einkauf '+date,quantity:remaining,unitPrice:p.unitPrice??null,purchaseDate:p.purchaseDate||date,location:s.location||'',supplierId:'',supplier:p.dealer||'',packageType:'Einzelbestand',packageSize:1,invoices:structuredClone(p.invoices||[]),notes:p.notes||''},{date,shoppingId:p.id});
 p.inventoryId=s.id;p.receivedAt=date;p.receivedPositionId=position.id;
 return {inventory,shopping};
}

export function contactRoles(c) {return Array.isArray(c.roles)?c.roles:[c.type||'Werkstatt'];}
export function normalizeStock(item) {
 const s=structuredClone(item);
 if(!Array.isArray(s.positions)){
  const position={id:'legacy-'+s.id,label:'Übernommener Bestand',quantity:0,unitPrice:s.unitPrice??null,purchaseDate:s.purchaseDate||'',location:s.location||'',supplierId:'',supplier:'',packageType:'Einzelbestand',packageSize:1,notes:s.notes||'',invoices:structuredClone(s.invoices||[])};
  s.positions=[position];s.movements=[];
  stockMovement(s,position,quantity(item.quantity),'opening',{reason:'Bestand aus bisheriger Lagerverwaltung übernommen'});
 }
 s.movements||=[];s.quantity=quantity(s.positions.reduce((sum,p)=>sum+p.quantity,0));
 return s;
}
export function normalizeGarage(value) {
 const garage={inventory:[],shopping:[],contacts:[],appointments:[],tools:[],computers:[],guides:[],unassignedDocuments:[],documentTypes:[],orders:[],...structuredClone(value)};
 garage.preferences={theme:'wald',notifications:true,...garage.preferences};
 garage.inventory=garage.inventory.map(normalizeStock);
 garage.contacts=garage.contacts.map(c=>({...c,roles:contactRoles(c)}));
 return garage;
}
export function stockMovement(stock,position,change,type,context={}) {
 if(!Number.isFinite(change)||Math.abs(change*1000-Math.round(change*1000))>0.00001)throw Error('Ungültige Bestandsänderung.');
 const before=position.quantity,after=quantity(before+change);
 const movement={id:crypto.randomUUID(),positionId:position.id,type,change:Math.round(change*1000)/1000,before,after,at:new Date().toISOString(),date:context.date||new Date().toLocaleDateString('sv-SE'),historyId:context.id||context.historyId||'',serviceTitle:context.title||context.serviceTitle||'',bikeId:context.bikeId||'',bikeName:context.bikeName||'',shoppingId:context.shoppingId||'',reason:context.reason||'',unitPrice:position.unitPrice??null};
 position.quantity=after;stock.movements.push(movement);stock.quantity=quantity(stock.positions.reduce((sum,p)=>sum+p.quantity,0));return movement;
}
export function addStockPosition(stock,values,context={}) {
 const amount=quantity(values.quantity);const position={...values,id:crypto.randomUUID(),quantity:0};
 if(!position.label?.trim())throw Error('Bitte die Lagerposition benennen.');
 stock.positions.push(position);stockMovement(stock,position,amount,'receipt',context);return position;
}
export function stockValue(stock) {
 return (stock.positions||[]).reduce((result,p)=>({cents:result.cents+(p.unitPrice===null?0:Math.round(p.quantity*p.unitPrice*100)),missing:result.missing+(p.quantity>0&&p.unitPrice===null?1:0)}),{cents:0,missing:0});
}
export function packageBalance(position) {
 const size=Math.round(position.packageSize*1000),remaining=Math.round(position.quantity*1000);
 const full=Math.floor(remaining/size);
 return {full,remainder:(remaining-full*size)/1000};
}

export function installedComponentKey(component,index){return component.id||'legacy:'+index;}
export function plannedOrderComponents(bike,categories=[]){
 if(!bike)return [];
 return (bike.components||[]).map((component,index)=>({component,key:installedComponentKey(component,index)}))
  .filter(({component})=>!categories.length||categories.includes('none')||categories.includes(componentCategory(component)));
}
export function completeWorkshopOrder(garage,orderId,removedKeys,date,km,tireChoices={}){
 const next=structuredClone(garage),order=next.orders.find(o=>o.id===orderId);
 if(!order||order.completedAt)throw Error('Der Auftrag ist bereits abgeschlossen oder fehlt.');
 if(!validISODate(date))throw Error('Bitte ein gültiges Abschlussdatum angeben.');
 const b=next.bikes.find(b=>b.id===order.bikeId);
 const keys=[...new Set(removedKeys)];
 if(keys.some(key=>!(order.replacementKeys||[]).includes(key)))throw Error('Bitte nur im Auftrag vorgesehene Bauteile ausbauen.');
 if(b){
  if(typeof km!=='number'||!Number.isFinite(km)||km<b.km)throw Error('Der Abschluss-Kilometerstand darf nicht unter dem aktuellen Stand liegen.');
  const planned=plannedOrderComponents(b,order.componentCategories||[]);
  if(keys.some(key=>!planned.some(row=>row.key===key)))throw Error('Ein vorgesehenes Bauteil ist nicht mehr verbaut. Bitte die Auswahl im Auftrag aktualisieren.');
  const archive=[...(b.componentArchive||[])];
  b.components=b.components.filter((c,index)=>{
   const key=installedComponentKey(c,index);if(!keys.includes(key))return true;
   const usage=componentMileage(c,{...b,km},next.history);
   if(usage.reason==='odometer')throw Error('Die Einbau-km liegen über dem Abschlussstand. Bitte die Kilometerstände prüfen.');
   if(componentCategory(c)==='Reifen'){
    const choice=tireChoices[key];if(!choice||!['stock','archive'].includes(choice.mode))throw Error('Bitte für jeden ausgebauten Reifen Wiedereinlagerung oder Archivierung auswählen.');
    if(choice.mode==='archive')(order.tireReturns??={})[key]={mode:'archive'};
    if(choice.mode==='stock'){storeRemovedTire(next,b,c,key,order,date,km,usage.km,choice);return false;}
   }
   archive.push({id:order.id+':'+key,orderId:order.id,componentKey:key,component:structuredClone(c),removedDate:date,removedKm:km,mileage:usage.km});return false;
  });
  b.componentArchive=archive;
  if(km!==b.km){b.km=km;b.kmDate=date;(b.readings??=[]).push({date,km,note:'Werkstattauftrag abgeschlossen: '+order.title});}
 }else if(keys.length)throw Error('Ein fremdes Fahrrad besitzt keine zugeordneten Bauteile.');
 order.completedAt=date;order.completedKm=b?km:null;order.removedKeys=keys;
 return next;
}

export function requiredWorkshopReplacements(garage,order){
 const b=garage.bikes.find(b=>b.id===order.bikeId),keys=new Set(plannedOrderComponents(b).map(r=>r.key));
 return order.parts.filter(part=>{
  const step=order.steps.find(s=>s.id===part.stepId),stock=garage.inventory.find(s=>s.id===part.inventoryId);
  const position=stock?.positions.find(p=>p.id===part.positionId)||(!part.positionId&&stock?.positions.length===1?stock.positions[0]:null);
  return (part.available||part.booking)&&step?.componentKey&&keys.has(step.componentKey)&&!position?.tire;
 });
}
export function suggestedWorkshopReplacement(garage,order,part){
 const eligible=requiredWorkshopReplacements(garage,order),step=order.steps.find(s=>s.id===part.stepId);
 return eligible.includes(part)&&eligible.filter(p=>order.steps.find(s=>s.id===p.stepId)?.componentKey===step.componentKey).length===1?step.componentKey:'';
}
export function settleWorkshopOrder(garage,orderId,action,selectedIds,date,comment,removedKeys=[],km=null,tireChoices={},installations=[]){
 const current=garage.orders.find(order=>order.id===orderId);
 if(!current||current.completedAt||current.cancelledAt)throw Error('Der Auftrag ist bereits beendet oder fehlt.');
 if(!['complete','pause','cancel','resume'].includes(action)||!validISODate(date)||comment.length>1000)throw Error('Bitte Datum und Auftragsgrund prüfen.');
 if(action==='resume'&&!current.pausedAt||action==='pause'&&current.pausedAt)throw Error('Dieser Statuswechsel ist nicht möglich.');
 if(action==='complete'){
  for(const part of requiredWorkshopReplacements(garage,current))if(!installations.some(x=>x.partId===part.id&&x.replacedKey))throw Error('Bitte den Austausch für '+part.name+' zuordnen oder ausdrücklich als Verbrauchsmaterial kennzeichnen.');
  for(const step of current.steps)if(removedKeys.includes(step.componentKey)&&current.parts.some(p=>p.stepId===step.id)&&!current.parts.some(p=>p.stepId===step.id&&(p.available||p.booking)))throw Error('Bitte das benötigte Ersatzteil zuerst als vorhanden bestätigen oder die Ersatzteilplanung korrigieren.');
 }
 const next=action==='complete'?completeWorkshopOrder(garage,orderId,removedKeys,date,km,tireChoices):structuredClone(garage);
 const order=next.orders.find(o=>o.id===orderId),selected=new Set(selectedIds);
 const parts=order.parts.filter(part=>part.available&&!part.booking);
 if(selectedIds.some(id=>!parts.some(part=>part.id===id)))throw Error('Die Auswahl der Ersatzteile hat sich geändert.');
 const used=[],returned=[];
 if(action!=='resume'){
  for(const part of parts){
   const consumed=action==='complete'||(action==='pause'?!selected.has(part.id):selected.has(part.id));
   if(!consumed){part.available=false;returned.push(part.id);continue;}
   used.push(part.id);
   const stock=next.inventory.find(item=>item.id===part.inventoryId);
   let movementId='',location='';
   if(part.inventoryId){
    const position=stock?.positions.find(p=>p.id===part.positionId)||(!part.positionId&&stock?.positions.length===1?stock.positions[0]:null);
    if(!position||position.quantity<part.quantity||stock.unit!==part.unit)throw Error('Prüfe die Lagerposition und verfügbare Menge für '+part.name+'.');
    part.positionId=position.id;location=position.location;
    const movement=stockMovement(stock,position,-part.quantity,'withdrawal',{date,title:order.title,bikeId:order.bikeId,
     bikeName:next.bikes.find(b=>b.id===order.bikeId)?.name||order.externalBike,reason:'Werkstattauftrag'});
    if(position.tire){
     const b=next.bikes.find(b=>b.id===order.bikeId);
     if(!b||part.quantity!==1)throw Error('Einen gebrauchten Reifen einem eigenen Fahrrad mit Menge 1 zuordnen.');
     mountStoredTire(next,stock,position,b,part.tirePosition,date,action==='complete'?km:b.km,movement);
    }
    movement.orderId=order.id;movement.orderPartId=part.id;if(part.stepId)movement.stepId=part.stepId;movementId=movement.id;
   }
   part.booking={date,movementId,location};
  }
 }
 if(action==='complete'){
  const byKey=new Map(plannedOrderComponents(garage.bikes.find(b=>b.id===order.bikeId)).map(row=>[row.key,row.component]));
  order.replacementSnapshot=(order.replacementKeys||[]).map(key=>{
   const c=byKey.get(key);
   return {key,component:{name:c?.name||'',manufacturer:c?.manufacturer||'',serial:c?.serial||''}};
  });
 }
 if(installations.length){
  if(action!=='complete'||!order.bikeId)throw Error('Bauteile können nur beim Abschluss am eigenen Fahrrad eingebaut werden.');
  const b=next.bikes.find(b=>b.id===order.bikeId),original=garage.bikes.find(b=>b.id===order.bikeId);
  const targets=new Map(plannedOrderComponents(original).map(row=>[row.key,row.component]));
  const seenParts=new Set(),seenKeys=new Set();order.installations=[];order.consumablePartIds=[];order.exchangeConfirmed=true;
  for(const selection of installations){
   const part=order.parts.find(p=>p.id===selection.partId),old=targets.get(selection.replacedKey);
   if(selection.replacedKey==='__consumable__'){if(!part?.booking||seenParts.has(part.id))throw Error('Verbrauchsmaterial muss einem tatsächlich verwendeten Ersatzteil zugeordnet sein.');order.consumablePartIds.push(part.id);seenParts.add(part.id);continue;}
   if(!part?.booking||!old||!removedKeys.includes(selection.replacedKey)||seenParts.has(part.id)||seenKeys.has(selection.replacedKey))throw Error('Jedes Ersatzteil genau einem ausgebauten Bauteil zuordnen.');
   const stock=next.inventory.find(s=>s.id===part.inventoryId);
   if(stock?.positions.find(p=>p.id===part.positionId)?.tire)throw Error('Gebrauchte Reifen werden bereits über die Reifenfunktion eingebaut.');
   const position=stock?.positions.find(p=>p.id===part.positionId);
   const component={id:'installed:'+order.id+':'+part.id,name:old.name,category:componentCategory(old),manufacturer:stock?.manufacturer??part.manufacturer??'',model:stock?.name??part.model??part.name,serial:part.serial||'',
    originalPartNumber:stock?.articleNumber??part.articleNumber??'',price:position?.unitPrice??stock?.unitPrice??null,lastPurchasedAt:position?.supplier||'',installedDate:date,installedKm:km,
    sourceOrderId:order.id,sourceOrderPartId:part.id,sourceInventoryId:part.inventoryId||''};
   if(b.components.some(c=>c.id===component.id))throw Error('Dieses Ersatzteil ist bereits eingebaut.');
   b.components.push(component);order.installations.push({partId:part.id,replacedKey:selection.replacedKey,component:structuredClone(component)});
   seenParts.add(part.id);seenKeys.add(selection.replacedKey);
  }
 }
 if(action==='complete'&&order.planId){
  const plan=next.plans.find(p=>p.id===order.planId);
  if(plan&&order.planOccurrence===JSON.stringify([plan.id,plan.nextDate||'',plan.nextKm??null])){
   if(plan.months||plan.intervalKm)Object.assign(plan,completePlan(plan,date,km));else plan.completed=true;
  }
 }
 if(action==='cancel')order.cancelledAt=date;
 if(action==='pause')order.pausedAt=date;
 else delete order.pausedAt;
 (order.workLog??=[]).push({action,date,comment,used,returned});
 return next;
}

export function tireLifetime(component,bike,history=[]){
 const current=componentMileage(component,bike,history).km;
 const previous=(component.tireHistory||[]).map(segment=>segment.mileage);
 return current===null||previous.some(km=>km===null)?null:Math.round((current+previous.reduce((sum,km)=>sum+km,0))*10)/10;
}
export function storeRemovedTire(garage,bike,component,key,order,date,km,mileage,choice){
 const location=String(choice.location||'').trim();if(!location)throw Error('Bitte einen Lagerort für den ausgebauten Reifen angeben.');
 let item=garage.inventory.find(item=>item.id===choice.inventoryId);
 if(choice.inventoryId&&!item)throw Error('Der ausgewählte Lagerartikel fehlt.');
 if(!item){
  item={id:crypto.randomUUID(),name:[component.name,component.model].filter(Boolean).join(' '),manufacturer:component.manufacturer||'',category:'Reifen',kind:'Original',unit:'Stück',quantity:0,minStock:0,articleNumber:component.originalPartNumber||'',unitPrice:null,purchaseDate:'',location:'',notes:'',invoices:[],positions:[],movements:[]};
  garage.inventory.push(item);
 }
 if(item.category!=='Reifen'||item.unit!=='Stück')throw Error('Bitte einen Reifenartikel mit Einheit Stück auswählen.');
 const tireId=component.tireId||crypto.randomUUID();
 const snapshot=structuredClone(component);delete snapshot.tireHistory;delete snapshot.tireId;delete snapshot.priorMileage;delete snapshot.tireInstallMovementId;
 const history=[...(component.tireHistory||[]),{bikeId:bike.id,bikeName:bike.name,installedDate:component.installedDate||'',installedKm:component.installedKm??null,removedDate:date,removedKm:km,mileage}];
 const position=addStockPosition(item,{label:'Gebrauchter Reifen · '+date,quantity:1,unitPrice:null,purchaseDate:'',location,supplierId:'',supplier:'',packageType:'Einzelbestand',packageSize:1,notes:'Wiederverwendbarer Reifen',invoices:[],tire:{id:tireId,component:snapshot,history}},{date,bikeId:bike.id,bikeName:bike.name,title:order.title,reason:'Reifen wiedereingelagert'});
 const movement=item.movements.at(-1);movement.tireReturnOrderId=order.id;movement.componentKey=key;
 (order.tireReturns??={})[key]={mode:'stock',inventoryId:item.id,positionId:position.id};
}
export function mountStoredTire(garage,stock,position,bike,name,date,km,movement){
 if(!['Vorderreifen','Hinterreifen'].includes(name))throw Error('Bitte Vorderrad oder Hinterrad für den Reifen auswählen.');
 if(bike.components.some(c=>componentCategory(c)==='Reifen'&&c.name===name))throw Error('An dieser Position ist bereits ein Reifen verbaut. Baue ihn zuerst aus.');
 const tire=position.tire;if(!tire)throw Error('Diese Lagerposition enthält keinen wiederverwendbaren Reifen.');
 const c={...structuredClone(tire.component),id:crypto.randomUUID(),name,category:'Reifen',installedDate:date,installedKm:km,tireId:tire.id,tireHistory:structuredClone(tire.history),tireInstallMovementId:movement.id};
 bike.components.push(c);movement.tireInstallId=c.id;
}
export function installTire(garage,inventoryId,positionId,bikeId,name,date){
 const next=structuredClone(garage),stock=next.inventory.find(item=>item.id===inventoryId),position=stock?.positions.find(p=>p.id===positionId),b=next.bikes.find(b=>b.id===bikeId&&!b.archived);
 if(!b||!position?.tire||position.quantity!==1||!validISODate(date))throw Error('Bitte einen verfügbaren Reifen und ein aktives Fahrrad auswählen.');
 const movement=stockMovement(stock,position,-1,'withdrawal',{date,bikeId:b.id,bikeName:b.name,reason:'Reifen wieder eingebaut'});
 mountStoredTire(next,stock,position,b,name,date,b.km,movement);return next;
}

// A fitted component is a catalogue reference, never an available warehouse unit.
export function syncInstalledInventory(garage,makeId=()=>crypto.randomUUID()) {
 const norm=v=>String(v??'').trim().toLocaleLowerCase('de-DE').replace(/\s+/g,' ');
 const partNumber=c=>c.originalPartNumber||c.partNumber||c.articleNumber||'';
 const signature=c=>JSON.stringify([componentCategory(c),norm(c.name),norm(c.manufacturer),norm(c.model),norm(partNumber(c)),...['width','axleDimension','brakeMount','rimHeight','innerWidth','rimMaterial','freehub'].map(k=>norm(c[k]))]);
 garage.inventory??=[];let changed=false;
 for(const bike of garage.bikes||[])for(const [index,c]of (bike.components||[]).entries()){
  if(!norm(c.name))continue;
  const key=signature(c),category=componentCategory(c),articleNumber=partNumber(c);
  let item=garage.inventory.find(s=>s.installedArticleSignature===key||s.technicalData&&signature(s.technicalData)===key);
  if(!item){const matches=garage.inventory.filter(s=>s.category===category&&norm(s.manufacturer)===norm(c.manufacturer)&&(
   articleNumber?norm(s.articleNumber)===norm(articleNumber):!s.articleNumber&&norm(s.name)===norm([c.name,c.model].filter(Boolean).join(' '))));if(matches.length===1)item=matches[0];}
  if(!item){item={id:makeId(),name:[c.name,c.model].filter(Boolean).join(' '),manufacturer:c.manufacturer||'',model:c.model||'',partType:c.name,articleNumber,category,kind:'Original',unit:'Stück',quantity:0,minStock:0,unitPrice:null,location:'',purchaseDate:'',notes:'',invoices:[],datasheets:[],positions:[],movements:[],technicalData:structuredClone(c),installedArticleSignature:key};garage.inventory.push(item);changed=true;}
  const source={bikeId:bike.id,componentKey:installedComponentKey(c,index),bikeName:bike.name||'Fahrrad'};
  if(!(item.installedOnBikes||[]).some(r=>r.bikeId===source.bikeId&&r.componentKey===source.componentKey)){
   item.installedOnBikes=[...(item.installedOnBikes||[]),source];
   const note='Automatisch als Artikel erfasst, weil dieses Bauteil an Fahrrad „'+source.bikeName+'“ verbaut ist. Bestand durch diese Erfassung: 0.';
   item.notes=[item.notes,note].filter(Boolean).join('\n');changed=true;
  }
 }
 return changed;
}
