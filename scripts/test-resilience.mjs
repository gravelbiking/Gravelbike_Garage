import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
class Element{
 constructor(){this.hidden=true;this.isConnected=true;this.children=[];this.attributes={};}
 replaceChildren(){this.children=[];}
 append(...children){this.children.push(...children);}
 setAttribute(k,v){this.attributes[k]=v;}
 removeAttribute(k){delete this.attributes[k];}
}
const ids=Object.fromEntries(['requestStatus','requestError','fatalError','offlineBanner'].map(k=>[k,new Element()]));
const handlers={},entries=[],navigator={onLine:true};
let logPosts=0,reloads=0;
const window={addEventListener:(key,fn)=>handlers[key]=fn};
const context=vm.createContext({window,navigator,document:{getElementById:id=>ids[id],createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener:()=>{}},console:{error:(...args)=>entries.push(args),warn:()=>{}},fetch:async()=>{logPosts++;return{ok:true};},AbortController,DOMException,setTimeout,clearTimeout,location:{reload:()=>reloads++}});
vm.runInContext(await readFile('src/resilience.js','utf8'),context);
const r=window.garageRuntime;
let release;const concurrent=r.request(()=>new Promise(resolve=>release=resolve));await Promise.resolve();
assert.equal(ids.requestStatus.hidden,false);
assert.equal(await r.request(async()=>42),42);assert.equal(ids.requestStatus.hidden,false);release(1);await concurrent;assert.equal(ids.requestStatus.hidden,true);
let aborted=false;
await assert.rejects(r.request(signal=>{signal.addEventListener('abort',()=>aborted=true);return new Promise(()=>{});},{timeout:5,context:'data/secret?token=private'}),{name:'TimeoutError'});
assert.equal(aborted,true);assert.equal(ids.requestStatus.hidden,true);
const cancel=new AbortController();const work=r.request(()=>new Promise(()=>{}),{signal:cancel.signal});cancel.abort();await assert.rejects(work,{name:'AbortError'});
let retry=0;const host=new Element();r.failure(Error('SECRET-PASSWORD'),()=>retry++,host);assert.equal(host.children[1].textContent,'Erneut versuchen');host.children[1].onclick();await new Promise(resolve=>setImmediate(resolve));assert.equal(retry,1);
navigator.onLine=false;handlers.offline();assert.equal(ids.offlineBanner.hidden,false);navigator.onLine=true;handlers.online();assert.equal(ids.offlineBanner.hidden,true);
handlers.error({error:Error('private')});assert.equal(ids.fatalError.hidden,false);ids.fatalError.children[2].onclick();assert.equal(reloads,1);
handlers.unhandledrejection({reason:Error('rejection')});assert.equal(ids.fatalError.hidden,false);
const e=Error('secret');r.log(e,'test');const count=logPosts;r.log(e,'test');assert.equal(logPosts,count);
assert.ok(!JSON.stringify(entries).includes('SECRET-PASSWORD'));assert.ok(!JSON.stringify(entries).includes('token='));
console.log('PASS: timeouts abort, pending counter, cancellation, explicit retry, offline recovery, global boundary and redacted deduplicated logging.');
