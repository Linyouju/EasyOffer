/* Authoritative workbook: keep every row; only confirmed, permitted facts enter autofill. */
(function(root){
'use strict';
const groupTypes={'03':'education','04':'work','05':'project','06':'campus','07':'award','08':'skill','09':'language','10':'research','11':'attachment','12':'answer','14':'rule'};
const aliases={
 '中文姓名':'name','手机号码':'phone','常用邮箱':'email','性别':'gender','出生日期':'birthday','最高学历':'degree',
 '学校中文全称':'school','学院或院系':'college','专业中文名称':'major','学历层次':'degree','专业方向':'specialization',
 '对外展示名称':'company','职位名称':'position','业务部门':'department','完整原始描述':'description',
 '项目名称':'name','项目全称':'name','担任角色':'role','项目角色':'role','本人角色':'role','项目链接':'url',
 '经历名称':'name','担任角色或职务':'role','职责描述':'description',
 '奖项或竞赛全称':'name','奖项等级':'level','获奖日期':'date','证件号码':'idCard',
 '获奖说明':'description','奖项说明':'description',
 '开始日期':'start','结束日期':'end'
};
// 「获奖说明」自 2.1 起按用户确认改为可自动填写；其余标签仍只作上下文，不进入可填字段。
const notesOnly=/^(教育经历补充|时间性质)$/;
function parse(XLSX, bytes, sourceName){
 const wb=XLSX.read(bytes,{type:'array',cellDates:false});const sheets=[];
 for(const name of wb.SheetNames){
  const sheet=wb.Sheets[name];const table=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true});
  if(name.startsWith('00')){sheets.push({name,guide:table});continue;}
  if(table[3]?.[0]!=='记录编号'||table[3]?.[1]!=='字段名称'||table[3]?.[2]!=='填写内容')throw Error('不是个人网申资料库模板：'+name);
  const rows=table.slice(4).flatMap((r,i)=>{
   if(!r[0]||!r[1])return [];
   const address='C'+(i+5),cell=sheet[address];let value=r[2];
   if(cell?.f)throw Error(name+'!'+address+' 含公式，请先将内容粘贴为文本或数值');
   if(typeof value==='number'&&/日期/.test(String(r[1]))){const d=XLSX.SSF.parse_date_code(value,{date1904:!!wb.Workbook?.WBProps?.date1904});if(!d)throw Error('日期无效：'+name+'!'+address);value=`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;}
   if(typeof value==='number'&&/号码|手机|证件|电话/.test(String(r[1]))&&!Number.isSafeInteger(value))throw Error('证件或号码精度已丢失，请在 Excel 中改为文本：'+name+'!'+address);
   return [{record:String(r[0]),label:String(r[1]),value:String(value??'').trim(),note:String(r[3]||''),status:String(r[4]||''),mode:String(r[5]||''),address}];
  });sheets.push({name,rows});
 }
 if(!sheets.some(s=>s.name.startsWith('01'))||!sheets.some(s=>s.name.startsWith('03')))throw Error('资料库缺少基础信息或教育经历工作表');
 return compile({sourceName,sheets});
}
function compile(input){
 const result={...input,schema:1,active:true,updatedAt:Date.now(),bank:[],userProfile:{},experiences:{education:[],work:[],project:[],campus:[]},customFields:[],stats:{sheets:input.sheets.length,rows:0,populated:0,confirmed:0,unconfirmed:0,manual:0,context:0}};
 const available=r=>r.value&&r.status==='已确认'&&['原样填写','可基于事实整理'].includes(r.mode);
 const add=(id,r,group,key)=>{result.bank.push({id,label:r.label,value:r.value,kind:/start|end|birthday|^date$/.test(key)?'date':r.mode==='可基于事实整理'?'longtext':'text',group,allowRewrite:r.mode==='可基于事实整理',source:{sheet:r.sheet,address:r.address,record:r.record}});};
 for(const sheet of input.sheets){
  if(!sheet.rows)continue;
  const groups=new Map();
  for(const row of sheet.rows){result.stats.rows++;if(row.value){result.stats.populated++;if(row.status==='已确认')result.stats.confirmed++;else result.stats.unconfirmed++;if(row.mode==='人工确认后填写')result.stats.manual++;}
   if(!groups.has(row.record))groups.set(row.record,[]);groups.get(row.record).push({...row,sheet:sheet.name});
  }
  const type=groupTypes[sheet.name.slice(0,2)];let index=0;
  for(const [record,rows] of groups){
   const facts=rows.filter(available);if(!facts.length)continue;
   const prefix=type?`${type}.${index}.`:'profile.';const group=sheet.name+' / '+record;const item={};const used=new Set();
   for(const [i,r] of facts.entries()){
    if(notesOnly.test(r.label)||type==='rule'){result.stats.context++;continue;}
    let key=aliases[r.label]||'field_'+record.replace(/-/g,'_')+'_'+rows.indexOf(r);
    if(used.has(key))key+='_'+i;used.add(key);
    add(prefix+key,r,group,key);item[key]=r.value;
   }
   const get=label=>facts.find(r=>r.label===label)?.value;
   if(type){
    for(const [key,p] of [['start','开始'],['end','结束']]){
     if(!item[key]){const y=get(p+'年份'),m=get(p+'月份');if(/^\d{4}$/.test(y||'')&&/^(?:[1-9]|1[0-2])$/.test(m||'')){const r={...facts.find(r=>r.label===p+'年份'),label:p+'时间',value:y+'-'+m.padStart(2,'0'),mode:'原样填写'};add(prefix+key,r,group,key);item[key]=r.value;}}
    }
    if(item.start&&item.end)item.period=item.start+' - '+item.end;
    if(!result.experiences[type])result.experiences[type]=[];
    result.experiences[type].push(item);index++;
   }else Object.assign(result.userProfile,item);
   if(!type&&get('籍贯省份')&&get('籍贯城市')){const r={...facts.find(r=>r.label==='籍贯城市'),label:'籍贯',value:get('籍贯省份')+get('籍贯城市')};add('profile.hometown',r,group,'hometown');result.userProfile.hometown=r.value;}
  }
 }
 if(new Set(result.bank.map(b=>b.id)).size!==result.bank.length)throw Error('资料编号重复，请检查工作表记录编号');
 for(const field of result.bank)field.recordId=field.source?.record||field.id.replace(/[^.]+$/,'');
 return result;
}
async function install(storage,library){
 const keys=['userProfile','experiences','customFields','knowledgeLibrary','knowledgeHistory'];const current=await storage.get(keys);
 const snapshot={savedAt:Date.now(),userProfile:current.userProfile||{},experiences:current.experiences||{},customFields:current.customFields||[],knowledgeLibrary:current.knowledgeLibrary||{}};
 await storage.set({userProfile:library.userProfile,experiences:library.experiences,customFields:[],knowledgeLibrary:{sourceName:library.sourceName,updatedAt:Date.now(),notes:'',authority:library},knowledgeHistory:[snapshot,...(current.knowledgeHistory||[])].slice(0,5)});
}
const api={parse,compile,install};root.WorkbookLibrary=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
