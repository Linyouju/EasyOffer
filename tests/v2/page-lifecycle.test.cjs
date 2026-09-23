const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main>我的投递</main>',{url:'https://careers.example.test/status',pretendToBeVisual:true,runScripts:'outside-only'}),w=dom.window;
 const tasks=[],timers=new Map(),intervals=[];let id=0,plans=0,applied=0,unavailable=true;
 w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};w.clearTimeout=i=>timers.delete(i);w.setInterval=fn=>intervals.push(fn);
 w.PageObserver={observe:()=>({fingerprint:'same-evidence',url:w.location.href,site:w.location.origin})};w.SemanticPlanner={continueTools:async plan=>plan};
 w.chrome={runtime:{onMessage:{addListener(){}},sendMessage:async m=>{
  if(m.type==='EASY_V2_CONFIG')return {ok:true,result:{autoSync:true}};
  if(m.type==='EASY_V2_SYNC_TASK'){tasks.push(m.task);return {ok:true,result:{}};}
  if(m.type==='EASY_V2_PLAN'){plans++;return unavailable?{ok:false,error:'模型服务不可用'}:{ok:true,result:{observations:[{id:'one'}],tools:[]}};}
  if(m.type==='EASY_V2_APPLY_OBSERVATIONS'){applied++;return {ok:true,result:{authoritySaved:true,results:[{applicationId:'same-id'}],desk:'pending',excel:{pending:true}}};}
  return {ok:true,result:{}};
 }},storage:{onChanged:{addListener(){}}}};
 w.eval(fs.readFileSync('integrations/openjobtracker/v2/page-runtime.js','utf8'));
 await Promise.resolve();await Promise.resolve();
 await assert.rejects(w.EasyOfferPage.sync(true),/不可用/);assert.equal(tasks.at(-1).status,'pending');assert.equal(applied,0);assert([...timers.values()].some(x=>x.ms===30000));
 unavailable=false;const retry=[...timers.values()].find(x=>x.ms===30000);retry.fn();for(let i=0;i<30;i++)await Promise.resolve();
 assert.equal(applied,1);assert.equal(tasks.at(-1).status,'complete');assert.equal(plans,2);
 await w.EasyOfferPage.sync();assert.equal(plans,2,'unchanged observation does not call AI again');
 w.history.pushState({},'', '/other-status');intervals[0]();const scheduled=[...timers.values()].filter(t=>t.ms===1200).at(-1);scheduled.fn();for(let i=0;i<30;i++)await Promise.resolve();assert.equal(plans,3,'SPA route is observed again');
 dom.window.close();console.log('PASS page lifecycle: durable pending failure, bounded retry, no false delivery, unchanged deduplication, SPA route trigger');
})().catch(e=>{console.error(e);process.exitCode=1;});
