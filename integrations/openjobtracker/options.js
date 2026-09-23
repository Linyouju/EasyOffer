globalThis.EasyOfferMetricSink=metric=>chrome.runtime.sendMessage({type:'EASY_V2_METRIC',metric});
/**
 * options.js
 * 设置中心逻辑：选择 / 授权本地 Excel 文件、读取 / 保存大模型配置与个人网申信息。
 * Excel 文件句柄持久化在 IndexedDB（chrome.storage 无法保存句柄），
 * 工作表名等普通配置保存在 chrome.storage.local，均仅存于用户本地。
 */

// 当前已选择并授权的 Excel 文件句柄（内存态，来自 IndexedDB）
let excelHandle = null;
// 通用 OpenAI Chat Completions 兼容接口配置字段
const LLM_FIELDS = ['llm_base_url', 'llm_model', 'llm_api_key'];
const LLM_PRESETS = {
  openai: { url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  deepseek: { url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  volcengine: { url: 'https://ark.cn-beijing.volces.com/api/v3', model: '' },
  dashscope: { url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  moonshot: { url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  zhipu: { url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  siliconflow: { url: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct' },
  openrouter: { url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  ollama: { url: 'http://localhost:11434/v1', model: 'llama3.2' }
};
// 个人资料字段（教育相关信息已移至「教育经历」板块）
const PROFILE_FIELDS = [
  'name', 'phone', 'email',
  'idCard', 'gender', 'birthday', 'hometown', 'intro'
];

/**
 * 多段经历板块定义。
 * key       : 存储与 DOM 容器标识（eduList / workList / projectList）
 * listId    : 对应 HTML 容器 id
 * title     : 每段标题前缀
 * subfields : 每段包含的子字段 [{ key, label, placeholder }]
 */
const EXPERIENCE_SECTIONS = {
  education: {
    listId: 'eduList',
    title: '教育经历',
    subfields: [
      { key: 'school', label: '学校', placeholder: '示例大学' },
      { key: 'major', label: '专业', placeholder: '计算机科学与技术' },
      { key: 'degree', label: '学历', placeholder: '本科 / 硕士' },
      { key: 'period', label: '起止时间', placeholder: '2022.09 - 2026.06' }
    ]
  },
  work: {
    listId: 'workList',
    title: '工作经历',
    subfields: [
      { key: 'company', label: '公司', placeholder: 'XX 科技有限公司' },
      { key: 'position', label: '职位', placeholder: '软件工程师' },
      { key: 'period', label: '起止时间', placeholder: '2023.07 - 至今' },
      { key: 'description', label: '描述', placeholder: '主要职责与成果' }
    ]
  },
  campus: {listId:'campusList',title:'校园经历',subfields:[{key:'name',label:'经历名称',placeholder:'院系学生工作'},{key:'role',label:'职务',placeholder:'办公室主任'},{key:'period',label:'起止时间',placeholder:'2018.09 - 2019.06'},{key:'description',label:'职责描述',placeholder:'真实工作职责与成果'}]},
  project: {
    listId: 'projectList',
    title: '项目经历',
    subfields: [
      { key: 'name', label: '项目名', placeholder: 'XX 系统' },
      { key: 'role', label: '角色', placeholder: '后端负责人' },
      { key: 'period', label: '起止时间', placeholder: '2026.03 - 2026.08' },
      { key: 'description', label: '描述', placeholder: '项目内容与你的贡献' }
    ]
  }
};

/** 刷新「已选择文件 / 授权状态」展示与重新授权按钮 */
function updateExcelFileStatus(state, fileName) {
  const statusEl = document.getElementById('excelFileStatus');
  const reauthBtn = document.getElementById('excelReauthBtn');
  if (statusEl) {
    if (state === 'granted') {
      statusEl.textContent = `已选择：${fileName}（具备读写权限）`;
      statusEl.style.color = '#3d9c2c';
    } else if (state === 'prompt') {
      statusEl.textContent = `已选择：${fileName}，但写入权限已失效，请点击下方按钮重新授权`;
      statusEl.style.color = '#b25000';
    } else {
      statusEl.textContent = fileName ? `无法访问：${fileName}，请重新选择文件` : '尚未选择文件';
      statusEl.style.color = '#d70015';
    }
  }
  if (reauthBtn) reauthBtn.style.display = state === 'prompt' ? '' : 'none';
}

/** 页面加载时从 IndexedDB 恢复文件句柄并检查权限 */
async function restoreExcelHandle(savedFileName) {
  try {
    excelHandle = await ExcelStore.getHandle();
  } catch (err) {
    console.warn('[EasyOffer] 读取 Excel 句柄失败:', err);
    excelHandle = null;
  }
  if (!excelHandle) {
    updateExcelFileStatus('missing', savedFileName || '');
    return;
  }
  const permission = await ExcelStore.queryPermission(excelHandle);
  updateExcelFileStatus(permission, excelHandle.name || savedFileName || '');
}

/** 读取当前输入的工作表名（空则用默认名） */
function getSheetName() {
  const el = document.getElementById('excel_sheet_name');
  return (el && el.value.trim()) || ExcelStore.DEFAULT_SHEET_NAME;
}

/** 弹出系统文件选择器，选择用于读写的 .xlsx 并申请读写权限 */
async function pickExcelFile() {
  if (typeof window.showOpenFilePicker !== 'function') {
    showToast('当前浏览器不支持本地文件读写，请使用最新版 Chrome 或 Edge', true);
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{
        description: 'Excel 工作簿 (.xlsx)',
        accept: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
        }
      }],
      excludeAcceptAllOption: false,
      multiple: false
    });
    if (!/\.xlsx$/i.test(handle.name || '')) {
      showToast('请选择 .xlsx 格式的 Excel 文件', true);
      return;
    }
    // 必须由用户手势在页面上下文中申请读写权限（Service Worker 无法弹窗申请）
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      showToast('未授予文件读写权限，无法写入 Excel', true);
      return;
    }
    await ExcelStore.saveHandle(handle);
    excelHandle = handle;
    // 立即持久化文件名与工作表名，保证未点「保存设置」也能同步
    const { excelConfig = {} } = await chrome.storage.local.get('excelConfig');
    await chrome.storage.local.set({
      excelConfig: { ...excelConfig, fileName: handle.name, autoExport: document.getElementById('excel_auto').checked,
    sheetName: getSheetName() }
    });
    updateExcelFileStatus('granted', handle.name);
    showToast('已选择 Excel 文件并获得读写权限');
  } catch (err) {
    // 用户主动取消选择时 AbortError，无需报错打扰
    if (err && err.name !== 'AbortError') {
      console.error('[EasyOffer] 选择 Excel 文件失败:', err);
      showToast(`选择文件失败：${err.message || err}`, true);
    }
  }
}

/**
 * 从扩展内置模板新建一个 Excel 文件（表头已写好）。
 * 读取打包在扩展中的「投递记录模板.xlsx」，弹出保存对话框让用户选位置，
 * 自动写入模板内容并保存文件句柄——之后读写全自动。
 */
async function createExcelFile() {
  if (typeof window.showSaveFilePicker !== 'function') {
    showToast('当前浏览器不支持本地文件读写，请使用最新版 Chrome 或 Edge', true);
    return;
  }
  let handle;
  try {
    handle = await window.showSaveFilePicker({
      suggestedName: '投递记录.xlsx',
      types: [{
        description: 'Excel 工作簿 (.xlsx)',
        accept: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
        }
      }]
    });
  } catch (err) {
    if (err && err.name !== 'AbortError') {
      console.error('[EasyOffer] 新建 Excel 文件失败:', err);
      showToast(`新建文件失败：${err.message || err}`, true);
    }
    return;
  }

  // 读取扩展内置模板（含标准表头 + 列宽）
  let templateBuffer;
  try {
    const url = chrome.runtime.getURL('投递记录模板.xlsx');
    const resp = await fetch(url);
    templateBuffer = await resp.arrayBuffer();
  } catch (err) {
    console.error('[EasyOffer] 读取内置模板失败:', err);
    showToast(`读取内置模板失败：${err.message || err}`, true);
    return;
  }

  // 把模板写入用户选择的文件
  try {
    const writable = await handle.createWritable();
    await writable.write(new Blob([templateBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }));
    await writable.close();
  } catch (err) {
    showToast(`写入文件失败：${err.message || err}`, true);
    return;
  }

  // 保存句柄并持久化配置
  await ExcelStore.saveHandle(handle);
  excelHandle = handle;
  const { excelConfig = {} } = await chrome.storage.local.get('excelConfig');
  await chrome.storage.local.set({
    excelConfig: { ...excelConfig, fileName: handle.name, autoExport: document.getElementById('excel_auto').checked,
    sheetName: getSheetName() }
  });
  updateExcelFileStatus('granted', handle.name);
  showToast('已创建备份文件；如需同步后自动备份，请勾选自动备份并保存设置');
}

/** 对已保存的文件句柄重新发起读写授权（权限在浏览器重启后可能失效） */
async function reauthorizeExcelFile() {
  if (!excelHandle) {
    showToast('尚未选择文件，请先点击「选择 Excel 文件」', true);
    return;
  }
  try {
    const permission = await excelHandle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      showToast('未授予文件读写权限', true);
      return;
    }
    updateExcelFileStatus('granted', excelHandle.name);
    showToast('已重新获得读写权限');
  } catch (err) {
    showToast(`授权失败：${err.message || err}`, true);
  }
}

/** 页面加载时回填已保存的数据 */
async function restoreOptions() {
  const ready=await chrome.runtime.sendMessage({type:'OJT_LIBRARY_READY'});if(ready&&!ready.ok){showToast(ready.error,true);return;}
  const data = await chrome.storage.local.get([
    'excelConfig', 'llmConfig', 'userProfile', 'customFields', 'experiences'
  ]);
  const excel = data.excelConfig || {};
  const llm = data.llmConfig || {};
  document.getElementById('semantic_enabled').checked = llm.semantic_enabled !== false;
  document.getElementById('mapping_threshold').value = llm.mapping_threshold || 0.92;
  const profile = data.userProfile || {};
  const customFields = data.customFields || [];
  const experiences = data.experiences || {};

  // 回填工作表名
  const sheetEl = document.getElementById('excel_sheet_name');
  if (sheetEl) sheetEl.value = excel.sheetName || ExcelStore.DEFAULT_SHEET_NAME;
  // 尝试恢复已保存的文件句柄并刷新文件状态
  await restoreExcelHandle(excel.fileName);
  // 回填大模型配置：文本字段用 key 去掉 llm_ 前缀映射到存储
  LLM_FIELDS.forEach((key) => {
    const el = document.getElementById(key);
    const storeKey = key.replace('llm_', ''); // llm_base_url -> base_url
    if (el && llm[storeKey] != null) el.value = llm[storeKey];
  });
  const enabledEl = document.getElementById('llm_enabled');
  if (enabledEl) enabledEl.checked = Boolean(llm.enabled);
  const providerEl = document.getElementById('llm_provider');
  if (providerEl) providerEl.value = llm.provider || 'custom';
  PROFILE_FIELDS.forEach((key) => {
    const el = document.getElementById(key);
    if (el && profile[key] != null) el.value = profile[key];
  });

  // 渲染已保存的自定义字段
  customFields.forEach((f) => addCustomRow(f));
  updateCustomHead();

  // 渲染已保存的多段经历
  Object.keys(EXPERIENCE_SECTIONS).forEach((type) => {
    const items = experiences[type] || [];
    items.forEach((item) => addExperienceItem(type, item));
  });
}

/** 把 [data-icon] 占位替换成统一线性图标（纯呈现，不参与任何逻辑） */
function paintIcons(root = document) {
  const I = globalThis.OJT_ICONS;
  if (!I) return;
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = I.icon(el.dataset.icon, { size: Number(el.dataset.iconSize) || 15 });
  });
}

/**
 * 向某个经历板块添加一段。
 * @param {string} type education|work|project
 * @param {object} data 已保存的该段数据
 */
function addExperienceItem(type, data = {}) {
  const section = EXPERIENCE_SECTIONS[type];
  const list = document.getElementById(section.listId);
  const item = document.createElement('div');
  item.className = 'exp-item';

  // 段落标题按当前段数编号
  const index = list.querySelectorAll('.exp-item').length + 1;
  const fieldsHtml = section.subfields.map((sf) => {
    const isDesc = sf.key === 'description';
    const control = isDesc
      ? `<textarea class="exp-field" data-key="${sf.key}" placeholder="${sf.placeholder}"></textarea>`
      : `<input type="text" class="exp-field" data-key="${sf.key}" placeholder="${sf.placeholder}" />`;
    return `<div class="field"><label>${sf.label}</label>${control}</div>`;
  }).join('');

  item.innerHTML = `
    <div class="exp-title">${section.title} ${index}</div>
    <button type="button" class="btn-del" title="删除本段"><span data-icon="trash"></span></button>
    <div class="grid-2">${fieldsHtml}</div>
  `;
  paintIcons(item);

  // 回填已保存值
  section.subfields.forEach((sf) => {
    const el = item.querySelector(`.exp-field[data-key="${sf.key}"]`);
    if (el && data[sf.key] != null) el.value = data[sf.key];
  });

  item.querySelector('.btn-del').addEventListener('click', () => {
    item.remove();
    renumberExperience(type);
  });

  list.appendChild(item);
}

/** 删除后重新编号该板块的段落标题 */
function renumberExperience(type) {
  const section = EXPERIENCE_SECTIONS[type];
  const items = document.querySelectorAll(`#${section.listId} .exp-item`);
  items.forEach((item, i) => {
    item.querySelector('.exp-title').textContent = `${section.title} ${i + 1}`;
  });
}

/** 收集所有板块的多段经历（跳过整段空白的项） */
function collectExperiences() {
  const result = {};
  Object.keys(EXPERIENCE_SECTIONS).forEach((type) => {
    const section = EXPERIENCE_SECTIONS[type];
    const items = document.querySelectorAll(`#${section.listId} .exp-item`);
    const arr = [];
    items.forEach((item) => {
      const obj = {};
      let hasValue = false;
      section.subfields.forEach((sf) => {
        const el = item.querySelector(`.exp-field[data-key="${sf.key}"]`);
        const v = el ? el.value.trim() : '';
        obj[sf.key] = v;
        if (v) hasValue = true;
      });
      if (hasValue) arr.push(obj);
    });
    result[type] = arr;
  });
  return result;
}

/** 创建一行自定义字段输入 */
function addCustomRow(field = { label: '', keywords: '', value: '' }) {
  const list = document.getElementById('customList');
  const row = document.createElement('div');
  row.className = 'custom-row';
  row.innerHTML = `
    <div class="field"><input type="text" class="cf-label" placeholder="如 GitHub" /></div>
    <div class="field"><input type="text" class="cf-keywords" placeholder="如 github,主页,homepage" /></div>
    <div class="field"><input type="text" class="cf-value" placeholder="如 https://github.com/xxx" /></div>
    <button type="button" class="btn-del" title="删除"><span data-icon="trash"></span></button>
  `;
  paintIcons(row);
  row.querySelector('.cf-label').value = field.label || '';
  row.querySelector('.cf-keywords').value = field.keywords || '';
  row.querySelector('.cf-value').value = field.value || '';
  row.querySelector('.btn-del').addEventListener('click', () => {
    row.remove();
    updateCustomHead();
  });
  list.appendChild(row);
  updateCustomHead();
}

/** 有自定义行时才显示表头 */
function updateCustomHead() {
  const hasRows = document.querySelectorAll('#customList .custom-row').length > 0;
  document.getElementById('customHead').classList.toggle('show', hasRows);
}

/** 从页面收集自定义字段（过滤掉字段名为空的行） */
function collectCustomFields() {
  const rows = document.querySelectorAll('#customList .custom-row');
  const result = [];
  rows.forEach((row) => {
    const label = row.querySelector('.cf-label').value.trim();
    const keywords = row.querySelector('.cf-keywords').value.trim();
    const value = row.querySelector('.cf-value').value.trim();
    if (label) result.push({ label, keywords, value });
  });
  return result;
}

/** 从表单收集某组字段的值 */
function collectFields(fields) {
  const result = {};
  fields.forEach((key) => {
    const el = document.getElementById(key);
    result[key] = el ? el.value.trim() : '';
  });
  return result;
}

/** 显示提示 */
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

/**
 * 从 18 位身份证号解析生日与性别。
 * 第 7-14 位为出生年月日；第 17 位奇数为男、偶数为女。
 * @param {string} id 身份证号
 * @returns {{birthday:string, gender:string}|null}
 */
function parseIdCard(id) {
  const s = (id || '').trim().toUpperCase();
  if (!/^\d{17}[\dX]$/.test(s)) return null; // 只处理 18 位
  const year = s.slice(6, 10);
  const month = s.slice(10, 12);
  const day = s.slice(12, 14);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const gender = parseInt(s[16], 10) % 2 === 1 ? '男' : '女';
  return { birthday: `${year}-${month}-${day}`, gender };
}

/** 身份证输入后自动带出性别与生日（仅在对应字段为空时填入，不覆盖手填值） */
function handleIdCardInput() {
  const parsed = parseIdCard(document.getElementById('idCard').value);
  if (!parsed) return;
  const genderEl = document.getElementById('gender');
  const birthdayEl = document.getElementById('birthday');
  if (!birthdayEl.value) birthdayEl.value = parsed.birthday;
  if (!genderEl.value) genderEl.value = parsed.gender;
}

/** 保存所有设置 */
async function saveOptions() {
  // Excel 普通配置：文件名来自已授权句柄（未重新选择时沿用已保存值）
  const { excelConfig: prevExcel = {} } = await chrome.storage.local.get('excelConfig');
  const excelConfig = {
    fileName: excelHandle ? excelHandle.name : (prevExcel.fileName || ''),
    autoExport: document.getElementById('excel_auto').checked,
    sheetName: getSheetName()
  };
  const userProfile = collectFields(PROFILE_FIELDS);
  const customFields = collectCustomFields();
  const experiences = collectExperiences();

  // 收集通用模型配置：文本字段去掉 llm_ 前缀存储，enabled/provider 单独处理
  const mappingThreshold = Number(document.getElementById('mapping_threshold').value);
  if (!Number.isFinite(mappingThreshold) || mappingThreshold < 0.8 || mappingThreshold > 1) { showToast('置信度门槛请填写 0.80 到 1.00'); return; }
  const llmConfig = {
    semantic_enabled: document.getElementById('semantic_enabled').checked,
    mapping_threshold: mappingThreshold,
    enabled: document.getElementById('llm_enabled').checked,
    provider: document.getElementById('llm_provider')?.value || 'custom'
  };
  LLM_FIELDS.forEach((key) => {
    const el = document.getElementById(key);
    llmConfig[key.replace('llm_', '')] = el ? el.value.trim() : '';
  });

  try {
    await chrome.storage.local.set({excelConfig,llmConfig});
    showToast('AI 与导出设置已保存；个人资料请在资料库中按记录保存');
  } catch (err) {
    console.error('[EasyOffer] 保存失败:', err);
    showToast('保存失败，请重试', true);
  }
}

function applyLlmPreset() {
  const provider = document.getElementById('llm_provider')?.value;
  const preset = LLM_PRESETS[provider];
  if (!preset) return;
  const urlEl = document.getElementById('llm_base_url');
  const modelEl = document.getElementById('llm_model');
  if (urlEl) urlEl.value = preset.url;
  if (modelEl) modelEl.value = preset.model;
}

async function testLlmConnection() {
  const result = document.getElementById('llmTestResult');
  const baseUrl = document.getElementById('llm_base_url')?.value.trim().replace(/\/+$/, '');
  const model = document.getElementById('llm_model')?.value.trim();
  const apiKey = document.getElementById('llm_api_key')?.value.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(baseUrl) || !model || !apiKey) {
    result.textContent = '请填写有效的 URL、模型 ID 和 API Key';
    result.style.color = '#d70015';
    return;
  }
  result.textContent = '正在测试连接…';
  result.style.color = '';
  try {
    const parsedUrl = new URL(baseUrl);
    const granted = await chrome.permissions.request({ origins: [`${parsedUrl.origin}/*`] });
    if (!granted) throw new Error('未获得该模型服务域名的访问权限');
    const mappings=await SemanticMapper.requestMappings({
      fields:[{id:'f0',label:'与您联系的电话号码',type:'tel'},{id:'f1',label:'您在这个项目中担任的职务',type:'text',section:'项目经历'}],
      bank:[{id:'profile.phone',label:'手机号',kind:'text',group:'基本资料'},{id:'project.0.role',label:'项目角色',kind:'text',group:'项目经历 1'}]
    }, {enabled:true,base_url:baseUrl,api_key:apiKey,model,mapping_threshold:0.92});
    if(!mappings.some(m=>m.fieldId==='f0'&&m.sourceId==='profile.phone'&&m.accepted)||!mappings.some(m=>m.fieldId==='f1'&&m.sourceId==='project.0.role'&&m.accepted)) throw new Error('接口已响应，但未通过语义填表验证');
    result.textContent='正在测试页面理解、投递状态和描述整理…';
    await ModelGateway.probe({enabled:true,base_url:baseUrl,api_key:apiKey,model:mappings.model||model});
    result.textContent = '测试通过：字段映射、页面理解、投递状态、描述整理（'+(mappings.model||model)+'）';
    result.style.color = '#3d9c2c';
    if(model.toLowerCase()==='claude' && mappings.model){document.getElementById('llm_model').value=mappings.model;const {llmConfig={}}=await chrome.storage.local.get('llmConfig');await chrome.storage.local.set({llmConfig:{...llmConfig,model:mappings.model}});}
  } catch (err) {
    result.textContent = `连接失败：${err.message}`;
    result.style.color = '#d70015';
  }
}

// 渲染静态占位图标（页头品牌、卡片标题、按钮）
paintIcons();

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('excelCreateBtn').addEventListener('click', createExcelFile);
document.getElementById('excelPickBtn').addEventListener('click', pickExcelFile);
document.getElementById('excelReauthBtn').addEventListener('click', reauthorizeExcelFile);
document.getElementById('llm_provider').addEventListener('change', applyLlmPreset);
document.getElementById('llmTestBtn').addEventListener('click', testLlmConnection);
document.getElementById('saveBtn').addEventListener('click', saveOptions);
document.getElementById('addFieldBtn').addEventListener('click', () => addCustomRow());
// 身份证号变化/失焦时自动解析性别与生日
document.getElementById('idCard').addEventListener('blur', handleIdCardInput);
document.getElementById('idCard').addEventListener('input', handleIdCardInput);

// 绑定三个「添加一段经历」按钮（按 data-exp 区分板块）
document.querySelectorAll('.btn-add[data-exp]').forEach((btn) => {
  btn.addEventListener('click', () => addExperienceItem(btn.dataset.exp));
});

// Opt-in only: visiting a permitted recruiting page may update the authoritative ledger.
(()=>{const label=document.createElement('label');label.style.cssText='display:block;margin:16px';const input=document.createElement('input');input.type='checkbox';label.append(input,document.createTextNode(' 访问已手动同步过的招聘网站时自动检查投递状态（仅浏览器运行期间）'));document.body.append(label);chrome.storage.local.get('easyOfferV2').then(x=>{input.checked=x.easyOfferV2?.autoSync===true;});input.addEventListener('change',async()=>{const x=await chrome.storage.local.get('easyOfferV2');await chrome.storage.local.set({easyOfferV2:{...x.easyOfferV2,autoSync:input.checked}});});})();

chrome.storage.local.get('excelConfig').then(x=>{document.getElementById('excel_auto').checked=x.excelConfig?.autoExport===true;});

// Personal tracking scope: sharing the extension must not impose the author's preference.
(()=>{const label=document.createElement('label');label.style.cssText='display:block;margin:16px';const input=document.createElement('input');input.type='checkbox';label.append(input,document.createTextNode(' 秋招投递同步：跳过明确标注的实习岗位（不删除已有记录）'));document.body.append(label);chrome.storage.local.get('easyOfferV2').then(x=>{input.checked=x.easyOfferV2?.excludeInternships===true;});input.addEventListener('change',async()=>{const x=await chrome.storage.local.get('easyOfferV2');await chrome.storage.local.set({easyOfferV2:{...x.easyOfferV2,excludeInternships:input.checked}});});})();
