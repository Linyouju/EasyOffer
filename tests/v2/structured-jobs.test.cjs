const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const P=require('../../integrations/openjobtracker/v2/semantic-planner');
const dom=new JSDOM('<main><h1>Hi!</h1></main><script type="application/ld+json">invalid</script><script type="application/ld+json"></script>',{url:'https://careers.example.test/job',runScripts:'outside-only'}),w=dom.window;
w.CSS={escape:x=>x};w.Element.prototype.getClientRects=()=>[{}];
w.document.querySelectorAll('script')[1].textContent=JSON.stringify({'@graph':[
 {'@type':'Organization',name:'Ignored'},
 {'@type':'JobPosting',title:'产品设计师',hiringOrganization:{name:'示例科技'},identifier:{value:'JOB-001'},datePosted:'2026-01-01'},
 {'@type':['Thing','JobPosting'],title:'研究员',hiringOrganization:{name:'第二家公司'},identifier:'JOB-002'}
]});
w.eval(fs.readFileSync('integrations/openjobtracker/v2/page-observer.js','utf8'));
const page=w.PageObserver.observe(),jobs=page.evidence.filter(e=>e.structuredType==='JobPosting');assert.equal(jobs.length,2);assert.notEqual(jobs[0].regionId,jobs[1].regionId);
const e=jobs[0],application={regionId:e.regionId,pageKind:'detail',sourceJobId:'JOB-001',posting:{company:'示例科技',title:'产品设计师'},status:{submitted:false},evidence:[{evidenceId:e.id,regionId:e.regionId,text:e.text,role:'identity'}]};
assert.equal(P.validateApplications({applications:[application]},page).observations.length,1);
assert.equal(P.validateApplications({applications:[{...application,pageKind:'application',status:{submitted:true}}]},page).observations.length,0,'JobPosting cannot prove submission');
assert.equal(P.validateApplications({applications:[{...application,posting:{company:'第二家公司',title:'产品设计师'}}]},page).observations.length,0,'JSON-LD items cannot be mixed');
dom.window.close();console.log('PASS structured jobs: malformed JSON isolated, graph and array types, separate posting provenance, no invented application');
