/* Editable offline mirror. Commands retain baseRevision until authority accepts or resolves conflicts. */
(()=>{'use strict';const origin=location.origin,QUEUE='easyoffer-v2-pending',BACKUP='easyoffer-v2-before-migration';const localDesk=location.protocol==='chrome-extension:';let remote=false,connected=false,seq=0,waiting=new Map();
const pending=()=>JSON.parse(localStorage.getItem(QUEUE)||'[]');const save=q=>localStorage.setItem(QUEUE,JSON.stringify(q));
function rpc(command){if(localDesk)return chrome.runtime.sendMessage({type:'EASY_V2_DESK',command}).then(r=>{if(!r?.ok)throw Error(r?.error||'本地工作台服务未响应');return r.result;});return new Promise((resolve,reject)=>{const requestId='desk-'+(++seq);waiting.set(requestId,{resolve,reject});window.postMessage({type:'EASY_V2_DESK_REQUEST',requestId,command},origin);setTimeout(()=>{if(waiting.delete(requestId))reject(Error('插件暂未连接，修改已保留'));},10000);});}
async function apply(snapshot){if(pending().length)return;remote=true;try{if(!localStorage.getItem(BACKUP))localStorage.setItem(BACKUP,localStorage.getItem(KEY)||'[]');if(persist(snapshot.records.map(validateRecord))===false)throw Error('工作台保存失败，版本尚未确认');render();}finally{remote=false;}
 $('#extension-status').textContent='工作台已保存，等待插件确认版本';
 await rpc({kind:'ack',records:snapshot.records.map(r=>({applicationId:r.applicationId,revision:r.revision}))});
 $('#extension-status').textContent='插件已连接 · 工作台已确认版本 '+snapshot.revision;
}

function showConflict(command,current){
 if(document.querySelector('[data-easyoffer-conflict]'))return;
 const dialog=document.createElement('dialog');dialog.dataset.easyofferConflict='true';
 dialog.style.cssText='max-width:680px;padding:24px;border:1px solid #ddd;border-radius:12px';
 const heading=document.createElement('h2');heading.textContent='这条记录有两个版本';dialog.append(heading);
 const explanation=document.createElement('p');explanation.textContent='你的离线修改仍然保留。请选择这次采用哪个版本，其他记录不会被覆盖。';dialog.append(explanation);
 for(const [key,value]of Object.entries(command.patch||{})){const p=document.createElement('p');p.textContent=key+'：离线修改「'+String(value)+'」；当前版本「'+String(current[key]??'')+'」';dialog.append(p);}
 const resolve=useMine=>{save(pending().filter(c=>useMine||c.operationId!==command.operationId).map(c=>c.applicationId===command.applicationId&&c.baseRevision===command.baseRevision?{...c,baseRevision:current.revision}:c));dialog.close();dialog.remove();setTimeout(flush,0);};
 for(const [label,choice]of [['采用我的修改',true],['采用当前版本',false]]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>resolve(choice);dialog.append(b);}
 const later=document.createElement('button');later.textContent='稍后处理';later.onclick=()=>{dialog.close();dialog.remove();};dialog.append(later);document.body.append(dialog);dialog.showModal();
}

const editableKeys=['company','role','location','url','category','status','notes','summary','salary','deadline','interview','interviewNote','rating','review','channel','companyDeadline'];
let flushing=false,inFlight='';
async function flush(){
 if(!connected||flushing)return;
 flushing=true;let halted=false;
 try{
  for(const initial of pending()){
   let c=pending().find(x=>x.operationId===initial.operationId);if(!c)continue;
   // A locally created row may be edited again before its first creation ACK returns.
   // Resolve its retained legacy ID, then send only the new edit's changed fields.
   if(c.kind==='migrate'&&c.records?.length===1){
    const snapshot=await rpc({kind:'query'}),row=c.records[0],current=snapshot.records.find(r=>r.legacyId===row.id);
    if(current){
     const patch={};for(const key of editableKeys)if(row[key]!==c.before?.[key])patch[key]=row[key]??'';
     const conflict=Object.keys(patch).some(k=>current[k]!==c.before?.[k]&&current[k]!==patch[k]);
     const next={kind:'edit',operationId:c.operationId,applicationId:current.applicationId,baseRevision:current.revision,patch};
     save(pending().map(x=>x.operationId===c.operationId?next:x));c=next;
     if(conflict){halted=true;showConflict(c,current);break;}
    }
   }
   inFlight=c.operationId;const result=await rpc(c);inFlight='';
   if(result.conflict){halted=true;$('#extension-status').textContent='有离线修改与新版本冲突，修改已保留';showConflict(c,result.current);break;}
   save(pending().filter(x=>x.operationId!==c.operationId).map(x=>x.kind==='edit'&&x.applicationId===c.applicationId&&x.baseRevision===c.baseRevision?{...x,baseRevision:result.revision}:x));
  }
  await apply(await rpc({kind:'query'}));
 }catch(error){halted=true;$('#extension-status').textContent=error.message;}
 finally{flushing=false;inFlight='';if(!halted&&pending().length)setTimeout(flush,0);}
}
function capture(before,next){if(remote)return;const queue=pending();for(const row of next.filter(r=>!r.demo)){const old=before.find(r=>r.id===row.id);if(JSON.stringify(old)===JSON.stringify(row))continue;
 if(!row.applicationId){const prior=queue.find(c=>c.kind==='migrate'&&c.operationId!==inFlight&&c.records?.[0]?.id===row.id);if(prior)prior.records=[row];else queue.push({kind:'migrate',operationId:crypto.randomUUID(),records:[row],before:old});continue;}
 const patch={};for(const key of ['company','role','location','url','category','status','notes','summary','salary','deadline','interview','interviewNote','rating','review','channel','companyDeadline'])if(row[key]!==old?.[key])patch[key]=row[key]??'';
 if(Object.keys(patch).length)queue.push({kind:'edit',operationId:crypto.randomUUID(),applicationId:row.applicationId,baseRevision:row.revision,patch});}
 for(const old of before.filter(r=>r.applicationId&&!next.some(n=>n.id===r.id)))queue.push({kind:'edit',operationId:crypto.randomUUID(),applicationId:old.applicationId,baseRevision:old.revision,patch:{deleted:true}});
 save(queue);setTimeout(flush,0);}
window.addEventListener('message',async e=>{if(e.source!==window||e.origin!==origin)return;if(e.data?.type==='EASY_V2_DESK_RESPONSE'){const p=waiting.get(e.data.requestId);if(p){waiting.delete(e.data.requestId);e.data.ok?p.resolve(e.data.result):p.reject(Error(e.data.error));}return;}
 if(e.data?.type==='EASY_V2_HELLO'){connected=true;try{const all=jobs.filter(r=>!r.demo);if(!localStorage.getItem('easyoffer-v2-migrated')){if(!localStorage.getItem(BACKUP))localStorage.setItem(BACKUP,JSON.stringify(jobs));await rpc({kind:'migrate',operationId:'workbench-initial-'+ApplicationCore.hash(all),records:all});localStorage.setItem('easyoffer-v2-migrated','true');}await flush();}catch(err){$('#extension-status').textContent=err.message;}}});
async function setStatus(row,status,undo){
 if(!connected||!row.applicationId)throw Error('请先连接插件并同步这条记录');if(flushing||pending().length)throw Error('已有修改正在同步，请稍后再试');
 if(!undo&&!ApplicationCore.statusActions(row).some(a=>a.status===status))throw Error('当前状态不支持此操作');
 const operationId=crypto.randomUUID(),result=await rpc({kind:'edit',operationId,applicationId:row.applicationId,baseRevision:undo?undo.revision:row.revision,source:'manual',...(undo?{undoOf:undo.operationId}:{patch:{status}})});
 if(result.conflict){await apply(result.snapshot||await rpc({kind:'query'}));throw Error('记录已更新，请核对后重试');}await apply(result.snapshot||await rpc({kind:'query'}));return {operationId,revision:result.revision};
}
window.EasyOfferDesk={capture,flush,rpc,pending,setStatus};
if(localDesk){
 connected=true;
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.easyOfferRevision||changes.easyOfferObservationTick))flush();});
 // Local workbench has no independent initial records to import. Its mirror is rebuilt from authority.
 flush();
}else window.postMessage({type:'EASY_V2_READY'},origin);
})();
