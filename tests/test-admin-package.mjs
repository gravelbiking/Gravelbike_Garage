import assert from 'node:assert/strict';import {mkdtemp,readFile,rm,access,writeFile,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {prepareAdmin} from '../scripts/prepare-admin.mjs';import {prepareApp} from '../scripts/prepare-app.mjs';
const dir=await mkdtemp(join(tmpdir(),'garage-admin-package-'));
try{
 await prepareAdmin(dir);
 assert.equal(await readFile(join(dir,'public/resilience.js'),'utf8'),await readFile('src/resilience.js','utf8'));
 assert.match(await readFile(join(dir,'private/core/backend.php'),'utf8'),/logging.php/);
 assert.match(await readFile(join(dir,'private/core/config.php'),'utf8'),/dirname\(__DIR__\)/);
 assert.equal(JSON.parse(await readFile(join(dir,'private/core/release.json'))).version,'1.2.5');
 for(const file of ['private/config.php','private/settings.json','private/core/setup-key.php'])await assert.rejects(access(join(dir,file)));
 await assert.rejects(prepareAdmin(dir),/must be empty/);
 const app=join(dir,'garage'),logs=join(app,'private/logs');await prepareApp(app);await mkdir(logs);await writeFile(join(logs,'retained.jsonl'),'retained diagnostic');await writeFile(join(app,'private/config.php'),'<?php /* Private existing configuration */');await prepareApp(app,{preserveConfig:true});assert.equal(await readFile(join(logs,'retained.jsonl'),'utf8'),'retained diagnostic');assert.match(await readFile(join(app,'private/config.php'),'utf8'),/Private existing configuration/);
 console.log('PASS #106 Admin staging: updated PHP core, shared frontend logger, no live credentials, no overwrite.');
}finally{await rm(dir,{recursive:true,force:true});}
