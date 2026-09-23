/* 统一线性图标集（单一来源）。
 * 供 popup.html / options.html / 页内助手面板（shadow DOM）共用，避免各处重复定义。
 * 规则：24x24 视图框、1.6 描边、圆头圆角、stroke=currentColor，随文字色变化；
 *      实心图形（停止方块、播放三角、AI 星芒等）在元素上自带 fill/stroke 覆盖。
 * 纯字符串工具，不依赖 DOM，也不访问 chrome API。
 */
(()=>{
 if(globalThis.OJT_ICONS)return;
 const P={
  /* 品牌与入口 */
  bolt:'<path d="M13.4 2.6 5 13.4h5.3L9.9 21.4l8.5-11H13l.4-7.8Z"/>',
  boltSolid:'<path fill="currentColor" stroke="none" d="M13.4 2.6 5 13.4h5.3L9.9 21.4l8.5-11H13l.4-7.8Z"/>',
  chart:'<path d="M6 19.2v-7.4M12 19.2V4.8M18 19.2v-4.6"/>',
  sliders:'<path d="M4 8h8.4M16.4 8H20M4 16h3.6M11.6 16H20"/><circle cx="14.4" cy="8" r="2"/><circle cx="9.6" cy="16" r="2"/>',

  /* 方向与控件 */
  arrowRight:'<path d="M4.8 12h13.4M12.6 6.4 18.4 12l-5.8 5.6"/>',
  chevronRight:'<path d="M9.6 5.6 16 12l-6.4 6.4"/>',
  chevronUp:'<path d="M5.6 15 12 8.6 18.4 15"/>',
  chevronDown:'<path d="M5.6 9 12 15.4 18.4 9"/>',
  x:'<path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4"/>',

  /* 播放控制 */
  pause:'<path d="M9.2 6.4v11.2M14.8 6.4v11.2" stroke-width="2.2"/>',
  play:'<path fill="currentColor" stroke="none" d="M8.2 5.6 18.4 12 8.2 18.4V5.6Z"/>',
  stop:'<rect x="7" y="7" width="10" height="10" rx="2.6" fill="currentColor" stroke="none"/>',

  /* 状态 */
  check:'<path d="M5.4 12.6 9.8 17 18.6 7.6"/>',
  checkCircle:'<path d="M20.6 12a8.6 8.6 0 1 1-17.2 0 8.6 8.6 0 0 1 17.2 0Z"/><path d="M8.4 12.1 11.2 15l4.6-5.6"/>',
  alert:'<path d="M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2Z"/><path d="M12 7.8v5M12 16.1h.02" stroke-width="1.8"/>',
  info:'<path d="M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2Z"/><path d="M12 11v5.2M12 8h.02" stroke-width="1.8"/>',

  /* 动作 */
  undo:'<path d="M8.6 13.8 3.8 9l4.8-4.8"/><path d="M3.8 9h9.4a6 6 0 0 1 0 12h-3"/>',
  list:'<path d="M9.2 6.6h9M9.2 12h9M9.2 17.4h9"/><circle cx="4.9" cy="6.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.9" cy="17.4" r="1.1" fill="currentColor" stroke="none"/>',
  refresh:'<path d="M20.2 11.4A8.2 8.2 0 0 0 6.4 6.6M3.8 12.6a8.2 8.2 0 0 0 13.8 4.8"/><path d="M6.4 3.4v3.4h3.4M17.6 20.6v-3.4h-3.4"/>',
  plus:'<path d="M12 5.6v12.8M5.6 12h12.8"/>',
  upload:'<path d="M12 16V5.4M8.4 9 12 5.4 15.6 9"/><path d="M4.8 15.4v3.2a1.4 1.4 0 0 0 1.4 1.4h11.6a1.4 1.4 0 0 0 1.4-1.4v-3.2"/>',
  plug:'<path d="M9.4 3.6v4.8M14.6 3.6v4.8"/><path d="M6.4 8.4h11.2v3.2a5.6 5.6 0 0 1-11.2 0V8.4Z"/><path d="M12 17.4v3"/>',
  trash:'<path d="M5.6 7.4h12.8M9.6 7.4V5.6a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1v1.8"/><path d="M7.2 7.4l.8 11a1.4 1.4 0 0 0 1.4 1.3h5.2a1.4 1.4 0 0 0 1.4-1.3l.8-11"/>',
  sparkle:'<path fill="currentColor" stroke="none" d="M12 3.2l1.7 4.9 4.9 1.7-4.9 1.7L12 16.4l-1.7-4.9L5.4 9.8l4.9-1.7L12 3.2Z"/><path fill="currentColor" stroke="none" d="M18.6 15.2l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z"/>',

  /* 内容分类（待补充清单按经历类型取图标） */
  user:'<path d="M12 12.4a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Z"/><path d="M4.6 20.2a7.6 7.6 0 0 1 14.8 0"/>',
  users:'<path d="M9.4 12.2a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4Z"/><path d="M2.9 19.6a6.5 6.5 0 0 1 13 0"/><path d="M16.4 5.4a3.7 3.7 0 0 1 0 7.1"/><path d="M17.6 13.7a6.5 6.5 0 0 1 3.5 5.9"/>',
  graduation:'<path d="M3.2 9.6 12 5.2l8.8 4.4L12 14 3.2 9.6Z"/><path d="M7.4 11.9v4.2c0 1.4 2.1 2.4 4.6 2.4s4.6-1 4.6-2.4v-4.2"/><path d="M20.4 10.2v4.6"/>',
  briefcase:'<path d="M4.4 8.6h15.2v9.8a1.6 1.6 0 0 1-1.6 1.6H6a1.6 1.6 0 0 1-1.6-1.6V8.6Z"/><path d="M9.2 8.6V6.6A1.6 1.6 0 0 1 10.8 5h2.4a1.6 1.6 0 0 1 1.6 1.6v2"/>',
  folder:'<path d="M4.4 7.6A1.6 1.6 0 0 1 6 6h3l2.1 2.6H18a1.6 1.6 0 0 1 1.6 1.6v7.2A1.6 1.6 0 0 1 18 19H6a1.6 1.6 0 0 1-1.6-1.6V7.6Z"/>',
  award:'<path d="M12 14.6a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z"/><path d="M8.6 13.6 7 21l5-2.4 5 2.4-1.6-7.4"/>',
  globe:'<path d="M20.6 12a8.6 8.6 0 1 0-17.2 0 8.6 8.6 0 0 0 17.2 0Z"/><path d="M3.6 12h16.8"/><path d="M12 3.4c2.4 2.6 2.4 14.6 0 17.2M12 3.4c-2.4 2.6-2.4 14.6 0 17.2"/>',
  cpu:'<path d="M9.2 9.2h5.6v5.6H9.2V9.2Z"/><path d="M8.6 4.4v2.8M15.4 4.4v2.8M8.6 16.8v2.8M15.4 16.8v2.8M4.4 8.6h2.8M4.4 15.4h2.8M16.8 8.6h2.8M16.8 15.4h2.8"/>',
  fileText:'<path d="M13.8 3.6H7.6A1.6 1.6 0 0 0 6 5.2v13.6a1.6 1.6 0 0 0 1.6 1.6h8.8a1.6 1.6 0 0 0 1.6-1.6V7.6l-4.2-4Z"/><path d="M13.6 3.6v4.2h4.2"/><path d="M9.2 12.4h5.6M9.2 15.6h3.8"/>',
  database:'<path d="M4.6 6.6c0-1.4 3.3-2.5 7.4-2.5s7.4 1.1 7.4 2.5-3.3 2.5-7.4 2.5-7.4-1.1-7.4-2.5Z"/><path d="M4.6 6.6v10.8c0 1.4 3.3 2.5 7.4 2.5s7.4-1.1 7.4-2.5V6.6"/><path d="M4.6 12c0 1.4 3.3 2.5 7.4 2.5s7.4-1.1 7.4-2.5"/>',
 };
 const SOLID=new Set(['boltSolid','play','stop','sparkle']);
 function icon(name,options={}){
  const body=P[name];
  if(!body)return '';
  const size=options.size||16;
  const solid=SOLID.has(name);
  return '<svg class="ojt-i'+(options.cls?' '+options.cls:'')+'" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" aria-hidden="true" focusable="false"'
   +' fill="'+(solid?'currentColor':'none')+'" stroke="'+(solid?'none':'currentColor')+'"'
   +' stroke-width="'+(options.stroke||1.6)+'" stroke-linecap="round" stroke-linejoin="round">'+body+'</svg>';
 }
 /** 按经历区块名挑图标；识别不出时给中性提示图标。 */
 function forSection(text){
  const s=String(text||'');
  if(/教育|学历|学习经历|学校/.test(s))return 'graduation';
  if(/工作|实习|职业|单位/.test(s))return 'briefcase';
  if(/项目/.test(s))return 'folder';
  if(/竞赛|获奖|荣誉|奖励|奖项/.test(s))return 'award';
  if(/语言|外语|英语/.test(s))return 'globe';
  if(/技能|计算机|IT能力|资格证书/.test(s))return 'cpu';
  if(/论文|研究|学术|成果/.test(s))return 'fileText';
  if(/个人|基本|联系/.test(s))return 'user';
  return 'alert';
 }
 globalThis.OJT_ICONS={paths:P,icon,forSection};
})();
