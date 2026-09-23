/* Browser adapter. Uses existing tested control writers, with independent mapping checks. */
(()=>{
 if(!globalThis.OJTFormCore||!globalThis.ApplicationAgent)return;
 if(globalThis.__ojtAgentVersion==='5.0.3')return;
 globalThis.__ojtAgentStop?.();
 document.querySelectorAll('#ojt-application-agent').forEach(el=>el.remove());
 globalThis.__ojtAgentVersion='5.0.3';
 if(globalThis.__ojtAgentListener)chrome.runtime.onMessage.removeListener(globalThis.__ojtAgentListener);
 const core=globalThis.OJTFormCore,mapper=globalThis.SemanticMapper;
 const visible=el=>el.isConnected&&!el.disabled&&(el.getClientRects().length>0)&&getComputedStyle(el).visibility!=='hidden';
 const norm=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
 const value=el=>{
  if(!el?.isConnected)return '';
  if(el.tagName==='SELECT')return el.value?String(el.selectedOptions?.[0]?.textContent||el.value).trim():'';
  const select=el.closest('.ant-select,.el-select,.brick-select');
  const selected=select?.querySelector('.ant-select-selection-item,.ant-select-selection-selected-value,.el-select__selected-item:not(.is-placeholder)');
  if(selected?.textContent.trim())return selected.textContent.trim();
  return String(el.isContentEditable?el.innerText:core.displayedControlValue(el)).trim();
 };
 const descriptor=el=>{
   const label=core.getFieldDescriptor(el).replace(/[＊*：:]/g,'').trim();
   if(/起止时间|起止日期|任职时间/.test(label)){for(let p=el.parentElement,d=0;p&&d<7;p=p.parentElement,d++){const pair=[...p.querySelectorAll('input:not([type=hidden])')];if(pair.length>2)break;if(pair.length===2&&pair.includes(el))return '起止时间 '+(pair.indexOf(el)===0?'开始日期':'结束日期');}}
   if(/起止|时间|日期/.test(label)&&/开始|起始|结束/.test(el.placeholder||'')&&!label.includes(el.placeholder))return label+' '+el.placeholder;
   return label;
 };
 const kind=s=>/教育|学历|学习经历/.test(s)?'education':/校园|学生干部|社团|在校职务|校内任职/.test(s)?'campus':/项目/.test(s)?'project':/工作|实习/.test(s)?'work':/竞赛|获奖|荣誉/.test(s)?'award':/语言|外语|英语/.test(s)?'language':/证书|资格/.test(s)?'certificate':/技能|计算机能力/.test(s)?'skill':/论文|研究成果|学术成果/.test(s)?'research':'';
 let runner,host,reportRoot,data,bank,latestRows=[],batchErrors=[],starting=false;
 globalThis.__ojtAgentStop=()=>runner?.stop();
 function section(el){return core.formSection(el);}
 // ============ 面板呈现层 ============
 // 只负责视觉与面板内交互，不参与任何填写判定；runner 的状态机与消息文案原样消费。
 // 令牌沿用 shadcn/ui 的语义化命名与半径派生，动效沿用 animate-ui 的入场/状态过渡约定。
 // 注意：等待 AI 时 report() 每秒都会被调用，所以所有更新都走"仅在内容变化时"分支，
 // 否则动画会每秒重放一次，反而像卡顿。
 let collapsed=false,showDetail=false,missingEntries=[],phase=0;
 let seenPhase=-1,seenMissingKey='',seenStatus='';
 const PHASES=['识别表单','AI 分析','填写字段','检查结果'];
 const PHASE_ARC=[.12,.37,.62,.87];
 const RING_R=19,RING_C=2*Math.PI*RING_R;
 const STATUS_TITLE={idle:'准备就绪',running:'正在为你填写当前页面',paused:'已暂停',blocked:'需要你补充内容',done:'本页填写完成',stopped:'已停止'};
// 业务侧的未填原因前缀很长且每条重复，这里只做「缩略」呈现，原文仍保留在「查看未填原因」里。
const REASON_SHORT={'未填写（当前经历无资料或未可靠匹配）':'资料库里没有对应内容','必填项未填写':'必填项，需要你手动填写','未能确认填写成功':'没填上，需要你手动确认','未识别独立经历区块':'没识别成独立的一段经历','资料库没有剩余的同类经历':'资料库里没有更多同类经历了','请手动检查选择项':'单选/多选题，需要你手动勾选','请核对学历':'需要你核对一下'};
// 这些原因的「：」后面跟的是「值」而不是字段名，不能拿去当标题（否则标题会变成"本科"）。
const VALUE_REASONS=new Set(['请核对学历']);
 const PANEL_CSS=`*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}
.panel{--radius:12px;--radius-sm:calc(var(--radius)*.6);--radius-md:calc(var(--radius)*.8);--radius-lg:var(--radius);--radius-xl:calc(var(--radius)*1.4);--radius-2xl:calc(var(--radius)*1.8);--background:#fbfbfc;--foreground:#1d1d1f;--card:#fff;--card-foreground:#1d1d1f;--popover:#fff;--popover-foreground:#1d1d1f;--muted:#f5f5f7;--muted-foreground:#6e6e73;--subtle-foreground:#96969b;--accent:#f0f0f3;--accent-foreground:#1d1d1f;--border:#e8e8ed;--border-subtle:#f0f0f3;--ring:#4a9e22;--primary:#4a9e22;--primary-foreground:#357a18;--primary-soft:#eef9d4;--primary-gradient:linear-gradient(100deg,#e9f887 0%,#c3ea68 45%,#93da55 100%);--success:#3d9c2c;--warning:#b25000;--destructive:#d70015;--shadow-sm:0 1px 2px rgba(16,18,20,.05);--shadow-md:0 4px 14px rgba(120,170,40,.26);--ease-spring:cubic-bezier(.22,1,.36,1);--ease-press:cubic-bezier(.32,.72,0,1);
font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif;font-size:13px;line-height:1.5;color:var(--foreground);background:var(--card);border:1px solid var(--border);border-radius:var(--radius-xl);box-shadow:var(--shadow-sm),0 14px 34px rgba(16,18,20,.10);overflow:hidden;display:flex;flex-direction:column;max-height:calc(100vh - 40px)}
.bar{display:flex;align-items:center;gap:9px;padding:11px 10px 11px 13px;border-bottom:1px solid var(--border-subtle);flex:none;transition:border-color 200ms linear}
.panel.collapsed .bar{border-bottom-color:transparent}
/* 品牌标识：logo 自带圆角与透明四角，容器不叠圆角裁切 */
.mark{width:28px;height:28px;flex:none;display:block}
.mark img{width:100%;height:100%;display:block}
.brand{flex:1;min-width:0}
.brand .name{display:block;font-size:13.5px;font-weight:650;letter-spacing:-.01em}
.brand .sub{display:block;font-size:11.5px;color:var(--muted-foreground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tools{display:flex;gap:2px;flex:none}
.iconbtn{width:28px;height:28px;border:none;background:transparent;color:var(--muted-foreground);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:background 140ms linear,color 140ms linear}
.iconbtn:hover{background:var(--accent);color:var(--accent-foreground)}
.iconbtn:active{transform:scale(.94)}
.iconbtn svg{transition:transform 220ms var(--ease-spring)}
.panel.collapsed #collapse svg{transform:rotate(180deg)}
.body-shell{display:grid;grid-template-rows:1fr;transition:grid-template-rows 300ms var(--ease-spring)}
.panel.collapsed .body-shell{grid-template-rows:0fr}
.body{min-height:0;overflow:hidden;display:flex;flex-direction:column;opacity:1;transition:opacity 180ms linear}
.panel.collapsed .body{opacity:0}
.meta{font-size:11.5px;color:var(--subtle-foreground);padding:9px 16px 0;font-variant-numeric:tabular-nums}
.progress{display:flex;align-items:center;gap:14px;padding:10px 16px 4px}
.ring{position:relative;width:72px;height:72px;flex:none}
.ring svg{display:block}
.ring .arc{transition:stroke-dashoffset 420ms var(--ease-spring)}
.ring .center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:1px}
.ring .num{font-size:20px;font-weight:650;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums;display:inline-block}
.ring .unit{font-size:10.5px;line-height:1;color:var(--muted-foreground)}
.steps{list-style:none;margin:0;padding:0;flex:1;min-width:0}
.steps li{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12.5px;color:var(--subtle-foreground);transition:color 220ms linear}
.steps li[data-s=done]{color:var(--muted-foreground)}
.steps li[data-s=active]{color:var(--foreground);font-weight:600}
.bul{width:14px;height:14px;border-radius:50%;flex:none;border:1.5px solid #dcdce1;display:flex;align-items:center;justify-content:center;background:transparent;transition:background 220ms linear,border-color 220ms linear}
.steps li[data-s=done] .bul{background:var(--primary);border-color:var(--primary);color:#fff}
.steps li[data-s=active] .bul{border-color:var(--primary)}
.steps li[data-s=active] .bul::after{content:'';width:5px;height:5px;border-radius:50%;background:var(--primary);animation:pulse 1.1s ease-in-out infinite}
.message{margin:0;padding:9px 16px 0;font-size:12.5px;color:var(--muted-foreground);word-break:break-word}
.pill{display:flex;align-items:center;gap:7px;margin:9px 16px 0;padding:9px 11px;border-radius:var(--radius-md);font-size:12.5px;font-weight:500;color:var(--primary-foreground);background:linear-gradient(100deg,#f7f8f3 0%,#eef7df 45%,#f7f8f3 100%);background-size:200% 100%;animation:shimmer 2.6s linear infinite}
.pill .spark{display:flex;color:var(--primary)}
.missing{list-style:none;margin:0;padding:8px 8px 0;display:flex;flex-direction:column;gap:1px;max-height:174px;overflow:auto}
/* 清单过长被截断时，给可滚动区域加边缘渐隐：避免出现「切一半的整行」紧贴按钮的难看形态。 */
.missing.scrollable{-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 10px,#000 calc(100% - 12px),transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 10px,#000 calc(100% - 12px),transparent 100%)}
.missing li{animation:row-in 260ms var(--ease-spring) backwards;animation-delay:calc(var(--i,0)*36ms)}
.mrow{width:100%;display:flex;align-items:flex-start;gap:9px;padding:7px 8px;border:none;background:transparent;border-radius:var(--radius-md);text-align:left;font-family:inherit;color:inherit;transition:background 140ms linear}
button.mrow{cursor:pointer}
button.mrow:hover{background:var(--muted)}
button.mrow:active{transform:scale(.995)}
.mtile{width:26px;height:26px;flex:none;border-radius:var(--radius-sm);background:var(--muted);color:var(--muted-foreground);display:flex;align-items:center;justify-content:center;transition:background 140ms linear,color 140ms linear}
button.mrow:hover .mtile{background:var(--card);color:var(--primary)}
.mbody{flex:1;min-width:0}
.mtitle{display:block;font-size:12.5px;font-weight:600;word-break:break-word}
.msub{display:block;font-size:11.5px;color:var(--muted-foreground);margin-top:1px;word-break:break-word}
.mgo{display:flex;color:var(--subtle-foreground);margin-top:6px;flex:none;transition:transform 220ms var(--ease-spring)}
button.mrow:hover .mgo{transform:translateX(2px)}
.celebrate{display:flex;justify-content:center;padding:20px 16px 0}
.badge{display:flex}
.panel[data-state=done] .message,.panel[data-state=stopped] .message{text-align:center;padding-left:26px;padding-right:26px}
.actions{display:flex;flex-direction:column;gap:7px;padding:13px 16px 14px}
.primary{width:100%;display:flex;align-items:center;justify-content:center;gap:7px;padding:11px 14px;border:none;border-radius:var(--radius-lg);background:var(--primary-gradient);color:var(--foreground);font-family:inherit;font-size:13.5px;font-weight:600;cursor:pointer;box-shadow:var(--shadow-sm);transition:filter 140ms linear,transform 140ms var(--ease-press),box-shadow 220ms var(--ease-spring)}
.primary:hover{filter:brightness(1.02);box-shadow:var(--shadow-md)}
.primary:active{transform:scale(.985)}
.picon{display:flex}
.ghosts{display:flex;align-items:center;gap:1px;flex-wrap:wrap}
.ghost{border:none;background:transparent;color:var(--muted-foreground);font-family:inherit;font-size:12px;padding:6px 9px;border-radius:var(--radius-md);cursor:pointer;transition:background 140ms linear,color 140ms linear}
.ghost:hover{background:var(--accent);color:var(--accent-foreground)}
.ghost:active{transform:scale(.96)}
#undo:hover{background:#fff4f3;color:#b3261e}
.iconbtn:focus-visible,.primary:focus-visible,.ghost:focus-visible,.mrow:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.8)}}
@keyframes shimmer{from{background-position:0 0}to{background-position:200% 0}}
@keyframes row-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}`;
 function ic(name,size){return globalThis.OJT_ICONS?globalThis.OJT_ICONS.icon(name,{size}):'';}
/**
 * 品牌头像：与弹窗、设置页、秋招工作台共用同一张 logo（icons/icon128.png）。
 * 页内面板注入在网页里，取扩展资源必须走 chrome.runtime.getURL，
 * 且该文件要在 manifest 的 web_accessible_resources 里（否则会被浏览器拦掉）。
 * 万一取不到，退回线性闪电图标，保证面板仍能正常渲染。
 */
 function logoSrc(){
  try{const url=chrome.runtime.getURL('icons/icon128.png');if(url)return '<img src="'+url+'" alt="">';}catch(_){}
  return ic('boltSolid',16);
 }
 function sectionIcon(text){return globalThis.OJT_ICONS?globalThis.OJT_ICONS.forSection(text):'alert';}
 function panelMarkup(){
  return '<section class="panel" id="panel" role="region" aria-label="智能网申助手">'
  +'<div class="bar"><span class="mark">'+logoSrc()+'</span>'
  +'<span class="brand"><span class="name">EasyOffer</span><span class="sub" id="subtitle"></span></span>'
  +'<span class="tools"><button type="button" class="iconbtn" id="collapse" title="收起面板" aria-label="收起面板">'+ic('chevronUp',15)+'</button><button type="button" class="iconbtn" id="close" title="关闭面板" aria-label="关闭面板" hidden>'+ic('x',15)+'</button></span></div>'
  +'<div class="body-shell"><div class="body">'
  +'<div class="meta" id="count"></div>'
  +'<div class="progress" id="progressWrap"><div class="ring" role="img" aria-label="填写进度">'
  +'<svg viewBox="0 0 48 48" width="72" height="72" aria-hidden="true"><defs><linearGradient id="ojtRing" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#d9f36a"/><stop offset="1" stop-color="#86d94a"/></linearGradient></defs>'
  +'<circle cx="24" cy="24" r="'+RING_R+'" fill="none" stroke="#ededf0" stroke-width="5"/>'
  +'<circle class="arc" id="ringArc" cx="24" cy="24" r="'+RING_R+'" fill="none" stroke="url(#ojtRing)" stroke-width="5" stroke-linecap="round" transform="rotate(-90 24 24)"/></svg>'
  +'<span class="center"><span class="num" id="ringNum">0</span><span class="unit">项</span></span></div>'
  +'<ul class="steps" id="steps"></ul></div>'
  +'<div class="celebrate" id="celebrate" hidden><span class="badge" id="badgePic"></span></div>'
  +'<p class="message" id="message" hidden></p>'
  +'<div class="pill" id="aiPill" hidden><span class="spark">'+ic('sparkle',15)+'</span><span id="aiPillText">AI 正在分析表单…</span></div>'
  +'<ul class="missing" id="missingList" hidden></ul>'
  +'<div class="actions"><button type="button" class="primary" id="pause"><span class="picon" id="pauseIcon"></span><span id="pauseLabel">暂停</span></button>'
  +'<div class="ghosts"><button type="button" class="ghost" id="diagnose">查看未填原因</button><button type="button" class="ghost" id="undo">撤销本页填写</button><button type="button" class="ghost" id="stop">停止</button></div></div>'
  +'</div></div></section>';
 }
 // ---- 动效工具（Web Animations API，等价于 animate-ui 的 spring 入场/状态过渡）----
 const SPRING='cubic-bezier(.22,1,.36,1)';
 function reduceMotion(){try{return matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(_){return false;}}
 function run(el,keyframes,options={}){
  if(!el||typeof el.animate!=='function'||reduceMotion())return;
  try{
   const animation=el.animate(keyframes,{duration:280,easing:SPRING,fill:'backwards',...options});
   animation.addEventListener?.('finish',()=>animation.cancel?.());
  }catch(_){}
 }
 const ENTER_IN=[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}];
 const POP_IN=[{opacity:0,transform:'scale(.88)'},{opacity:1,transform:'none'}];
 /** 仅在文本真的变化时写入并播放动画——report() 会每秒重入，必须避免动画反复重放。 */
 function setText(el,text,keyframes){
  if(!el)return false;
  const next=String(text==null?'':text);
  if(el.textContent===next)return false;
  el.textContent=next;
  if(keyframes)run(el,keyframes,{duration:200});
  return true;
 }
 /** 把消息映射到四个阶段之一；识别不出时保持上一阶段，避免进度倒退。 */
 function detectPhase(message){
  const text=String(message||'');
  if(/AI\s*分批分析/.test(text))return 1;
  if(/正在填写|正在添加下一段经历/.test(text))return 2;
  if(/正在检查填写结果/.test(text))return 3;
  if(/正在分析当前页面|正在进入下一页|没有找到可填写的表单/.test(text))return 0;
  return phase;
 }
/**
 * 拆解业务侧的未填原因：「前缀：区块 / 字段」→ 标题＝字段名，副标题＝简短原因。
 * 关键：标题必须是「字段名」。业务侧的前缀（如"请手动检查选择项"）只是原因，
 * 拿它当标题会让每一条长得一模一样，用户根本看不出是哪个字段没填上。
 */
function parseMissing(text){
 const raw=String(text||''),cut=raw.indexOf('：');
 if(cut<0)return {text:raw,title:raw,sub:'',label:'',section:'',plain:true};
 const reason=raw.slice(0,cut).trim(),rest=raw.slice(cut+1).trim(),short=REASON_SHORT[reason]||reason;
 // 「请核对学历：本科」这类「：」后面是值，不是字段名，标题保留原因，值放到副标题。
 if(VALUE_REASONS.has(reason))return {text:raw,title:reason,sub:rest?short+'：'+rest:short,label:'',section:'',plain:false};
 // 「：」之后可能是「区块 / 字段」，也可能只有「字段」。
 const seg=rest.split(' / '),section=seg.length>1?seg[0]:'',label=(seg.length>1?seg.slice(1).join(' / '):rest)||reason;
 return {text:raw,title:label,sub:section?section+' · '+short:short,label,section,plain:false};
}
/** 已找到对应控件时，把含糊的「没填上」细化为可操作的说法（下拉框尤其需要说清楚）。 */
function refineMissing(entry){
 if(!entry?.row)return;
 const el=entry.row.el,tag=String(el?.tagName||'').toLowerCase();
 const isChoice=tag==='select'||el.getAttribute?.('role')==='combobox'||el.getAttribute?.('aria-haspopup')==='listbox';
 if(isChoice&&/未能确认填写成功|必填项未填写|未填写/.test(entry.text))entry.sub='下拉选项里没有对得上的，需要你手动选';
}
 /** 未填项与页面控件的对应关系，仅用于「点击定位」。 */
 function matchRow(entry){
  if(entry.plain||!entry.label)return null;
  const candidates=latestRows.filter(row=>!row.current&&row.label);
  return candidates.find(row=>row.label===entry.label&&(!entry.section||row.section===entry.section))
   ||candidates.find(row=>row.label===entry.label)||null;
 }
 /** 点击未填项 → 滚动到页面对应字段并短暂高亮；只改内联样式且会还原，不触碰任何值。 */
 function locate(entry){
  const el=entry?.row?.el;
  if(!el||!el.isConnected)return;
  try{el.scrollIntoView({block:'center',behavior:'smooth'});}catch(_){el.scrollIntoView();}
  const box=el.closest('.ant-form-item,.el-form-item,.form-item,.brick-field,[class*="form-item"],[class*="field"]')||el;
  const previous=box.getAttribute('style');
  box.style.transition='box-shadow .25s ease,background-color .25s ease';
  box.style.borderRadius='8px';
  box.style.backgroundColor='#f4fbeb';
  box.style.boxShadow='0 0 0 2px #86d94a';
  setTimeout(()=>{if(previous===null)box.removeAttribute('style');else box.setAttribute('style',previous);},2400);
 }
 function paintCollapse(){
  if(!reportRoot)return;
  const panel=reportRoot.querySelector('#panel'),button=reportRoot.querySelector('#collapse');
  if(!panel)return;
  panel.classList.toggle('collapsed',collapsed);
  if(button){
   const label=collapsed?'展开面板':'收起面板';
   button.title=label;button.setAttribute('aria-label',label);
  }
 }
 function paintMissing(){
  if(!reportRoot)return;
  const list=reportRoot.querySelector('#missingList');
  if(!list)return;
  const diagnose=reportRoot.querySelector('#diagnose');
  const key=missingEntries.map(entry=>entry.text).join('\u0001')+'|'+(showDetail?'1':'0');
  if(key!==seenMissingKey){
   seenMissingKey=key;
   list.replaceChildren();
   missingEntries.forEach((entry,index)=>{
    const li=document.createElement('li');
    li.style.setProperty('--i',String(Math.min(index,8)));
    const clickable=Boolean(entry.row);
    const host=document.createElement(clickable?'button':'div');
    if(clickable){host.type='button';host.dataset.missing=String(index);}
    host.className='mrow';
    host.innerHTML='<span class="mtile"></span><span class="mbody"><span class="mtitle"></span><span class="msub"></span></span>'+(clickable?'<span class="mgo">'+ic('chevronRight',13)+'</span>':'');
    host.querySelector('.mtile').innerHTML=ic(clickable?sectionIcon(entry.section||entry.title):'alert',15);
    host.querySelector('.mtitle').textContent=entry.plain?entry.text:entry.title;
    host.querySelector('.msub').textContent=clickable?(showDetail?entry.text:(entry.sub||'点击定位到表单字段')):(showDetail?'':entry.sub);
    li.append(host);list.append(li);
   });
  }
  list.hidden=!missingEntries.length;
  // 仅在真的需要滚动时才加渐隐（清单短时不加，免得首尾行被莫名淡化）。
  list.classList.toggle('scrollable',!list.hidden&&list.scrollHeight>list.clientHeight+1);
  if(diagnose){
   diagnose.hidden=!missingEntries.length;
   diagnose.textContent=showDetail?'收起未填原因':'查看未填原因';
  }
 }
// 只读工具钩子：供设计预览页复用同一份样式与标记，供测试直接校验未填原因的拆解规则。
globalThis.__ojtPanelAssets={css:PANEL_CSS,markup:panelMarkup,parseMissing};
 function report(state){
  const status=state.status||'idle';
  if(!host?.isConnected){
   host=document.createElement('div');host.id='ojt-application-agent';host.style='position:fixed;right:20px;bottom:20px;z-index:2147483647;width:340px;max-width:90vw';
   reportRoot=host.attachShadow({mode:'closed'});
   reportRoot.innerHTML='<style>'+PANEL_CSS+'</style>'+panelMarkup();
   const q=id=>reportRoot.querySelector('#'+id);
   q('collapse').onclick=()=>{collapsed=!collapsed;paintCollapse();};
   q('close').onclick=()=>host.remove();
   q('pause').onclick=()=>{if(runner.status==='blocked')runner.run();else if(runner.paused)runner.resume();else runner.pause();};
   q('stop').onclick=()=>runner.stop();q('undo').onclick=()=>runner.undo();
   q('diagnose').onclick=()=>{showDetail=!showDetail;paintMissing();};
   q('missingList').addEventListener('click',event=>{const trigger=event.target.closest('button[data-missing]');if(trigger)locate(missingEntries[Number(trigger.dataset.missing)]);});
   document.documentElement.appendChild(host);
   run(reportRoot.querySelector('.panel'),[{opacity:0,transform:'translateY(10px) scale(.97)'},{opacity:1,transform:'none'}],{duration:320});
  }
  const q=id=>reportRoot.querySelector('#'+id);
  const statusChanged=status!==seenStatus;
  seenStatus=status;
  phase=detectPhase(state.message);
  const missing=Array.isArray(state.missing)?state.missing:[];
  missingEntries=missing.map(parseMissing);
  for(const entry of missingEntries)entry.row=matchRow(entry);
  for(const entry of missingEntries)refineMissing(entry);

  const title=status==='blocked'?(missing.length?'发现 '+missing.length+' 项需要你补充':'需要你手动处理'):(STATUS_TITLE[status]||'智能网申助手');
  if(statusChanged||q('subtitle').textContent!==title)setText(q('subtitle'),title,ENTER_IN);
  q('panel').dataset.state=status;
  setText(q('count'),'第 '+(state.page||1)+' 页 · 累计已填写 '+(state.filled||0)+' 项',[{opacity:.4},{opacity:1}]);

  // 原始业务消息照原样呈现；与状态标题重复时不再重复一行。
  const message=String(state.message||'');
  const redundant=status==='blocked'&&/^有内容需要你补充/.test(message);
  const working=status==='running'||status==='paused';
  const aiActive=working&&phase===1;

  q('progressWrap').hidden=!working;
  q('celebrate').hidden=!['done','stopped'].includes(status);
  if(working){
   if(phase!==seenPhase){
    seenPhase=phase;
    const arc=q('ringArc');
    arc.setAttribute('stroke-dasharray',RING_C.toFixed(2));
    arc.setAttribute('stroke-dashoffset',(RING_C*(1-PHASE_ARC[phase])).toFixed(2));
    const steps=q('steps');steps.replaceChildren();
    PHASES.forEach((name,index)=>{
     const li=document.createElement('li');
     li.dataset.s=index<phase?'done':index===phase?'active':'todo';
     li.innerHTML='<span class="bul">'+(index<phase?ic('check',9):'')+'</span><span class="stext">'+name+'</span>';
     steps.append(li);
    });
    if(phase===1)run(q('aiPill'),ENTER_IN,{duration:240});
   }
   setText(q('ringNum'),String(state.filled||0),POP_IN);
  }else{
   q('ringNum').textContent=String(state.filled||0);
   seenPhase=-1;
   if(statusChanged){
    q('badgePic').innerHTML=status==='done'
     ?'<svg width="46" height="46" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#86d94a"/><path d="M8.1 12.3 10.9 15.1 15.9 9.4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
     :ic('info',46);
    run(q('badgePic'),POP_IN,{duration:320});
   }
  }

  // AI 分析中：用同一行承载最具体的信息，避免"进度环 + 静态 pill + 消息行"三处重复。
  q('aiPill').hidden=!aiActive;
  if(aiActive)setText(q('aiPillText'),message||'AI 正在分析表单…');
  setText(q('message'),redundant||aiActive?'':message);
  q('message').hidden=redundant||aiActive||!message;

  paintMissing();

  const pause=q('pause');
  pause.hidden=status==='done'||status==='stopped';
  setText(q('pauseLabel'),status==='running'?'暂停':status==='blocked'?'继续填写':'继续');
  const iconName=status==='running'?'pause':'play';
  if(pause.dataset.icon!==iconName){pause.dataset.icon=iconName;q('pauseIcon').innerHTML=ic(iconName,16);}
  q('stop').hidden=status==='done'||status==='stopped';
  q('close').hidden=!['done','stopped','blocked'].includes(status);
  paintCollapse();
 }
 // 覆盖范围与 content.js 的单字段填写保持一致：
// 之前排除了 input[type=search]，导致 antd / Element Plus 等把下拉做成搜索框的控件整类不可见；
// 也没有纳入没有任何 input 的自定义选择容器（百度 brick-select、role=combobox 等）。
function controls(){
  const found=[...document.querySelectorAll(
    'input:not([type=hidden]):not([type=password]):not([type=file]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable="true"],.brick-field .brick-select-selection,[role=combobox]:not(input):not(textarea),[aria-haspopup=listbox]:not(input):not(textarea)'
  )].filter(el=>visible(el)&&!host?.contains(el));
  // 自定义下拉往往「外层容器 + 内部搜索框」同时命中；只保留最内层的可交互节点。
  return found.filter(el=>!found.some(other=>other!==el&&el.contains(other)));
}
 function observe(){
  const counts={};
  const actualControls=controls();
  const rows=actualControls.map((el,i)=>{
   const label=descriptor(el),sec=section(el),anchorType=mapper.recordAnchorType(label),type=anchorType||kind(sec)||kind(label);
   const anchor=Boolean(anchorType)||(!['education','work','project'].includes(type)&&/^(校园经历|社团|活动|经历|竞赛|奖项|语言|技能|证书|论文)(名称|全称)$|^语种$|^语言类别$|^获奖项$|^获奖名称$|^语言$/.test(label));
   return {el,id:'f'+i,label,section:sec,recordType:type,anchor,type:el.isContentEditable?'richtext':el.type||el.tagName.toLowerCase(),placeholder:el.placeholder||'',options:el.tagName==='SELECT'?[...el.options].filter(o=>o.value).map(o=>o.textContent.trim()):[],required:el.required||el.getAttribute('aria-required')==='true'||Boolean(el.closest('[class*="form-item"]')?.querySelector('[class*="required"]')),prefix:'',current:value(el),maxLength:el.maxLength>0?el.maxLength:undefined};
  }).filter(r=>!/验证码|兑换码|搜索|captcha|password/i.test(r.label+" "+r.placeholder));
  for(const r of core.recordDisplayAnchors?.(actualControls)||[])rows.push({...r,id:'display'+rows.length,section:section(r.el),anchor:true,readOnlyAnchor:true,prefix:''});
  rows.sort((a,b)=>a.el===b.el?0:(a.el.compareDocumentPosition(b.el)&Node.DOCUMENT_POSITION_FOLLOWING)?-1:1);
  // Use each record's DOM container, including fields BEFORE its school/company name.
  let blockNumber=0;
  for(const anchor of rows.filter(r=>r.anchor&&r.recordType)){
   counts[anchor.recordType]=(counts[anchor.recordType]||0)+1;
   let container=null;
   for(let node=anchor.el.parentElement;node&&node!==document.body;node=node.parentElement){
    const children=rows.filter(r=>node.contains(r.el));
    if(children.some(r=>r.anchor&&r.recordType!==anchor.recordType)||children.filter(r=>r.anchor).length>1)break;
    if(children.length>1)container=node;
   }
   if(container){const key=String(++blockNumber);for(const row of rows.filter(r=>container.contains(r.el))){row.blockKey=key;row.recordType=anchor.recordType;row.section=anchor.section;}}
  }
  // Some builders flatten repeated records into sibling fields instead of record wrappers.
  const flatParents=new Set();
  for(const anchor of rows.filter(r=>r.anchor&&!r.blockKey)){
   for(let parent=anchor.el.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
    const members=rows.filter(r=>parent.contains(r.el));
    if(members.some(r=>r.anchor&&r.recordType!==anchor.recordType))break;
    if(members.filter(r=>r.anchor).length<2)continue;
    if(!flatParents.has(parent)){flatParents.add(parent);mapper.partitionFlatRecords(members,'flat'+(++blockNumber),anchor.recordType,anchor.section);}
    break;
   }
  }
  // Also reserve saved, collapsed cards that no longer expose editable controls.
  const occupied=new Set();
  const english=bank.find(b=>/^language\.\d+\.name$/.test(b.id)&&b.value==='英语');
  if(english&&rows.some(r=>r.section==='英语能力'&&r.current))occupied.add(english.id.replace(/[^.]+$/,''));
  for(const node of document.querySelectorAll('h4,h5,strong,span,div,p')){
   if(node.children.length||!visible(node)||!node.textContent.trim())continue;
   const type=kind(section(node));if(!type)continue;
   if(rows.some(r=>r.blockKey&&r.el.closest('section,article')===node.closest('section,article')&&r.anchor&&mapper.recordName(r.current,type)===mapper.recordName(node.textContent,type)))continue;
   for(const source of bank.filter(b=>b.id.startsWith(type+'.')&&/\.(name|company|school)$/.test(b.id))){
    if(mapper.recordName(node.textContent,type)===mapper.recordName(source.value,type)&&!node.closest('.ant-select,.el-select,.brick-select'))occupied.add(source.id.replace(/[^.]+$/,''));
   }
  }
  mapper.bindRecordGroups(rows,bank,occupied);
  if(english)for(const row of rows.filter(r=>r.section==='英语能力')){row.prefix=english.id.replace(/[^.]+$/,'');row.scopeUnknown=false;}
  const errors=[...document.querySelectorAll('[role=alert],.el-form-item__error,.ant-form-item-explain-error')].filter(visible).map(el=>el.textContent.trim()).filter(Boolean);
  latestRows=rows;
  const blocker=[...document.querySelectorAll('iframe[src*="captcha"],input[autocomplete="one-time-code"]')].some(visible)?'页面需要验证码，请你完成后继续':rows.length===0?'没有找到可填写的表单，请打开网申填写页':null;
  return {rows,counts,occupied:[...occupied],errors,blocker,url:location.href,signature:location.href+'|'+rows.map(r=>r.label+':'+r.current).join('|')};
 }
 function matchingSource(row,snapshot){
  if(!row.prefix||row.scopeUnknown)return null;
  const allowed=bank.filter(s=>s.id.startsWith(row.prefix));
  const label=row.label;let key='';
  const exact=allowed.filter(s=>norm(s.label)===norm(label.replace(/[＊*：:]/g,'')));if(exact.length===1&&mapper.compatible(row,exact[0]))return exact[0];
  if(/^工作性质$/.test(label))return allowed.find(s=>(s.label==='经历类型'||s.label==='工作性质')&&mapper.compatible(row,s));
  if(/^获奖级别$/.test(label))return allowed.find(s=>s.label==='级别');
  if(/^获奖时间$/.test(label))return allowed.find(s=>s.id.endsWith('.date'));
  if(/^获奖描述$/.test(label)||(row.recordType==='award'&&label==='描述'))return allowed.find(s=>s.id.endsWith('.level'));
  if(/^(获奖|奖项)类型$/.test(label))return allowed.find(s=>/^(获奖|奖项)类型$/.test(s.label));
  if(/是否|排名|类别|性质|方向|导师|学院|院系|实验室|省份|城市/.test(label))return null;
  if(/开始|起始|入学|入职|入司/.test(label))key='start';else if(/结束|毕业时间|离职|离司/.test(label))key='end';
  else if(/学校|院校/.test(label))key='school';else if(/学历|学位/.test(label))key='degree';else if(/专业/.test(label))key='major';
  else if(/^项目职责$/.test(label))key='role';
  else if(/^(描述|项目描述|工作描述|职责描述|校园经历描述|经历描述|证书描述|奖项说明|获奖说明)$/.test(label))key='description';
  else if(['project','campus'].includes(mapper.recordAnchorType(label))||/校园经历名称|^获奖名称$|^奖项名称$|^获奖项$|^证书名称$/.test(label))key='name';else if(/角色|职务/.test(label))key='role';else if(mapper.recordAnchorType(label)==='work')key='company';else if(/^(职位|岗位)(名称)?$/.test(label))key='position';else if(/^(所在部门|部门名称|部门)$/.test(label))key='department';
  return allowed.find(s=>s.id.endsWith('.'+key)&&mapper.compatible(row,s));
 }
 function actions(snapshot){
  const buttons=[...document.querySelectorAll('button,a,[role=button]')].filter(visible);
  for(const button of buttons){
   const sec=section(button),type=kind(sec),label=button.textContent.trim();
   const names=bank.filter(b=>b.id.startsWith(type+'.')&&/\.(name|company|school)$/.test(b.id));
   const represented=new Set([...(snapshot.occupied||[]),...snapshot.rows.filter(r=>r.recordType===type&&r.prefix).map(r=>r.prefix)]);
   const unresolved=snapshot.rows.some(r=>r.recordType===type&&r.scopeUnknown&&r.anchor);
   const remaining=names.some(b=>!represented.has(b.id.replace(/[^.]+$/,'')));
   if(type&&remaining&&!unresolved&&ApplicationAgent.safeAction({kind:'add',label,section:sec}))return {kind:'add',label,section:sec,el:button,key:sec+':'+label+':'+snapshot.counts[type]};
  }
  return buttons.map(el=>({kind:'next',label:el.textContent.trim(),el,key:el.textContent.trim()})).find(ApplicationAgent.safeAction);
 }
 /**
 * 「选其他 + 说明补充」时要写进说明框的文字：奖项全称（＋等级）。
 * 等级取同一条记录里的 level（如 award.0.level = 「三等奖」），
 * 拼成「2026 未来设计师·全国高校数字艺术设计大赛（三等奖）」——只做忠实拼接，不新增任何事实。
 */
function composeAwardDetail(item){
 const name=String(item?.source?.value||'').trim();
 if(!name)return '';
 const prefix=/^([a-z]+\.\d+\.)/.exec(String(item?.source?.id||''))?.[1];
 const level=prefix?(bank.find(b=>b.id===prefix+'level')?.value||''):'';
 const text=String(level||'').trim();
 return text&&!name.includes(text)?name+'（'+text+'）':name;
}
const adapter={report,
  observe,
  async *plan(snapshot){
   batchErrors=[];
   const empty=snapshot.rows.filter(r=>!r.readOnlyAnchor&&!r.current&&!r.scopeUnknown);
   const fields=[],unknown=[];
   for(const row of empty){const source=matchingSource(row,snapshot);if(source)fields.push({...row,source});else unknown.push(row);}
   // Yield local exact matches immediately, before any network request.
   if(fields.length)yield {fields};
   const groups=new Map();
   for(const row of unknown.filter(r=>r.label)){const key=row.prefix||'profile';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
   const batches=[...groups.values()].flatMap(rows=>Array.from({length:Math.ceil(rows.length/4)},(_,i)=>rows.slice(i*4,i*4+4)));
   const runBatch=async rows=>{
    const started=Date.now();
    const progress=()=>{if(runner.status==='running')runner.emit(`AI 分批分析（${rows.length} 项，已等待 ${Math.floor((Date.now()-started)/1000)} 秒）`);};
    progress();const timer=setInterval(progress,1000);
    let response;
    try{
     const prefixes=new Set(rows.map(r=>r.prefix).filter(Boolean));
     const sources=prefixes.size?bank.filter(b=>[...prefixes].some(p=>b.id.startsWith(p))):bank.filter(b=>b.id.startsWith('profile.'));
     if(!sources.length)return [];
     const needsText=rows.some(r=>/描述|职责|业绩|成果|介绍|内容/.test(r.label+" "+r.placeholder));
     const request={type:'MAP_FORM_FIELDS',payload:{agentMode:true,context:(data.knowledgeLibrary?.notes||'').slice(0,2000),fields:rows.map(({el,current,...r})=>r),bank:mapper.metadata(sources),projectEvidence:needsText?sources.filter(b=>/^(project|work|campus)\.\d+\.description$/.test(b.id)).map(b=>({id:b.id,text:b.value})):[]}};
     response=await chrome.runtime.sendMessage(request);
     if(!response?.ok&&/格式|截断/.test(response?.error||'')){await runner.gate();response=await chrome.runtime.sendMessage({...request,payload:{...request.payload,mappingOnly:true}});}
    }catch(error){response={ok:false,error:error.message||'AI 请求失败'};}finally{clearInterval(timer);}
    await runner.gate();
    if(!response?.ok){
     // 一批里只要有 1 项让模型出错，整批就白跑。拆成两半各再试一次，把损失面缩到 1 项。
     if(rows.length>1){
      const mid=Math.ceil(rows.length/2);
      const head=await runBatch(rows.slice(0,mid)),tail=await runBatch(rows.slice(mid));
      return [...head,...tail];
     }
     batchErrors.push(`${rows.map(r=>r.section+' / '+r.label).join('、')}：${response?.error||'AI 暂不可用'}，已跳过并继续其他区块`);
     return [];
    }
    let maps;try{maps=mapper.validateMappings(response.mappings,rows,bank,response.threshold);}catch{batchErrors.push(rows.map(r=>r.label).join('、')+'：映射格式无效，已继续其他区块');return [];}
    const mapped=[];
    for(const mapping of maps.filter(m=>m.accepted)){
     const row=rows.find(r=>r.id===mapping.fieldId);let source=bank.find(b=>b.id===mapping.sourceId);
     if(!row||!source)continue;
     if(row.prefix&&!source.id.startsWith(row.prefix))continue;
     if(mapping.draft)source={...source,value:mapping.draft};else if(mapping.quotes?.length)source={...source,value:mapping.quotes.join('\n')};
     mapped.push({...row,source,ai:true});
    }
    return mapped;
   };
   for(const batch of batches){
    await runner.gate();
    const mapped=await runBatch(batch);
    if(mapped.length)yield {fields:mapped};
   }
  },
  valid(item,snapshot){return location.href===snapshot.url&&visible(item.el)&&descriptor(item.el)===item.label&&mapper.compatible(item,item.source)&&(!item.prefix||item.source.id.startsWith(item.prefix));},
  read:item=>value(item.el),
  async write(item){
   if(item.maxLength&&item.source.value.length>item.maxLength)return false;
   let writtenSource=item.source;
   if(item.source.kind==='date'&&item.el.tagName==='SELECT'){const parts=core.parseDateParts(item.source.value);const options=[...item.el.options].map(o=>o.textContent.trim());if(parts&&options.some(x=>/^\d{4}年?$/.test(x)))writtenSource={...item.source,value:String(parts.y),kind:'text'};else if(parts&&options.some(x=>/^\d{1,2}月?$/.test(x)))writtenSource={...item.source,value:String(parts.mo),kind:'text'};}
   item.expected=writtenSource.value;
   let ok=await core.writeMappedField(item.el,writtenSource);
   // 下拉里没有能对上的选项时，退一步：选中「其他」，并把真值补写进同一条记录的说明框。
   // 仅对获奖/竞赛类字段开放（见 content.js 的 OTHER_FALLBACK_LABEL），且必须有说明框可写，缺一不可。
   if(!ok&&typeof core.writeOtherFallback==='function'){
    const fallback=await core.writeOtherFallback(item.el,composeAwardDetail(item));
    if(fallback){
     item.otherDetailEl=fallback.detailEl;ok=true;
     // 「其他」不是资料库里的原名，下一轮 observe() 会把锚点读成「其他」，
     // 从而把整块判成「已有经历名称与资料库不一致」而锁死。把归属写进数据集，
     // 让 bindRecordGroups 直接沿用，避免自己写的内容反而挡住自己。
     const prefix=/^([a-z]+\.\d+\.)/.exec(String(item.source.id||''))?.[1];
     if(prefix)item.el.dataset.ojtRecordPrefix=prefix;
    }
   }
   if(ok&&item.source.id){const prefix=/^([a-z]+\.\d+\.)/.exec(item.source.id)?.[1];if(prefix)item.el.dataset.ojtRecordPrefix=prefix;}
   if(ok){
    // 「其他」兜底填出来的字段用琥珀色标注，提醒你复核——它毕竟不是资料库里的原词。
    const color=item.otherDetailEl?'#b25000':item.ai?'#5aa81f':'#8e8e93';
    item.el.style.outline='2px solid '+color;item.el.style.outlineOffset='2px';
    if(item.otherDetailEl){item.otherDetailEl.style.outline='2px solid #b25000';item.otherDetailEl.style.outlineOffset='2px';}
   }
   return ok;
  },
  async verify(item){await new Promise(r=>setTimeout(r,180));if(!item.el.isConnected)return false;
   // 「其他」兜底填写：判定标准换成「兜底项确实被选中 + 说明框确实写进了内容」。
   if(item.otherDetailEl){
    if(!item.otherDetailEl.isConnected||!norm(value(item.otherDetailEl)))return false;
    const shown=item.el.tagName==='SELECT'?[...item.el.selectedOptions].map(o=>o.textContent.trim()).join(''):value(item.el);
    return /其他|其它/i.test(shown||'');
   }
   const actual=value(item.el);if(item.source.kind==='date'&&item.el.tagName!=='SELECT'){const parts=core.parseDateParts(item.source.value);if(parts&&item.el.dataset.ojtDatePrecision==='year')return actual===String(parts.y);if(parts&&(item.el.type==='month'||item.el.dataset.ojtDatePrecision==='month'))parts.precision='month';return core.matchesDate(actual,parts);}
   // 下拉的校验必须与写入端同规则：写入端允许「收紧的互相包含」（「竞赛」→「竞赛获奖」），
   // 校验端若仍按一字不差判断，就会把刚填上的选项判为失败并被 runner 回滚掉。
   if(item.el.tagName==='SELECT')return [...item.el.selectedOptions].some(o=>norm(o.textContent)===norm(item.expected||item.source.value)||norm(o.value)===norm(item.expected||item.source.value)||core.optionMatches?.(o.textContent,item.source.value)===true);
   return norm(actual)===norm(item.source.value)||(/获奖级别|奖项级别/.test(item.label)&&/^(省市级|省区级|省级)$/.test(actual)&&/^(省市级|省区级|省级)$/.test(item.source.value))||core.optionMatches?.(actual,item.source.value)===true;},
  async check(snapshot,plan){
   const now=observe();
   if(now.rows.some(r=>!r.current&&!snapshot.rows.some(old=>old.el===r.el&&old.label===r.label)))return {rescan:true};
   const missing=now.rows.filter(r=>!r.current).map(r=>(r.scopeUnknown?(r.scopeReason||(!r.blockKey?'未识别独立经历区块': '资料库没有剩余的同类经历'))+'：':r.required?'必填项未填写：':'未填写（当前经历无资料或未可靠匹配）：')+r.section+' / '+r.label);
   missing.push(...batchErrors);
   for(const row of now.rows)if(!row.current&&row.el.dataset.ojtDateFailure)missing.push(row.label+'：'+row.el.dataset.ojtDateFailure);
   const unsupported=[...document.querySelectorAll('input[type=radio],input[type=checkbox]')].filter(visible);
   const groups=new Map();for(const el of unsupported){const key=el.name||core.getFieldDescriptor(el);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(el);}
   for(const group of groups.values())if(!group.some(el=>el.checked))missing.push('请手动检查选择项：'+core.getFieldDescriptor(group[0]));
   for(const item of plan.fields)if(item.failed||(!value(item.el)&&item.required))missing.push('未能确认填写成功：'+item.label);
   missing.push(...now.errors);
   // Also block incompatible pre-existing values for the highest-risk crossed fields.
   for(const row of now.rows){if(mapper.fieldKind(row.label)==='degree'&&row.current&&!mapper.compatible({label:row.label},{id:'profile.degree',label:'学历',value:row.current}))missing.push('请核对学历：'+row.current);}
   const action=actions(now);return {missing:[...new Set(missing)],action:missing.length&&action?.kind!=='add'?null:action};
  },
  async act(action,snapshot){
   if(!visible(action.el)||!ApplicationAgent.safeAction({...action,label:action.el.textContent.trim()}))return false;
   if(action.el.tagName==='A'&&action.el.href&&new URL(action.el.href).origin!==location.origin)return false;
   const before=observe().signature;action.el.click();for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,200));if(runner.stopped)return false;if(observe().signature!==before)return true;}return false;
  },
  checkpoint:(action,page)=>action.kind==='next'?chrome.runtime.sendMessage({type:'OJT_AGENT_CHECKPOINT',page:page+1}):Promise.resolve(),
  clearCheckpoint:()=>chrome.runtime.sendMessage({type:'OJT_AGENT_CLEAR'}),
  restore:entry=>{if(entry.item.el.isConnected){if(entry.item.el.isContentEditable){entry.item.el.textContent=entry.before;entry.item.el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:entry.before}));}else{const el=entry.item.el;const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,entry.before);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}}},
 };
 async function start(page=1){
  if(starting)return;
  if(runner&&['running','paused'].includes(runner.status)){runner.emit('助手正在运行，可以在页面上暂停或停止');return;}
  starting=true;
  try{
  const ready=await chrome.runtime.sendMessage({type:'OJT_LIBRARY_READY'});if(ready&&!ready.ok)throw Error(ready.error);
  data=await chrome.storage.local.get(['userProfile','experiences','customFields','knowledgeLibrary']);bank=ready.result?.bank||mapper.buildBank(data,core.labels);
  if(!bank.length)throw Error('请先在配置个人资料中保存简历信息');
  runner=new ApplicationAgent.Runner(globalThis.EasyFormAdapter?EasyFormAdapter.create(adapter,bank):adapter);runner.page=page;void runner.run();
  }finally{starting=false;}
 }
 globalThis.__ojtStartAgent=start;
 // 支持注入了 iframe 的表单：只有本框架确实存在可填控件时才响应/自启动，
 // 否则保持沉默，把响应让给真正承载表单的框架（顶层框架始终响应，保持原有行为）。
 const hasWork=()=>controls().length>0;
 const listener=(message,sender,respond)=>{if(message.type==='START_APPLICATION_AGENT'){if(window.top!==window&&!hasWork())return false;start().then(()=>respond({ok:true,message:'助手已启动，请在页面查看进度'})).catch(e=>respond({ok:false,error:e.message}));return true;}};
 globalThis.__ojtAgentListener=listener;chrome.runtime.onMessage.addListener(listener);
 chrome.runtime.sendMessage({type:'OJT_AGENT_RESUME'}).then(state=>{if(state?.resume&&(window.top===window||hasWork()))start(state.page);}).catch(()=>{});
})();
