// Partially completed records must reuse their facts and fill only empty fields.
const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const P=require('../../integrations/openjobtracker/v2/semantic-planner');
const records=[
 {type:'work',id:'W1',company:'示例科技',role:'交互设计',start:'2026-05-26',end:'2026-09-21',description:'负责输入工具体验设计。\n· 访谈与流程分析。\n· 交付交互原型。'},
 {type:'work',id:'W2',company:'示例汽车（AUTO）',role:'UX设计',start:'2024-07-08',end:'2024-11-20',description:'负责车载交互体验研究。\n· 梳理场景并交付设计方案。'},
 {type:'project',id:'P1',name:'创作者工具设计',role:'交互设计',start:'2026-08-03',end:'2026-09-01',description:'面向创作者的工具设计。\n· 完成跨端预览与异常状态设计。'}
];
const bank=records.flatMap((r,i)=>Object.entries(r).filter(([k])=>!['id','type'].includes(k)).map(([k,value])=>({id:`${r.type}.${i}.${k}`,recordId:r.id,label:k==='description'?'完整原始描述':k,value,kind:['start','end'].includes(k)?'date':k==='description'?'longtext':'text'})));
// Formatting tolerance must not turn different records or invalid dates into matches.
assert(P.factMatches({current:'2026-5'},'2026-05-26'));
assert(P.factMatches({current:'2026年05月'},'2026-05-26'));
assert(P.factMatches({current:'08月',datePart:'month'},'2026-08-26'));
assert(!P.factMatches({current:'2026-0'},'2026-05-26'));
assert(!P.factMatches({current:'2026-02-30'},'2026-02-28'));
assert(!P.factMatches({current:'示例汽车另一部门'},'示例汽车（AUTO）'));
const editedSession={userEdited:['#empty','#filled'],bindings:{},owners:{}};
const editPage={fields:[{locator:'#empty',current:''},{locator:'#filled',current:'用户值'}],regions:[]};
assert.deepEqual(P.reconcileFormSession(editedSession,editPage,{newRun:true}).userEdited,['#filled']);
assert.deepEqual(P.reconcileFormSession(editedSession,editPage).userEdited,editedSession.userEdited,'ongoing run protection is not reset by a rescan');
const recordHtml=(r,i)=>`<article data-record id="record${i}"><h2>${r.type==='work'?'实习经历':'项目经历'}</h2><label>${r.company?'公司名称':'项目名称'}<input id="name${i}" data-key="${r.company?'company':'name'}" value="${i===1?'示例汽车 (AUTO)':r.company||r.name}"></label><label>职位名称<input id="role${i}" data-key="role" value="${r.role}"></label><label>开始时间<input id="start${i}" data-key="start" placeholder="YYYY-MM" value="${i===1?'':r.start.slice(0,7)}"></label><label>结束时间<input id="end${i}" data-key="end" placeholder="YYYY-MM" value="${r.end.slice(0,7)}"></label><label>描述<textarea id="description${i}" data-key="description"></textarea></label></article>`;
const html='<main>'+records.map(recordHtml).join('')+'</main><button id="save">保存</button><button id="submit">提交</button><button id="add">新增</button>';
(async()=>{let session={userEdited:['#description0','#description1','#description2'],bindings:{},owners:{},operations:{}},last,calls=0;
const config=process.env.LIVE_MODEL_CONFIG?JSON.parse(fs.readFileSync(process.env.LIVE_MODEL_CONFIG)):null;
if(config)global.ModelGateway=require('../../integrations/openjobtracker/v2/model-gateway');
const dom=new JSDOM(html,{url:'https://careers.example.test/partial',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
 w.structuredClone=structuredClone;w.CSS={escape:s=>s};w.Element.prototype.getClientRects=()=>[{width:200,height:30}];w.Element.prototype.getBoundingClientRect=()=>({width:200,height:30,top:0,left:0,bottom:30,right:200});w.Element.prototype.scrollIntoView=()=>{};
 w.chrome={runtime:{onMessage:{addListener:()=>{},removeListener:()=>{}},sendMessage:async m=>{
 if(m.type==='OJT_AGENT_RESUME')return {resume:false};
 if(m.type==='EASY_V2_SESSION'){if(m.patch)session=structuredClone(m.patch);return {ok:true,result:structuredClone(session)};}
 if(m.type==='EASY_V2_PLAN'){calls++;let result;if(config)result=await P.plan('form',m.page,bank,session,config,{feedback:m.feedback});else{const blocks=records.map((r,i)=>{const region=m.page.regions.find(x=>x.locator==='#record'+i);return {regionId:region.id,recordId:r.id,allowedTypes:[r.type],evidence:[{regionId:region.id,text:r.type==='work'?'公司名称':'项目名称'}],fields:m.page.fields.filter(f=>f.regionId===region.id&&!f.current).map(f=>({fieldId:f.id,meaning:f.type==='textarea'?'description':undefined,sourceIds:[`${r.type}.${i}.${w.document.querySelector(f.locator).dataset.key}`]}))};});result=w.SemanticPlanner.validateForm({blocks},m.page,bank,session);}return {ok:true,result};}
 return {ok:true};}},storage:{local:{get:async()=>({knowledgeLibrary:{authority:{active:true,bank}},experiences:{}})}}};
}});
const w=dom.window;try{
 let submitted=0,saved=0,added=0;w.document.querySelector('#submit').onclick=()=>submitted++;w.document.querySelector('#save').onclick=()=>saved++;w.document.querySelector('#add').onclick=()=>added++;
 for(const f of ['ui-icons.js','job-validator.js','semantic-mapper.js','content.js','application-agent.js','v2/page-observer.js','v2/semantic-planner.js','v2/form-adapter.js','agent-dom.js'])w.eval(fs.readFileSync('integrations/openjobtracker/'+f,'utf8'));
 const run=w.ApplicationAgent.Runner.prototype.run;w.ApplicationAgent.Runner.prototype.run=function(){w.runner=this;return run.call(this);};const emit=w.ApplicationAgent.Runner.prototype.emit;w.ApplicationAgent.Runner.prototype.emit=function(...args){last=this.status;return emit.apply(this,args);};
 const el=id=>w.document.getElementById(id),values=()=>[...w.document.querySelectorAll('input,textarea')].map(e=>[e.id,e.value]);
 const before=values();async function start(){last=null;await new Promise(resolve=>w.__ojtAgentListener({type:'START_APPLICATION_AGENT'},{},resolve));for(let n=0;n<2400;n++){await new Promise(r=>setTimeout(r,25));if(['done','blocked','stopped'].includes(last))return;}throw Error('partial resume timeout');}
 await start();for(let i=0;i<3;i++)assert.equal(el('description'+i).value,records[i].description,'empty description '+i+' must resume with the complete original');
 assert.equal(el('start1').value,'2024-07','missing start is filled from the matched record at target precision');
 for(const [id,value] of before.filter(([id,v])=>v))assert.equal(el(id).value,value,'existing fact preserved '+id);
 const once=values();await start();assert.deepEqual(values(),once,'repeat is idempotent');
 // Clearing a previously protected field between runs explicitly permits refill;
 // a neighboring non-empty user description must stay unchanged.
 el('description0').value='';el('description1').value='用户确认的描述';session.userEdited=['#description0','#description1'];
 await start();assert.equal(el('description0').value,records[0].description);assert.equal(el('description1').value,'用户确认的描述');assert.equal(w.document.querySelectorAll('article').length,3);assert.equal(added,0);assert.equal(submitted,0);assert.equal(saved,0);
 console.log((config?'REAL MODEL / JSDOM ':'')+'PASS partially filled records: existing names/roles/months, punctuation, missing start, cleared descriptions, repeated run, user content preserved, no duplicate/save/submit ('+calls+' plan calls)');
}finally{w.runner?.stop();dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
