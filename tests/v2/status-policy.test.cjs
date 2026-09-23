const assert=require('node:assert/strict');
const C=require('../../integrations/openjobtracker/v2/application-core');
global.ApplicationCore=C;global.XLSX=require('../../vendor/sheetjs/xlsx.full.min');
const E=require('../../integrations/openjobtracker/v2/excel-export');
const state=C.empty();
C.migrate(state,[{id:'old',company:'示例科技',role:'产品设计师',status:'已投递',url:'https://careers.example.test/job'}],'import');
const a=state.applications[0],id=a.id;
for(const [raw,label,active]of [['录用评估','已投递',true],['无反馈','已投递',true],['已撤回','已撤回',false],['流程结束','流程结束',false],['已录用','Offer',false],['面试未通过','未通过',false]]){
 C.command(state,{applicationId:id,baseRevision:a.revision,operationId:raw,patch:{status:raw}});
 const row=C.toView(a),sheet=E.workbook(state).Sheets['EasyOffer权威记录'];
 assert.equal(a.id,id);assert.equal(row.status,label);assert.equal(sheet.F2.v,label);assert.equal(sheet.G2.v,raw);assert.equal(C.isActive(a.state),active);
 if(!active)assert.equal(C.nextAction(row),null);
}
assert.deepEqual(C.nextAction({status:'已投递'}),{label:'推进到笔试',status:'笔试'});
assert.equal(C.nextAction({status:'面试中'}).status,'Offer');
console.log('PASS shared status policy: identical desk/export labels, raw status retained, no-feedback is not terminal, closed/withdrawn do not advance');
