const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const files=fs.readdirSync('tests').filter(f=>f.endsWith('.test.cjs')).sort();let failed=0;
for(const file of files){const r=spawnSync(process.execPath,[path.join('tests',file)],{stdio:'inherit',env:process.env});if(r.status!==0)failed++;}
console.log(JSON.stringify({suites:files.length,passed:files.length-failed,failed}));process.exitCode=failed?1:0;
