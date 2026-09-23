// Execute the shipped HTML and its actual script order, not a hand-ordered module list.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,requestInterceptor,VirtualConsole}=require('jsdom');
const origin='https://autumn-career-desk-qpc.linyouju.chatgpt.site';
const resources={interceptors:[requestInterceptor(request=>{const u=new URL(request.url),p=path.resolve('dist','.'+u.pathname);return u.origin===origin&&p.startsWith(path.resolve('dist')+path.sep)&&fs.existsSync(p)?new Response(fs.readFileSync(p),{headers:{'Content-Type':p.endsWith('.js')?'application/javascript':'text/css'}}):new Response('',{status:404});})]};
(async()=>{const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:origin,runScripts:'dangerously',resources,pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){w.structuredClone=structuredClone;}});
 try{await new Promise(r=>dom.window.addEventListener('load',r,{once:true}));assert.deepEqual(errors,[]);assert(dom.window.ApplicationCore);assert(dom.window.EasyOfferDesk);assert(dom.window.document.querySelector('#stats').children.length>0,'shipped page initializes statistics');assert(dom.window.document.querySelector('#view').children.length>0,'shipped page renders records');console.log('PASS shipped workbench HTML: dependency order, initial render and desk bridge initialized');}finally{dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
