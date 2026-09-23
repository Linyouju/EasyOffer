/* One editable Profile. Bank and spreadsheets are projections, never other authorities. */
(function(root){'use strict';
const clone=x=>structuredClone(x),uid=()=>crypto.randomUUID();
const types=['profile','education','work','project','campus','award','skill','language','research','attachment','answer','certificate','rule','other'];
const labels={profile:'基本信息',education:'教育经历',work:'实习／工作经历',project:'项目经历',campus:'校园经历',award:'获奖经历',skill:'技能',language:'语言',research:'论文研究',attachment:'作品集',answer:'开放题',certificate:'证书',rule:'填写规则',other:'其他资料'};
const keys={'中文姓名':'name','手机号码':'phone','常用邮箱':'email','学校中文全称':'school','专业中文名称':'major','学历层次':'degree','对外展示名称':'company','公司名称':'company','职位名称':'position','完整原始描述':'description','项目描述':'description','职责描述':'description','项目名称':'name','担任角色':'role','项目角色':'role','开始日期':'start','结束日期':'end','获奖日期':'date','奖项或竞赛全称':'name','奖项等级':'level'};
const sheetTypes={'01':'profile','02':'profile','03':'education','04':'work','05':'project','06':'campus','07':'award','08':'skill','09':'language','10':'research','11':'attachment','12':'answer','14':'rule'};
const norm=x=>String(x||'').normalize('NFKC').replace(/\s/g,'');
function empty(){return {schema:1,id:uid(),revision:0,updatedAt:Date.now(),records:[],guides:[],history:[],operations:{},migrationWarnings:[]};}
function eligible(f){return !!String(f.value||'').trim()&&f.status==='已确认'&&['原样填写','可基于事实整理'].includes(f.mode);}
function field(patch){return {id:uid(),key:'',label:'',value:'',status:'已确认',mode:'原样填写',kind:'text',revision:1,...patch};}
function migrate(data,legacyBank=[]){
 const p=empty(),a=data.knowledgeLibrary?.authority;const bank=a?.active?a.bank||[]:legacyBank;
 const records=new Map(),slots=new Map();
 const record=(id,type)=>{const k=type+'|'+id;if(!records.has(k)){const r={id:id||uid(),type,revision:1,fields:[]};records.set(k,r);p.records.push(r);}return records.get(k);};
 if(a?.active)for(const s of a.sheets||[]){if(!s.rows){p.guides.push(clone(s));continue;}for(const row of s.rows){const candidates=[...new Set(bank.filter(b=>(b.recordId||b.source?.record)===row.record).map(b=>b.id.split('.')[0]).filter(t=>types.includes(t)))];const type=sheetTypes[s.name.slice(0,2)]||types.find(t=>labels[t]===s.name)||(candidates.length===1?candidates[0]:'other'),r=record(row.record,type),f=field({...clone(row),id:uid(),key:keys[row.label]||(/^[a-z][a-zA-Z]*$/.test(row.label)?row.label:''),source:{sheet:s.name,address:row.address,record:row.record}});r.fields.push(f);slots.set([s.name,row.record,row.address].join('|'),f);}}
 for(const b of bank){const type=types.includes(b.id.split('.')[0])?b.id.split('.')[0]:'other';const prefix=b.id.replace(/[^.]+$/,'');const identity=b.recordId||b.source?.record||bank.find(x=>x.id.startsWith(prefix)&&(x.recordId||x.source?.record))?.recordId||prefix;
 let r=record(identity,type),f=b.source?.sheet?slots.get([b.source.sheet,b.source.record,b.source.address].join('|')):null;
 if(f?.legacyId&&f.legacyId!==b.id)f=null;
 if(!f)f=r.fields.find(x=>x.key===b.id.split('.').at(-1)&&!x.legacyId);
 if(!f){f=field({label:b.label});r.fields.push(f);}
 if(f.value&&f.value!==b.value)p.migrationWarnings.push({fieldId:f.id,reason:'填写依据与旧展示值不同，保留生效值',previousValue:f.value});
 Object.assign(f,{key:b.id.split('.').at(-1),value:String(b.value),kind:b.kind||'text',status:'已确认',mode:b.allowRewrite?'可基于事实整理':'原样填写',legacyId:b.id,source:clone(b.source||f.source||{})});
 }
 // Record IDs from different sheets may collide; keep the original number as provenance.
 const seen=new Set();for(const r of p.records){if(seen.has(r.id)){r.legacyRecordId=r.id;r.id=uid();}seen.add(r.id);for(const f of r.fields)if(!f.key)f.key='field_'+f.id.replaceAll('-','');}
 p.revision=1;p.migratedAt=Date.now();return p;
}
function bank(p){return p.records.flatMap(r=>r.fields.filter(eligible).map(f=>({id:r.type+'.'+r.id.replace(/[^\w-]/g,'_')+'.'+f.key,fieldId:f.id,fieldRevision:f.revision,recordId:r.id,recordRevision:r.revision,label:f.label,value:f.value,kind:f.kind,group:labels[r.type]+' / '+r.id,allowRewrite:f.mode==='可基于事实整理',source:{...f.source,record:r.id},profileId:p.id})));}
function command(p,c){
 if(!c.operationId)throw Error('缺少操作编号');if(p.operations[c.operationId])return clone(p.operations[c.operationId]);
 const changes=c.changes||[];if(!Array.isArray(changes)||changes.length>5000)throw Error('更新数量无效');const next=clone(p),applied=[];
 for(const change of changes){let r=next.records.find(r=>r.id===change.recordId);if(change.addRecord){if(r)throw Error('记录已存在');if(!types.includes(change.addRecord.type))throw Error('记录类型无效');r={id:change.recordId||uid(),type:change.addRecord.type,revision:1,fields:[]};next.records.push(r);applied.push({recordId:r.id,createdRecord:true});}
 if(!r)throw Error('未找到目标经历，请重新选择');if(!change.fieldId&&!change.newField)continue;
 let f=r.fields.find(f=>f.id===change.fieldId);if(!f&&change.newField){f=field({...change.newField,id:change.fieldId||uid()});if(!f.label||!f.key)throw Error('缺少字段名称');r.fields.push(f);applied.push({recordId:r.id,fieldId:f.id,before:null,after:clone(f)});r.revision++;continue;}
 if(!f)throw Error('未找到字段');if(change.baseRevision!==f.revision||change.oldValue!==f.value)throw Error('资料已变更，请重新核对差异');
 const before=clone(f);for(const k of ['value','label','status','mode','kind'])if(change.patch&&Object.hasOwn(change.patch,k)){const v=change.patch[k];if(typeof v!=='string'||v.length>50000)throw Error('字段值无效');f[k]=v;}
 if(!['已确认','需核对','未确认'].includes(f.status)||!['原样填写','可基于事实整理','人工确认后填写'].includes(f.mode))throw Error('确认状态或填写规则无效');
 if(JSON.stringify(before)===JSON.stringify(f))continue;f.revision++;r.revision++;applied.push({recordId:r.id,fieldId:f.id,before,after:clone(f)});
 }
 if(applied.length){next.revision++;next.updatedAt=Date.now();next.history.push({operationId:c.operationId,at:next.updatedAt,changes:applied});}
 next.operations[c.operationId]={revision:next.revision,changed:applied.length};Object.assign(p,next);return clone(next.operations[c.operationId]);
}
function undo(p,id){const event=p.history.find(h=>h.operationId===id&&!h.undone);if(!event)throw Error('没有可撤销的更新');const next=clone(p);
 for(const c of [...event.changes].reverse()){const r=next.records.find(r=>r.id===c.recordId);if(!r)throw Error('经历已改变，无法撤销');if(c.createdRecord){if(r.fields.length)throw Error('新增经历已有后续编辑，不能删除');next.records=next.records.filter(x=>x!==r);continue;}const f=r.fields.find(f=>f.id===c.fieldId);if(!f||f.revision!==c.after.revision||f.value!==c.after.value)throw Error('字段已有后续修改，保留当前内容');if(c.before){Object.assign(f,clone(c.before),{revision:f.revision+1});}else r.fields=r.fields.filter(x=>x!==f);r.revision++;}
 next.history.find(h=>h.operationId===id).undone=true;next.revision++;next.updatedAt=Date.now();Object.assign(p,next);return {revision:p.revision};}
function lowerPrecision(oldValue,value){return /^\d{4}(?:-\d{2}){1,2}$/.test(oldValue)&&/^\d{4}(?:-\d{2}){0,1}$/.test(value)&&value.length<oldValue.length;}
function diff(current,incoming){const changes=[];for(const r of incoming.records){let target=current.records.find(x=>x.id===r.id);if(!target){const anchor=r.fields.find(f=>['name','company','school'].includes(f.key)&&f.value);const matches=anchor?current.records.filter(x=>x.type===r.type&&x.fields.some(f=>f.key===anchor.key&&norm(f.value)===norm(anchor.value))):[];if(matches.length===1)target=matches[0];else if(matches.length>1){changes.push({kind:'ambiguous',record:r,reason:'同名经历不唯一，请手动选择或修改'});continue;}}
 if(!target){changes.push({kind:'add-record',record:r,recordId:r.id,addRecord:{type:r.type}});for(const f of r.fields)changes.push({kind:'add-field',recordId:r.id,fieldId:f.id,newField:f});continue;}
 for(const f of r.fields){const old=target.fields.find(x=>x.id===f.id)||target.fields.find(x=>x.key===f.key&&x.label===f.label);if(!old){changes.push({kind:'add-field',recordId:target.id,fieldId:f.id,newField:f});continue;}if(!f.value||lowerPrecision(old.value,f.value))continue;const patch={};for(const k of ['value','status','mode'])if(f[k]!==old[k])patch[k]=f[k];if(Object.keys(patch).length)changes.push({kind:'update',recordId:target.id,fieldId:old.id,label:old.label,baseRevision:old.revision,oldValue:old.value,patch});}}
 return changes;}
function workbook(XLSX,p){const wb=XLSX.utils.book_new(),sheetMap=new Map();for(const s of p.guides||[])if(s.guide)XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(s.guide),s.name);
 const refs=[];for(const r of p.records)for(const f of r.fields){const name=f.source?.sheet||String(15+types.indexOf(r.type)).padStart(2,'0')+' '+labels[r.type];if(!sheetMap.has(name))sheetMap.set(name,[[labels[r.type]],[],[],['记录编号','字段名称','填写内容','备注','确认状态','填写规则']]);const rows=sheetMap.get(name);rows.push([r.id,f.label,f.value,f.note||'',f.status,f.mode]);refs.push({sheet:name,row:rows.length-1,recordId:r.id,type:r.type,fieldId:f.id,label:f.label,key:f.key,kind:f.kind});}
 if(!sheetMap.size){sheetMap.set('01 基本信息',[['基本信息'],[],[],['记录编号','字段名称','填写内容','备注','确认状态','填写规则'],['PERSON','中文姓名','','','已确认','原样填写']]);sheetMap.set('03 教育经历',[['教育经历'],[],[],['记录编号','字段名称','填写内容','备注','确认状态','填写规则']]);}
 for(const [name,rows]of sheetMap)XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name);
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['EasyOffer Profile 1'],[JSON.stringify({id:p.id,refs})]]),'_EasyOffer');return wb;}
function readWorkbook(XLSX,bytes,name){const wb=XLSX.read(bytes,{type:'array'});if(!wb.Sheets._EasyOffer)return migrate({knowledgeLibrary:{authority:WorkbookLibrary.parse(XLSX,bytes,name)}});
 const meta=JSON.parse(wb.Sheets._EasyOffer.A2?.v||'{}');if(!Array.isArray(meta.refs))throw Error('资料模板元数据无效');const p=empty();p.id=meta.id||p.id;const records=new Map();for(const sn of wb.SheetNames){if(sn==='_EasyOffer')continue;const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:true});if(rows[3]?.[0]!=='记录编号'){p.guides.push({name:sn,guide:rows});continue;}
 for(let i=4;i<rows.length;i++){const [recordId,label,raw,note,status,mode]=rows[i];if(!recordId||!label)continue;const ref=meta.refs.find(x=>x.sheet===sn&&x.recordId===String(recordId)&&x.label===String(label))||meta.refs.find(x=>x.sheet===sn&&x.recordId===String(recordId)&&x.fieldId&&x.key===keys[label]);if(wb.Sheets[sn]['C'+(i+1)]?.f)throw Error('资料不能包含公式');const type=ref?.type||sheetTypes[sn.slice(0,2)]||'other';if(!records.has(String(recordId))){const r={id:String(recordId),type,revision:1,fields:[]};records.set(r.id,r);p.records.push(r);}let value=String(raw??'');if(typeof raw==='number'&&/日期/.test(String(label))){const d=XLSX.SSF.parse_date_code(raw,{date1904:!!wb.Workbook?.WBProps?.date1904});if(d)value=[d.y,String(d.m).padStart(2,'0'),String(d.d).padStart(2,'0')].join('-');}records.get(String(recordId)).fields.push(field({id:ref?.fieldId||uid(),key:ref?.key||keys[label]||uid().replaceAll('-',''),label:String(label),value,note:String(note||''),status:status||'需核对',mode:mode||'人工确认后填写',kind:ref?.kind||(/日期/.test(label)?'date':'text'),source:{sheet:sn,address:'C'+(i+1),record:String(recordId)}}));}}
 return p;}
root.ProfileCore={empty,migrate,bank,command,undo,diff,workbook,readWorkbook,eligible,lowerPrecision,types,labels,field};if(typeof module!=='undefined')module.exports=root.ProfileCore;
})(globalThis);
