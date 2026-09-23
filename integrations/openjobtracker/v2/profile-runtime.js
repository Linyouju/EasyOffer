/* Profile shares the existing transactional repository, not a second editable store. */
let profileReady;
async function ensureProfile(){
 if(!profileReady)profileReady=(async()=>{await libraryReady;const data=await chrome.storage.local.get(['knowledgeLibrary','userProfile','experiences','customFields']);await easyRepo.transact(s=>{if(!s.profile){s.profile=ProfileCore.migrate(data,SemanticMapper.buildBank(data,{}));s.profileMigrationBackup=structuredClone(data);}});await chrome.storage.local.set({easyProfileMigrated:true});})();
 await profileReady;return (await easyRepo.snapshot()).profile;
}
async function profileBank(){return ProfileCore.bank(await ensureProfile());}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
 if(m?.type!=='EASY_PROFILE')return;
 const run=(async()=>{const trusted=sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL('options.html'));
 if(!trusted)throw Error('资料管理请求来源无效');await ensureProfile();
 if(m.action==='get')return ensureProfile();
 if(['resume','edit'].includes(m.action)){const result=await ProfileAI.propose(await ensureProfile(),m.text,m.action,await getLlmConfig(),{onMetric:easyMetrics});if(m.action==='resume'){if(result.ambiguous)throw Error(result.reason);return result.changes;}return result;}
 if(m.action==='apply'){const result=await easyRepo.transact(s=>ProfileCore.command(s.profile,m.command));await chrome.storage.local.set({easyProfileRevision:result.revision});return {result,profile:await ensureProfile()};}
 if(m.action==='undo'){const result=await easyRepo.transact(s=>ProfileCore.undo(s.profile,m.operationId));await chrome.storage.local.set({easyProfileRevision:result.revision});return {result,profile:await ensureProfile()};}
 throw Error('未知资料操作');})();run.then(result=>respond({ok:true,result})).catch(e=>respond({ok:false,error:e.message}));return true;
});
