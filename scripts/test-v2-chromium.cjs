/* Real Chromium + configured model. Never run this against the user's active browser/profile.
   MODEL_CONFIG_FILE points to a private file (same shape as extension llmConfig).
   This runner fails rather than falling back to model mocks or jsdom. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'work/v2-live');fs.mkdirSync(artifacts,{recursive:true});
const {runtimeOptions,diagnose}=require('./browser-runtime.cjs');
const report={kind:'real-chromium-and-model',startedAt:new Date().toISOString(),passed:false,checks:[],metrics:[]};
let context,server,profile,phase='setup',secretForRedaction='';
(async()=>{
 const {chromium}=require('playwright');
 if(!process.env.MODEL_CONFIG_FILE)throw Error('MODEL_CONFIG_FILE is required; no fake model fallback is allowed');
 const config=JSON.parse(fs.readFileSync(process.env.MODEL_CONFIG_FILE,'utf8'));report.model=config.model;secretForRedaction=config.api_key||'';
 execFileSync(process.execPath,['scripts/build-extension.cjs'],{cwd:root,stdio:'pipe'});
 const base=path.join(root,'outputs/easyoffer-extension-v2'),testPackage=path.join(artifacts,'extension');fs.rmSync(testPackage,{recursive:true,force:true});fs.cpSync(base,testPackage,{recursive:true});
 report.build=JSON.parse(fs.readFileSync(path.join(base,'build-info.json')));
 const manifest=JSON.parse(fs.readFileSync(path.join(testPackage,'manifest.json')));manifest.host_permissions.push('http://127.0.0.1/*',new URL(config.base_url).origin+'/*');manifest.content_scripts[0].matches.push('http://127.0.0.1/*');fs.writeFileSync(path.join(testPackage,'manifest.json'),JSON.stringify(manifest,null,2));report.testManifestDifference='Adds local fixture and configured model host permissions only; production JavaScript unchanged.';
 server=http.createServer((req,res)=>{const name=req.url==='/status'?'status.html':req.url==='/practice-variant'?'practice-variant.html':'practice.html';res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,'tests/v2/fixtures',name)));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 profile=fs.mkdtempSync(path.join(artifacts,'profile-'));
 const launch=runtimeOptions(chromium,testPackage);report.browser={executablePath:launch.executablePath,headless:launch.headless,isolatedProfile:true};
 phase='launch';context=await chromium.launchPersistentContext(profile,launch);phase='flows';report.pageErrors=[];context.on('page',p=>p.on('pageerror',e=>report.pageErrors.push({url:p.url(),message:e.message})));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const {library,projects}=require('../tests/v2/data.cjs');
 await worker.evaluate(async ({config,library})=>{await chrome.storage.local.set({llmConfig:config,knowledgeLibrary:{authority:library},experiences:{},easyOfferV2:{autoSync:false}});},{config,library});
 const page=await context.newPage();await page.goto(origin+'/practice');
 // The production panel uses a closed shadow root. Locate its real button via
 // Chromium's DOM inspection, then issue a trusted mouse click; do not open the root.
 const panelClick=async id=>{const cdp=await context.newCDPSession(page);try{const {root}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});const visit=n=>{if(n.attributes?.some((a,i)=>i%2===0&&a==='id'&&n.attributes[i+1]===id))return n;for(const c of [...(n.children||[]),...(n.shadowRoots||[])]){const found=visit(c);if(found)return found;}};const node=visit(root);assert(node,'panel button missing: '+id);const {model}=await cdp.send('DOM.getBoxModel',{nodeId:node.nodeId});const q=model.content;await page.mouse.click((q[0]+q[4])/2,(q[1]+q[5])/2);}finally{await cdp.detach();}};
 const tabId=()=>worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url)?.id,page.url());
 const send=async message=>worker.evaluate(async({id,message})=>chrome.tabs.sendMessage(id,message),{id:await tabId(),message});
 await page.waitForTimeout(500);const started=await send({type:'START_APPLICATION_AGENT'});assert(started.ok,started.error);
 await page.locator('[name=name1]').waitFor();await page.waitForFunction(()=>document.querySelector('[name=name1]').value.length>0,{},{timeout:90000});
 await panelClick('stop');await page.reload();await page.waitForTimeout(500);await send({type:'START_APPLICATION_AGENT'});
 await page.waitForFunction(()=>document.querySelectorAll('article').length===2&&[...document.querySelectorAll('article input, article textarea')].every(e=>e.value),{},{timeout:180000});
 const values=await page.locator('article').evaluateAll(nodes=>nodes.map(n=>[...n.querySelectorAll('input,textarea')].map(e=>e.value)));
 for(let i=0;i<2;i++){assert.equal(values[i][0],projects[i].name);assert.equal(values[i][1],projects[i].role);assert.equal(values[i][2],projects[i].start);assert.equal(values[i][3],projects[i].end);assert(values[i][4]!==values[i][5]);}
 assert.equal(await page.evaluate(()=>window.submissions),0);assert.equal(await page.locator('#terms').isChecked(),false);report.checks.push('live AI form: two records, dropdown, dates, descriptions, stop/reload/resume, no submission');
 await page.goto(origin+'/practice-variant');await page.waitForTimeout(500);await send({type:'START_APPLICATION_AGENT'});
 await page.waitForFunction(()=>document.querySelectorAll('article').length===2&&[...document.querySelectorAll('article input, article textarea')].every(e=>e.value),{},{timeout:180000});
 for(let i=1;i<=2;i++)for(const key of ['name','role','start','end'])assert.equal(await page.locator(`[name=${key}${i}]`).inputValue(),projects[i-1][key]);
 report.checks.push('live AI unseen form variant: changed explanation, labels and date order, no production aliases');
 await page.goto(origin+'/status');await page.waitForTimeout(500);
 const first=await send({type:'EASY_V2_SYNC_PAGE'});assert(first.ok,first.error);const before=await worker.evaluate(async()=>easyRepo.snapshot());assert.equal(before.applications.length,1);assert.equal(before.applications[0].state.raw,'简历评估');const id=before.applications[0].id;
 await page.evaluate(()=>{document.querySelector('#current').textContent='筛选中';document.querySelector('#job-title').textContent='2027届产品设计师';document.querySelector('#city').textContent='北京';});
 const second=await send({type:'EASY_V2_SYNC_PAGE'});assert(second.ok);const updated=await worker.evaluate(async()=>easyRepo.snapshot());assert.equal(updated.applications.length,1);assert.equal(updated.applications[0].id,id);assert.equal(updated.applications[0].state.raw,'筛选中');assert.notEqual(updated.applications[0].state.stage,'offer');
 await send({type:'EASY_V2_SYNC_PAGE'});const repeated=await worker.evaluate(async()=>easyRepo.snapshot());assert.equal(repeated.events.length,updated.events.length);report.checks.push('live AI status: same application ID, changed title/city/state, repeat idempotency, no future Offer');
 // Intercept the real workbench origin in this isolated context only. Never write to the live website.
 const deskOrigin='https://autumn-career-desk-qpc.linyouju.chatgpt.site';
 await context.route(deskOrigin+'/**',async route=>{const pathname=decodeURIComponent(new URL(route.request().url()).pathname),file=path.join(root,'dist',pathname==='/'?'index.html':pathname);if(!file.startsWith(path.join(root,'dist')+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});const contentType=file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html';return route.fulfill({status:200,contentType,body:fs.readFileSync(file)});});
 const desk=await context.newPage();await desk.goto(deskOrigin);await desk.getByText('插件已连接 · 工作台已确认版本',{exact:false}).waitFor({timeout:15000});
 const acknowledged=await worker.evaluate(async()=>easyRepo.snapshot());assert.equal(acknowledged.deliveries.desk[id],acknowledged.applications[0].revision);report.checks.push('real extension -> isolated workbench view -> persisted revision ACK');
 await desk.getByRole('tab',{name:/^已投递/}).click();
 await desk.getByRole('button',{name:'推进到笔试',exact:true}).click();
 await desk.waitForFunction(({id,revision})=>EasyOfferDesk.pending().length===0&&JSON.parse(localStorage.getItem('offerly-career-v1')||'[]').some(r=>r.applicationId===id&&r.revision>revision&&r.status==='笔试')&&document.querySelector('#extension-status').textContent.includes('已确认版本'),{id,revision:acknowledged.applications[0].revision});
 const edited=await worker.evaluate(async()=>easyRepo.snapshot()),editedApp=edited.applications.find(a=>a.id===id);assert.equal(edited.applications.filter(a=>a.sourceApplicationId==='APP-DEMO-1').length,1);assert.equal(editedApp.state.stage,'written');assert.equal(edited.deliveries.desk[id],editedApp.revision);report.checks.push('workbench UI action updates same application ID and authority revision');
 // Native File System Access and IndexedDB-backed handle, in the extension origin.
 const options=await context.newPage();await options.goto(worker.url().replace(/background.js$/,'options.html'));
 await options.evaluate(async()=>{const dir=await navigator.storage.getDirectory();const handle=await dir.getFileHandle('v2-test.xlsx',{create:true});const stream=await handle.createWritable();const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['保持原表']]),'旧数据');await stream.write(XLSX.write(wb,{type:'array',bookType:'xlsx'}));await stream.close();await ExcelStore.saveHandle(handle);});
 const exported=await worker.evaluate(async()=>easyExport());assert(!exported.pending,exported.error);report.checks.push('native file handle -> authority XLSX projection');
 const sheets=await options.evaluate(async()=>{const f=await (await ExcelStore.getHandle()).getFile();const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});return {old:XLSX.utils.sheet_to_json(wb.Sheets['旧数据'],{header:1}),rows:XLSX.utils.sheet_to_json(wb.Sheets['EasyOffer权威记录'])};});
 assert.deepEqual(sheets.old,[['保持原表']]);assert.equal(sheets.rows.length,edited.applications.filter(a=>!a.deleted).length);assert.equal(sheets.rows.filter(r=>r.applicationId===id).length,1);const exportedRow=sheets.rows.find(r=>r.applicationId===id);assert.equal(exportedRow['当前进度'],'笔试');assert.equal(exportedRow.revision,editedApp.revision);report.checks.push('XLSX readback matches workbench status, ID and revision, preserves existing worksheet');
 const persisted=await worker.evaluate(async()=>easyRepo.snapshot());report.metrics=persisted.metrics||[];assert(report.metrics.filter(m=>m.ok).length>=3);assert.deepEqual(report.pageErrors,[],'no uncaught browser page errors');
 await context.close();context=await chromium.launchPersistentContext(profile,launch);const restarted=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const afterRestart=await restarted.evaluate(async()=>easyRepo.snapshot());assert.equal(afterRestart.applications[0].id,id);assert.equal(afterRestart.applications[0].state.stage,'written');assert.deepEqual(afterRestart.deliveries,persisted.deliveries);assert.deepEqual(afterRestart.sessions,persisted.sessions);report.checks.push('real Chromium/worker restart preserves IndexedDB identity, sessions and delivery acknowledgments');report.passed=true;
})().catch(async error=>{report.error=error.message;report.failure=diagnose(error,phase);report.failedPhase=phase;process.exitCode=1;
 // Synthetic fixtures only; capture the visible failure and persisted plans, never configuration.
 if(context){report.pages=await Promise.all(context.pages().map(async p=>({url:p.url(),text:await p.locator('body').innerText().catch(()=>''),fields:await p.locator('input,textarea').evaluateAll(es=>es.filter(e=>e.type!=='password'&&!/api|key|model|base_url/.test(e.id)).map(e=>({name:e.name,value:e.value}))).catch(()=>[])})));const worker=context.serviceWorkers()[0];if(worker)report.diagnostics=await worker.evaluate(async()=>{const s=await easyRepo.snapshot();return {metrics:s.metrics,plans:s.planDiagnostics,sessions:s.sessions,applications:s.applications};}).catch(()=>null);}
}).finally(async()=>{await context?.close();if(profile)fs.rmSync(profile,{recursive:true,force:true});await new Promise(r=>server?server.close(r):r());report.finishedAt=new Date().toISOString();const serialized=JSON.stringify(report,null,2);fs.writeFileSync(path.join(artifacts,'result.json'),secretForRedaction?serialized.replaceAll(secretForRedaction,'[redacted]'):serialized);console.log(JSON.stringify({passed:report.passed,checks:report.checks,failure:report.failure,report:path.join(artifacts,'result.json')}));});
