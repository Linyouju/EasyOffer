/* Runs tests/browser/*.html fixtures against the CURRENT extension source in a real DOM (jsdom).
   Fixtures stub window.chrome themselves and load integrations/openjobtracker/*.js by relative path,
   so this exercises the same DOM-traversal code paths the extension uses on a招聘 page. */
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');

const ROOT=process.env.FIXTURE_ROOT||path.resolve(__dirname,'..');
const DIR=path.join(ROOT,'tests/browser');
const only=process.argv.slice(2);
const observations=new Set(['agent.html','missing-fields.html']);

function patch(window){
  // jsdom has no layout engine; real pages give these elements non-empty rects.
  const proto=window.Element.prototype;
  proto.getClientRects=function(){return [{width:120,height:24}];};
  proto.getBoundingClientRect=function(){return {x:0,y:0,width:120,height:24,top:0,left:0,right:120,bottom:24};};
  Object.defineProperty(proto,'offsetParent',{configurable:true,get(){return this.parentElement||window.document.body;}});
  Object.defineProperty(proto,'offsetWidth',{configurable:true,get(){return 120;}});
  Object.defineProperty(proto,'offsetHeight',{configurable:true,get(){return 24;}});
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function run(file){
  const html=fs.readFileSync(path.join(DIR,file),'utf8');
  const vc=new VirtualConsole();
  const jsdomErrors=[];
  vc.on('jsdomError',e=>jsdomErrors.push(e.message));
  const dom=new JSDOM(html,{
    url:'file://'+path.join(DIR,file),
    runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,
    beforeParse:patch,
  });
  const {window}=dom;
  const doc=window.document;

  // Wait for external extension scripts to finish loading.
  for(let i=0;i<200&&!window.OJTFormCore;i++)await sleep(25);
  if(!window.OJTFormCore){dom.window.close();return {file,error:'extension scripts did not load'};}

  const button=doc.querySelector('button#start')||doc.querySelector('button#run')||doc.querySelector('#start')||doc.querySelector('#run');
  if(!button){dom.window.close();return {file,error:'no start/run button'};}
  const out=doc.querySelector('#audit')||doc.querySelector('#result');
  button.click();

  // Wait until the audit area reports a verdict, or it stops changing.
  let last='', stable=0;
  for(let i=0;i<(observations.has(file)?320:1600);i++){
    await sleep(25);
    const now=out?out.textContent:'';
    if(/PASS|FAIL/.test(now)){stable=now===last?stable+1:0;last=now;if(stable>=20)break;continue;}
    if(now!==last&&now!=='待运行'&&now!=='待检查'&&now!==''){last=now;}
  }
  // give the agent a moment to settle after the last write
  for(let i=0;i<80&&!/PASS|FAIL/.test(out?out.textContent:'');i++)await sleep(25);
  await sleep(100);
  const text=(out?out.textContent:'').trim();
  dom.window.close();
  return {file,text,jsdomErrors};
}

(async()=>{
  const files=(only.length?only:fs.readdirSync(DIR).filter(f=>f.endsWith('.html')&&f!=='compact-cards.html')).sort();
  let pass=0,fail=0,skip=0,observed=0;
  const lines=[];
  for(const f of files){
    let r;
    try{r=await run(f);}catch(e){r={file:f,error:String(e&&e.message||e)};}
    if(r.error){lines.push(`\n== ${r.file} ==\n  ERROR ${r.error}`);skip++;continue;}
    const rows=r.text.split('\n').filter(l=>/^(PASS|FAIL)\s/.test(l));
    if(!rows.length){lines.push(`\n== ${r.file} ==\n  NO VERDICT: ${r.text.slice(0,300).replace(/\n/g,' / ')}`);if(observations.has(r.file))observed++;else skip++;continue;}
    lines.push(`\n== ${r.file} ==`);
    for(const row of rows){lines.push('  '+row);row.startsWith('PASS')?pass++:fail++;}
    if(r.jsdomErrors.length)skip++;
    if(r.jsdomErrors.length)lines.push('  [jsdom] '+[...new Set(r.jsdomErrors)].slice(0,3).join(' | '));
  }
  console.log(lines.join('\n'));
  console.log(`\nTOTAL PASS=${pass} FAIL=${fail} UNRESOLVED_FIXTURES=${skip} OBSERVATIONAL=${observed}`);
  if(fail||skip)process.exitCode=1;
})();
