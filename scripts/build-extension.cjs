const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),src=path.join(root,'integrations/openjobtracker');
// This directory is exclusively generated. Removing it prevents stale or private files leaking into packages.
const out=path.join(root,'outputs/easyoffer-extension-v2');fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');const files={};
function copy(from,to){const data=fs.readFileSync(from);fs.mkdirSync(path.dirname(path.join(out,to)),{recursive:true});fs.writeFileSync(path.join(out,to),data);files[to]=hash(data);}
const allowed=JSON.parse(fs.readFileSync(path.join(__dirname,'extension-files.json')));
for(const file of allowed){if(file.includes('..')||path.isAbsolute(file))throw Error('Invalid distribution path');copy(path.join(src,file),file);}
for(const file of ['app.js','index.html','favicon.png','assets/easyoffer-logo.png','ui.js','ui.css','application-core.js','desk-client.js'])copy(path.join(root,'dist',file),'workbench/'+file);
for(const file of ['README.md','PRIVACY.md','THIRD_PARTY_NOTICES.md'])copy(path.join(root,file),file);
for(const entry of fs.readdirSync(path.join(root,'licenses')))copy(path.join(root,'licenses',entry),'licenses/'+entry);
const vendor=path.join(root,'vendor/sheetjs');const provenance=JSON.parse(fs.readFileSync(path.join(vendor,'provenance.json')));if(hash(fs.readFileSync(path.join(vendor,'xlsx.full.min.js')))!==provenance.sha256)throw Error('SheetJS checksum mismatch');
copy(path.join(vendor,'xlsx.full.min.js'),'xlsx.full.min.js');copy(path.join(vendor,'LICENSE'),'licenses/SheetJS-LICENSE');
const XLSX=require(path.join(vendor,'xlsx.full.min.js'));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['公司名称','应聘岗位','城市','当前进度','投递渠道','投递链接','更新时间']]),'投递记录');const template=path.join(out,'投递记录模板.xlsx');fs.writeFileSync(template,Buffer.from(XLSX.write(wb,{type:'array',bookType:'xlsx'})));files['投递记录模板.xlsx']=hash(fs.readFileSync(template));
const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json')));const refs=[manifest.background.service_worker,manifest.options_page,manifest.action.default_popup,...Object.values(manifest.icons),...manifest.content_scripts.flatMap(c=>c.js),...manifest.web_accessible_resources.flatMap(c=>c.resources)];
for(const file of Object.keys(files)){if(file.endsWith('.js')){const s=fs.readFileSync(path.join(out,file),'utf8');for(const m of s.matchAll(/importScripts\(([^)]+)\)/g))for(const q of m[1].matchAll(/['"]([^'"]+)['"]/g))refs.push(q[1]);}if(file.endsWith('.html'))for(const m of fs.readFileSync(path.join(out,file),'utf8').matchAll(/(?:src|href)="([^"#]+)"/g))if(!/:/.test(m[1]))refs.push(path.posix.join(path.posix.dirname(file),m[1]));}
for(const file of refs)if(!fs.existsSync(path.join(out,file)))throw Error('Missing runtime file: '+file);
const ProfileCore=require(path.join(src,'v2/profile-core.js'));
for(const [name,p] of [['个人资料空白模板.xlsx',{...ProfileCore.empty(),id:'blank-template'}]]){const data=Buffer.from(XLSX.write(ProfileCore.workbook(XLSX,p),{type:'array',bookType:'xlsx'}));fs.writeFileSync(path.join(out,name),data);files[name]=hash(data);}
const audit=require('./release-audit.cjs').auditDirectory(out);if(audit.findings.length)throw Error('Distribution audit rejected files: '+JSON.stringify(audit.findings));
let commit='unavailable';try{if(fs.existsSync(path.join(root,'.git')))commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
const build={version:manifest.version,sourceCommit:commit,sourceTreeHash:hash(JSON.stringify(files)),builtAt:new Date().toISOString(),audit,files};fs.writeFileSync(path.join(out,'build-info.json'),JSON.stringify(build,null,2));console.log(JSON.stringify({out,version:build.version,sourceCommit:commit,sourceTreeHash:build.sourceTreeHash,files:Object.keys(files).length}));
