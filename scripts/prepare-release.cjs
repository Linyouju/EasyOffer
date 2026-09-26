/* Explicit clean snapshot: never publish the private development repository/history. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),release=path.join(root,'outputs/easyoffer-release'),source=path.join(release,'source'),extension=path.join(release,'extension');
fs.rmSync(release,{recursive:true,force:true});fs.mkdirSync(source,{recursive:true});
function cp(file){fs.mkdirSync(path.dirname(path.join(source,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(source,file));}
const dirs=['frontend','workbench','vendor','licenses','examples','tests','docs'];
for(const dir of dirs){const walk=d=>{for(const e of fs.readdirSync(path.join(root,d),{withFileTypes:true})){if(e.name==='node_modules'||e.name.startsWith('.'))continue;const f=path.join(d,e.name);e.isDirectory()?walk(f):cp(f);}};walk(dir);}
for(const file of ['package.json','package-lock.json','README.md','PRIVACY.md','LICENSE','THIRD_PARTY_NOTICES.md','.gitignore'])cp(file);
for(const file of JSON.parse(fs.readFileSync(path.join(__dirname,'extension-files.json'))))cp('integrations/openjobtracker/'+file);
for(const name of ['extension-files.json','release-audit.cjs','prepare-release.cjs','build-extension.cjs','browser-runtime.cjs','test-node.cjs','test-browser.cjs','test-v2.cjs','test-v2-chromium.cjs','test-share-chromium.cjs','test-workbench-status.cjs'])cp('scripts/'+name);
fs.mkdirSync(path.join(source,'.github/workflows'),{recursive:true});fs.copyFileSync(path.join(root,'.github/workflows/checks.yml'),path.join(source,'.github/workflows/checks.yml'));
fs.cpSync(path.join(root,'outputs/easyoffer-extension-v2'),extension,{recursive:true});
const audit=require('./release-audit.cjs'),reports={source:audit.auditDirectory(source),extension:audit.auditDirectory(extension)};
if(Object.values(reports).some(r=>r.findings.length))throw Error('Public snapshot rejected: '+JSON.stringify(reports));
fs.writeFileSync(path.join(release,'audit.json'),JSON.stringify(reports,null,2));
// Archives exclude all private Git history and build-machine paths.
for(const dir of ['extension','source'])execFileSync('zip',['-qr','easyoffer-'+dir+'.zip',dir],{cwd:release});
const sums=['easyoffer-extension.zip','easyoffer-source.zip'].map(f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(release,f))).digest('hex')+'  '+f).join('\n')+'\n';fs.writeFileSync(path.join(release,'SHA256SUMS'),sums);
console.log(JSON.stringify({release,audit:reports,archives:['easyoffer-extension.zip','easyoffer-source.zip']}));
