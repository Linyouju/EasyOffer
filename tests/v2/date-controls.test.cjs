const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const scripts=['ui-icons.js','job-validator.js','semantic-mapper.js','content.js','v2/page-observer.js'];
async function exercise(){
 const C=globalThis.OJTFormCore,el=id=>document.getElementById(id),rows=[];
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 for(const [id,source,expected] of [['full','2026-08-26','2026-08-26'],['year','2026-08-26','2026'],['ym','2026-08-26','2026-08'],['slash','2026-08-26','2026/08/26'],['nativeDay','2026-08-26','2026-08-26'],['nativeMonth','2026-08-26','2026-08'],['sy','2026-08-26','2026年'],['sm','2026-08-26','08月'],['sd','2026-08-26','26日'],['enMonth','2026-08-26','August']]){
  const element=el(id);check(await C.writeMappedField(element,{id:'award.0.date',kind:'date',value:source},false,true),'write '+id);
  const shown=element.tagName==='SELECT'?element.selectedOptions[0].textContent:C.displayedControlValue(element);
  check(shown===expected,`${id} expected ${expected}, got ${shown}`);check(C.dateControlMatches(element,source),'verified precision '+id);rows.push(id);
 }
 for(const [id,value] of [['noMonth','2026'],['noDay','2026-08'],['reject','2026-08-26'],['existing','2026-08-26']]){check(!await C.writeMappedField(el(id),{id:'award.0.date',kind:'date',value},false,true),'must reject '+id);}
 check(el('existing').value==='2024-01-08','preserve user date');
 let page=PageObserver.observe();const ends=page.fields.filter(f=>f.type==='date-control');check(ends.length===2,'both visible endpoints observed');check(!page.fields.some(f=>document.querySelector(f.locator)?.matches('[class*=date-picker-period-hidden-input]')),'keyboard proxy is not a date field');
 for(const [id,date] of [['begin','2025-04-02'],['end','2026-08-26']]){check(await C.writeMappedField(el(id),{id:'project.0.'+(id==='begin'?'start':'end'),kind:'date',value:date},false,true),'period '+id);check(C.dateControlMatches(el(id),date),'period readback '+id);}
 page=PageObserver.observe();check(page.fields.find(f=>f.locator==='#begin').dateEdge==='start','start identity');check(page.fields.find(f=>f.locator==='#end').dateEdge==='end','end identity');
 const original='原始内容\n\n\n·  保留项目事实和原有标点。'.repeat(140);
 check(await C.writeMappedField(el('original'),{id:'project.0.description',kind:'longtext',value:original,preserveOriginal:true},false,true),'original write');check(el('original').value===original,'no implicit 2000-character truncation or whitespace rewriting');
 check(saved===0&&submitted===0,'no save or submit');return {checks:rows.length+9,dates:rows,begin:C.displayedControlValue(el('begin')),end:C.displayedControlValue(el('end'))};
}
(async()=>{
 const html=fs.readFileSync('tests/v2/fixtures/date-controls.html','utf8');let result;
 const setup=w=>{w=w||globalThis;w.chrome={runtime:{onMessage:{addListener:()=>{},removeListener:()=>{}}},storage:{local:{get:async()=>({})}}};};
 if(process.env.DATE_CHROMIUM){const {chromium}=require('playwright');const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.setContent(html);await page.evaluate(setup);for(const f of scripts)await page.addScriptTag({path:'integrations/openjobtracker/'+f});result=await page.evaluate(exercise);}finally{await browser.close();}}
 else{const dom=new JSDOM(html,{url:'https://forms.example.test',runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){setup(w);w.CSS={escape:s=>s};w.Element.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{width:100,height:20}];};w.Element.prototype.getBoundingClientRect=()=>({width:100,height:20,top:0,left:0,bottom:20,right:100});w.Element.prototype.scrollIntoView=()=>{};}});try{for(const f of scripts)dom.window.eval(fs.readFileSync('integrations/openjobtracker/'+f,'utf8'));result=await dom.window.eval('('+exercise.toString()+')()');}finally{dom.window.close();}}
 assert.equal(result.begin,'2025-04');assert.equal(result.end,'2026-08');console.log((process.env.DATE_CHROMIUM?'CHROMIUM':'JSDOM')+' PASS date compatibility matrix '+JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
