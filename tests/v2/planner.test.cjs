const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),{bank}=require('./data.cjs');const P=require('../../integrations/openjobtracker/v2/semantic-planner');
const dom=new JSDOM(fs.readFileSync('tests/v2/fixtures/practice.html','utf8'),{url:'https://careers.example.test/form',runScripts:'dangerously',beforeParse(w){w.Element.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{width:100,height:20}];};w.CSS={escape:s=>s};}});const w=dom.window;
w.eval(fs.readFileSync('integrations/openjobtracker/v2/page-observer.js','utf8'));let page=w.PageObserver.observe();assert.equal(page.fields.filter(f=>!f.forbidden).length,6);assert.equal(page.fields.filter(f=>f.forbidden).length,1);const region=page.regions.find(r=>r.locator==='#record1');assert(region);
const sourceKeys=['name','role','start','end','description','description'];const block={regionId:region.id,recordId:'DEMO-PROJ-A',allowedTypes:['project'],evidence:[{regionId:region.id,text:'实践名称'}],fields:page.fields.filter(f=>f.regionId===region.id).map((f,i)=>({fieldId:f.id,sourceIds:['project.0.'+sourceKeys[i]],...(i===4?{quotes:['本人负责访谈整理与交互原型设计。'],adaptation:{type:'extract',evidence:[{regionId:region.id,text:'主要职责'}]}}:{})}))};
const plan=P.validateForm({blocks:[block]},page,bank,{});assert.equal(plan.fields.length,6);assert.equal(plan.owners['DEMO-PROJ-A'],'#record1');assert.equal(P.validateForm({blocks:[{...block,recordId:'missing'}]},page,bank,{}).fields.length,0);
const parent=page.regions.find(r=>region.ancestorIds.includes(r.id)&&r.text.includes('课程项目'));
assert(parent,'observer preserves the enclosing instructions');
const parentBlock={...block,evidence:[...block.evidence,{regionId:parent.id,text:'课程项目'}]};
assert.equal(P.validateForm({blocks:[parentBlock]},page,bank,{}).fields.length,6);
const exactQuoted=structuredClone(parentBlock);exactQuoted.fields[0].quotes=[bank.find(f=>f.id==='project.0.name').value];
assert.equal(P.validateForm({blocks:[exactQuoted]},page,bank,{}).fields.length,6,'an unchanged exact fact may carry its literal quote');
exactQuoted.fields[0].quotes=['编造名称'];assert.equal(P.validateForm({blocks:[exactQuoted]},page,bank,{}).fields.length,5);
const unrelated={id:'unrelated',locator:'#foreign',text:'课程项目'};
assert.equal(P.validateForm({blocks:[{...block,evidence:[...block.evidence,{regionId:'unrelated',text:'课程项目'}]}]},{...page,regions:[...page.regions,unrelated]},bank,{}).fields.length,0,'unrelated instructions cannot justify a record');
const bad=structuredClone(block);bad.fields[0].sourceIds=['project.1.name'];assert.equal(P.validateForm({blocks:[bad]},page,bank,{}).fields.length,5);
const competing=structuredClone(block);competing.recordId='DEMO-PROJ-B';competing.fields=competing.fields.slice(1).map(f=>({...f,sourceIds:f.sourceIds.map(id=>id.replace('project.0.','project.1.'))}));
const mixed=P.validateForm({blocks:[{...block,fields:[block.fields[0]]},competing]},page,bank,{});assert.equal(mixed.fields.length,1,'one region cannot mix partial plans from different records');assert.equal(mixed.diagnostics[0].code,'REGION_ALREADY_ASSIGNED');
const duplicate=P.validateForm({blocks:[block]},page,bank,{owners:{'DEMO-PROJ-A':'#another'}});assert.equal(duplicate.fields.length,0);
assert.equal(P.records([...bank].reverse()).find(r=>r.recordId==='DEMO-PROJ-A').fields.length,5);
const statePage={site:'https://careers.example.test',url:'https://careers.example.test/applications',observedAt:100,regions:[{id:'r1'}],evidence:[{id:'e1',regionId:'r1',text:'示例科技 产品设计师 已投递 简历评估',role:'current',sourceApplicationId:'APP-1'},{id:'future',regionId:'r1',text:'Offer',role:'future'}]};
const application={regionId:'r1',pageKind:'application',sourceApplicationId:'APP-1',posting:{company:'示例科技',title:'产品设计师'},status:{submitted:true,raw:'简历评估'},evidence:[{evidenceId:'e1',regionId:'r1',text:'示例科技 产品设计师 已投递 简历评估',role:'current'}]};assert.equal(P.validateApplications({applications:[application]},statePage).observations.length,1);assert.equal(P.validateApplications({applications:[{...application,sourceApplicationId:'invented'}]},statePage).observations.length,0);assert.equal(P.validateApplications({applications:[{...application,status:{submitted:true,raw:'Offer'}}]},statePage).observations.length,0);
dom.window.close();console.log('PASS planner/observer: unrecognized regions preserved, provenance, owners, stable records, protocol actions protected, invented IDs and future state rejected');

const withPreference={...statePage,evidence:[...statePage.evidence,{id:'child',regionId:'r1',preferenceId:'P1',text:'第一意向：体验设计部 等待评估',role:'unknown'}]};
const childAsParent={...application,status:{submitted:true,raw:'等待评估'},evidence:[...application.evidence,{evidenceId:'child',regionId:'r1',text:'第一意向：体验设计部 等待评估',role:'application'}]};
const refused=P.validateApplications({applications:[childAsParent]},withPreference);assert.equal(refused.observations.length,0);assert.equal(refused.diagnostics[0].code,'UNSUPPORTED_PARENT_STATUS');
let repairs=0;global.ModelGateway={invoke:async req=>{repairs++;if(repairs===1)return {applications:[childAsParent]};assert.equal(req.input.validationErrors[0].code,'UNSUPPORTED_PARENT_STATUS');return {applications:[application]};}};
P.plan('application',withPreference,[],{},{}).then(p=>{assert.equal(repairs,2);assert.equal(p.observations[0].status.raw,'简历评估');console.log('PASS state evidence conflict is repaired by bounded model feedback, not a guessed rule state');}).catch(e=>{console.error(e);process.exitCode=1;});

const legacy=bank.map(({recordId,source,...f})=>f);const reordered=legacy.map(f=>({...f,id:f.id.replace(/^project\.(\d+)\./,(_,i)=>'project.'+(1-Number(i))+'.')}));
assert.deepEqual(P.records(legacy).map(r=>r.recordId).sort(),P.records(reordered).map(r=>r.recordId).sort(),'legacy array reindexing preserves record identities');

const imported=bank.map(({recordId,source,...f})=>({...f,...(['start','end'].includes(f.id.split('.').at(-1))?{}:{source:{record:recordId}})}));
const importedRecords=P.records(imported);assert.equal(importedRecords.length,2,'confirmed date supplements retain the workbook record identity');assert(importedRecords.every(r=>r.fields.some(f=>f.id.endsWith('.start'))&&r.fields.some(f=>f.id.endsWith('.name'))));
assert.equal(P.records([...imported].reverse()).map(r=>r.recordId).sort().join(','),importedRecords.map(r=>r.recordId).sort().join(','),'field order cannot change recovered ownership');

const labelPage=structuredClone(page),labelRegion=labelPage.regions.find(r=>r.id===block.regionId);labelRegion.text='实践名称\n-\n至今\n本人角色\n主要职责';
assert.equal(P.validateForm({blocks:[{...block,evidence:[{regionId:block.regionId,text:'实践名称\n本人角色'}]}]},labelPage,bank,{}).fields.length,6,'separate quoted labels remain grounded in the same region');
assert.equal(P.validateForm({blocks:[{...block,evidence:[{regionId:block.regionId,text:'实践名称\n编造标签'}]}]},labelPage,bank,{}).fields.length,0,'missing quote cannot pass');
const narrative=structuredClone(block);narrative.fields[0].sourceIds=['project.0.description'];assert.equal(P.validateForm({blocks:[narrative]},page,bank,{}).fields.length,5,'narrative cannot fill a fact input');

// An empty AI block must not reserve a record ahead of the real target block.
const emptyRegion={...region,id:'empty',locator:'#empty',fieldIds:[]};
const emptyFirst=P.validateForm({blocks:[{...block,regionId:'empty',evidence:[{regionId:'empty',text:'实践名称'}],fields:[]},block]},{...page,regions:[emptyRegion,...page.regions]},bank,{});
assert.equal(emptyFirst.fields.length,6,'an empty proposal cannot consume a record');
const workBank=[{id:'work.0.company',recordId:'WORK',label:'公司名称',value:'示例企业',kind:'text'},{id:'work.0.employmentType',recordId:'WORK',label:'工作性质',value:'实习',kind:'text'}];
const workPage={regions:[{id:'work',locator:'#work',heading:'工作经历',text:'公司名称',fieldIds:['wf']},{id:'intern',locator:'#intern',heading:'实习经历',text:'公司名称',fieldIds:['if']}],fields:[{id:'wf',regionId:'work',locator:'#wf',label:'公司名称',type:'text',current:''},{id:'if',regionId:'intern',locator:'#if',label:'公司名称',type:'text',current:''}],actions:[]};
const makeWorkBlock=(regionId,fieldId)=>({regionId,recordId:'WORK',allowedTypes:['work'],evidence:[{regionId,text:'公司名称'}],fields:[{fieldId,sourceIds:['work.0.company']}]});
const workPlan=P.validateForm({blocks:[makeWorkBlock('work','wf'),makeWorkBlock('intern','if')]},workPage,workBank,{});
assert.equal(workPlan.fields.length,1);assert.equal(workPlan.fields[0].regionId,'intern','dedicated internship area owns internship records');assert.equal(workPlan.diagnostics[0].code,'USE_DEDICATED_INTERNSHIP_SECTION');
console.log('PASS imported supplements, scoped quote fragments, narrative guard, empty ownership and separate internship section');
