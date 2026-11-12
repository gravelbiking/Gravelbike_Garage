import {spawnSync} from 'node:child_process';
const suites=['components','km-precision','workshop','document-preview','resilience','navigation','reload-view','release-121a','release-121b','release-123','release-124'];
for(const suite of suites){const r=spawnSync(process.execPath,['scripts/test-'+suite+'.mjs'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
console.log('Alle enthaltenen Quellcode-Regressionstests bestanden. Keine Produktionsverbindung.');
