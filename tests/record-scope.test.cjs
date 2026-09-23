const assert=require('node:assert/strict');
const M=require('../integrations/openjobtracker/semantic-mapper.js');
const bank=[{id:'education.0.school',value:'研究生大学'},{id:'education.0.lab',value:'研究生实验室',label:'实验室'},{id:'education.1.school',value:'本科学校'},{id:'work.0.company',value:'甲公司'},{id:'work.1.company',value:'乙公司（乙）'}];
const row=(type,block,anchor,current='',label='')=>({recordType:type,blockKey:block,anchor,current,label});
const rows=[row('education','b',false,'','开始日期'),row('education','b',true,'本科学校'),row('education','b',false,'','实验室'),row('education','m',true,'研究生大学'),row('education','m',false,'','实验室'),row('work','w1',true,'乙公司'),row('work','w2',true,'')];
M.bindRecordGroups(rows,bank);
assert.equal(rows[0].prefix,'education.1.','fields before school bind to same record');assert.equal(rows[2].prefix,'education.1.');assert.equal(rows[4].prefix,'education.0.');assert.equal(rows[5].prefix,'work.1.');assert.equal(rows[6].prefix,'work.0.','blank record uses remaining identity');
assert(!M.compatible(rows[2],bank[1]),'graduate lab cannot enter bachelor block even at confidence 1');
assert.equal(M.validateMappings([{fieldId:'lab',sourceId:'education.0.lab',confidence:1}],[{...rows[2],id:'lab'}],bank,.92).length,0);
const unknown=[row('education','x',true,'未知学校'),row('education','x',false,'','实验室'),row('education',null,false,'','实验室')];M.bindRecordGroups(unknown,bank);assert(unknown.every(r=>r.scopeUnknown));assert(!M.compatible(unknown[1],bank[1]));
console.log('PASS identity-first whole records, reversed order, date-before-name, blank allocation, unknown identity and hard cross-record rejection');

const existing=[row('work','empty',true),row('work','known',true,'乙公司'),row('work','known',false,'已手动修改的职责','职责描述')];M.bindRecordGroups(existing,bank);assert.equal(existing[0].prefix,'work.0.');assert.equal(existing[2].current,'已手动修改的职责');
const duplicate=[row('work','a',true,'甲公司'),row('work','b',true,'甲公司'),row('work','c',true)];M.bindRecordGroups(duplicate,bank);assert(duplicate[1].scopeUnknown);assert.equal(duplicate[2].prefix,'work.1.');
const renamed=[row('work','a',true,'可能已改名的已有公司'),row('work','b',true)];M.bindRecordGroups(renamed,bank);assert(renamed.every(r=>r.scopeUnknown),'unresolved existing identity must not cause duplicate allocation');
const collapsed=[row('work','blank',true)];M.bindRecordGroups(collapsed,bank,['work.0.']);assert.equal(collapsed[0].prefix,'work.1.');

// A clearly different competition year must not block remaining known awards.
{ const bank=[{id:'award.0.name',value:'2026 全国设计大赛'},{id:'award.1.name',value:'2026 省设计大赛'}];
 const rows=[{recordType:'award',blockKey:'a',anchor:true,current:'2025 全国设计大赛'}, {recordType:'award',blockKey:'b',anchor:true,current:''}];
 M.bindRecordGroups(rows,bank);assert.equal(rows[1].prefix,'award.0.');
 rows[0].current='2026 全国设计大赛 三等奖';M.bindRecordGroups(rows,bank);assert.equal(rows[1].scopeUnknown,true);
}

const flat=[{label:'开始日期'},{label:'结束日期'},{label:'公司名称',anchor:true,current:'乙公司'},{label:'描述'},{label:'开始日期'},{label:'结束日期'},{label:'公司名称',anchor:true,current:'甲公司'},{label:'描述'}];
assert(M.partitionFlatRecords(flat,'shared','work','实习经历'));
assert.equal(flat[0].blockKey,flat[3].blockKey);assert.notEqual(flat[3].blockKey,flat[4].blockKey);
assert.equal(flat[4].blockKey,flat[7].blockKey);
{const bank=[{id:'project.0.name',value:'科大讯飞AI精准学动力系统'},{id:'project.1.name',value:'搜狗商业化'},{id:'work.0.company',value:'宝马（BMW）'},{id:'work.0.start',value:'2024-07-08'},{id:'work.0.end',value:'2024-11-20'}];
const rows=[row('project','old',true,'宝马(BMW) | 出发前场景下的备车交互体验优化'),row('project','old',false,'2024-07','开始日期'),row('project','old',false,'2024-11','结束日期'),row('project','known',true,'科大讯飞学习机｜学习动机提升模块设计（校企合作项目）'),row('project','new',true)];
M.bindRecordGroups(rows,bank);assert.equal(rows[3].prefix,'project.0.');assert.equal(rows[4].prefix,'project.1.');assert(rows[0].scopeUnknown,'work-derived project remains untouched');}
{const bank=[{id:'education.0.school',value:'研究生大学'},{id:'education.0.start',value:'2024-09-01'},{id:'education.0.end',value:'2027-06-30'},{id:'education.0.major',value:'设计学'}];const rows=[row('education','x',true),row('education','x',false,'2024-09','开始日期'),row('education','x',false,'2027-06','结束日期'),row('education','x',false,'设计学','专业')];M.bindRecordGroups(rows,bank);assert(rows.every(r=>r.prefix==='education.0.'));rows[2].current='2026-06';M.bindRecordGroups(rows,bank);assert(rows.every(r=>r.scopeUnknown),'conflicting dates do not guess identity');}
