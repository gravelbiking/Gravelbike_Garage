import {cp,writeFile,mkdir,readdir,chmod,readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Staging only: never connect to a server or overwrite an existing installation.
export async function prepareAdmin(output){
 const target=resolve(output);
 await mkdir(target,{recursive:true});
 if((await readdir(target)).length)throw Error('Admin staging directory must be empty. Existing installations are never overwritten.');
 await cp(join(root,'admin/public'),join(target,'public'),{recursive:true});
 await cp(join(root,'admin/private'),join(target,'private'),{recursive:true});
 const core=join(target,'private/core');
 await cp(join(root,'selfhost'),core,{recursive:true});
 await writeFile(join(core,'config.php'),"<?php\nreturn require dirname(__DIR__).'/config.php';\n",{mode:0o600});
 const {version,releaseName}=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 for(const dir of [join(target,'private'),core])await writeFile(join(dir,'release.json'),JSON.stringify({version,name:releaseName}));
 await writeFile(join(target,'private/.htaccess'),'Require all denied\n');
 await chmod(join(target,'private'),0o700);
 await writeFile(join(target,'private/config.example.php'),`<?php
// Example ONLY. Use the existing private config.php / shared-config symlink.
// Do not create an installation key, reset users or replace database credentials.
// Required: installation_name, installation_key, origin, storage_path, database,
// admin: base_path, registry_path, grafana_port, python.
throw new RuntimeException('Configure the private Admin installation explicitly.');
`,{mode:0o600});
 await cp(join(root,'src/resilience.js'),join(target,'public/resilience.js'));
 return {public:join(target,'public'),private:join(target,'private')};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw Error('Usage: node scripts/prepare-admin.mjs <empty-local-staging-directory>');
 console.log(await prepareAdmin(process.argv[2]));
}
