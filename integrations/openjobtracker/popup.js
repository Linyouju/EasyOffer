/**
 * popup.js
 * 工具栏弹窗逻辑：
 *  - 一键填充本页：向当前标签页 content.js 发送填表指令
 *  - 同步进度到 Excel：让 content.js 抓取岗位信息，校验后交给 background.js 覆盖写入本地 Excel
 *  - 配置个人资料：打开设置页
 */

/** 把占位元素替换成统一线性图标（纯呈现，不参与任何业务判断） */
function paintIcons() {
  const I = globalThis.OJT_ICONS;
  if (!I) return;
  // stroke 统一传 2，避免混用不同粗细的图标；实心图标（闪电）本身不带描边，忽略该参数。
  const put = (id, name, size, stroke = 2) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = I.icon(name, { size, stroke });
  };
  // 品牌标识（左上角）用真 logo 图片，不用图标占位
  const brandMark = document.getElementById('brandMark');
  if (brandMark) brandMark.innerHTML = '<img src="icons/icon128.png" alt="">';

  // 主 CTA：闪电是「动作图标」，实心黑，与视觉基准一致（底板 34 → 图标 18 / 箭头 16）
  put('ctaIcon', 'boltSolid', 18);
  put('ctaArrow', 'arrowRight', 16);

  // 次级列表项：两项同一套尺寸（底板 34 → 图标 17 / chevron 15）
  put('syncIcon', 'chart', 17);
  put('syncGo', 'chevronRight', 15);
  put('deskIcon', 'list', 17);
  put('deskGo', 'chevronRight', 15);

  // 个人资料：右上角图标按钮（按钮 28 → 图标 15，无文字、无 chevron）
  put('optionsIcon', 'user', 15);
}

/** 更新底部日志反馈 */
function setLog(text, status = '') {
  document.getElementById('logText').textContent = text;
  const dot = document.getElementById('logDot');
  dot.className = 'dot' + (status ? ' ' + status : '');
}

/** 获取当前活动标签页 */
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * 向指定标签页发送消息。
 * 若 content.js 尚未注入（如页面未匹配 content_scripts），则用 scripting 动态注入后重试。
 */
async function sendToContent(tabId, message) {
 const tab=await chrome.tabs.get(tabId);const origin=new URL(tab.url).origin+'/*';if(!await chrome.permissions.contains({origins:[origin]}))await chrome.permissions.request({origins:[origin]});
 const frames=await chrome.webNavigation.getAllFrames({tabId});const results=[],failures=[];
 for(const frame of frames||[{frameId:0}]){try{
  const version=await chrome.tabs.sendMessage(tabId,{type:'OJT_VERSION'},{frameId:frame.frameId}).catch(()=>null);
  if(version?.version!==chrome.runtime.getManifest().version)await chrome.scripting.executeScript({target:{tabId,frameIds:[frame.frameId]},files:["ui-icons.js", "job-validator.js", "v2/application-core.js", "semantic-mapper.js", "content.js", "application-agent.js", "v2/page-observer.js", "v2/semantic-planner.js", "v2/form-adapter.js", "v2/page-runtime.js", "agent-dom.js"]});
  const observed=await chrome.tabs.sendMessage(tabId,{type:'EASY_V2_OBSERVE'},{frameId:frame.frameId});
  if(message.type==='START_APPLICATION_AGENT'&&!observed?.result?.fields?.length)continue;
  results.push(await chrome.tabs.sendMessage(tabId,message,{frameId:frame.frameId}));
 }catch(e){failures.push({frameId:frame.frameId,error:e.message});}}
 const result=results.find(r=>r?.ok&&!r.result?.noRecords)||results[0];return result?{...result,frames:results.length,frameFailures:failures}:{ok:false,error:'未找到有权限的可操作框架',frameFailures:failures};
}

/** 一键填充本页 */
async function handleFill() {
  setLog('正在填充本页表单…', 'busy');
  try {
    const tab = await getActiveTab();
    const res = await sendToContent(tab.id, { type: 'START_APPLICATION_AGENT' });
    if (res && res.ok) {
      setLog(res.message || `已填充 ${res.filledCount} 个字段`, 'ok');
    } else {
      setLog(res?.message || res?.error || '未找到可填充字段', 'err');
    }
  } catch (err) {
    console.error(err);
    setLog('填充失败：请在网申页面重试', 'err');
  }
}

/** Observe every accessible frame through the shared planner and authority. */
async function handleSync() {
  setLog('AI 正在理解岗位与投递状态…', 'busy');
  try {
    const tab = await getActiveTab();
    if (new URL(tab.url).hostname === 'autumn-career-desk-qpc.linyouju.chatgpt.site') {
      setLog('请在招聘网站点击同步；工作台用于查看和管理记录。', 'err');
      return;
    }
    const response=await sendToContent(tab.id,{type:'EASY_V2_SYNC_PAGE'});
    if(!response?.ok)throw Error(response?.error||'页面理解未完成');
    const r=response.result||{};
    const text=r.busy?'本页正在分析，请稍候':r.noRecords?'暂未识别出可同步记录':r.unchanged?'页面状态未变化':!r.results?.length&&r.excluded?.length?'已跳过实习岗位，无需同步':r.unresolved?.length?'部分记录尚未核实，已保留待重试':r.results?.some(x=>x.pending)?'有记录归属待核对，已保留页面证据':r.desk==='confirmed'?'工作台已更新':'已记录，待工作台接收';
    const partial=response.frameFailures?.length?'；部分页面框架未能读取':'';
    const excel=r.authoritySaved&&!r.excel?.skipped?'；Excel '+(r.excel?.pending?'待重试':'已导出'):'';
    setLog(text+partial+excel+(r.results?.length&&r.excluded?.length?'；已跳过 '+r.excluded.length+' 条实习岗位':''),r.noRecords||r.unresolved?.length||r.results?.some(x=>x.pending)?'err':'ok');
  } catch (err) {
    setLog('同步未完成：'+err.message, 'err');
  }
}

/** 打开配置页 */
function handleOptions() {
  chrome.runtime.openOptionsPage();
}

/**
 * 打开秋招工作台。
 * 交给后台处理：已经开过就聚焦过去，没开过才新建标签页，避免每点一次就多攒一个标签页。
 * 工作台地址与插件消息通道都是既有的，这里只是加一个入口，不改动桥接逻辑。
 */
function handleDesk() {
  try {
    const done = chrome.runtime.sendMessage({ type: 'EASYOFFER_OPEN_DESK' });
    if (done && typeof done.catch === 'function') done.catch(() => {});
  } catch (_) { /* 后台不可用时静默，不打断弹窗 */ }
}

document.getElementById('fillBtn').addEventListener('click', handleFill);
document.getElementById('syncBtn').addEventListener('click', handleSync);
document.getElementById('optionsBtn').addEventListener('click', handleOptions);
document.getElementById('deskBtn').addEventListener('click', handleDesk);

// 初始化：渲染图标与版本号，检查是否已选择 Excel 文件
(async function init() {
  paintIcons();
  const versionEl = document.getElementById('version');
  if (versionEl) versionEl.textContent = 'v' + chrome.runtime.getManifest().version;
  const { excelConfig } = await chrome.storage.local.get('excelConfig');
  if (!excelConfig || !excelConfig.fileName) {
    setLog('在招聘页开始填写或同步；个人资料在管理页维护');
  }
})();
