const assert=require('node:assert/strict');const {Runner,safeAction}=require('../integrations/openjobtracker/application-agent.js');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 for(const label of ['提交','提交申请','立即投递','完成','同意并继续','保存并下一步','Submit application'])assert(!safeAction({kind:'next',label}));
 assert(safeAction({kind:'next',label:'下一步'}));assert(safeAction({kind:'add',label:'+ 添加',section:'项目经历'}));assert(!safeAction({kind:'add',label:'添加'}));
 let writes=0,acts=0,resolvePlan;const statuses=[];
 const a={report:s=>statuses.push(s.status),observe:async()=>({signature:'one'}),plan:()=>new Promise(r=>resolvePlan=r),valid:()=>true,read:()=>'',write:()=>{writes++;return true},verify:()=>true,check:()=>({missing:[]}),act:()=>{acts++;return true},restore:()=>{}};
 let runner=new Runner(a);let task=runner.run();await tick();runner.stop();resolvePlan({fields:[{label:'学历'}]});await task;assert.equal(writes,0,'late model response cannot write after stop');
 runner=new Runner(a);task=runner.run();await tick();runner.pause();resolvePlan({fields:[{label:'学历'}]});await tick();assert.equal(writes,0,'pause blocks execution');runner.resume();await task;assert.equal(writes,1);assert.equal(runner.status,'done');
 runner=new Runner({...a,plan:async()=>({fields:[]}),check:()=>({missing:['必填地址']} )});await runner.run();assert.equal(runner.status,'blocked');assert.equal(acts,0);
 runner=new Runner({...a,plan:async()=>({fields:[]}),check:()=>({missing:[],action:{kind:'next',label:'提交',key:'submit'}})});await runner.run();assert.equal(acts,0);assert.equal(runner.status,'done');
 runner=new Runner({...a,plan:async()=>({fields:[]}),check:()=>({missing:[],action:{kind:'next',label:'下一步',key:'next'}})});await runner.run();assert.equal(acts,1,'unchanged page not clicked endlessly');assert.equal(runner.status,'blocked');
 let value='changed by user',restored=0;runner=new Runner({...a,read:()=>value,restore:()=>restored++});runner.writes=[{item:{},before:'',after:'agent text'}];await runner.undo();assert.equal(restored,0,'undo preserves user edits');
 const kb=require('../integrations/openjobtracker/knowledge-base.js');const text='江南大学 硕士研究生';const facts=kb.validate([{group:'profile',key:'degree',value:'硕士研究生',evidence:text},{group:'profile',key:'currentCity',value:'无锡',evidence:text}],text);assert.equal(facts.length,1);const before={userProfile:{degree:'本科'},experiences:{project:[{name:'已存项目'}]}};const updated=kb.apply(before,facts);assert.equal(updated.userProfile.degree,'硕士研究生');assert.equal(before.userProfile.degree,'本科');assert.equal(updated.experiences.project.length,1);
 let failed={label:'可选描述'},seenFailure=false;
 runner=new Runner({...a,plan:()=>({fields:[failed]}),write:()=>false,check:()=>{seenFailure=failed.failed;return {missing:failed.failed?['写入失败']:[]};}});await runner.run();assert(seenFailure);assert.equal(runner.status,'blocked');assert.equal(runner.writes.length,0);
 let held='',reports=[];runner=new Runner({...a,report:s=>reports.push(s),plan:()=>({fields:[{label:'日期'}]}),read:()=>held,write:()=>{held='错误日期';return true},verify:()=>false,restore:()=>{held=''},check:()=>({missing:['日期失败']})});await runner.run();assert.equal(held,'');assert.equal(reports.at(-1).filled,0);
 let scans=0;runner=new Runner({...a,observe:()=>{scans++;return {signature:'dynamic'}},plan:()=>({fields:[]}),check:()=>scans===1?{rescan:true}:{missing:[]}});await runner.run();assert.equal(scans,2);
 console.log('PASS agent stop/pause/late-response/required blockers/no-submit/loop bound/undo protection and grounded resume updates');
})().catch(e=>{console.error(e);process.exitCode=1});
{
 const kb=require('../integrations/openjobtracker/knowledge-base.js');
 const rows=kb.validate([{group:'education',key:'name',entity:'Test University',value:'Test University',evidence:'Test University'}],'Test University');
 require('node:assert/strict').equal(rows[0].key,'school');
}
