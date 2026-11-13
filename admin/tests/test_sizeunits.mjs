import vm from 'node:vm';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const registry={};let plugin;
vm.runInNewContext(await readFile(new URL('../private/sizeunits-plugin/module.js',import.meta.url),'utf8'),{Intl,Number,System:{register(deps,fn){assert.deepEqual([...deps],['@grafana/data']);const module=fn((name,value)=>{plugin=value;});module.setters[0]({AppPlugin:class{},getValueFormatterIndex:()=>registry});module.execute();}}});
assert.ok(plugin);
for(const [input,text,suffix] of [[0,'0',' MB'],[250000,'0,25',' MB'],[1000000,'1',' MB'],[999000000,'999',' MB'],[1000000000,'1',' GB'],[1500000000,'1,5',' GB']]){
 const v=registry.garagebytes(input);assert.equal(v.text,text);assert.equal(v.suffix,suffix);
}
assert.equal(registry.garagebytes(null).text,'');assert.equal(registry.garagebytes(NaN).text,'');
console.log('PASS: actual Grafana preload plugin registers MB/GB formatter; threshold, small values, zero and null.');
