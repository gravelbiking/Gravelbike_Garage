import {spawnSync} from 'node:child_process';
{const r=spawnSync(process.execPath,['tests/installed-inventory.mjs'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
{const r=spawnSync(process.execPath,['tests/release132.mjs'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
{const r=spawnSync(process.execPath,['tests/test-log-preview.mjs'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
{const r=spawnSync(process.execPath,['tests/release133.mjs'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
const suites=['components','km-precision','workshop','document-preview','resilience','navigation','reload-view','release-121a','release-121b','release-123','release-124'];
for(const suite of suites){const r=spawnSync(process.execPath,['scripts/test-'+suite+'.mjs'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
{const r=spawnSync(process.execPath,['tests/release125.mjs'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
{const r=spawnSync(process.execPath,['tests/test-frontend-logging.mjs'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
{const r=spawnSync(process.execPath,['tests/test-admin-package.mjs'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
for(const args of [[process.env.GT_TEST_PHP||'php','tests/logging.php'],['python3','tests/test_error_logs.py'],['python3','tests/test_job_logging.py'],['python3','-B','admin/tests/test_worker.py'],['python3','-B','admin/tests/test_dashboard.py'],[process.env.GT_TEST_PHP||'php','admin/tests/test_monitoring.php'],[process.execPath,'admin/tests/test_sizeunits.mjs']]){const r=spawnSync(args[0],args.slice(1),{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
console.log('Alle enthaltenen Quellcode-Regressionstests bestanden. Keine Produktionsverbindung.');
