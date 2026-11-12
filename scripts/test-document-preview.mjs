import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const handlers=new Map(),windowHandlers=new Map(),urls=new Set();
const url='https://garage.example/api.php?route=files%2Fabc';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
class Element {
 constructor(){this.children=[];this.handlers=new Map();}
 addEventListener(name,fn){const previous=this.handlers.get(name);this.handlers.set(name,previous?()=>{previous();fn();}:fn);}
 setAttribute(){}
 append(element){this.children.push(element);}
 remove(){this.removed=true;}
}
class Dialog extends Element {
 constructor(){super();this.selectors=new Map();}
 querySelector(selector){
  if(!this.selectors.has(selector))this.selectors.set(selector,new Element());
  return this.selectors.get(selector);
 }
 showModal(){this.open=true;}
 close(){if(this.open){this.open=false;this.handlers.get('close')();}}
}
class PreviewURL extends URL {
 static createObjectURL(){const value='blob:'+urls.size;urls.add(value);return value;}
 static revokeObjectURL(value){assert.ok(urls.delete(value));}
}
let dialog;
let signal;
let respond;
let focused=0;
const trigger={href:url,dataset:{documentPreview:'Rechnung'},isConnected:true,focus:()=>focused++};
const document={
 currentScript:{src:'https://garage.example/document-preview.js'},
 addEventListener:(name,fn)=>handlers.set(name,fn),
 createElement:()=>new Dialog(),
 body:{append:element=>{dialog=element;}}
};
const context=vm.createContext({
 setTimeout,clearTimeout,garageRuntime:{request:(work,{signal})=>work(signal),log:()=>{},failure:()=>{}},document,window:{addEventListener:(name,fn)=>windowHandlers.set(name,fn)},
 location:{origin:'https://garage.example'},URL:PreviewURL,AbortController,Image:Element,
 fetch:(_url,options)=>{signal=options.signal;return new Promise(resolve=>{respond=resolve;});}
});
const source=await readFile(new URL('../src/document-preview.js',import.meta.url),'utf8');
vm.runInContext(source,context);
function click(){
 let intercepted=false;
 handlers.get('click')({target:{closest:()=>trigger},button:0,preventDefault:()=>{intercepted=true;}});
 assert.ok(intercepted);
 assert.ok(dialog.open);
 assert.match(dialog.innerHTML,/<form method="dialog"><button[^>]+>Schließen/);
 assert.equal(dialog.querySelector('.preview-download').href,url);
}
click();
dialog.close();
assert.ok(signal.aborted&&dialog.removed);
assert.equal(focused,1);
respond({ok:false});
await settle();

click();
respond({ok:true,headers:{get:()=> 'image/png'},blob:async()=>new Blob(['image'])});
await settle();
assert.equal(urls.size,1);
assert.equal(dialog.querySelector('.preview-content').children[0].alt,'Rechnung');
windowHandlers.get('hashchange')();
assert.equal(urls.size,0);
assert.ok(dialog.removed);
assert.equal(focused,2);
console.log('PASS: closing cancels a pending request, releases images and returns focus to the original link.');
