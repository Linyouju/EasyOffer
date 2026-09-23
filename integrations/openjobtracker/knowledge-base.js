(function(root){
 'use strict';
 const PROFILE=new Set(['name','phone','email','gender','birthday','idCard','hometown','currentCity','address','school','major','degree','graduationYear','intro','expectedCity','expectedSalary','wechat','qq']);
 const GROUPS=new Set(['education','work','project','campus']);
 const KEYS=new Set(['name','role','description','school','major','degree','company','position','period']);
 const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'');
 function validate(items,text){
  if(!Array.isArray(items))throw Error('资料解析格式不正确');
  const seen=new Set();
  return items.slice(0,150).map(p=>{
   if(!p||typeof p!=='object')return p;
   const aliases={education:{name:'school'},work:{name:'company',role:'position'}};
   return {...p,key:aliases[p.group]?.[p.key]||p.key};
  }).filter(p=>{
   if(!p||typeof p.value!=='string'||!p.value.trim()||p.value.length>10000||typeof p.evidence!=='string'||!normalize(text).includes(normalize(p.evidence)))return false;
   // Import facts are verbatim; rewriting occurs only when answering a form field.
   if(!normalize(p.evidence).includes(normalize(p.value)))return false;
   if(p.group==='profile'){if(!PROFILE.has(p.key))return false;}
   else if(!GROUPS.has(p.group)||!KEYS.has(p.key)||typeof p.entity!=='string'||!normalize(text).includes(normalize(p.entity)))return false;
   const id=[p.group,p.entity||'',p.key].join('|');if(seen.has(id))return false;seen.add(id);return true;
  }).map(p=>({group:p.group,key:p.key,entity:p.group==='profile'?'':p.entity,value:p.value.trim(),evidence:p.evidence}));
 }
 function locate(data,p){if(p.group==='profile')return data.userProfile||{};const rows=data.experiences?.[p.group]||[];return rows.find(r=>[r.name,r.school,r.company].some(v=>v&&normalize(v)===normalize(p.entity)))||{};}
 function apply(data,proposals){
  const next=structuredClone({userProfile:data.userProfile||{},experiences:data.experiences||{},customFields:data.customFields||[]});
  for(const p of proposals){if(p.group==='profile'){next.userProfile[p.key]=p.value;continue;}
   const rows=next.experiences[p.group]??=[];
   let row=rows.find(r=>[r.name,r.school,r.company].some(v=>v&&normalize(v)===normalize(p.entity)));
   if(!row){const anchor=p.group==='education'?'school':p.group==='work'?'company':'name';row={[anchor]:p.entity};rows.push(row);}
   row[p.key]=p.value;
  }
  return next;
 }
 const api={validate,locate,apply};root.KnowledgeBase=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
