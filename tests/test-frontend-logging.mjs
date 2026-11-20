import assert from 'node:assert/strict';import vm from 'node:vm';import{readFile}from'node:fs/promises';
const storage=new Map(),payloads=[],handlers={},elements=new Map();let online=false,posts=0,status=200;
class Element{constructor(){this.hidden=true;this.isConnected=true;}setAttribute(){}removeAttribute(){}append(){}replaceChildren(){}}
const navigator={get onLine(){return online;}},window={addEventListener:(event,fn)=>handlers[event]=fn};
const context=vm.createContext({window,navigator,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},location:{pathname:'/test1/',hash:'#inventory'},document:{getElementById:k=>{if(!elements.has(k))elements.set(k,new Element());return elements.get(k);},createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener(){}},console:{error(){},warn(){}},fetch:async(_url,opts)=>{posts++;payloads.push(JSON.parse(opts.body));return{ok:status===200,status};},AbortController,DOMException,setTimeout,clearTimeout});
vm.runInContext(await readFile('src/resilience.js','utf8'),context);const runtime=window.garageRuntime;
const secret=Error('password=not-for-logs PRIVATE DOCUMENT');runtime.log(secret,'inventory?token=private');runtime.log(secret,'inventory');
assert.equal(posts,0);assert.ok([...storage.values()].some(s=>s.includes('inventory')));assert.ok(![...storage.values()].join('').includes('not-for-logs'));
online=true;handlers.online();await new Promise(r=>setImmediate(r));assert.equal(posts,1);assert.equal(payloads[0].entries.length,1);assert.equal(payloads[0].entries[0].page,'inventory');assert.equal(payloads[0].entries[0].context,'inventory');
const error=Error('private');await assert.rejects(runtime.request(async()=>{throw error;},{requestId:'specific-request-106',context:'strava'}));assert.equal(error.requestId,'specific-request-106');await new Promise(r=>setImmediate(r));assert.equal(payloads.at(-1).entries[0].requestId,'specific-request-106');
status=401;runtime.log(Error('not-for-logs'),'auth');await new Promise(r=>setImmediate(r));assert.ok([...storage.values()].some(s=>s.includes('auth')));const failed=posts;status=200;await runtime.flush();assert.equal(posts,failed+1);assert.equal(JSON.parse([...storage.values()][0]).length,0);
assert.ok(!JSON.stringify(payloads).includes('PRIVATE DOCUMENT'));assert.ok(!JSON.stringify(payloads).includes('token='));
console.log('PASS #106 frontend: offline retention, deduplication, redaction, request correlation, authenticated retry and acknowledged delivery.');

runtime.log(Error('Bitte zuerst die Fahrrad-Grunddaten prüfen.'),'component-save');await new Promise(r=>setImmediate(r));assert.equal(payloads.at(-1).entries[0].diagnosticCode,'bike.basics.invalid');console.log('PASS safe validation diagnostic codes.');
