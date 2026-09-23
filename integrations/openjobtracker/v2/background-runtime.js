/* All V2 business operations pass through this authority. No page can read raw storage. */
const easyRepo=new EasyOfferRepository();
const easyDeskOrigin='https://autumn-career-desk-qpc.linyouju.chatgpt.site';
const easyReady=(async()=>{const old=await chrome.storage.local.get('offerlyOutbox');if(old.offerlyOutbox?.length)await easyRepo.migrate(old.offerlyOutbox.map(r=>({...r,role:r.position,location:r.city})),'legacy-outbox-v1');})();
const isDesk=sender=>sender.id===chrome.runtime.id&&sender.frameId===0&&sender.url&&(new URL(sender.url).origin===easyDeskOrigin||sender.url.split(/[?#]/)[0]===chrome.runtime.getURL('workbench/index.html'));
const isPage=sender=>sender.id===chrome.runtime.id&&Boolean(sender.tab)&&!isDesk(sender);
const isOptions=sender=>sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL('options.html'));
async function easyMetrics(metric){await easyRepo.transact(s=>{s.metrics=[...(s.metrics||[]),metric].slice(-200);});}
globalThis.EasyOfferMetricSink=easyMetrics;
async function easyExport({optional=false}={}){if(optional){const c=await chrome.storage.local.get('excelConfig');if(!c.excelConfig?.autoExport)return {skipped:true};}const snapshot=await easyRepo.snapshot();try{const r=await ApplicationExcel.exportSnapshot(snapshot);await easyRepo.transact(s=>{s.deliveries.excel=Math.max(s.deliveries.excel,r.revision);s.excelError=null;});return {exportedRevision:r.revision};}catch(e){await easyRepo.transact(s=>{s.excelError=e.message;});return {pending:true,error:e.message};}}
async function easySnapshot(){const s=await easyRepo.snapshot();return {revision:s.revision,records:s.applications.filter(a=>!a.deleted).map(ApplicationCore.toView),deliveries:s.deliveries,excelError:s.excelError};}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
 if(!m?.type?.startsWith('EASY_V2_'))return;
 const task=(async()=>{
  await easyReady;
  if(m.type==='EASY_V2_DESK'){
   if(!isDesk(sender))throw Error('Untrusted workbench source');
   const c=m.command;if(!c||JSON.stringify(c).length>2000000)throw Error('Invalid command');
   if(c.kind==='query')return easySnapshot();
   if(c.kind==='migrate'){if(!Array.isArray(c.records))throw Error('Missing records');await easyRepo.migrate(c.records,c.operationId);await easyExport({optional:true});return easySnapshot();}
   if(c.kind==='edit'){const result=await easyRepo.command(c);const excel=result.conflict?undefined:await easyExport({optional:true});if(!result.conflict)await chrome.storage.local.set({easyOfferRevision:(await easyRepo.snapshot()).revision});return {...result,excel,snapshot:await easySnapshot()};}
   if(c.kind==='ack'){await easyRepo.ack('desk',c.records||[]);return {ok:true};}
   if(c.kind==='export')return easyExport();throw Error('Unknown desk command');
  }
  if(m.type==='EASY_V2_METRIC'&&isOptions(sender)){const metric=m.metric||{};const allowed=['taskId','purpose','model','durationMs','ok','inputTokens','outputTokens','cacheTokens','retries','retryReason','replanReason'];await easyMetrics(Object.fromEntries(allowed.filter(k=>Object.hasOwn(metric,k)).map(k=>[k,metric[k]])));return {ok:true};}
  if(m.type==='EASY_V2_DIAGNOSTIC'&&isOptions(sender)){return {snapshot:await easySnapshot(),metrics:(await easyRepo.snapshot()).metrics||[]};}
  if(!isPage(sender))throw Error('Page context required');
  const sessionKey=new URL(sender.url).origin+new URL(sender.url).pathname+new URL(sender.url).search+'|'+sender.frameId;
  if(m.type==='EASY_V2_SESSION')return easyRepo.session(sessionKey,current=>{if(!m.patch)return current||{bindings:{},owners:{},operations:{},userEdited:[]};const next={...(current||{bindings:{},owners:{},operations:{}}),...m.patch};next.updatedAt=Date.now();return next;});
  if(m.type==='EASY_V2_SYNC_TASK'){const patch=m.task;if(!patch||!['pending','complete','no-records'].includes(patch.status))throw Error('Invalid sync task');return easyRepo.session(sessionKey,current=>({...current,syncTask:{status:patch.status,fingerprint:String(patch.fingerprint||'').slice(0,100),lastAttemptAt:Date.now(),error:patch.status==='pending'?String(patch.error||'').slice(0,200):'',url:sender.url}}));}
  if(m.type==='EASY_V2_PROFILE_CHECK'){const bank=await profileBank();return {valid:(m.sources||[]).every(x=>bank.some(f=>f.fieldId===x.fieldId&&f.fieldRevision===x.revision))};}
  if(m.type==='EASY_V2_CANCEL'){ModelGateway.cancel(m.taskId);return {ok:true};}
  if(m.type==='EASY_V2_TRACK_ORIGIN'){const c=await chrome.storage.local.get('easyOfferV2');const value=c.easyOfferV2||{};value.autoSyncSites=[...new Set([...(value.autoSyncSites||[]),new URL(sender.url).origin])];await chrome.storage.local.set({easyOfferV2:value});return {ok:true};}
  if(m.type==='EASY_V2_CONFIG'){const c=await chrome.storage.local.get('easyOfferV2');return {autoSync:c.easyOfferV2?.autoSync===true&&c.easyOfferV2.autoSyncSites?.includes(new URL(sender.url).origin)};}
  if(m.type==='EASY_V2_PLAN'){
   const page=m.page;if(!page||page.site!==new URL(sender.url).origin||JSON.stringify(page).length>160000)throw Error('Invalid page observation');
   const session=await easyRepo.session(sessionKey);
   const settings=await chrome.storage.local.get('easyOfferV2'),applicationPolicy={excludeInternships:settings.easyOfferV2?.excludeInternships===true};
   const signature=JSON.stringify({page:{...page,taskId:undefined,observedAt:undefined},applicationPolicy}),version=chrome.runtime.getManifest().version;
   if(m.purpose==='application'&&!m.toolResults&&session?.applicationUnderstanding?.signature===signature&&session.applicationUnderstanding.version===version){const cached=session.applicationUnderstanding.plan;return {...cached,observations:cached.observations.map(o=>({...o,taskId:page.taskId,observedAt:page.observedAt})),cacheHit:true};}
   const config=await getLlmConfig();const data=await chrome.storage.local.get(['knowledgeLibrary','experiences','userProfile','customFields']);
   const bank=typeof profileBank==='function'?await profileBank():SemanticMapper.buildBank(data,{});const plan=await SemanticPlanner.plan(m.purpose,page,bank,session,config,{applicationPolicy,feedback:m.feedback,replanReason:m.replanReason||(m.toolResults?'tool-followup':null),toolResults:m.toolResults,onMetric:easyMetrics,transformCache:(await easyRepo.snapshot()).transformCache||{},saveTransform:(key,value)=>easyRepo.transact(s=>{s.transformCache||={};s.transformCache[key]=value;const keys=Object.keys(s.transformCache);for(const k of keys.slice(0,Math.max(0,keys.length-100)))delete s.transformCache[k];})});
   if(m.purpose==='application'&&plan.observations?.length&&!plan.tools?.length&&!plan.diagnostics?.length)await easyRepo.session(sessionKey,current=>({...current,applicationUnderstanding:{signature,version,plan}}));
   await easyRepo.transact(s=>{s.planDiagnostics=[...(s.planDiagnostics||[]),{taskId:page.taskId,purpose:m.purpose,fingerprint:page.fingerprint,accepted:(plan.fields||[]).map(f=>({fieldId:f.id,recordId:f.recordId,sourceIds:f.sourceIds,strategy:f.strategy})),observationIds:(plan.observations||[]).map(o=>o.id),unresolved:plan.diagnostics||[]}].slice(-100);});return plan;
  }
  if(m.type==='EASY_V2_APPLY_OBSERVATIONS'){
   const settings=await chrome.storage.local.get('easyOfferV2'),policy={excludeInternships:settings.easyOfferV2?.excludeInternships===true};
   const results=[],excluded=[];for(const o of m.observations||[]){if(SemanticPlanner.applicationExcluded(o.posting,(o.evidence||[]).map(e=>e.text).join('\n'),policy)){excluded.push({title:o.posting.title,reason:'实习岗位不在当前同步范围'});continue;}if(o.site!==new URL(sender.url).origin)throw Error('Observation origin mismatch');results.push(await easyRepo.observe(o));}
   if(results.some(r=>r.pending))await easyRepo.session(sessionKey,current=>({...current,applicationUnderstanding:null}));
   const exportResult=await easyExport({optional:true});await chrome.storage.local.set({easyOfferRevision:(await easyRepo.snapshot()).revision,easyOfferObservationTick:Date.now()});const snapshot=await easyRepo.snapshot();return {results,excluded,authoritySaved:true,desk:results.every(r=>r.applicationId&&(snapshot.deliveries.desk[r.applicationId]||0)>=r.revision)?'confirmed':'pending',excel:exportResult};
  }
  throw Error('Unknown V2 message');
 })();task.then(result=>respond({ok:true,result})).catch(e=>respond({ok:false,error:e.message}));return true;
});

// Register the same observer on explicitly granted origins, including future visits to unfamiliar sites.
async function refreshEasyObservers(){
 const {easyOfferV2}=await chrome.storage.local.get('easyOfferV2');
 const previous=await chrome.scripting.getRegisteredContentScripts({ids:['easy-v2-observer']});
 if(previous.length)await chrome.scripting.unregisterContentScripts({ids:['easy-v2-observer']});
 if(!easyOfferV2?.autoSync)return;
 const matches=[];for(const origin of easyOfferV2.autoSyncSites||[]){if(/^https?:/.test(origin)&&origin!==easyDeskOrigin&&await chrome.permissions.contains({origins:[origin+'/*']}))matches.push(origin+'/*');}
 if(!matches.length)return;
 const js=chrome.runtime.getManifest().content_scripts[0].js;
 await chrome.scripting.registerContentScripts([{id:'easy-v2-observer',matches,excludeMatches:[easyDeskOrigin+'/*'],js,allFrames:true,runAt:'document_idle',persistAcrossSessions:true}]);
}
let observerRegistration=Promise.resolve();const scheduleObservers=()=>{observerRegistration=observerRegistration.then(refreshEasyObservers).catch(()=>{});};
chrome.permissions.onAdded.addListener(scheduleObservers);chrome.permissions.onRemoved.addListener(scheduleObservers);
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.easyOfferV2)scheduleObservers();});
scheduleObservers();
