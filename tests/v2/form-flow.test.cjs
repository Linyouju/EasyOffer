// Exercises the production entry/observer/planner-validator/writer/runner with an explicit model-output stub.
// LIVE_MODEL_CONFIG opts into the configured real service with synthetic data; controls/RPC remain jsdom.
// This never stands in for Chromium execution.
const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),{bank,projects}=require('./data.cjs');
const scripts=['ui-icons.js','job-validator.js','semantic-mapper.js','content.js','application-agent.js','v2/page-observer.js','v2/semantic-planner.js','v2/form-adapter.js','agent-dom.js'];
const liveConfig=process.env.LIVE_MODEL_CONFIG?JSON.parse(fs.readFileSync(process.env.LIVE_MODEL_CONFIG,'utf8')):null;const liveMetrics=[];global.ModelGateway=require('../../integrations/openjobtracker/v2/model-gateway');const livePlanner=require('../../integrations/openjobtracker/v2/semantic-planner');
if(liveConfig){const invoke=ModelGateway.invoke;let n=0;ModelGateway.invoke=async req=>{const output=await invoke(req);fs.mkdirSync('work/v2-live',{recursive:true});fs.writeFileSync('work/v2-live/form-model-'+(++n)+'.json',JSON.stringify({page:req.input.page,output},null,2));return output;};}
const sleep=n=>new Promise(r=>setTimeout(r,n));
(async()=>{let session={},calls=0,interrupt=true,last,dom;const listeners=[];
const html=fs.readFileSync('tests/v2/fixtures/'+(process.env.V2_FIXTURE||'practice.html'),'utf8');
dom=new JSDOM(html,{url:'https://careers.example.test/form',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
 w.structuredClone=structuredClone;w.CSS={escape:s=>s};w.Element.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{width:400,height:40}];};w.Element.prototype.getBoundingClientRect=()=>({width:400,height:40,top:0,left:0,bottom:40,right:400});w.Element.prototype.scrollIntoView=()=>{};
 w.chrome={runtime:{onMessage:{addListener:f=>listeners.push(f),removeListener:()=>{}},sendMessage:async m=>{
  if(m.type==='OJT_AGENT_RESUME')return {resume:false};
  if(m.type==='EASY_V2_SESSION'){if(m.patch){session=structuredClone(m.patch);if(interrupt&&Object.values(session.operations||{}).some(o=>o.status==='verified')){interrupt=false;w.activeRunner.stop();}}return {ok:true,result:structuredClone(session)};}
  if(m.type==='EASY_V2_PLAN'){
   calls++;const page=m.page;if(liveConfig){const result=await livePlanner.plan('form',page,bank,session,liveConfig,{feedback:m.feedback,toolResults:m.toolResults,fetcher:(url,init)=>fetch(url,{...init,headers:{...init.headers,'Accept-Encoding':'identity'}}),onMetric:x=>{liveMetrics.push(x);fs.mkdirSync('work/v2-live',{recursive:true});fs.writeFileSync('work/v2-live/form-metrics.json',JSON.stringify(liveMetrics,null,2));}});fs.mkdirSync('work/v2-live',{recursive:true});fs.writeFileSync('work/v2-live/form-'+(process.env.V2_FIXTURE||'practice.html')+'.json',JSON.stringify({kind:'real-model-jsdom-controls',model:liveConfig.model,metrics:liveMetrics,acceptedFields:result.fields.map(f=>({fieldId:f.id,recordId:f.recordId,sourceIds:f.sourceIds})),tools:result.tools,diagnostics:result.diagnostics},null,2));return {ok:true,result};}const blocks=page.regions.filter(r=>/^#record/.test(r.locator)).map((r,i)=>({regionId:r.id,recordId:projects[i].recordId,allowedTypes:['project'],evidence:[{regionId:r.id,text:r.heading}],fields:page.fields.filter(f=>f.regionId===r.id).map(f=>{const el=w.document.querySelector(f.locator),name=el.name.replace(/\d/g,'');return {fieldId:f.id,adaptation:['duties','description'].includes(name)?{type:'split',evidence:[{regionId:page.regions.find(x=>x.text.includes('主要职责填写本人完成的任务')||x.text.includes('背景及交付'))?.id||r.id,text:page.regions.find(x=>x.text.includes('主要职责填写本人完成的任务'))?'主要职责填写本人完成的任务，实践内容填写项目背景及交付。':r.heading}]}:undefined,sourceIds:['project.'+i+'.'+(name==='duties'?'description':name)],quotes:name==='duties'?[projects[i].description.split('。')[1]+'。']:name==='description'?[projects[i].description.split('。')[0]+'。',projects[i].description.split('。')[2]+'。']:undefined};})}));
   return {ok:true,result:w.SemanticPlanner.validateForm({blocks,actionId:blocks.length<2?page.actions.find(a=>a.label==='新增经历').id:null},page,bank,session)};
  }return {ok:true};
 }},storage:{local:{get:async()=>({knowledgeLibrary:{authority:{active:true,bank}},experiences:{}})}}};
}});const w=dom.window;for(const file of scripts)w.eval(fs.readFileSync('integrations/openjobtracker/'+file,'utf8'));
const run=w.ApplicationAgent.Runner.prototype.run;w.ApplicationAgent.Runner.prototype.run=function(){w.activeRunner=this;return run.call(this);};const emit=w.ApplicationAgent.Runner.prototype.emit;w.ApplicationAgent.Runner.prototype.emit=function(m,e){last={message:m,status:this.status};return emit.call(this,m,e);};
async function start(){await new Promise(resolve=>w.__ojtAgentListener({type:'START_APPLICATION_AGENT'},{},resolve));for(let i=0;i<1200;i++){await sleep(25);if(last&&['done','blocked','stopped'].includes(last.status))return;}throw Error('flow timed out');}
await start();assert.equal(last.status,'stopped',JSON.stringify(last));assert.equal(session.operations[Object.keys(session.operations)[0]].status,'verified');
// Simulate a node rebuild; no DOM ownership marker is added by the test.
const first=w.document.querySelector('[name=name1]'),replacement=first.cloneNode();replacement.value=first.value;first.replaceWith(replacement);
last=null;await start();assert.equal(last.status,'done',JSON.stringify(last));
assert.equal(w.document.querySelectorAll('article').length,2);assert.equal(w.added,1);assert.equal(w.submissions,0);assert.equal(w.document.getElementById('terms').checked,false);
for(let i=1;i<=2;i++)for(const k of ['name','role','start','end'])assert.equal(w.document.querySelector(`[name=${k}${i}]`).value,projects[i-1][k]);
assert.equal(Object.keys(session.owners).length,2);assert.equal(Object.values(session.operations).filter(o=>o.status==='verified').length,12);
for(let i=1;i<=2;i++){assert.match(w.document.querySelector(`[name=duties${i}]`).value,/本人负责/);assert.doesNotMatch(w.document.querySelector(`[name=description${i}]`).value,/本人负责/);}
assert(calls<=5);const saved=w.document.querySelector('[name=description2]');saved.value='用户修改的说明';await w.activeRunner.undo();assert.equal(saved.value,'用户修改的说明');
console.log((liveConfig?'REAL MODEL / JSDOM ':'')+'PASS form flow: production START entry, 12 fields, 2 records, split descriptions, dropdown, dates, interruption/rebuild/resume, persisted ownership, undo, zero submissions');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
