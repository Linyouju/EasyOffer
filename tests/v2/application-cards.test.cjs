const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const P=require('../../integrations/openjobtracker/v2/semantic-planner'),C=require('../../integrations/openjobtracker/v2/application-core');
const html=fs.readFileSync('tests/v2/fixtures/application-cards.html','utf8');
function observe(html){const dom=new JSDOM(html,{url:'https://careers.example.test/applications',runScripts:'outside-only'});const w=dom.window;w.CSS={escape:s=>s};w.Element.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{}]};w.eval(fs.readFileSync('integrations/openjobtracker/v2/page-observer.js','utf8'));return {dom,page:w.PageObserver.observe()};}
(async()=>{
const {dom,page}=observe(html),cards=page.regions.filter(r=>r.role==='record-candidate');assert.equal(cards.length,2,'one observation region per complete card, not per timeline node');
const whole=page.evidence.find(e=>e.regionId===cards[1].id&&e.locator===cards[1].locator);assert(whole.fragments.some(f=>f.text==='界面研究员'));assert(whole.fragments.some(f=>f.text==='第 2 志愿'),'adjacent badge remains separate from title');
const titles=['界面研究员实习生','界面研究员'],raws=['流程终止','笔试中'],dates=['2026-02-03','2026-08-04'];
function model(p){return {applications:p.regions.filter(r=>r.role==='record-candidate').map((r,i)=>{const e=p.evidence.find(e=>e.regionId===r.id&&e.locator===r.locator);return {regionId:r.id,pageKind:'application',posting:{company:'岚川实验室',title:titles[i],season:i?'2027届校园招聘计划':'日常实习招聘计划'},status:{submitted:true,raw:raws[i],appliedAt:dates[i]},evidence:[{evidenceId:e.id,regionId:r.id,text:e.text,role:'application'},{evidenceId:'document-title',regionId:'page-identity',text:'岚川实验室',role:'identity'}]}})};}
const output=model(page),checked=P.validateApplications(output,page);assert.equal(checked.observations.length,2);assert.equal(checked.diagnostics.length,0);
assert(!page.evidence.filter(e=>e.regionId===cards[0].id).some(e=>e.text.includes('笔试中')),'sibling status cannot leak');
const scoped=P.validateApplications(output,page,{excludeInternships:true});assert.equal(scoped.observations.length,1);assert.equal(scoped.observations[0].posting.title,titles[1]);assert.equal(scoped.excluded.length,1);assert.equal(scoped.diagnostics.length,0);
assert(!P.applicationExcluded({title:'交互设计师'},'岗位要求：有实习经验优先',{excludeInternships:true}));
assert(P.applicationExcluded({title:'交互设计师'},'校招 - 实习',{excludeInternships:true}));
assert(!P.applicationExcluded({title:'交互设计师'},'校招 - 正式',{excludeInternships:true}));
const parent=page.regions.find(r=>cards[0].ancestorIds.includes(r.id)&&cards[1].ancestorIds.includes(r.id));const wrongScope=structuredClone(output);wrongScope.applications[0].regionId=parent.id;assert(P.validateApplications(wrongScope,page).diagnostics.some(d=>d.code==='MULTI_RECORD_SCOPE'));
const state=C.empty();for(const o of checked.observations)C.observe(state,o);const ids=state.applications.map(a=>a.id),events=state.events.length;for(const o of P.validateApplications(output,page).observations)C.observe(state,o);
assert.equal(state.applications.length,2);assert.deepEqual(state.applications.map(a=>a.id),ids);assert.equal(state.events.length,events);
assert.deepEqual(state.applications.map(a=>C.toView(a).status),['流程结束','笔试']);assert.deepEqual(state.applications.map(a=>a.appliedAt),dates);
const mixed=structuredClone(output);mixed.applications[0].status.raw='笔试中';assert.equal(P.validateApplications(mixed,page).observations.length,1);assert.equal(P.validateApplications(mixed,page).diagnostics[0].code,'UNSUPPORTED_STATUS');
const badTitle=structuredClone(output);badTitle.applications[1].posting.title=titles[0];assert.equal(P.validateApplications(badTitle,page).observations.length,1,'global company context cannot justify another job title');
const badCompany=structuredClone(output);badCompany.applications[1].posting.company='不存在的企业';assert(P.validateApplications(badCompany,page).diagnostics.some(d=>d.code==='UNSUPPORTED_COMPANY'));
const empty=P.validateApplications({applications:[]},page);assert.equal(empty.diagnostics[0].code,'EMPTY_APPLICATION_RESULT','recognized page evidence is not a no-records success');
let calls=0;global.ModelGateway={invoke:async req=>{calls++;return calls===1?badCompany:output;}};assert.equal((await P.plan('application',page,[],{},{})).observations.length,2);assert.equal(calls,2,'silent rejection now gets model feedback');
global.ModelGateway={invoke:async()=>({applications:[]})};assert((await P.plan('application',page,[],{},{})).diagnostics.length,'empty repaired output remains pending');
// Both new CSS names and no CSS classes must preserve the same card boundary.
for(const variant of [html.replaceAll(/class="[^"]*"/g,''),html.replaceAll('entry-h3','obscure-Q7')]){const x=observe(variant);assert.equal(x.page.regions.filter(r=>r.role==='record-candidate').length,2);assert.equal(P.validateApplications(model(x.page),x.page).observations.length,2);x.dom.window.close();}
const wrongDate=C.empty();C.observe(wrongDate,{...checked.observations[0],id:'different',status:{submitted:true,raw:'流程终止',appliedAt:'2026-02-16'}});assert.equal(wrongDate.applications[0].appliedAt,undefined,'end date cannot masquerade as application date');
dom.window.close();console.log('PASS application cards: anonymous div scopes, page company identity, separate internship/formal records, exact status/date, no cross-card leakage, bounded repair and visible pending');
})().catch(e=>{console.error(e);process.exitCode=1});
