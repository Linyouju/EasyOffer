const assert=require('node:assert/strict');
const P=require('../../integrations/openjobtracker/v2/semantic-planner');
const page={fingerprint:'one',taskId:'task',regions:[{id:'r'}],fields:[{id:'select',optionControl:true},{id:'terms',optionControl:true,forbidden:true}]};
(async()=>{
 let reads=0,rounds=0;
 const observer={observe:()=>page,readRegion:async()=>{reads++;throw Error('site removed node');},readOptions:async()=>{reads++;return [{text:'UX设计'}];}};
 const result=await P.continueTools({tools:[{name:'readRegion',id:'r'},{name:'readOptions',id:'terms'},{name:'executeCode',id:'anything'}]},page,{observer,request:async(p,history)=>{
  rounds++;assert.equal(p.taskId,'task');
  if(rounds===1){assert.deepEqual(history.map(r=>r.code),['READ_FAILED','INVALID_TOOL_ARGUMENTS','INVALID_TOOL_ARGUMENTS']);return {tools:[{name:'readOptions',id:'select'}]};}
  assert.equal(history.length,4);assert.equal(history[3].ok,true);assert.equal(history[3].result[0].text,'UX设计');return {tools:[],fields:['continue']};
 }});
 assert.equal(reads,2);assert.equal(rounds,2);assert.deepEqual(result.fields,['continue']);
 rounds=0;
 await assert.rejects(P.continueTools({tools:[{name:'readOptions',id:'select'}]},page,{observer,request:async(_,history)=>{rounds++;if(rounds===2)assert.equal(history.at(-1).code,'NO_PROGRESS');return {tools:[{name:'readOptions',id:'select'}]};}}),/预算/);
 assert.equal(rounds,2);
 await assert.rejects(P.continueTools({tools:[{name:'readOptions',id:'select'}]},page,{observer,isCancelled:()=>true,request:()=>{throw Error('must not request');}}),/STOPPED/);
 console.log('PASS shared tools: argument checks, forbidden actions, structured failures, follow-up results, repeat and call budget, cancellation');
})().catch(e=>{console.error(e);process.exitCode=1;});
