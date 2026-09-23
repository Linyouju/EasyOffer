const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const C=require('../../integrations/openjobtracker/v2/application-core');
const tick=()=>new Promise(r=>setTimeout(r,10));
(async()=>{
 const state=C.empty();C.migrate(state,[{id:'old',company:'示例科技',role:'产品设计师',status:'已投递'}],'seed');const id=state.applications[0].id;
 const messages=[],storage={excelConfig:{autoExport:true}},listeners=[];let exports=0,fail=true;
 class Repo{snapshot(){return Promise.resolve(structuredClone(state));}async transact(fn){return fn(state);}async command(c){return C.command(state,c).result;}async session(k,update){if(update)state.sessions[k]=update(state.sessions[k]);return state.sessions[k];}}
 const ctx={console,URL,Promise,ApplicationCore:C,EasyOfferRepository:Repo,ApplicationExcel:{exportSnapshot:async()=>{exports++;if(fail)throw Error('Excel 不可写');return {revision:state.revision};}},chrome:{runtime:{id:'extension',onMessage:{addListener:f=>listeners.push(f)},getURL:p=>'chrome-extension://extension/'+p},storage:{local:{get:async()=>storage,set:async x=>{Object.assign(storage,x);messages.push(x);}},onChanged:{addListener(){}}},scripting:{getRegisteredContentScripts:async()=>[]},permissions:{onAdded:{addListener(){}},onRemoved:{addListener(){}}}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('integrations/openjobtracker/v2/background-runtime.js','utf8'),ctx);
 const deskSender={id:'extension',frameId:0,url:'https://autumn-career-desk-qpc.linyouju.chatgpt.site/'};
 const call=(message,sender=deskSender)=>new Promise(resolve=>listeners[0](message,sender,resolve));
 const command={kind:'edit',operationId:'desk-edit',applicationId:id,baseRevision:1,patch:{status:'面试中'}};
 const edited=await call({type:'EASY_V2_DESK',command});assert.equal(edited.ok,true);assert.equal(edited.result.excel.pending,true);assert.equal(state.applications[0].id,id);assert.equal(C.toView(state.applications[0]).status,'面试中');assert.equal(state.deliveries.excel,0);assert.equal(state.excelError,'Excel 不可写');
 fail=false;await call({type:'EASY_V2_DESK',command:{kind:'export'}});assert.equal(state.deliveries.excel,state.revision);assert.equal(exports,2);
 storage.excelConfig.autoExport=false;const skipped=await call({type:'EASY_V2_DESK',command:{...command,operationId:'optional-export',baseRevision:state.applications[0].revision,patch:{notes:'可选导出'}}});assert.equal(skipped.result.excel.skipped,true);assert.equal(exports,2);
 const revision=state.revision;await call({type:'EASY_V2_DESK',command});assert.equal(state.revision,revision,'same operation is not applied twice');
 const pageSender={id:'extension',frameId:0,url:'https://careers.example.test/status',tab:{id:1}};
 await call({type:'EASY_V2_SYNC_TASK',task:{status:'pending',fingerprint:'x',error:'服务不可用'}},pageSender);assert.equal(Object.values(state.sessions)[0].syncTask.status,'pending');
 const denied=await call({type:'EASY_V2_DESK',command:{kind:'query'}},{...deskSender,url:'https://untrusted.example/'});assert.equal(denied.ok,false);

 const dom=new JSDOM('<div id="extension-status"></div>',{url:deskSender.url,runScripts:'outside-only'}),w=dom.window;let acks=0,saveFails=true,ackFails=false;
 w.ApplicationCore=C;w.KEY='jobs';w.jobs=[];w.$=x=>w.document.querySelector(x);w.validateRecord=x=>x;w.render=()=>{};w.persist=rows=>{if(saveFails)return false;w.jobs=rows;w.localStorage.setItem(w.KEY,JSON.stringify(rows));return true;};w.localStorage.setItem('easyoffer-v2-migrated','true');
 const emit=data=>w.dispatchEvent(new w.MessageEvent('message',{source:w,origin:w.location.origin,data}));
 w.postMessage=m=>{if(m.type!=='EASY_V2_DESK_REQUEST')return;let result;if(m.command.kind==='query')result={revision:state.revision,records:state.applications.map(C.toView)};else if(m.command.kind==='ack'){acks++;result={ok:true};}setTimeout(()=>emit({type:'EASY_V2_DESK_RESPONSE',requestId:m.requestId,ok:!(m.command.kind==='ack'&&ackFails),error:'版本确认失败，等待重试',result}),0);};
 w.eval(fs.readFileSync('integrations/openjobtracker/v2/desk-client.js','utf8'));emit({type:'EASY_V2_HELLO'});await tick();await tick();assert.equal(acks,0);assert.match(w.$('#extension-status').textContent,/保存失败/);
 saveFails=false;emit({type:'EASY_V2_HELLO'});await tick();await tick();assert.equal(acks,1);assert.equal(w.jobs[0].applicationId,id);assert.equal(w.jobs[0].status,'面试中');
 ackFails=true;emit({type:'EASY_V2_HELLO'});await tick();await tick();assert.equal(acks,2);assert.match(w.$('#extension-status').textContent,/确认失败/);assert.doesNotMatch(w.$('#extension-status').textContent,/已确认版本/);assert.equal(w.jobs[0].applicationId,id);
 ackFails=false;emit({type:'EASY_V2_HELLO'});await tick();await tick();assert.equal(acks,3);assert.match(w.$('#extension-status').textContent,/已确认版本/);dom.window.close();
 console.log('PASS delivery: desk command uses authority ID and exports same revision, retry without duplicate writes, pending service task, trusted origin, no ACK on failed mirror save');
})().catch(e=>{console.error(e);process.exitCode=1;});
