const assert=require('node:assert/strict');
global.SemanticMapper=require('../integrations/openjobtracker/semantic-mapper.js');
global.CSS={escape:s=>s};
global.InputEvent=class extends Event{};
class Input{
 constructor(label,type='text'){this.label=label;this.type=type;this.tagName='INPUT';this.value='';this.style={};this.offsetParent={};this.disabled=false;this.className='';this.id='';this.name='';this.placeholder='';this.readOnly=false;this.isConnected=true;
  const node={textContent:label,children:[]};
  this.parentElement={getAttribute:()=>null,parentElement:null,previousElementSibling:null,querySelector:s=>s.includes('label')?node:null,querySelectorAll:()=>[this],className:''};
 }
 getAttribute(key){return key==='type'?this.type:null}
 closest(s){return s.includes('.form-item')?this.parentElement:null}
 dispatchEvent(e){(this.events??=[]).push(e.type);return true} focus(){} blur(){} getClientRects(){return [{}]}
}
class Textarea extends Input {constructor(label){super(label);this.tagName='TEXTAREA'}}
class Rich extends Input{constructor(label){super(label);this.tagName='DIV';this.isContentEditable=true;this.textContent=''}get innerText(){return this.textContent}}
global.HTMLTextAreaElement=Textarea;global.HTMLInputElement=Input;global.window={HTMLInputElement:Input,HTMLTextAreaElement:Textarea};global.document={querySelector:()=>null,querySelectorAll:()=>[],body:{innerText:'已完成项目'}};
const {fillExperience,setNativeValue,pendingProjects,fillExactProjectFields}=require('../integrations/openjobtracker/content.js');
(async()=>{
 const fields=[new Input('项目名称'),new Input('项目角色'),new Input('项目链接'),new Input('项目开始时间','month'),new Input('项目结束时间','month'),new Rich('项目描述'),new Rich('项目业绩（选填）')];
 const count=await fillExperience('project',[{name:'待填项目',role:'交互设计',period:'2026.05 - 2026.09',description:'第一段\n第二段'}],fields);
 assert.equal(count,5);assert.equal(fields[0].value,'待填项目');assert.equal(fields[1].value,'交互设计');assert.equal(fields[2].value,'');assert.equal(fields[3].value,'2026-05');assert.equal(fields[4].value,'2026-09');assert.equal(fields[5].textContent,'第一段\n第二段');assert.equal(fields[6].textContent,'');assert(fields[5].events.includes('input'));
 assert.equal(await fillExperience('project',[{name:'错误覆盖',role:'覆盖',description:'覆盖'}],fields),0);
 const separated=[new Input('项目名称'),new Textarea('项目职责'),new Textarea('项目描述')];
 assert.equal(await fillExperience('project',[{name:'科大讯飞',role:'UX设计',description:'详细项目描述'}],separated),3);
 assert.equal(separated[1].value,'UX设计');assert.equal(separated[2].value,'详细项目描述');
 assert.equal(setNativeValue(fields[5],'覆盖'),false);
 assert.deepEqual(pendingProjects([{name:'已完成项目'},{name:'下一段项目'}]),[{name:'下一段项目'}]);
 const exact=[new Rich('项目描述'),new Rich('项目业绩（选填）')];
 exact.forEach(el=>el.parentElement.className='editor-with-dropdown-toolbar');
 assert.equal(await fillExactProjectFields(exact,[{description:'项目概述原文\n· 项目落地：与产品研发共同推进方案实现。'}]),2);
 assert.equal(exact[0].textContent,'项目概述原文\n· 项目落地：与产品研发共同推进方案实现。');
 assert.equal(exact[1].textContent,'· 项目落地：与产品研发共同推进方案实现。');
 assert.equal(await fillExactProjectFields(exact,[{description:'不应覆盖'}]),0);
 const draft=new Rich('项目描述');draft.textContent='b端项目';
 assert.equal(await fillExactProjectFields([draft],[{name:'搜狗输入法｜B端皮肤编辑器',description:'完整描述，包含项目背景和设计流程。'}]),1);
 assert.equal(draft.textContent,'完整描述，包含项目背景和设计流程。');
 draft.textContent='这是我修改后的正式描述';
 assert.equal(await fillExactProjectFields([draft],[{name:'搜狗输入法｜B端皮肤编辑器',description:'不得覆盖正式描述'}]),0);
 console.log('PASS: project name/role/link/date/rich-text routing, empty achievement preserved, no overwrite, next project selection');
})().catch(e=>{console.error(e);process.exitCode=1});

{
 const {parseDateParts,matchesDate,fillSelect}=require('../integrations/openjobtracker/content.js');
 assert(!matchesDate('2026-05-01',parseDateParts('2026-05-26')),'wrong day must fail');
 assert(!matchesDate('2026-06',parseDateParts('2026-02')),'year digits cannot match month');
 assert(matchesDate('2026年5月26日',parseDateParts('2026-05-26')));
 assert(matchesDate('2026.05',parseDateParts('2026-05')));
 assert(!matchesDate('2026-05',parseDateParts('2026-05-26')));
 assert.equal(parseDateParts('2026-02-30'),null);
 assert.equal(setNativeValue(new Input('结束日期','date'),'2026-05'),false,'never invent a day');

 // 原生 <select> 的匹配规则（2026-09-22 统一，与自定义下拉共用 pickOption）：
 //   完全相等 → 收紧的互相包含（前缀或后缀，且长度差 ≤3 字），两者都要求唯一命中。
 // 从前这里「只认一字不差」，导致「竞赛」对不上「竞赛获奖」这类只差一两字的选项白白放弃。
 const stubSelect=(pairs)=>({options:pairs.map(([textContent,value])=>({textContent,value})),value:'',dispatchEvent(){return true}});
 const textOf=sel=>{const hit=sel.options.find(o=>o.value===sel.value);return hit?hit.textContent:''};

 // 前缀匹配：「本科生」→「本科」只差 1 字，应当填上
 const prefix=stubSelect([['本科','b'],['全日制本科','f']]);
 assert.equal(fillSelect(prefix,'本科生'),true,'prefix match must select');
 assert.equal(textOf(prefix),'本科');

 // 完全相等优先：「硕士」同时是「硕士研究生」的前缀，但精确项必须胜出
 const exact=stubSelect([['硕士','m'],['硕士研究生','mm']]);
 assert.equal(fillSelect(exact,'硕士'),true);
 assert.equal(textOf(exact),'硕士');

 // 真歧义：两个候选都只差 2 字，无从判断 —— 宁可不选
 const ambiguous=stubSelect([['竞赛获奖','a'],['竞赛奖项','b']]);
 assert.equal(fillSelect(ambiguous,'竞赛'),false,'ambiguous loose match must not select');

 // 既非前缀也非后缀：目标很长、选项极短，宽松的 includes 会误中「设计」，收紧后必须拒绝
 const far=stubSelect([['设计','d']]);
 assert.equal(fillSelect(far,'全国高校数字艺术设计大赛'),false,'short option inside long target must not match');
}
