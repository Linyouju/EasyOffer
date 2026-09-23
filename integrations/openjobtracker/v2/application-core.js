/* Shared, deterministic application identity and evidence reducer. No browser or AI calls. */
(function(root){
'use strict';
const clone=x=>structuredClone(x), norm=x=>String(x||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,'');
const uid=()=>crypto.randomUUID();
const hash=x=>{let h=2166136261;for(const c of JSON.stringify(x)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16);};
const title=x=>norm(x).replace(/^(?:20\d{2}|\d{2})[届年]?(?:秋招|春招|校招|校园招聘)?[-—·:：]*/,'');
function empty(){return {schema:2,revision:0,applications:[],observations:[],events:[],operations:{},deliveries:{desk:{},excel:0},sessions:{},backups:[]};}
function stateFromRaw(raw,submitted=false){const t=String(raw||'');let stage='unknown',outcome='active';
 if(/撤回|撤销|放弃/.test(t))outcome='withdrawn';else if(/不通过|未通过|淘汰|拒绝|不合适/.test(t))outcome='rejected';else if(/流程结束|终止/.test(t))outcome='closed';
 if(/offer|录用通知|已录用/i.test(t))stage='offer';else if(/录用评估/.test(t))stage='evaluation';else if(/面试|一面|二面|终面/.test(t))stage='interview';else if(/笔试/.test(t))stage='written';else if(/测评/.test(t))stage='assessment';else if(/筛选|简历评估|初筛/.test(t))stage='screening';else if(/人才库/.test(t))stage='pool';else if(/投递|申请|已查看/.test(t))stage='submitted';
 return {submitted:Boolean(submitted),stage,outcome,raw:t};}
const viewStatuses=Object.freeze(['计划投递','已投递','笔试','面试中','Offer','未通过','已撤回','流程结束']);
const viewStages=Object.freeze(['计划投递','已投递','笔试','面试','Offer']);
const manualActions=Object.freeze({
 '计划投递':{label:'标记已投递',status:'已投递'},
 '已投递':{label:'推进到笔试',status:'笔试'},
 '笔试':{label:'安排面试',status:'面试中'},
 '面试中':{label:'标记 Offer',status:'Offer'}
});
function statusLabel(s){if(!s?.submitted)return '计划投递';if(s.outcome==='rejected')return '未通过';if(s.outcome==='withdrawn')return '已撤回';if(s.outcome==='closed')return '流程结束';return ({offer:'Offer',interview:'面试中',written:'笔试',assessment:'笔试'})[s.stage]||'已投递';}
function viewState(row){return row.applicationState&&statusLabel(row.applicationState)===row.status?row.applicationState:stateFromRaw(row.status,row.status!=='计划投递');}
function isActive(s){return Boolean(s?.submitted&&s.outcome==='active'&&s.stage!=='offer');}
function nextAction(row){const s=viewState(row);return s.outcome==='active'?manualActions[statusLabel(s)]||null:null;}
function statusActions(row){const next=nextAction(row);if(!next)return [];const label=statusLabel(viewState(row));const alternatives=label==='已投递'?['面试中','未通过','已撤回']:label==='笔试'||label==='面试中'?['未通过','已撤回']:[];return [next,...alternatives.map(status=>({status,label:status==='面试中'?'进入面试':status==='已撤回'?'放弃':status}))];}
function statusInfo(row,now=Date.now()){
 const relative=t=>{if(!Number.isFinite(Number(t))||!t)return '';const d=new Date(Number(t)),today=new Date(now),days=Math.floor((new Date(today.getFullYear(),today.getMonth(),today.getDate())-new Date(d.getFullYear(),d.getMonth(),d.getDate()))/86400000);return days===0?'今天 '+d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):days===1?'昨天':days>1&&days<7?days+' 天前':d.toLocaleDateString('zh-CN');};
 const checked=row.lastStatusObservedAt;const source=row.statusSource;const label=source==='manual'?'手动更新':source==='agent'?'Agent 更新':source==='official_site'?'官网读取':'';
 const primary=source==='official_site'&&checked?'官网读取 · '+relative(checked):label&&row.statusUpdatedAt?label+' · '+relative(row.statusUpdatedAt):checked?'官网读取 · '+relative(checked):'尚未读取官网状态';
 const days=checked?Math.floor((now-checked)/86400000):0;const secondary=!checked?(primary==='尚未读取官网状态'?'':'尚未读取官网状态'):days>=7?days+' 天未检查官网':source==='manual'||source==='agent'?'官网读取 · '+relative(checked):'';return {primary,secondary};
}
function viewStage(row){return row.status==='未通过'?Math.min(3,Math.max(0,Number(row.stage)||0)):Math.max(0,viewStages.indexOf(row.status==='面试中'?'面试':row.status));}
function toView(a){return {...(a.legacy||{}),id:a.id,applicationId:a.id,legacyId:a.legacy?.id,revision:a.revision,statusSource:a.statusSource||null,statusUpdatedAt:a.statusUpdatedAt||null,updatedAt:a.updatedAt||null,appliedAt:a.appliedAt||'',lastObservedAt:a.lastObservedAt||null,lastStatusObservedAt:a.lastStatusObservedAt||null,recruitmentSeason:a.posting.season||'',sourceJobId:a.posting.sourceJobId||'',sourceApplicationId:a.sourceApplicationId||'',company:a.posting.company,role:a.posting.title,position:a.posting.title,location:a.posting.city,city:a.posting.city,url:a.posting.url,category:a.posting.department||'',status:statusLabel(a.state),rawStatus:a.state.raw,applicationState:clone(a.state),preferences:clone(a.preferences||[]),kind:a.kind||'job',demo:false,...a.user};}
function migrate(state,records,operationId){if(state.operations[operationId])return state;state.backups.push({id:operationId,records:clone(records)});
 for(const r of records){if(!r||r.demo||!r.company)continue;const existing=state.applications.find(a=>a.id===r.applicationId||(r.id&&a.legacy?.id===r.id)||(r.id&&a.legacyIds?.includes(r.id)));if(existing)continue;const linked=associate(state,{site:safeSite(r.url),posting:{company:r.company,title:r.role||r.position||'',city:r.location||r.city||''},sourceApplicationId:r.sourceApplicationId,sourceJobId:r.sourceJobId}).app;if(linked&&r.kind!=='company'){linked.legacy={...r,...linked.legacy};linked.legacyIds=[...(linked.legacyIds||[]),r.id].filter(Boolean);continue;}const app={id:typeof r.applicationId==='string'?r.applicationId:uid(),revision:1,kind:r.kind||'job',legacy:clone(r),posting:{id:uid(),company:r.company,title:r.role||r.position||'',city:r.location||r.city||'',url:r.url||'',site:safeSite(r.url),season:r.season||'',sourceJobId:r.sourceJobId||''},sourceApplicationId:r.sourceApplicationId||'',context:r.context||'',state:stateFromRaw(r.rawStatus||r.status,r.sourceType!=='detail'&&!['计划投递','状态未知',''].includes(r.status||'')),user:{},preferences:[],fingerprints:[],manual:{}};state.applications.push(app);}
 state.revision++;state.operations[operationId]={revision:state.revision};return state;}
function safeSite(url){try{return new URL(url).origin;}catch{return '';}}
function fingerprint(o){return hash({site:o.site,sourceApplicationId:o.sourceApplicationId,sourceJobId:o.sourceJobId,region:o.regionId,posting:o.posting,status:o.status,preferences:o.preferences});}
function associate(state,o){const siteCandidates=state.applications.filter(a=>!o.site||!a.posting.site||a.posting.site===o.site);
 const pick=xs=>xs.length===1?{app:xs[0]}:xs.length>1?{ambiguous:xs.map(a=>a.id)}:null;
 // An explicit site application ID outranks model wording, season or title changes.
 // Context is only a fallback discriminator, never a reason to split the same ID.
 if(o.sourceApplicationId){const exact=pick(siteCandidates.filter(a=>a.sourceApplicationId===o.sourceApplicationId));if(exact)return exact;}
 const candidates=siteCandidates.filter(a=>!o.context||!a.context||o.context===a.context).filter(a=>!o.posting.season||!a.posting.season||o.posting.season===a.posting.season);
 const compatible=candidates.filter(a=>!(o.sourceApplicationId&&a.sourceApplicationId&&o.sourceApplicationId!==a.sourceApplicationId));
 if(o.sourceJobId){const exact=pick(compatible.filter(a=>a.posting.sourceJobId===o.sourceJobId));if(exact)return exact;}
 return pick(compatible.filter(a=>norm(a.posting.company)===norm(o.posting.company)&&title(a.posting.title)===title(o.posting.title)&&(!a.posting.city||!o.posting.city||norm(a.posting.city)===norm(o.posting.city))))||{};
}
function validateObservation(o){if(!o||!o.id||!o.site||!o.posting?.company||!o.posting?.title||!Array.isArray(o.evidence))throw Error('Observation missing identity or evidence');
 if(!o.evidence.length||o.evidence.some(e=>typeof e.text!=='string'||!e.regionId))throw Error('Observation requires scoped evidence');
 if(!Number.isFinite(o.observedAt))throw Error('Observation time missing');return o;}
function observe(state,input){const o=clone(validateObservation(input));const fp=fingerprint(o);const match=associate(state,o);
 const previous=state.observations.find(x=>x.id===o.id);
 if(previous){const known=associate(state,previous).app;if(known){known.lastObservedAt=Math.max(known.lastObservedAt||0,o.observedAt);if(o.pageKind==='application')known.lastStatusObservedAt=Math.max(known.lastStatusObservedAt||0,o.observedAt);}return {state,result:{duplicate:true,...(known?{applicationId:known.id,revision:known.revision}:{})}};}
 o.source='official_site';state.observations.push(o);
 if(match.ambiguous)return {state,result:{pending:true,candidates:match.ambiguous,observationId:o.id}};
 let a=match.app;const before=a?clone(a):null;
 if(a?.fingerprints.includes(fp)){a.lastObservedAt=Math.max(a.lastObservedAt||0,o.observedAt);if(o.pageKind==='application')a.lastStatusObservedAt=Math.max(a.lastStatusObservedAt||0,o.observedAt);return {state,result:{duplicate:true,applicationId:a.id,revision:a.revision}};}
 if(!a){a={id:uid(),revision:0,posting:{id:uid(),...o.posting,site:o.site,sourceJobId:o.sourceJobId||''},sourceApplicationId:o.sourceApplicationId||'',context:o.context||'',state:stateFromRaw('',false),user:{},preferences:[],manual:{},fingerprints:[],legacy:{}};state.applications.push(a);}
 const status=o.status||{};const evidence=o.evidence.filter(e=>e.role!=='future'&&e.role!=='navigation');
 const submitted=o.pageKind==='application'&&status.submitted===true&&evidence.some(e=>e.role==='application'||e.role==='current');
 const statusSupported=status.raw&&evidence.some(e=>e.text.includes(status.raw)&&['current','application'].includes(e.role));
 const newerEvent=!a.state.occurredAt||!status.occurredAt||Date.parse(status.occurredAt)>=Date.parse(a.state.occurredAt);
 const changedEvidence=a.manual.state?.observedRaw!==undefined?status.raw!==a.manual.state.observedRaw:fp!==a.manual.state?.fingerprint;
 if(submitted)a.state.submitted=true;
 if(o.pageKind==='application'){a.lastStatusObservedAt=o.observedAt;const date=status.appliedAt;if(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&evidence.some(e=>new RegExp('(?:投递时间|申请时间|投递日期|申请日期|投递简历|提交申请)\\s*[:：]?\\s*'+date+'(?![0-9])').test(e.text)))a.appliedAt=date;}
 if(statusSupported&&o.pageKind==='application'&&newerEvent&&changedEvidence){const next=stateFromRaw(status.raw,a.state.submitted||submitted);if(status.occurredAt&&!Number.isNaN(Date.parse(status.occurredAt)))next.occurredAt=status.occurredAt;if(JSON.stringify(a.state)!==JSON.stringify(next)||!a.statusSource){a.statusSource='official_site';a.statusUpdatedAt=o.observedAt;}a.state=next;}
 if(statusSupported&&o.pageKind==='application')a.lastOfficialStatusRaw=status.raw;
 for(const key of ['company','title','city','department','url','season'])if(o.posting[key]&&(!a.manual[key]||(newerEvent&&o.posting[key]!==a.manual[key].observedValue))){a.posting[key]=o.posting[key];delete a.manual[key];}
 if(o.sourceApplicationId)a.sourceApplicationId=o.sourceApplicationId;if(o.sourceJobId)a.posting.sourceJobId=o.sourceJobId;
 if(Array.isArray(o.preferences))a.preferences=clone(o.preferences);
 a.fingerprints.push(fp);a.lastObservedAt=o.observedAt;a.lastObservationId=o.id;
 const meaningful=x=>x&&JSON.stringify({posting:x.posting,state:x.state,preferences:x.preferences,appliedAt:x.appliedAt});
 if(before&&meaningful(before)===meaningful(a))return {state,result:{unchanged:true,applicationId:a.id,revision:a.revision}};
 a.updatedAt=o.observedAt;a.revision++;state.revision++;state.events.push({id:uid(),source:'official_site',applicationId:a.id,revision:a.revision,observationId:o.id,trigger:'observation',at:o.observedAt,before:before&&toView(before),after:toView(a)});
 return {state,result:{applicationId:a.id,revision:a.revision,changed:true}};
}
function command(state,c){if(!c?.operationId)throw Error('operationId required');if(state.operations[c.operationId])return {state,result:state.operations[c.operationId]};
 const a=state.applications.find(a=>a.id===c.applicationId);if(!a)throw Error('Application not found');
 if(a.revision!==c.baseRevision)return {state,result:{conflict:true,current:toView(a),command:clone(c)}};
 const before=toView(a),patch={...(c.patch||{})},now=Date.now(),source=c.source==='agent'?'agent':'manual';
 let restored; if(c.undoOf){const event=state.events.find(e=>e.operationId===c.undoOf&&e.applicationId===a.id);if(!event||event.revision!==a.revision||!event.before?.applicationState)throw Error('记录已变化，无法撤销此状态更新');restored=clone(event.before.applicationState);patch.status=event.before.status;}
 if(Object.keys(patch).length===1&&patch.status===statusLabel(a.state)&&!restored){const result={applicationId:a.id,revision:a.revision,unchanged:true};state.operations[c.operationId]=result;return {state,result};}
 for(const [k,v]of Object.entries(patch)){if(['company','role','location','url','category'].includes(k)){const field={role:'title',location:'city',category:'department'}[k]||k;a.manual[field]={revision:a.revision+1,observedValue:a.posting[field]};a.posting[field]=String(v);}else if(k==='status'){a.state=restored||stateFromRaw(v,v!=='计划投递');a.statusSource=source;a.statusUpdatedAt=now;a.manual.state={fingerprint:a.fingerprints.at(-1),observedRaw:a.lastOfficialStatusRaw??state.observations.find(o=>o.id===a.lastObservationId)?.status?.raw,revision:a.revision+1};}else if(['notes','summary','salary','deadline','interview','interviewNote','rating','review','channel','companyDeadline'].includes(k))a.user[k]=v;else if(k==='deleted')a.deleted=Boolean(v);}
 a.updatedAt=now;a.revision++;state.revision++;state.events.push({id:uid(),source,applicationId:a.id,revision:a.revision,trigger:source==='agent'?'agent':'user',at:now,operationId:c.operationId,before,after:toView(a)});const result={applicationId:a.id,revision:a.revision};state.operations[c.operationId]=result;return {state,result};}
const api={empty,migrate,observe,command,associate,stateFromRaw,statusLabel,toView,fingerprint,hash,viewStatuses,viewStages,viewStage,nextAction,statusActions,statusInfo,isActive};root.ApplicationCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
