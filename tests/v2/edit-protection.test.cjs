// Trusted input events are explicit test doubles; browser integration is separate.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{const dom=new JSDOM('<article id="record"><h2>项目经历</h2><label>描述<textarea id="description"></textarea></label></article>',{url:'https://example.test/resume',runScripts:'dangerously'});const w=dom.window;try{
 let session={bindings:{},owners:{},operations:{},userEdited:[]},callbacks={};
 const add=w.document.addEventListener.bind(w.document);w.document.addEventListener=(name,callback,...args)=>{if(['input','change','pointerdown'].includes(name))callbacks[name]=callback;return add(name,callback,...args);};
 w.structuredClone=structuredClone;w.CSS={escape:s=>s};w.Element.prototype.getClientRects=()=>[{width:100,height:20}];
 for(const file of ['v2/page-observer.js','v2/semantic-planner.js'])w.eval(fs.readFileSync('integrations/openjobtracker/'+file,'utf8'));
 const field=()=>({...w.PageObserver.observe().fields[0],recordId:'PROJECT',value:'完整原始描述',sourceIds:['project.0.description'],source:{id:'project.0.description',kind:'longtext'},binding:{recordId:'PROJECT',regionLocator:'#record'}});
 w.chrome={runtime:{sendMessage:async m=>m.type==='EASY_V2_PLAN'?{ok:true,result:{fields:[field()]}}:m.type==='EASY_V2_SESSION'?(m.patch&&(session=structuredClone(m.patch)),{ok:true,result:structuredClone(session)}):{ok:true}}};
 w.eval(fs.readFileSync('integrations/openjobtracker/v2/form-adapter.js','utf8'));
 let a=w.EasyFormAdapter.create({},[]),snapshot=await a.observe();const el=w.document.getElementById('description');
 callbacks.pointerdown({isTrusted:true,type:'pointerdown',target:el});assert.equal((await a.plan(snapshot)).fields.length,1,'focus is not an edit');
 callbacks.input({isTrusted:true,type:'input',target:el});assert.equal((await a.plan(snapshot)).fields.length,0,'active-run manual clearing is protected');await a.clearCheckpoint();
 snapshot=await a.observe();assert.equal((await a.plan(snapshot)).fields.length,1,'Continue on the same adapter can refill the now empty field');
 await a.clearCheckpoint();console.log('PASS edit protection: focus is not an edit, active edits protected, empty fields reopen only on a new run');
}finally{dom.window.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
