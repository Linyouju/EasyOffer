const assert=require('node:assert/strict');
const {Runner}=require('../integrations/openjobtracker/application-agent.js');
(async()=>{
 const values=new Map();let release;const delay=new Promise(r=>release=r);
 const adapter={report:()=>{},observe:()=>({signature:'page'}),async *plan(){yield {fields:[{label:'school'}]};await delay;throw Error('AI timeout');},valid:()=>true,read:i=>values.get(i.label)||'',write:i=>{values.set(i.label,'known');return true},verify:()=>true,check:()=>({}),clearCheckpoint:()=>{}};
 const runner=new Runner(adapter);const task=runner.run();await new Promise(r=>setImmediate(r));
 assert.equal(values.get('school'),'known','exact fields written before AI responds');
 release();await task;assert.equal(runner.status,'blocked');assert.equal(values.get('school'),'known','partial results survive timeout');
 let resume;const paused=new Promise(r=>resume=r);const stopped=new Runner({...adapter,async *plan(){yield {fields:[{label:'first'}]};await paused;yield {fields:[{label:'late'}]};}});
 const next=stopped.run();await new Promise(r=>setImmediate(r));stopped.stop();resume();await next;assert(!values.has('late'),'late batch cannot write after stop');
 console.log('PASS incremental batches, partial timeout preservation, stop before late batch');
})().catch(e=>{console.error(e);process.exitCode=1});
