const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const elements=new Map(),saved=new Map([['offerly-career-v1-plans-recovered-20260917','1']]);
const el=k=>{if(!elements.has(k))elements.set(k,{innerHTML:'',textContent:'',appendChild(){},classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},showModal(){},close(){}});return elements.get(k)};
const ctx={document:{querySelector:el,querySelectorAll:()=>[],createElement:()=>el('created'),addEventListener(){}},window:{addEventListener(){}},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},structuredClone,URL,Date,Math,console,setTimeout:()=>1,clearTimeout(){},crypto:require('node:crypto').webcrypto};
vm.createContext(ctx);
// Load the same shared state definitions as the deployed workbench; assertions are unchanged.
vm.runInContext(fs.readFileSync(path.join(__dirname,'../integrations/openjobtracker/v2/application-core.js'),'utf8'),ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../dist/extension-sync.js'),'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx);
for(const status of ['已投递','笔试','面试中','Offer','未通过']){
 ctx.status=status;
 run(`persist([{id:'company',kind:'company',company:'vivo',status:'计划投递',notes:'保留企业备注'}, {id:'role',kind:'job',company:'V I V O',role:'交互设计',status:'计划投递',summary:'保留待投岗位'}, {id:'applied',kind:'job',company:'ＶＩＶＯ',role:'产品设计',status,review:'保留复盘'}, {id:'other',kind:'company',company:'其他公司',status:'计划投递'}].map(validateRecord));filter='pending';render()`);
 assert.equal(run('companyPlans().length'),1);
 assert.equal(run('metrics().plannedCompanies'),1);
 assert.doesNotMatch(el('#cards').innerHTML,/vivo|V I V O|ＶＩＶＯ/);
 run(`filter='all';render()`);
 assert.match(el('#cards').innerHTML,/产品设计/);assert.match(el('#cards').innerHTML,/交互设计/);
 assert.equal(run('jobs.length'),4);assert.equal(run('jobs[0].notes'),'保留企业备注');
 assert.throws(()=>run(`addCompanyRecord({company:'vivo'})`),/已有投递/);
}
run(`persist([{id:'p',kind:'company',company:'甲公司',status:'计划投递'}, {id:'j',company:'甲公司',role:'设计',status:'计划投递'}].map(validateRecord));updateJob('j',{status:'已投递'});`);
assert.equal(run('companyPlans().length'),0);
run(`jobs=JSON.parse(localStorage.getItem(KEY)).map(validateRecord)`);assert.equal(run('companyPlans().length'),0);
run(`updateJob('j',{status:'计划投递'})`);assert.equal(run('companyPlans().length'),1);
run(`var merged=mergeExtensionRecords(jobs,[{id:'receipt',company:'甲公司',position:'设计',status:'投递成功'}]);persist(merged.next)`);assert.equal(run('companyPlans().length'),0);
assert.equal(run(`mergeExtensionRecords(jobs,[{id:'receipt',company:'甲公司',position:'设计',status:'投递成功'}]).changed`),0);
run(`persist([{id:'p',kind:'company',company:'甲公司',status:'计划投递'}, {id:'demo',company:'甲公司',role:'示例',status:'已投递',demo:true}].map(validateRecord))`);assert.equal(run('companyPlans().length'),1);
console.log('PASS company-level exclusion, counts, history preservation, manual/sync/reload paths, re-add guard, explicit rollback and demo isolation');
run(`persist([{id:'p1',kind:'company',company:'得物',status:'计划投递'},{id:'a1',company:'得物App',role:'设计',status:'已投递'},{id:'p2',kind:'company',company:'Shopee',status:'计划投递'},{id:'a2',company:'深圳虾皮信息科技有限公司',role:'设计',status:'已投递'},{id:'p3',kind:'company',company:'阿里淘天',status:'计划投递'},{id:'a3',company:'阿里巴巴',role:'设计',status:'已投递'}].map(validateRecord));filter='pending';render()`);
assert.equal(run('companyPlans().length'),1);assert.equal(run('companyPlans()[0].company'),'阿里淘天');
assert.equal(run(`mergeExtensionRecords(jobs,[{id:'alias',company:'得物',position:'设计',status:'笔试'}]).next.length`),6);
console.log('PASS verified brand/legal-name aliases, sync matching, separate subsidiaries preserved');
