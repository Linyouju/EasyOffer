(function(root){'use strict';
const controls='input:not([type=hidden]):not([type=password]):not([type=file]):not([type=submit]):not([type=button]),textarea,select,[contenteditable=true],[role=combobox]';
const visible=e=>Boolean(e.getClientRects().length)&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'&&!e.closest('[hidden],[aria-hidden=true],#ojt-application-agent,[data-easyoffer-ui]');
const text=e=>{if(!e)return '';if(typeof e.innerText==='string')return e.innerText.trim();const copy=e.cloneNode(true);copy.querySelectorAll?.('script,style,noscript,[hidden],[aria-hidden=true],#ojt-application-agent,[data-easyoffer-ui]').forEach(n=>n.remove());return String(copy.textContent||'').trim();};
function path(e){if(e===document.body)return 'body';if(e===document.documentElement)return 'html';if(e.id)return '#'+CSS.escape(e.id);const parts=[];for(let n=e;n&&n!==document.body;n=n.parentElement){const tag=n.tagName.toLowerCase(),siblings=[...n.parentElement.children].filter(x=>x.tagName===n.tagName);parts.unshift(tag+':nth-of-type('+(siblings.indexOf(n)+1)+')');}return 'body>'+parts.join('>');}
const hash=s=>{let n=0;for(const c of s)n=(n*31+c.charCodeAt(0))|0;return(n>>>0).toString(36);};
const value=e=>['checkbox','radio'].includes(e.type)?(e.checked?(e.value||'true'):''):(root.OJTFormCore?root.OJTFormCore.displayedControlValue(e):e.value||'');
function observe(){const regions=[],fields=[],evidence=[],actions=[];const map=new Map();
 const endpoints=root.OJTFormCore?.periodEndpoints()||[];
 const selector=controls+', [class*=date-picker-period-month-label]';
 const all=[...document.querySelectorAll(controls),...endpoints].filter(e=>!e.matches('[class*=date-picker-period-hidden-input]')).filter(visible).filter(e=>!e.disabled).filter((e,_,a)=>!a.some(x=>x!==e&&e.contains(x)));
 function heading(n){return [...n.children].find(c=>!c.querySelector(selector)&&c.matches('legend,h1,h2,h3,h4,h5,[class*=title i],[class*=heading i]'));}
 function fieldUnit(e){for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){if(heading(p))return p;if(p.matches('fieldset,article,form,section,[data-record]'))break;}return e;}
 function logicalCount(n){return new Set(all.filter(e=>n.contains(e)).map(fieldUnit)).size;}
 function addRegion(n){const locator=path(n);if(!map.has(locator)){const h=heading(n);const r={id:'r'+hash(locator),locator,heading:text(h||n.querySelector('legend,h1,h2,h3,h4')),text:text(n).slice(0,5000),role:n.closest('nav,aside')?'navigation':'unknown',fieldIds:[]};map.set(locator,r);regions.push(r);}return map.get(locator);}
 function region(e){let n=e.closest('fieldset,article,[data-record],[data-application-id],[data-job-id],[class*=record],[class*=card]');if(!n){
   const unit=fieldUnit(e);
   // A split date (year/month/end/ongoing) is one field, never an experience.
   if(unit!==e){n=unit.parentElement;while(n&&n!==document.body&&logicalCount(n)<2&&!heading(n))n=n.parentElement;}
   else for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const cs=all.filter(x=>p.contains(x));const compound=cs.every(x=>root.OJTFormCore?.dateSegment(x)||x.type==='checkbox');if(cs.length>=3&&!compound){n=p;break;}}
 }return addRegion(n||e.closest('form,section,main')||document.body);}
 for(const el of all){const r=region(el),locator=path(el),unit=fieldUnit(el),part=root.OJTFormCore?.dateSegment(el);let label=root.OJTFormCore?.getFieldDescriptor(el)||el.labels?.[0]?.textContent||el.getAttribute('aria-label')||el.placeholder||'';
 const rowLabel=unit!==el?text(heading(unit)):'';
 const endpoint=endpoints.includes(el),dateGroup=part||endpoint?path(unit!==el?unit:el.parentElement):undefined;
 let dateEdge;
 if(endpoint){const siblings=endpoints.filter(e=>e.parentElement===el.parentElement);dateEdge=siblings.indexOf(el)===0?'start':'end';label=[rowLabel,dateEdge==='start'?'开始日期':'结束日期'].filter(Boolean).join(' ');}
 if(part){const siblings=[...unit.querySelectorAll(controls)].filter(x=>root.OJTFormCore?.dateSegment(x)===part);dateEdge=siblings.length===2?(siblings.indexOf(el)===0?'start':'end'):undefined;label=[rowLabel,dateEdge==='start'?'开始':dateEdge==='end'?'结束':'',part==='year'?'年':part==='month'?'月':'日'].filter(Boolean).join(' ');}
 const f={id:'f'+hash(locator),regionId:r.id,locator,label,section:root.OJTFormCore?.formSection(el)||'',type:endpoint?'date-control':el.isContentEditable?'contenteditable':el.type||el.getAttribute('role')||el.tagName.toLowerCase(),current:value(el),optionControl:Boolean(root.OJTFormCore?.isSelectLike(el)||el.tagName==='SELECT'||el.getAttribute('role')==='combobox'||el.getAttribute('aria-haspopup')==='listbox'||el.closest('[role=combobox],[class*=select i]')),datePart:part||undefined,dateEdge,dateGroup,datePrecision:endpoint?'month':root.OJTFormCore?.dateTargetPrecision(el,''),placeholder:el.placeholder||'',required:el.required,maxLength:el.maxLength>0?el.maxLength:null,options:el.tagName==='SELECT'?[...el.options].map(o=>({text:o.textContent,value:o.value})):[],forbidden:/协议|同意|授权|隐私|验证码|签名|captcha|password/i.test(label)};fields.push(f);r.fieldIds.push(f.id);}
 // Surrounding captions are evidence for the model, not a hard-coded section type.
 for(const r of [...regions]){let n=document.querySelector(r.locator)?.parentElement;for(let depth=0;n&&n!==document.body&&depth<5;n=n.parentElement,depth++){if(heading(n))addRegion(n);}}

 // Content-only repeated siblings are observation scopes, not a site selector list.
 // Keep title/metadata/timeline together even when the page uses generic divs.
 const candidates=[];
 for(const parent of document.body.querySelectorAll('*')){
  if(parent.closest('nav,header,aside,footer,#ojt-application-agent,[data-easyoffer-ui]'))continue;
  const groups=new Map();
  for(const child of parent.children){
   if(!visible(child)||!child.matches('div,li,article,section,[role=listitem]')||child.querySelector(controls))continue;
   const raw=text(child);if(raw.length<30||raw.length>8000||child.children.length<2)continue;
   const signature=child.tagName+':'+[...child.children].map(n=>n.tagName).join(',');
   const group=groups.get(signature)||[];group.push(child);groups.set(signature,group);
  }
  for(const group of groups.values())if(group.length>=2&&new Set(group.map(text)).size>1)candidates.push(...group);
 }
 const recordNodes=[...new Set(candidates)].filter(n=>!candidates.some(p=>p!==n&&p.contains(n))).slice(0,80);
 for(const n of recordNodes){const r=addRegion(n);r.role='record-candidate';evidence.push({id:'e'+hash(path(n)),regionId:r.id,locator:path(n),role:'unknown',text:text(n),sourceApplicationId:n.getAttribute('data-application-id')||'',sourceJobId:n.getAttribute('data-job-id')||''});}
 const titleText=String(document.title||'').trim();
 if(titleText){const id='page-identity';regions.push({id,locator:'head>title',heading:titleText,text:titleText,role:'page-identity',fieldIds:[],ancestorIds:[]});evidence.push({id:'document-title',regionId:id,locator:'head>title',role:'identity',scope:'page-identity',text:titleText});}
 for(const el of [...document.querySelectorAll('nav,header,main,section,article,[data-application-id],[data-job-id],[class*=card],[class*=step],[class*=status],[aria-current],[data-state],[data-preference-id],h1,h2,h3')].filter(visible)){
 const locator=path(el),record=recordNodes.find(n=>n.contains(el)),r=record?addRegion(record):region(el),raw=text(el);if(!raw||raw.length>12000)continue;const role=el.closest('nav,header,aside')?'navigation':el.matches('[aria-current=step],[data-state=active],.active,.current')?'current':el.matches('[data-state=future],[aria-disabled=true],.future')?'future':'unknown';
 if(evidence.some(e=>e.id==='e'+hash(locator)))continue;
 evidence.push({id:'e'+hash(locator),regionId:r.id,locator,role,text:raw,sourceApplicationId:el.getAttribute('data-application-id')||'',sourceJobId:el.getAttribute('data-job-id')||'',preferenceId:el.closest('[data-preference-id]')?.getAttribute('data-preference-id')||'',attributes:{class:el.className,ariaCurrent:el.getAttribute('aria-current'),dataState:el.getAttribute('data-state')}});
 }
 // Offer content scopes independently of repetition or site class names. The model
 // selects the record boundary; repeated siblings above are only grouping hints.
 let contentBudget=45000,contentCount=0,contentTruncated=false;
 const seenContent=new Set(evidence.map(e=>e.text));
 const contentNodes=[...document.body.querySelectorAll('div,section,article,main,li,ul,ol,tr,td,dl,dd,p,h1,h2,h3,h4,a')].reverse();
 for(const n of contentNodes){
  if(!visible(n)||n.closest('nav,header,aside,footer,#ojt-application-agent,[data-easyoffer-ui]')||n.querySelector(controls))continue;
  const raw=text(n);if(!raw||raw.length>5000||seenContent.has(raw))continue;
  if(contentCount>=120||raw.length>contentBudget){contentTruncated=true;continue;}
  const r=addRegion(n),id='e'+hash(path(n));
  if(!evidence.some(e=>e.id===id))evidence.push({id,regionId:r.id,locator:path(n),role:'unknown',text:raw,sourceApplicationId:n.getAttribute('data-application-id')||'',sourceJobId:n.getAttribute('data-job-id')||''});
  seenContent.add(raw);contentCount++;contentBudget-=raw.length;
 }
 for(const el of [...document.querySelectorAll('button,[role=button],a')].filter(visible)){const label=text(el);if(!label||label.length>60)continue;actions.push({id:'a'+hash(path(el)),locator:path(el),label,forbidden:/提交|投递|申请|同意|授权|删除|撤回|保存|submit|apply|accept|delete/i.test(label),regionId:region(el).id});}
 // Keep adjacent labels distinguishable (e.g. job title versus preference badge).
 for(const e of evidence){const n=document.querySelector(e.locator);if(!n)continue;e.fragments=[...n.querySelectorAll('*')].filter(x=>!x.children.length&&visible(x)&&!x.matches('script,style,input,textarea')).map(x=>({tag:x.tagName.toLowerCase(),text:text(x)})).filter(x=>x.text&&x.text.length<=200).slice(0,32);}
 // Preserve DOM ancestry so help text on a surrounding section can support a child record.
 for(const r of regions){const node=document.querySelector(r.locator);r.ancestorIds=regions.filter(p=>p!==r&&p.role!=='navigation'&&document.querySelector(p.locator)?.contains(node)).map(p=>p.id);}
 // JobPosting is evidence of an opportunity, never evidence that the user applied.
 // Parse data only. Do not run scripts or inherit external selectors/company dictionaries.
 const plain=value=>typeof value==='string'?value.slice(0,6000):'';
 for(const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0,20)){
  if(script.textContent.length>200000)continue;
  let queue;try{queue=[JSON.parse(script.textContent)];}catch{continue;}
  let visited=0,index=0;
  while(queue.length&&visited++<100){
   const data=queue.shift();if(Array.isArray(data)){queue.push(...data);continue;}if(!data||typeof data!=='object')continue;
   if(Array.isArray(data['@graph']))queue.push(...data['@graph']);
   if(![data['@type']].flat().some(t=>t==='JobPosting'||t==='https://schema.org/JobPosting'))continue;
   const title=plain(data.title),company=plain(typeof data.hiringOrganization==='string'?data.hiringOrganization:data.hiringOrganization?.name);
   if(!title||!company)continue;
   const locator=path(script),id='j'+hash(locator+':'+index++),sourceJobId=plain(typeof data.identifier==='string'?data.identifier:data.identifier?.value);
   const fields={company,title,sourceJobId,description:plain(data.description),location:data.jobLocation,datePosted:plain(data.datePosted),url:plain(data.url)};
   const raw=JSON.stringify(fields).slice(0,10000);
   regions.push({id,locator,role:'job-detail',heading:title,text:raw,fieldIds:[],ancestorIds:[],structured:true});
   evidence.push({id:'e'+id,regionId:id,locator,role:'identity',text:raw,sourceJobId,structuredType:'JobPosting'});
  }
 }
 const snapshot={schema:2,coverage:{contentTruncated},url:location.href,site:location.origin,title:document.title,regions,fields,evidence,actions,observedAt:Date.now()};snapshot.fingerprint=hash(JSON.stringify({regions,fields,evidence,actions}));return snapshot;
}
function readRegion(id){const s=observe(),r=s.regions.find(r=>r.id===id);return r?{...r,fields:s.fields.filter(f=>f.regionId===id),evidence:s.evidence.filter(e=>e.regionId===id)}:null;}
async function readOptions(fieldId){const f=observe().fields.find(f=>f.id===fieldId);if(!f||f.forbidden||!f.optionControl)return [];const el=document.querySelector(f.locator);if(el.tagName==='SELECT')return f.options;el.click();await new Promise(r=>setTimeout(r,200));return (root.OJTFormCore?.selectedOptions(el)||[...document.querySelectorAll('[role=option],[class*=option],li')].filter(visible)).map(e=>({text:text(e)})).filter(x=>x.text&&x.text.length<200).slice(0,80);}
root.PageObserver={observe,readRegion,readOptions,path,value,visible};if(typeof module!=='undefined')module.exports=root.PageObserver;
})(globalThis);
