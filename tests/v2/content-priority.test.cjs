const assert=require('node:assert/strict'),P=require('../../integrations/openjobtracker/v2/semantic-planner');
const full='背景：改进预约服务。\n· 职责：本人完成访谈、流程分析与原型设计。\n· 成果：交付可交互原型。';
const bank=[
 {id:'project.0.description',recordId:'P',label:'完整原始描述',value:full,kind:'longtext',allowRewrite:true},
 {id:'project.0.duties',recordId:'P',label:'本人职责',value:'本人完成访谈、流程分析与原型设计。',kind:'longtext',allowRewrite:true},
 {id:'project.0.name',recordId:'P',label:'项目名称',value:'预约设计',kind:'text'},
 {id:'project.0.role',recordId:'P',label:'项目角色',value:'UX设计',kind:'text'}
];
function plan(label,mapping,extra={},sources=bank,help=''){
 const field={id:'f',regionId:'r',locator:'#f',label,type:'textarea',current:'',...extra};
 const region={id:'r',locator:'#r',text:label+'\n'+help,fieldIds:['f']};
 return P.validateForm({blocks:[{regionId:'r',recordId:'P',allowedTypes:['project'],evidence:[{regionId:'r',text:label}],fields:[{fieldId:'f',...mapping}]}]},{fields:[field],regions:[region],actions:[]},sources,{});
}
for(const label of ['项目描述','实践内容','描述','工作职责']){
 const p=plan(label,{sourceIds:['project.0.duties'],quotes:['本人完成访谈、流程分析与原型设计。']});
 assert.equal(p.fields[0].value,full,'a summary source must not replace the complete existing description');
 assert.deepEqual(p.fields[0].sourceIds,['project.0.description']);assert(p.fields[0].source.preserveOriginal);
}
assert.equal(plan('你在这段实践中做了什么',{meaning:'description',sourceIds:['project.0.description']}).fields[0].value,full,'AI semantic mapping supports unfamiliar labels without rewriting');
assert.equal(plan('本人职责',{sourceIds:['project.0.description'],quotes:['职责：本人完成访谈、流程分析与原型设计。']}).fields[0].value,bank[1].value,'existing dedicated responsibility is preferred to extracting from the whole description');
const onlyDescription=bank.filter(f=>f.id.endsWith('description'));
const extract=plan('主要职责',{sourceIds:['project.0.description'],quotes:['本人完成访谈、流程分析与原型设计。'],adaptation:{type:'extract',evidence:[{regionId:'r',text:'主要职责'}]}},{},onlyDescription);
assert.equal(extract.fields[0].contentMode,'adapt');assert.equal(extract.fields[0].value,bank[1].value);
const short=plan('项目描述',{sourceIds:['project.0.description'],quotes:['改进预约服务。','交付可交互原型。'],adaptation:{type:'limit'}},{maxLength:25});
assert.equal(short.fields[0].value,'改进预约服务。\n交付可交互原型。');
assert.equal(plan('项目描述',{sourceIds:['project.0.description']},{maxLength:25}).diagnostics[0].code,'CONTENT_LENGTH_LIMIT');
assert.equal(plan('项目成果',{sourceIds:['project.0.description'],quotes:['提升转化率30%'],adaptation:{type:'extract',evidence:[{regionId:'r',text:'项目成果'}]}}).fields.length,0,'missing facts are not fabricated');
const combined=plan('请综合介绍项目名称、角色和成果',{meaning:'overview',sourceIds:['project.0.name','project.0.role','project.0.description'],quotes:['预约设计','UX设计','交付可交互原型。'],adaptation:{type:'merge',evidence:[{regionId:'r',text:'请综合介绍项目名称、角色和成果'}]}});
assert.equal(combined.fields[0].value,'预约设计\nUX设计\n交付可交互原型。');
assert.equal(plan('项目描述',{sourceIds:['project.0.description'],quotes:['改进预约服务。'],adaptation:{type:'extract',evidence:[{regionId:'r',text:'项目描述'}]}}).fields[0].value,full,'ordinary description does not authorize gratuitous shortening');
const split=plan('实践内容',{sourceIds:['project.0.description'],quotes:['背景：改进预约服务。','成果：交付可交互原型。'],adaptation:{type:'split',evidence:[{regionId:'r',text:'实践内容只写背景与成果，职责另填'}]}},{},bank,'实践内容只写背景与成果，职责另填');
assert.equal(split.fields[0].value,'背景：改进预约服务。\n成果：交付可交互原型。');
const contextualExtract=plan('实践内容',{sourceIds:['project.0.description'],quotes:['背景：改进预约服务。','成果：交付可交互原型。'],adaptation:{type:'extract',evidence:[{regionId:'r',text:'实践内容只写背景与成果，职责另填'}]}},{},bank,'实践内容只写背景与成果，职责另填');assert.equal(contextualExtract.fields[0].value,split.fields[0].value,'contextual split may be expressed as extraction');
assert.equal(plan('公司名称',{sourceIds:['project.0.name'],quotes:['预约']},{type:'text'}).fields.length,0,'exact facts cannot be shortened');
assert.equal(plan('描述',{sourceIds:['project.1.description']}).fields.length,0,'record boundaries remain strict');
console.log('PASS content priority: original, renamed labels, dedicated fields, extraction, split, merge, bounded compression and no invented facts');
