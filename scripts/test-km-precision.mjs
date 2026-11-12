import assert from 'node:assert/strict';
import {kmInputValue,kmFromInput} from '../src/logic.js';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
for(const [raw,rounded] of [[135.427,135.4],[135.478,135.5],[135.45,135.5],[0,0],[0.049,0],[0.05,0.1],[100,100]]){
 assert.equal(kmInputValue(raw),rounded);assert.equal(kmFromInput(String(rounded),raw),raw);
}
assert.equal(kmInputValue(''),'');assert.equal(kmInputValue(null),null);
assert.equal(kmFromInput('135.6',135.427),135.6);
const source=await readFile('src/client.js','utf8');
const context=vm.createContext({kmInputValue,kmFromInput,esc:v=>String(v??'')});
vm.runInContext(source.slice(source.indexOf('const input='),source.indexOf('const select=')),context);
for(const field of ['km','componentKm','nextKm','intervalKm','completedKm','distance']){
 const markup=vm.runInContext(`input('${field}','km',135.427,'number','min="135.427" step="0.1"')`,context);
 assert.match(markup,/value="135.4"/);assert.match(markup,/min="135.4"/);assert.ok(!markup.includes('135.427'));
}
assert.match(vm.runInContext(`input('cost','Preis',135.427,'number','step="0.01"')`,context),/135.427/);
// Editing the rounded display repeatedly must not erase precise import residue.
let km=135.427;
for(let i=0;i<100;i++){km=kmFromInput(String(kmInputValue(km)),km);km=Math.round((km+.001)*1000)/1000;}
assert.equal(km,135.527);
console.log('PASS #100: rounded fields/minimums, boundaries, zero/empty values, unchanged precision, deliberate corrections and no drift.');
