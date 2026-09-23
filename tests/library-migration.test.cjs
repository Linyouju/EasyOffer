const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../integrations/openjobtracker/background.js'),'utf8').split('chrome.runtime.onMessage.addListener')[0];
(async()=>{
 const state={workbookSeedApplied:'old',confirmedProfilePatch:'same-patch',knowledgeLibrary:{authority:{active:true,bank:[]}}};
 const patch={id:'same-patch',date:'2026-09-21',facts:[{id:'work.0.start',value:'2026-05-26',requires:{id:'work.0.company',value:'腾讯'}}]};
 let installs=0;
 const ctx={structuredClone,Date,importScripts(){},chrome:{runtime:{getURL:p=>p},storage:{local:{get:async()=>structuredClone(state),set:async x=>Object.assign(state,x)}}},
  fetch:async p=>({ok:true,json:async()=>p.includes('source')?{id:'new',sourceName:'new.xlsx'}:patch,arrayBuffer:async()=>new ArrayBuffer(0)}),
  XLSX:{},WorkbookLibrary:{parse:()=>({active:true,bank:[{id:'work.0.company',value:'腾讯'},{id:'award.2.name',value:'新增奖项'}]}),install:async(s,authority)=>{installs++;await s.set({knowledgeLibrary:{authority}})}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);assert.equal((await vm.runInContext('libraryReady',ctx)).ok,true);
 assert.equal(state.knowledgeLibrary.authority.bank.find(x=>x.id==='work.0.start').value,'2026-05-26');
 assert.ok(state.knowledgeLibrary.authority.bank.some(x=>x.id==='award.2.name'));
 const second=vm.createContext({...ctx});vm.runInContext(source,second);await vm.runInContext('libraryReady',second);
 assert.equal(installs,1);assert.equal(state.knowledgeLibrary.authority.bank.filter(x=>x.id==='work.0.start').length,1);
 const saved=JSON.stringify(state);
 const absent=vm.createContext({...ctx,fetch:async()=>{throw new TypeError('Failed to fetch');}});
 vm.runInContext(source,absent);assert.equal((await vm.runInContext('libraryReady',absent)).ok,true,'optional private seed absent must not block stored library');
 assert.equal(JSON.stringify(state),saved,'missing private files never overwrite existing user data');
 const malformed=vm.createContext({...ctx,fetch:async()=>({ok:true,json:async()=>{throw new SyntaxError('Invalid seed JSON');}})});
 vm.runInContext(source,malformed);assert.equal((await vm.runInContext('libraryReady',malformed)).ok,false,'present but corrupt seed remains a visible import failure');
 const noSupplement=vm.createContext({...ctx,fetch:async p=>{if(p.includes('additions'))throw new TypeError('Failed to fetch');return {ok:true,json:async()=>({id:'new'})};}});
 vm.runInContext(source,noSupplement);assert.equal((await vm.runInContext('libraryReady',noSupplement)).ok,true);assert.equal(JSON.stringify(state),saved);
 console.log('PASS seed update retains confirmed supplements; repeated startup is idempotent');
})().catch(e=>{console.error(e);process.exitCode=1});
