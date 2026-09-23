/**
 * content.js
 * 页面注入脚本，包含两大模块：
 *  1. 自动填表模块：读取 userProfile，智能匹配并填充表单字段（兼容 React/Vue）。
 *  2. 进度抓取模块：extractJobInfo() 从 DOM 中提取公司、岗位、投递状态。
 */

(function () {
  'use strict';
  if(globalThis.__ojtListener && typeof chrome !== 'undefined')chrome.runtime.onMessage.removeListener(globalThis.__ojtListener);

  // ============ 字段匹配规则 ============
  // key 为 userProfile 字段，value 为用于模糊匹配的关键词（中英文）
  const FIELD_KEYWORDS = {
    name: ['姓名', '名字', '本人姓名', '申请人', '应聘者', 'fullname', 'full name', 'realname', 'real name', 'yourname', 'your name', '真实姓名', 'applicant', 'candidate'],
    phone: ['手机', '手机号', '手机号码', '电话', '电话号码', '移动电话', '联系电话', '联系方式', 'phone', 'phonenumber', 'phone number', 'mobile', 'mobilephone', 'cellphone', 'cell', 'tel', 'telephone', 'contact', 'contactnumber'],
    email: ['邮箱', '电子邮箱', '电子邮件', '邮件地址', 'email', 'emailaddress', 'email address', 'e-mail', 'mail', 'mailbox'],
    wechat: ['微信', '微信号', 'wechat', 'weixin', 'wx'],
    qq: ['qq', 'qq号', 'qq号码'],
    school: ['学校', '院校', '毕业院校', '就读院校', '就读学校', '毕业学校', 'school', 'university', 'college', 'institution', 'alma mater'],
    major: ['专业', '所学专业', '专业名称', '学科', 'major', 'discipline', 'speciality', 'specialty', 'field of study', 'subject'],
    degree: ['学历', '学位', '最高学历', '文化程度', '教育程度', 'degree', 'education', 'educationlevel', 'education level', 'qualification', 'academic degree'],
    graduationYear: ['毕业年份', '毕业时间', '毕业年月', '预计毕业', '毕业日期', 'graduation', 'graduationyear', 'graduation year', 'graduation date', 'gradyear', 'grad year', '毕业年'],
    idCard: ['身份证', '身份证号', '身份证号码', '证件号码', '证件号', 'idcard', 'id card', 'idnumber', 'id number', 'identity', 'identitycard', 'identification'],
    gender: ['性别', 'gender', 'sex'],
    nation: ['民族', 'nation', 'nationality', 'ethnic', 'ethnicity'],
    politicalStatus: ['政治面貌', '党团', '政治', 'political', 'political status', 'political affiliation'],
    maritalStatus: ['婚姻状况', '婚姻', '婚否', 'marital', 'marital status', 'marriage'],
    birthday: ['生日', '出生日期', '出生年月', '出生年月日', '出生', 'birthday', 'birth', 'birthdate', 'birth date', 'dateofbirth', 'date of birth', 'dob'],
    hometown: ['籍贯', '户籍', '户籍所在地', 'hometown', 'native place', 'nativeplace', 'birthplace', 'domicile', '祖籍', '原籍'],
    currentCity: ['现居', '现居地', '现居住地', '居住地', '所在城市', '所在地', '现所在地', 'current city', 'currentcity', 'residence', 'living city', 'location'],
    address: ['地址', '通讯地址', '联系地址', '家庭住址', '住址', 'address', 'mailing address', 'contact address'],
    expectedCity: ['期望城市', '意向城市', '期望工作地', '意向工作地', '期望工作城市', 'expected city', 'preferred city', 'desired location'],
    expectedSalary: ['期望薪资', '期望薪水', '薪资要求', '期望月薪', '薪资期望', 'expected salary', 'salary expectation', 'desired salary'],
    gpa: ['gpa', '绩点', '平均绩点', '成绩', 'grade point'],
    intro: ['自我介绍', '简介', '个人简介', '个人评价', '个人陈述', 'introduction', 'introduce', 'about', 'aboutme', 'about me', 'summary', 'self introduction', 'bio', 'profile', '个人描述']
  };

  // 具有「日期语义」的内置字段：这类字段若落在自定义弹层选择器上，走 fillDatePicker
  const DATE_FIELDS = new Set(['birthday', 'graduationYear']);
  const EXPERIENCE_DATE_FIELDS = new Set(['period']);

  // 各日期字段的业务规则：最早年份、是否允许未来日期、最多允许超前的年数
  const DATE_RULES = {
    birthday: { minYear: 1900, allowFuture: false },
    graduationYear: { minYear: 1900, allowFuture: true, maxAheadYears: 10 },
    period: { minYear: 1900, allowFuture: true, maxAheadYears: 10 }
  };

  // 长文本兜底长度上限（组件未声明 maxlength 时使用）
  const LONG_TEXT_MAX = 2000;

  /**
   * 使用原生 Setter 设置 input/textarea 的值，并派发事件，
   * 以便 React/Vue 等框架能感知到值的变化。
   */
  function setNativeValue(element, value, preserveOriginal=false) {
    if(element.isContentEditable){
      if(element.innerText.trim())return false;
      element.focus();element.textContent=String(value);
      element.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:String(value)}));
      element.dispatchEvent(new Event('change',{bubbles:true}));element.blur();return element.innerText.trim()===String(value).trim();
    }
    // 原生 <select> 交给 fillSelect 处理（按 option 匹配）
    if (element.tagName === 'SELECT') {
      return fillSelect(element, value);
    }
    // 日期/月份输入框：date 需要 YYYY-MM-DD，month 需要 YYYY-MM
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (['date', 'month'].includes(type)) {
      const parts = parseDateParts(value);
      if(!parts || (type==='date'&&parts.precision!=='day') || (type==='month'&&parts.precision==='year'))return false;
      const iso = normalizeDateValue(value);
      if (!isValidDateString(iso)) return false;
      value = type === 'month' ? iso.slice(0, 7) : iso;
    } else if (element instanceof HTMLTextAreaElement) {
      if(preserveOriginal){value=String(value);const max=getMaxLength(element);if(max&&value.length>max)return false;}
      else value = formatLongText(value, getMaxLength(element));
      if (!value) return false;
    } else {
      value = sanitizeText(value);
      const max = getMaxLength(element);
      if (max && value.length > max) value = value.slice(0, max);
      if (!value) return false;
    }
    const proto = element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }
    // 依次派发常见框架监听的事件
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  /** 读取控件声明的最大长度（maxlength / data-maxlength），无声明返回 0 */
  function getMaxLength(element) {
    const raw = element.getAttribute('maxlength') || element.getAttribute('data-maxlength');
    const max = Number(raw);
    return Number.isFinite(max) && max > 0 ? max : 0;
  }

  /**
   * 单行文本清洗：去掉不可见控制字符，把换行/制表压成空格，并裁剪首尾空白。
   */
  function sanitizeText(value) {
    return String(value ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 长文本（textarea）格式化：
   *  - 统一换行符为 \n，去除不可见控制字符与零宽字符；
   *  - 压缩连续空行（最多保留一个空行），裁剪每行行尾空格；
   *  - 按 maxlength 截断，优先在句末/换行处断开，避免截出半句话。
   * @param {string} value 原始文本
   * @param {number} maxLength 上限；0 表示使用 LONG_TEXT_MAX 兜底
   */
  function formatLongText(value, maxLength) {
    let text = String(value ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g, '')
      .replace(/[ \t\u00A0\u3000]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!text) return '';
    const limit = maxLength || LONG_TEXT_MAX;
    if (text.length <= limit) return text;
    const cut = text.slice(0, limit);
    // 在最后一个句末标点或换行处截断，且不能丢掉超过 20% 的内容
    const breakAt = Math.max(
      cut.lastIndexOf('\n'),
      cut.lastIndexOf('。'), cut.lastIndexOf('；'), cut.lastIndexOf('！'), cut.lastIndexOf('？'),
      cut.lastIndexOf('. '), cut.lastIndexOf('; ')
    );
    return (breakAt > limit * 0.8 ? cut.slice(0, breakAt + 1) : cut).trim();
  }

  /**
   * 把任意性别写法归一到 male / female / other / secret。
   * 注意顺序：female 含 male 子串，必须先判 female；中文同理先判更具体的词。
   */
  function normalizeGender(value) {
    const text = normalize(value);
    if (!text) return '';
    // female 含 male 子串，必须先判 female；中文同理先判更具体的词
    if (/其他|其它|other/.test(text)) return 'other';
    if (/保密|未知|不透露|不公开|prefernottosay|secret/.test(text)) return 'secret';
    if (/女|female|woman|women/.test(text)) return 'female';
    if (/男|male|man|men/.test(text)) return 'male';
    if (text === 'f') return 'female';
    if (text === 'm') return 'male';
    return '';
  }

  // 选项文本无法识别时，退回按 value 编码匹配（各站编码不统一，仅作兜底）
  const GENDER_VALUE_CODES = {
    male: ['1', 'm'],
    female: ['0', 'f'],
    other: ['3', 'other'],
    secret: ['2', 'unknown', 'secret']
  };

  /**
   * 取单选按钮对应的选项文本。
   * 只接受「足够具体」的来源：aria-label、关联/包裹的 label、仅含该按钮的父容器，
   * 避免把同组其它选项（男 女 其他）的文本一起读进来导致误判。
   */
  function getRadioOptionText(radio) {
    const label = radio.id
      ? document.querySelector(`label[for="${CSS.escape(radio.id)}"]`)
      : null;
    const parent = radio.parentElement;
    const soleParentText = parent && parent.querySelectorAll('input[type="radio"]').length === 1
      ? parent.textContent
      : '';
    const text = [
      radio.getAttribute('aria-label'),
      label?.textContent,
      radio.closest('label')?.textContent,
      soleParentText
    ].map((t) => cleanText(t || '')).find((t) => t && t.length <= 20);
    return text || radio.value || '';
  }

  /**
   * 勾选性别单选按钮（男 / 女 / 其他 / 保密）。
   * @param {HTMLInputElement} radio 命中性别语义的任一单选按钮
   * @param {string} value 用户资料中的性别值
   * @returns {boolean} 是否成功勾选
   */
  function fillGenderRadio(radio, value) {
    const target = normalizeGender(value);
    if (!target) return false;
    const groupName = radio.getAttribute('name');
    const scope = radio.closest('.brick-field,.ant-form-item,.el-form-item,fieldset,form') || document;
    const radios = Array.from(scope.querySelectorAll('input[type="radio"]'))
      .filter((item) => (!groupName || item.getAttribute('name') === groupName) &&
        !item.disabled && isVisibleControl(item));
    // 1) 按选项文本语义匹配
    let match = radios.find((item) => normalizeGender(getRadioOptionText(item)) === target);
    // 2) 文本不可识别（如选项只有图标/编码）时按 value 编码兜底
    if (!match) {
      const codes = GENDER_VALUE_CODES[target] || [];
      match = radios.find((item) => codes.includes(normalize(item.value || '')));
    }
    if (!match) return false;
    if (match.checked) return true;
    match.click();
    if (!match.checked) match.checked = true;
    match.dispatchEvent(new Event('input', { bubbles: true }));
    match.dispatchEvent(new Event('change', { bubbles: true }));
    return match.checked;
  }


  /**
   * 下拉选项匹配的**唯一入口**：完全相等 → 收紧的互相包含，两者都要求唯一命中。
   *
   * 为什么必须统一：从前原生 <select> 只认完全相等（「竞赛」对不上「竞赛获奖」就放弃），
   * 而自定义下拉却用宽松的 includes 且不做唯一性检查（可能选中一个毫不相干的选项）。
   * 一个太死、一个太松，都是缺陷。这里收敛成同一套规则，两条路径共用。
   *
   * 「收紧」的含义：只接受「短的 是 长的 的前缀/后缀，且长度差不超过 LOOSE_MAX_DIFF」。
   *   「竞赛」  vs 「竞赛获奖」    → 差 2 字，且是前缀 ✓
   *   「本科」  vs 「本科及以上」  → 差 3 字，且是前缀 ✓
   *   「三等奖」vs 「浙江省三等奖」→ 差 3 字，且是后缀 ✓
   *   「设计」  vs 「2026 未来设计师·全国高校数字艺术设计大赛」 → 不是前缀/后缀 ✗
   * 最后这种正是宽松 includes 会误中的情形，所以必须收紧。
   *
   * 命中 0 个或 ≥2 个一律返回 null —— 宁可留空并计入未填原因，也不猜。
   *
   * @param {{el:Element,text:string}[]} candidates text 必须已归一化（normalize/choiceNorm）
   * @param {string} targetText 目标值，必须用与 candidates 相同的归一化方式处理过
   * @returns {Element|null}
   */
  const LOOSE_MAX_DIFF = 3;
  /**
   * 单个选项文本是否「可以接受」为目标值。
   * 与 pickOption 共用同一套规则——**写入端与校验端必须一致**：
   * 否则「竞赛」写进「竞赛获奖」之后，校验端按一字不差判定失败，会把这个刚填上的值回滚掉。
   * 对文本字段也安全：长度差超过 LOOSE_MAX_DIFF 一律不接受，长文本被截断不会被误判为通过。
   */
  function optionMatches(optionText, target) {
    const text = normalize(optionText), want = normalize(target);
    if (!text || !want) return false;
    if (text === want) return true;
    if (text.length < 2 || want.length < 2) return false;
    if (Math.abs(text.length - want.length) > LOOSE_MAX_DIFF) return false;
    return text.startsWith(want) || text.endsWith(want) || want.startsWith(text) || want.endsWith(text);
  }

  function pickOption(candidates, targetText) {
    const target = String(targetText || '');
    if (!target) return null;
    const exact = candidates.filter((c) => c.text === target);
    if (exact.length === 1) return exact[0].el;
    if (exact.length > 1) return null;
    const loose = candidates.filter((c) => c.text !== target && optionMatches(c.text, target));
    return loose.length === 1 ? loose[0].el : null;
  }

  /**
   * 为原生 <select> 选中一个 option。
   * 先用 pickOption 按选项文本匹配（相等 → 收紧的包含），再退回按 value 编码匹配。
   * 没命中或命中多个一律返回 false。
   * @param {HTMLSelectElement} select
   * @param {string} value 目标文本（如 "本科"、"男"、"2026"）
   * @returns {boolean} 是否成功选中
   */
  function fillSelect(select, value) {
    if (!value) return false;
    const part=dateSegment(select);
    const choice=v=>part?dateChoiceValue(v,part):normalize(v);
    const target = choice(value);
    const options = Array.from(select.options).filter(o=>!o.disabled&&o.value!=='');
    let match = pickOption(options.map((o)=>({el:o,text:choice(o.textContent)})), target);
    // 选项文本都对不上时，退回按 value 编码匹配（各站编码不统一，仅作兜底）
    if (!match) {
      const byValue = options.filter((o)=>normalize(o.value)===target);
      match = byValue.length===1 ? byValue[0] : null;
    }
    if (!match) return false;
    // 用原生 value setter，保证 React 受控 select 也能感知。
    // window.HTMLSelectElement 可能不存在（Node 测试用的极简 DOM 桩），所以先判断再取。
    const setter = window.HTMLSelectElement
      ? Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set
      : null;
    if (setter) setter.call(select, match.value);
    else select.value = match.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /**
   * 将日期值规整为 <input type=date> 需要的 YYYY-MM-DD 格式。
   * 支持 "2002-11"、"2002/11/05"、"2002.11" 等常见写法；无法解析时返回原值。
   */
  function normalizeDateValue(value) {
    if (!value) return '';
    const text = String(value).trim();
    // 支持 20021105 这类纯数字写法
    const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    const m = compact || text.match(/^(\d{4})[-/.年]\s*(\d{1,2})(?:[-/.月]\s*(\d{1,2}))?[月日]?$/);
    if (!m) return '';
    const y = Number(m[1]);
    const mo = Number(m[2] || 1);
    const d = Number(m[3] || 1);
    if (mo < 1 || mo > 12) return '';
    // 按当月实际天数校验，拒绝 2 月 30 日这类非法值
    if (d < 1 || d > new Date(y, mo, 0).getDate()) return '';
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  /** 校验字符串是否为合法的 YYYY-MM-DD */
  function isValidDateString(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  }

  /**
   * 按字段的业务规则校验日期：年份下限、是否允许未来日期、允许超前的年数。
   * @param {{y:number,mo:number,d:number}} parts
   * @param {string} field 字段名（birthday / graduationYear / period 等）
   * @returns {boolean} 是否满足规则
   */
  function isDateWithinRule(parts, field) {
    const rule = DATE_RULES[field];
    if (!rule) return true;
    if (parts.y < rule.minYear) return false;
    const target = new Date(parts.y, parts.mo - 1, parts.d);
    const now = new Date();
    if (!rule.allowFuture) {
      // 非未来日期：仅比较到「日」，避免同日因时分秒被误判
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (target > today) return false;
    } else if (rule.maxAheadYears) {
      const limit = new Date(now.getFullYear() + rule.maxAheadYears, now.getMonth(), now.getDate());
      if (target > limit) return false;
    }
    return true;
  }

  /** 将日期值解析为 {y, mo, d} 数字对象；无法解析返回 null */
  function parseDateParts(value) {
    if(/^\d{4}$/.test(String(value).trim()))return {y:Number(value),mo:1,d:1,precision:'year'};
    const s = normalizeDateValue(value);
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]), precision: /^(?:\d{8}|\d{4}[-/.年]\s*\d{1,2}[-/.月]\s*\d{1,2}日?)$/.test(String(value).trim())?'day':'month' };
  }


  /** 睡眠 ms 毫秒（用于等待弹层日历渲染） */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** 判断控件当前展示文本是否已包含目标年月（兼容 2002.11 / 2002年11月 等写法） */
  function matchesDate(text, parts) {
    if(!parts)return false;
    const actual=parseDateParts(text);
    return Boolean(actual&&actual.y===parts.y&&(parts.precision==='year'||actual.precision!=='year'&&actual.mo===parts.mo&&(parts.precision==='month'||(actual.precision==='day'&&actual.d===parts.d))));
  }


  /**
   * 填充「自定义日期选择器」（Ant Design / Element UI / 自定义弹层等）。
   * 这类控件通常是一个 readonly <input> + 点击弹出日历面板，无法用原生 setter 生效。
   * 策略（逐级降级）：
   *  1) 直接写值：对 readonly input 用原生 setter 写入 YYYY-MM-DD 并派发事件，部分组件可感知；
   *  2) 模拟交互：点击输入框弹出面板，在面板内按「年 → 月 → 日」定位并点击对应单元格。
   * 全程防御：任一步失败即静默返回 false，不影响其它字段。
   *
   * @param {HTMLElement} el 日期输入框元素
   * @param {string} value 目标日期（任意常见写法）
   * @param {string} [field] 字段名，用于套用 DATE_RULES 业务规则校验
   * @returns {Promise<boolean>} 是否填充成功
   */
  function displayedControlValue(el) {
    if(el.tagName==='SELECT')return el.value?cleanText(el.selectedOptions?.[0]?.textContent||el.value):'';
    if(periodEndpoint(el)){const year=el.querySelector('[data-cy=year],[class$="-label-year"]')?.textContent.trim(),month=el.querySelector('[data-cy=month],[class$="-label-month"]')?.textContent.trim();return /^\d{4}$/.test(year)&&/^(0?[1-9]|1[0-2])$/.test(month)?year+'-'+month.padStart(2,'0'):'';}
    // Searchable selects expose a separate committed value. Their input is only a
    // query, and must never count as a successful selection (including dates).
    const holder=el.closest('[role="combobox"],[class*="select" i]');
    const display=holder?.querySelector('[class*="display-value"],.ant-select-selection-item,.el-select__selected-item,[data-selected-value]');
    if(display)return cleanText(display.textContent);
    const raw=String(el.value||'').trim();
    if(raw&&!/^(yyyy(?:[-/.]mm(?:[-/.]dd)?)?|请选择|开始日期|结束日期)$/i.test(raw))return raw;
    // Some pickers keep their search input empty and render the selected value beside it.
    for(let parent=el.parentElement,depth=0;parent&&depth<7;parent=parent.parentElement,depth++){
      if(parent.querySelectorAll('input,textarea,select').length>1)break;
      const leaves=Array.from(parent.querySelectorAll('span,div')).filter(n=>!n.contains(el)&&!n.children.length&&isVisibleControl(n));
      const selected=leaves.map(n=>cleanText(n.textContent)).find(t=>/^\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?$/.test(t)||/^(实习|全职|兼职|其他|国家级|省区级|省市级|省级|校级|公司级|熟练|熟悉|良好)$/.test(t));
      if(selected)return selected;
    }
    return /^(yyyy(?:[-/.]mm(?:[-/.]dd)?)?|请选择|开始日期|结束日期)$/i.test(raw)?'':raw;
  }
  function dateSegment(el) {
    if(!el?.getAttribute)return null;
    if(['checkbox','radio'].includes(el.type))return null;
    const hint=String(el.placeholder||el.getAttribute('aria-label')||'').trim();
    let part=/^(年|年份|yyyy|year)$/i.test(hint)?'year':/^(月|月份|mm|month)$/i.test(hint)?'month':/^(日|日期中的日|dd|day)$/i.test(hint)?'day':el.dataset.ojtDateSegment||null;
    // Some controlled selects erase their placeholder after a choice. Keep the
    // observed segment so selecting the start year cannot relabel the end year.
    if(!part&&el.closest('[class*="date" i],[class*="month" i]')){
      const shown=displayedControlValue(el);part=/^\d{4}$/.test(shown)?'year':null;
      const group=el.closest('[class*=month-range],[class*=month-select]');
      const inputs=group&&[...group.querySelectorAll('input:not([type=checkbox]):not([type=hidden]),select')];
      if(!part&&inputs&&[2,4].includes(inputs.length)&&inputs.includes(el))part=inputs.indexOf(el)%2?'month':'year';
    }
    if(part)el.dataset.ojtDateSegment=part;
    return part;
  }
  function dateSegmentValue(el,value) {
    const part=dateSegment(el),parts=parseDateParts(value);
    if(!part||!parts||part==='month'&&parts.precision==='year'||part==='day'&&parts.precision!=='day')return null;
    return String(parts[part==='year'?'y':part==='month'?'mo':'d']);
  }
  function periodEndpoints(scope=document){
    return [...scope.querySelectorAll('[class*="date-picker-period-month"]')].filter(e=>
      /(?:^|\s)[^ ]*date-picker-period-month-label(?:\s|$)/.test(e.className)&&
      e.querySelector('[data-cy="year"],[class$="-label-year"]')&&e.querySelector('[data-cy="month"],[class$="-label-month"]'));
  }
  function periodEndpoint(el){return periodEndpoints(el.parentElement||document).includes(el);}
  function dateTargetPrecision(el,value){
    const part=dateSegment(el);if(part)return part;
    if(periodEndpoint(el)||el.type==='month')return 'month';
    if(el.type==='date')return 'day';
    const hint=[el.getAttribute('data-format'),el.placeholder,el.getAttribute('aria-label')].filter(Boolean).join(' ').toLowerCase();
    if(/yyyy[-/.年]mm[-/.月]dd/.test(hint))return 'day';
    if(/yyyy[-/.年]mm/.test(hint))return 'month';
    return el.dataset.ojtDatePrecision||parseDateParts(value)?.precision;
  }
  function dateControlMatches(el,value){
    const part=dateSegment(el);
    if(part){const want=dateSegmentValue(el,value),shown=displayedControlValue(el);return want!==null&&dateChoiceValue(shown,part)===want;}
    return matchesDate(displayedControlValue(el),{...parseDateParts(value),precision:dateTargetPrecision(el,value)});
  }
  function dateChoiceValue(value,part){
    const text=String(value||'').trim().toLowerCase();
    if(part==='month'){
      const chinese=['一','二','三','四','五','六','七','八','九','十','十一','十二'];
      const english=['january','february','march','april','may','june','july','august','september','october','november','december'];
      const i=english.findIndex(m=>m===text||m.slice(0,3)===text.replace(/\.$/,''));if(i>=0)return String(i+1);
      const c=chinese.findIndex(m=>m+'月'===text);if(c>=0)return String(c+1);
    }
    const m=text.match(/^(\d+)(?:年|月|日)?$/);if(!m)return text;
    const n=Number(m[1]);return (part==='year'?m[1].length===4:part==='month'?n>=1&&n<=12:n>=1&&n<=31)?String(n):text;
  }
  function selectedOptions(el) {
    const linked=(el.getAttribute('aria-controls')||el.getAttribute('aria-owns')||'').split(/\s+/).map(id=>document.getElementById(id)).filter(Boolean);
    const local=el.closest('[class*="dropdown" i]')||el.closest('[class*="select" i],[role="combobox"]');
    const selector='[role="option"],[class*="option" i],[class*="menu-item" i],[class*="Menu-content-item"],li';
    const collect=scope=>Array.from(scope.querySelectorAll(selector)).filter(n=>isVisibleControl(n)&&!n.closest('nav,header,aside,[class*=page-option]')&&cleanText(n.textContent));
    let options=linked.flatMap(collect);
    if(!options.length&&local)options=collect(local);
    if(!options.length)options=collect(document).filter(n=>n.matches('[role="option"],[class*="option" i],[class*="menu-item" i],[class*="Menu-content-item"]')||n.closest('[role="listbox"],[class*="dropdown" i],[class*="menu" i]'));
    // A nested label and its clickable option are one choice, not two matches.
    return options.filter(n=>!options.some(child=>child!==n&&n.contains(child)&&cleanText(child.textContent)===cleanText(n.textContent)));
  }
  function calendarCells(panel,pattern){
    return Array.from(panel.querySelectorAll('td,[role=gridcell],button,[role=button],span,div')).filter(n=>isVisibleControl(n)&&pattern.test(cleanText(n.textContent))&&!Array.from(n.children).some(c=>pattern.test(cleanText(c.textContent))));
  }
  function calendarGrid(pattern,minimum){
    const cells=calendarCells(document,pattern);
    for(const cell of cells)for(let parent=cell.parentElement,depth=0;parent&&parent!==document.body&&depth<7;parent=parent.parentElement,depth++){
      if(parent.querySelector('input,textarea,select'))break;
      if(calendarCells(parent,pattern).length>=minimum)return parent;
    }
    return null;
  }
  function visibleMonthGrid(){return calendarGrid(/^(?:0?[1-9]|1[0-2])月$/,12);}
  async function pickMonthGrid(el,parts){
    let table=visibleMonthGrid();if(!table)return false;
    let panel=table;
    for(let i=0;i<6&&panel&&!calendarCells(panel,/^\d{4}\s*年?$/).length;i++)panel=panel.parentElement;
    const yearButton=panel&&calendarCells(panel,/^\d{4}\s*年?$/)[0];
    if(!yearButton){el.dataset.ojtDateFailure='未识别月份面板年份按钮';return false;}
    if(parseInt(yearButton.textContent)!==parts.y){
      simulateOpen(yearButton);await sleep(120);
      const yearGrid=calendarGrid(/^\d{4}年?$/,3);
      const yearCell=yearGrid&&calendarCells(yearGrid,/^\d{4}年?$/).find(c=>parseInt(c.textContent)===parts.y);
      if(!yearCell){el.dataset.ojtDateFailure='未识别年份选项 '+parts.y;return false;}
      simulateOpen(yearCell);await sleep(120);
      table=visibleMonthGrid();if(!table)return false;
      panel=table;for(let i=0;i<6&&panel&&!calendarCells(panel,/^\d{4}\s*年?$/).length;i++)panel=panel.parentElement;
      const shown=panel&&calendarCells(panel,/^\d{4}\s*年?$/)[0];if(!shown||parseInt(shown.textContent)!==parts.y)return false;
    }
    const month=calendarCells(table,/^(?:0?[1-9]|1[0-2])月$/).find(c=>parseInt(c.textContent)===parts.mo);if(!month)return false;
    simulateOpen(month);await sleep(150);
    const actual=displayedControlValue(el),ok=matchesDate(actual,{...parts,precision:'month'});
    if(ok)el.dataset.ojtDatePrecision='month';else el.dataset.ojtDateFailure='点击月份后显示值：'+(actual||'空')+'；目标 '+parts.y+'-'+parts.mo;
    return ok;
  }
  async function fillPeriodEndpoint(el,parts){
    const year=el.querySelector('[data-cy="year"],[class$="-label-year"]');
    const month=el.querySelector('[data-cy="month"],[class$="-label-month"]');
    if(!year||!month)return false;
    simulateOpen(year);await sleep(120);
    const years=calendarGrid(/^\d{4}年?$/,3);
    const choice=years&&calendarCells(years,/^\d{4}年?$/).find(c=>parseInt(c.textContent)===parts.y);
    if(choice){simulateOpen(choice);await sleep(120);}
    // An existing matching year can stay; an unavailable year is not guessed.
    if(parseInt(el.querySelector('[data-cy="year"],[class$="-label-year"]')?.textContent)!==parts.y)return false;
    simulateOpen(el.querySelector('[data-cy="month"],[class$="-label-month"]'));await sleep(120);
    const pattern=/^(?:0?[1-9]|1[0-2])月?$/;
    const months=calendarGrid(pattern,12);
    const picks=months&&calendarCells(months,pattern).filter(c=>parseInt(c.textContent)===parts.mo);
    if(!picks||picks.length!==1)return false;
    simulateOpen(picks[0]);await sleep(150);
    return matchesDate(displayedControlValue(el),{...parts,precision:'month'});
  }
  async function fillDatePicker(el, value, field) {
    // 只写年月（如 "2002.11"）时，normalizeDateValue 会补齐为当月 1 号
    const sourceParts = parseDateParts(value);
    if (!sourceParts) return false;
    const precision=dateTargetPrecision(el,value),rank={year:1,month:2,day:3};
    if(rank[precision]>rank[sourceParts.precision])return false;
    const partsToUse={...sourceParts,precision};
    if (field && !isDateWithinRule(partsToUse, field)) return false;
    if(periodEndpoint(el))return fillPeriodEndpoint(el,partsToUse);
    const iso = `${partsToUse.y}-${String(partsToUse.mo).padStart(2, '0')}-${String(partsToUse.d).padStart(2, '0')}`;


    // ---- 策略 1：直接输入 ----
    // 百度该控件支持文本输入，教育经历通常显示为 YYYY.MM，优先使用该格式。
    // 最后再尝试标准日期格式，避免组件把 YYYY-MM-DD 当成非法值清空。
    try {
      if (el.readOnly||el.tagName!=='INPUT') throw new Error('Use date picker');
      const proto = window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      const monthText = `${partsToUse.y}.${String(partsToUse.mo).padStart(2, '0')}`;
      const separator=(el.placeholder||'').match(/yyyy([./-])mm/i)?.[1]||'-';
      const isoTarget=precision==='year'?String(partsToUse.y):precision==='month'?iso.slice(0,7):iso;
      const candidates=[...new Set([isoTarget.replace(/-/g,separator),isoTarget,...(precision==='month'?[monthText]:[])])];
      for (const candidate of candidates) {
        if (setter) setter.call(el, candidate);
        else el.value = candidate;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: candidate }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(80);
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(120);
        if (matchesDate(displayedControlValue(el), partsToUse)) {delete el.dataset.ojtDateFailure;el.dataset.ojtDatePrecision=precision;return true;}
      }
    } catch (e) { /* 忽略，进入策略 2 */ }


    if(/^yyyy$/i.test(el.placeholder||el.value||'')){
      simulateOpen(el);await sleep(120);const grid=calendarGrid(/^\d{4}年?$/,3);const cell=grid&&calendarCells(grid,/^\d{4}年?$/).find(c=>parseInt(c.textContent)===partsToUse.y);
      if(cell){simulateOpen(cell);await sleep(120);if(displayedControlValue(el)===String(partsToUse.y)){el.dataset.ojtDatePrecision='year';return true;}}
      if(!el.readOnly){setNativeValue(el,String(partsToUse.y));el.dispatchEvent(new Event('blur',{bubbles:true}));await sleep(120);if(displayedControlValue(el)===String(partsToUse.y)){el.dataset.ojtDatePrecision='year';return true;}}
      return false;
    }
    el.dataset.ojtDateFailure='未打开月份面板';
    for(let target=el,depth=0;target&&depth<6;target=target.parentElement,depth++){
      if(target.querySelectorAll('input,textarea,select').length>1)break;
      simulateOpen(target);await sleep(120);
      if(visibleMonthGrid()&&(!dateTargetPrecision(el,'')||dateTargetPrecision(el,'')==='month')){
        // A year/month panel with no contrary day-format contract is itself
        // evidence of target precision, even when its input just says 请选择.
        el.dataset.ojtDatePrecision='month';partsToUse.precision='month';
        el.dataset.ojtDateFailure='月份面板已打开，但未确认选中结果';
        const ok=await pickMonthGrid(el,partsToUse);
        if(ok)delete el.dataset.ojtDateFailure;
        return ok;
      }
    }

    // ---- 策略 2：模拟点击面板 ----
    try {
      if(partsToUse.precision!=='day')return false;
      const picked = await pickDateByPanel(el, partsToUse);
      if (!picked) return false;
      // 点击后校验控件展示值，避免面板点空却误判为成功
      await sleep(80);
      return matchesDate(el.value ?? el.textContent, partsToUse);
    } catch (e) {
      return false;

    }
  }

  /** 触发一次「聚焦+鼠标+点击」序列，尽量唤起各类组件的弹层 */
  function simulateOpen(el) {
    el.focus();
    ['mousedown', 'mouseup', 'click'].forEach((t) => {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    });
  }

  /** 填充百度等网站的自定义下拉框（学校、学历、成绩排名等）。 */
  function normalizeDegree(value) {
    const text = normalize(value);
    if (/(博士|phd|doctor|doctoral)/.test(text)) return 'doctor';
    if (/(硕士|研究生|master|postgraduate)/.test(text) && !/博士/.test(text)) return 'master';
    if (/(本科|学士|bachelor|undergraduate)/.test(text)) return 'bachelor';
    if (/(大专|专科|高职|高专|associate)/.test(text)) return 'associate';
    if (/(高中|中专|中职|技校|职高|highschool)/.test(text)) return 'secondary';
    if (/初中/.test(text)) return 'middle';
    return text;
  }

  function isDegreeDescriptor(descriptor) {
    return ['学历', '学位', '最高学历', '文化程度', '教育程度', 'degree', 'education', 'qualification']
      .some((keyword) => normalize(descriptor).includes(normalize(keyword)));
  }

  function degreeScore(optionText, target) {
    const option = normalizeDegree(optionText);
    if (option !== target) return -1;
    const text = normalize(optionText);
    const preferred = {
      doctor: ['博士', 'phd', 'doctor'],
      master: ['硕士研究生', '硕士', 'master', '研究生'],
      bachelor: ['本科', '大学本科', '本科生', '学士', 'bachelor'],
      associate: ['大专', '专科', '高职', 'associate'],
      secondary: ['高中', '中专', '中职', '技校'],
      middle: ['初中']
    }[target] || [];
    return preferred.reduce((score, keyword, index) =>
      text.includes(normalize(keyword)) ? Math.max(score, preferred.length - index) : score, 0);
  }

  async function fillCustomSelect(el, value) {
    if (!value) return false;
    const degreeField = isDegreeDescriptor(getFieldDescriptor(el));
    const role = (el.getAttribute('role') || '').toLowerCase();
    const isEditableInput = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
      !el.readOnly && el.getAttribute('readonly') === null &&
      role !== 'combobox' && role !== 'listbox' &&
      !el.getAttribute('aria-haspopup');
    if (degreeField && isEditableInput && !isSelectLike(el)) {
      return setNativeValue(el, value);
    }
    // A select query is not a committed form value: input only, no premature
    // change/blur (which closes controlled dropdowns before an option is clicked).
    const query=text=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(el.tagName==='INPUT'&&!el.readOnly){setter.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));}};
    query('');
    el.focus();el.click();
    await sleep(180);
    const awardLevel=/获奖级别|奖项级别/.test(getFieldDescriptor(el));
    const part=dateSegment(el);
    const choiceNorm=v=>part?dateChoiceValue(v,part):awardLevel&&/^(省市级|省区级|省级)$/.test(String(v).trim())?'省级':normalize(v);
    const target = degreeField ? normalizeDegree(value) : choiceNorm(value);
    const choose=()=>{
      const options=selectedOptions(el);
      if(part){const matches=options.filter(o=>choiceNorm(o.textContent)===target);return matches.length===1?matches[0]:null;}
      if(degreeField)return options.map(option=>({option,score:degreeScore(option.textContent,target)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score)[0]?.option;
      return pickOption(options.map(option=>({el:option,text:choiceNorm(option.textContent)})),target);
    };
    // Prefer an existing matching choice before search: searching “硕士研究生”
    // can hide the site's shorter “硕士” option even though they are equivalent.
    let match=choose();
    if(!match){query(String(value));for(let i=0;i<6&&!match;i++){await sleep(150);match=choose();}}
    if (!match) { query(''); return false; }
    // Dispatch on the connected choice once; focus/mousedown can rerender it.
    match.click();
    await sleep(80);
    return (part?choiceNorm(displayedControlValue(el))===choiceNorm(value):optionMatches(choiceNorm(displayedControlValue(el)),choiceNorm(value)))||Boolean(degreeField&&normalizeDegree(displayedControlValue(el))===normalizeDegree(value));
  }

  /** 查找当前文档中可见的日历弹层面板 */
  function findVisiblePanel() {
    const SELECTORS = [
      '.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)',
      '.ant-picker-panel-container',
      '.el-picker-panel', '.el-date-picker',
      '[class*="date-picker-panel"]', '[class*="datepicker"][class*="panel"]',
      '[class*="calendar"][class*="panel"]', '[class*="picker-dropdown"]',
      '[role="dialog"][class*="picker"]', '[role="grid"]'
    ];
    for (const sel of SELECTORS) {
      const panels = Array.from(document.querySelectorAll(sel))
        .filter((p) => p.offsetParent !== null || p.getClientRects().length);
      if (panels.length) return panels[panels.length - 1]; // 取最后出现的（通常是当前打开的）
    }
    return null;
  }

  /**
   * 在弹层面板内按「年→月→日」点选目标日期。
   * 兼容主流组件的日期单元格类名与结构。
   */
  async function pickDateByPanel(el, parts) {
    simulateOpen(el);
    let panel = null;
    // 最多等待 ~600ms 让面板渲染
    for (let i = 0; i < 6 && !panel; i++) {
      await sleep(100);
      panel = findVisiblePanel();
    }
    if (!panel) return false;

    // 面板顶部通常有「年月」切换与前后翻页箭头。
    // 简化策略：通过读取面板当前展示的年月，用「上/下一月」箭头翻到目标年月，再点日。
    const clickCell = (cell) => {
      if (!cell) return false;
      ['mousedown', 'mouseup', 'click'].forEach((t) =>
        cell.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
      );
      return true;
    };

    // 尝试将面板导航到目标年月
    const monthConfirmed = await navigateToYearMonth(panel, parts);
    panel = findVisiblePanel() || panel;

    // 选日：优先带精确 title/日期属性的单元格，其次按可见数字文本匹配当月日期
    const dayStr = String(parts.d);
    const isoDay = `${parts.y}-${String(parts.mo).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;

    // Ant Design：td.ant-picker-cell[title="YYYY-MM-DD"] > .ant-picker-cell-inner
    let cell = panel.querySelector(
      `[title="${isoDay}"] , td[title="${isoDay}"]`
    );
    if (cell) {
      const inner = cell.querySelector('.ant-picker-cell-inner') || cell;
      if (clickCell(inner)) return true;
    }

    // Element UI / 通用：在「当月」单元格里按文本匹配日号，排除上/下月的灰格
    if (!monthConfirmed) return false;
    const dayCells = Array.from(panel.querySelectorAll(
      'td:not(.next-month):not(.prev-month):not(.ant-picker-cell-out-view), ' +
      '.ant-picker-cell-in-view, [class*="day"]:not([class*="prev"]):not([class*="next"])'
    ));
    cell = dayCells.find((c) => {
      const t = (c.textContent || '').trim();
      return t === dayStr;
    });
    if (cell) {
      const inner = cell.querySelector('.ant-picker-cell-inner, .el-date-table__cell') || cell;
      return clickCell(inner);
    }
    return false;
  }

  /**
   * 将日历面板翻页到目标年月。
   * 读取面板头部当前年月，用前/后翻月箭头逐月靠近（限制最大步数防死循环）。
   */
  async function navigateToYearMonth(panel, parts) {
    const readHeader = (p) => {
      const headText = (p.querySelector(
        '.ant-picker-header-view, .el-date-picker__header-label, [class*="header"]'
      )?.textContent) || p.textContent || '';
      const ym = headText.match(/(\d{4})\D{0,3}(\d{1,2})?/);
      if (!ym) return null;
      return { y: Number(ym[1]), mo: ym[2] ? Number(ym[2]) : null };
    };
    const prevBtn = panel.querySelector(
      '.ant-picker-header-prev-btn, .el-icon-arrow-left, [class*="prev"][class*="month"], button[class*="prev"]'
    );
    const nextBtn = panel.querySelector(
      '.ant-picker-header-next-btn, .el-icon-arrow-right, [class*="next"][class*="month"], button[class*="next"]'
    );
    const click = (btn) => btn && ['mousedown', 'mouseup', 'click'].forEach((t) =>
      btn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
    );

    for (let step = 0; step < 36; step++) {
      const cur = readHeader(panel);
      if (!cur || cur.mo == null) break; // 读不出年月则放弃导航，靠后续按日号兜底
      const diff = (parts.y - cur.y) * 12 + (parts.mo - cur.mo);
      if (diff === 0) return true;
      click(diff > 0 ? nextBtn : prevBtn);
      await sleep(80);
      panel = findVisiblePanel() || panel;
    }
    return false;
  }

  /**
   * 获取一个表单元素的“可用于匹配的文本描述”，
   * 综合 label、placeholder、name、id、aria-label 等。
   */
  // A real local caption is authoritative; placeholders and generated IDs are not labels.
  function localFieldCaption(el) {
    const controls='input:not([type=hidden]),textarea,select,[contenteditable="true"]';
    const text=node=>cleanText(node?.textContent||'').replace(/[＊*：:]/g,'').trim();
    const usable=node=>node && node!==el && !node.contains(el) && !node.matches?.(controls) && !node.querySelector?.(controls) && text(node).length>0 && text(node).length<45 && !/^(请选择|请输入|请填写|至今|[-~～—–/.\d\s]+)$/.test(text(node)) && !node.closest?.('button,[role=button],nav,[role=navigation]');
    const explicit=el.id?document.querySelector(`label[for="${CSS.escape(el.id)}"]`):null;
    if(explicit&&text(explicit).length<45)return text(explicit);
    const aria=el.getAttribute('aria-label');
    if(aria&&aria.length<45&&!/^请(输入|选择)/.test(aria))return aria;
    for(let child=el,depth=0;child?.parentElement&&depth<24;child=child.parentElement,depth++){
      const parent=child.parentElement;
      const immediate=child.previousElementSibling;
      if(usable(immediate))return text(immediate);
      const inputs=Array.from(parent.querySelectorAll(controls));
      if(inputs.length===2){const shared=Array.from(parent.querySelectorAll('label,div,span,p')).find(n=>usable(n)&&/^起止(时间|日期)$/.test(text(n)));if(shared)return text(shared);continue;}
      // A pair of dates can share one label. Never borrow from an adjacent grid field.
      if(inputs.length>1 && !(inputs.length===2&&inputs.every(e=>/date|month|时间|日期|年月/i.test([e.type,e.placeholder,e.className].join(' ')))))break;
      const before=Array.from(parent.children||[]).slice(0,Array.from(parent.children||[]).indexOf(child)).reverse();
      const caption=before.find(usable);
      if(caption)return text(caption);
      const label=Array.from(parent.querySelectorAll(':scope > label,:scope > [class*="label" i]')).find(usable);
      if(label)return text(label);
    }
    return '';
  }
  function getFieldDescriptor(el) {
    const local=localFieldCaption(el);
    if(/起止时间|起止日期/.test(local)){
      for(let parent=el.parentElement,depth=0;parent&&depth<6;parent=parent.parentElement,depth++){
        const pair=Array.from(parent.querySelectorAll('input'));if(pair.length>2)break;
        if(pair.length===2&&pair.includes(el)&&pair.every(x=>x.type!=='checkbox'&&x.type!=='radio'))return local+' '+(pair.indexOf(el)===0?'开始日期':'结束日期');
      }
    }
    if(local)return (local+(/时间|日期|年月/.test(local)&&/开始|起始|结束/.test(el.placeholder||'')?' '+el.placeholder:'')).toLowerCase();
    const parts = [];
    const parentText = (node) => cleanText(node?.textContent || '').slice(0, 80);
    const addNearbyLabel = (node) => {
      if (!node) return false;
      const directLabel = node.querySelector(':scope > label, :scope > [class*="label" i]');
      if (directLabel) {
        parts.push(parentText(directLabel));
        return true;
      }
      const previous = node.previousElementSibling;
      if (previous && previous.children.length === 0 && parentText(previous).length <= 30) {
        parts.push(parentText(previous));
        return true;
      }
      return false;
    };
    // 关联的 <label for="id">
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) parts.push(label.textContent);
    }
    // 元素被 <label> 包裹的情况
    const parentLabel = el.closest('label');
    if (parentLabel) parts.push(parentLabel.textContent);
    parts.push(el.placeholder || el.getAttribute('data-placeholder') || '');
    parts.push(el.name || '');
    parts.push(el.id || '');
    parts.push(el.getAttribute('aria-label') || '');
    // 百度等 React 表单常把标题放在控件同级或最近表单项中。
    // 只读取最近的标题节点，避免把同一大容器内其它字段的标题混入当前控件。
    const formItem = el.closest('.brick-field,.ant-form-item,.el-form-item,.form-item,.form-row,.item-form,.input-wrap');
    const brickLabel = formItem?.querySelector(
      ':scope > .brick-field-label-wrap .brick-field-label, .brick-field-label-wrap .brick-field-label'
    );
    if (brickLabel) parts.push(parentText(brickLabel));
    let labelled = addNearbyLabel(el.parentElement) || addNearbyLabel(formItem);
    if(!labelled){let parent=el.parentElement;for(let depth=0;parent&&depth<4;depth++,parent=parent.parentElement){const label=parent.querySelector(':scope > .label,:scope > .title,:scope > .form-label,:scope > label');if(label&&parent.querySelectorAll('input,textarea,[contenteditable=true]').length<=2){parts.push(parentText(label));labelled=true;break;}}}
    if (!labelled && !brickLabel) {
      const previous = el.parentElement?.previousElementSibling;
      if (previous && !previous.querySelector('input,textarea,select,[contenteditable=true]') && parentText(previous).length<60) parts.push(parentText(previous));
    }
    if (!labelled && !brickLabel) {
      let node=el;
      for(let depth=0;node?.parentElement&&depth<5;depth++,node=node.parentElement){
        const parent=node.parentElement;
        if(parent.querySelectorAll('input,textarea,select,[contenteditable="true"]').length>2)break;
        const siblings=Array.from(parent.children||[]);
        const before=siblings.slice(0,siblings.indexOf(node)).reverse();
        const caption=before.find(s=>!s.querySelector('input,textarea,select,[contenteditable="true"]') && cleanText(s.textContent).length>0 && cleanText(s.textContent).length<60);
        if(caption){parts.push(parentText(caption));break;}
      }
    }
    // A caption may be nested beside an editor toolbar instead of being a direct sibling.
    let scope=el.parentElement;
    for(let depth=0;scope&&depth<7;depth++,scope=scope.parentElement){
      const controls=Array.from(scope.querySelectorAll('input,textarea,select,[contenteditable="true"]'));
      if(controls.length>1)break;
      const caption=Array.from(scope.querySelectorAll('label,span,div,p,h4')).find(node=>node!==el&&!node.contains(el)&&/^(项目描述|项目业绩|项目成果)([（(].*?[）)])?$/.test(cleanText(node.textContent)));
      if(caption){parts.unshift(cleanText(caption.textContent));break;}
    }
    // Rich editors put toolbars between the visible field title and editable node.
    let fieldNode=el;
    for(let depth=0;fieldNode?.parentElement&&depth<6;depth++,fieldNode=fieldNode.parentElement){
      const siblings=Array.from(fieldNode.parentElement.children||[]);
      const previous=siblings.slice(0,siblings.indexOf(fieldNode)).reverse();
      const title=previous.find(node=>/^(项目描述|项目业绩|项目成果|项目名称|项目角色|项目链接|工作内容|工作职责|开始时间|结束时间)([（(].*?[）)])?$/.test(cleanText(node.textContent)));
      if(title){parts.push(parentText(title));break;}
    }
    if (/选择年月|开始时间|结束时间|起止/.test(parts.join(' '))) {
      let parent=el.parentElement;
      for(let depth=0;parent&&depth<4;depth++,parent=parent.parentElement){
        const pair=Array.from(parent.querySelectorAll('input')).filter(e=>/年月|时间|date|month/i.test([e.placeholder,e.name,e.className].join(' ')));
        if(pair.length===2&&pair.includes(el)){parts.push(pair.indexOf(el)===0?'开始时间':'结束时间');break;}
        if(pair.length>2)break;
      }
    }
    // Some resume editors put labels outside the input's DOM wrapper.
    // Match the visible caption directly above the control, never a toolbar button.
    if(el.getBoundingClientRect){
      const box=el.getBoundingClientRect();
      const captions=Array.from(document.querySelectorAll('label,h4,h5,dt,p,span,div')).filter(node=>{
        if(node===el||node.contains(el)||node.closest('button,[role=button]'))return false;
        const caption=cleanText(node.textContent);
        if(!/^(项目名称|项目角色|项目链接|项目开始时间|项目结束时间|项目描述|项目业绩|项目成果|工作描述|工作内容|开始时间|结束时间|起止时间)([（(].*?[）)])?$/.test(caption))return false;
        const rect=node.getBoundingClientRect();
        return rect.width>0&&Math.abs(rect.left-box.left)<60&&box.top-rect.bottom>=-4&&box.top-rect.bottom<180;
      }).sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom);
      if(captions[0])parts.unshift(cleanText(captions[0].textContent));
    }
    // Prefer the nearest actual caption over placeholder/name/id and unrelated ancestors.
    const explicit=el.id?document.querySelector(`label[for="${CSS.escape(el.id)}"]`):null;
    const nearest=explicit||el.closest('label')||formItem?.querySelector(':scope > label,:scope > .el-form-item__label,:scope > .ant-form-item-label label');
    if(nearest&&cleanText(nearest.textContent).length<60)return (cleanText(nearest.textContent)+' '+(/时间|日期|年月/.test(cleanText(nearest.textContent))?el.placeholder||'':'')).toLowerCase();
    return parts.join(' ').toLowerCase();
  }

  /**
   * 归一化文本用于匹配：全角转半角、去除所有空白、转小写。
   * 使描述文本与关键词在「有无空格、全/半角、大小写」差异下仍能命中。
   */
  function normalize(text) {
    return String(text || '')
      // 全角字符转半角（含全角空格 \u3000）
      .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/\u3000/g, ' ')
      .replace(/\s+/g, '')
      .toLowerCase();
  }

  /** 根据描述文本判断该元素属于哪个 profile 字段（内置） */
  function matchField(descriptor) {
    const norm = normalize(descriptor);
    const positionHint = ['职位', '岗位', '应聘职位', '应聘岗位', 'position', 'jobtitle', 'job title', 'jobname'];
    const hasPositionHint = positionHint.some((kw) => norm.includes(normalize(kw)));
    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
      // 某些官网会给“职位名称”控件使用 name="name" 或 id="name"，
      // 不能因此把个人姓名写入职位字段。
      if (field === 'name' && hasPositionHint) continue;
      const matched = keywords.find((kw) => norm.includes(normalize(kw)));
      if (matched) {
        // 英文 name 只允许来自明确的姓名字段，不再依赖通用 name/id 属性。
        if (field === 'name' && normalize(matched) === 'name') continue;
        return field;
      }
    }
    return null;
  }

  /**
   * 判断一个元素是否「疑似下拉/选择器」而非真正的自由文本输入框。
   * 这类元素通常用于选择证件类型、国家、区号等，不应被填入文本值，
   * 否则会出现「身份证号被填进证件类型下拉」这类错填。
   */
  function isSelectLike(el) {
    // Editor formatting controls do not turn its editable surface into a dropdown.
    if(el.tagName==='TEXTAREA'||el.isContentEditable)return false;
    // 原生 select 天然排除（querySelector 已不选，双保险）
    if (el.tagName === 'SELECT') return true;
    // 只读输入框：多数自定义下拉用 readonly input 承载选中项
    if (el.readOnly || el.getAttribute('readonly') !== null) return true;
    // ARIA 语义：组合框 / 列表框 / 带弹出选择
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (role === 'combobox' || role === 'listbox') return true;
    const haspopup = (el.getAttribute('aria-haspopup') || '').toLowerCase();
    if (haspopup === 'listbox' || haspopup === 'menu' || haspopup === 'true') return true;
    // 元素本身或其父容器带常见下拉组件类名（Ant Design / Element UI 等）
    const cls = (el.className && String(el.className) || '').toLowerCase();
    const parentCls = (el.closest('[class]')?.className && String(el.closest('[class]').className) || '').toLowerCase();
    const SELECT_CLS = ['select', 'dropdown', 'picker', 'combobox', 'cascader'];
    if (SELECT_CLS.some((c) => cls.includes(c))) return true;
    // 父级是 select 组件容器（如 .ant-select 内的搜索输入框）
    if (SELECT_CLS.some((c) => parentCls.includes(c)) &&
        (el.getAttribute('aria-autocomplete') || role || haspopup)) return true;
    // 兜底一：向上追溯若干层，任一祖先带下拉组件类名，则视为选择器内部输入框。
    // 用于覆盖「证件类型」这类自定义下拉：其内部常有一个透明可输入的搜索框，
    // 本身无明显属性，但外层容器一定带 select/dropdown 等类名。
    let node = el.parentElement;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      const c = (node.className && String(node.className) || '').toLowerCase();
      if (SELECT_CLS.some((k) => c.includes(k))) return true;
      const r = (node.getAttribute && (node.getAttribute('role') || '')).toLowerCase();
      if (r === 'combobox' || r === 'listbox') return true;
    }
    // 兜底二：邻近存在下拉指示图标（箭头）。很多自定义下拉在输入框旁放一个
    // 带 arrow/caret/triangle/suffix 类名的图标或 svg，据此判定为选择器。
    const sibScope = el.closest('div,span,label') || el.parentElement;
    if (sibScope) {
      const indicator = sibScope.querySelector(
        '[class*="arrow"],[class*="caret"],[class*="triangle"],[class*="suffix"],[class*="indicator"]'
      );
      if (indicator) return true;
    }
    return false;
  }

  /**
   * 针对特定字段的值合法性校验：避免把值填到语义相符但控件不符的框里。
   * 例如身份证号不应填入「证件类型」选择框（其当前值往往是"身份证"这类短文本）。
   */
  function isValueCompatible(field, el) {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    // 这些字段绝不该落在下拉/选择类控件上
    const TEXT_ONLY = ['idCard', 'phone', 'birthday', 'email', 'graduationYear'];
    if (TEXT_ONLY.includes(field) && isSelectLike(el)) return false;
    // 身份证 / 手机号：目标应为可输入较长数字的框，排除 type=date 等
    if ((field === 'idCard' || field === 'phone') &&
        ['date', 'time', 'month', 'week', 'color', 'range'].includes(type)) {
      return false;
    }
    return true;
  }

  /**
   * 在自定义字段中匹配描述文本。
   * @param {string} descriptor 元素描述文本
   * @param {Array<{label:string,keywords:string,value:string}>} customFields
   * @returns {object|null} 命中的自定义字段
   */
  function matchCustomField(descriptor, customFields) {
    const norm = normalize(descriptor);
    for (const cf of customFields) {
      // 关键词优先；未填关键词时退回用字段名匹配
      const kws = (cf.keywords || cf.label || '')
        .split(/[，,]/)
        .map((s) => normalize(s))
        .filter(Boolean);
      if (kws.some((kw) => norm.includes(kw))) {
        return cf;
      }
    }
    return null;
  }

  /** 高亮已填充元素（浅绿色轮廓） */
  function isVisibleControl(el) {
    if (el.offsetParent !== null || el.getClientRects().length) return true;
    if (el.type === 'radio' || el.type === 'checkbox') {
      const label = el.id
        ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
        : el.closest('label');
      return Boolean(label && (label.offsetParent !== null || label.getClientRects().length));
    }
    return false;
  }

  function highlight(el) {
    el.style.outline = '2px solid #8e8e93'; // 规则直配：中性灰
    el.style.outlineOffset = '1px';
    el.style.transition = 'outline .3s';
  }

  // ============ 多段经历填充 ============

  /**
   * 各经历板块子字段的匹配关键词。
   * 用于在页面重复区块中定位对应输入框。
   */
  const EXPERIENCE_KEYWORDS = {
    education: {
      school: ['学校', '院校', 'school', 'university', 'college', '毕业院校'],
      major: ['专业', 'major', 'discipline', 'speciality', 'specialty'],
      degree: ['学历', '学位', 'degree', 'education', 'qualification'],
      period: ['时间', '起止', '入学', '毕业时间', 'period', 'date', 'duration', '年限']
    },
    work: {
      company: ['公司', '单位', 'company', 'employer', 'organization', '雇主'],
      position: ['职位', '岗位', 'position', 'title', 'role', 'job'],
      period: ['时间', '起止', '在职', 'period', 'date', 'duration', '年限'],
      description: ['描述', '职责', '内容', 'description', 'responsibility', 'detail', '工作内容']
    },
    project: {
      name: ['项目名', '项目名称', 'project name', 'projectname'],
      role: ['角色', '担任', 'role', '职责', '负责'],
      period: ['时间', '起止', 'period', 'date', 'duration', '项目时间'],
      description: ['描述', '内容', 'description', 'detail', '项目描述', '简介']
    }
  };

  /**
   * 填充某一类多段经历。
   * 思路：以「区块标识字段」（如教育的 school、工作的 company）在页面中出现的位置，
   * 将页面切分为若干重复区块；第 N 个区块用第 N 段数据填充。
   *
   * @param {string} type education|work|project
   * @param {Array<object>} items 用户保存的多段数据
   * @param {NodeListOf<Element>} allElements 页面上的可填元素
   * @returns {number} 填充的字段数
   */
  async function fillExperience(type, items, allElements) {
    if (!items || !items.length) return 0;
    const keywords = EXPERIENCE_KEYWORDS[type];
    // 用第一个子字段作为「锚点」来划分区块
    const anchorKey = Object.keys(keywords)[0];

    // 收集每个元素命中的子字段
    const els = Array.from(allElements).filter(
      (el) => !(el.disabled || !isVisibleControl(el))
    );
    const tagged = els.map((el) => {
      const descriptor = getFieldDescriptor(el);
      let hitKey = null;
      for (const [k, kws] of Object.entries(keywords)) {
        if (kws.some((kw) => descriptor.includes(kw.toLowerCase()))) {
          hitKey = k;
          break;
        }
      }
      return { el, hitKey };
    });

    // 按锚点字段出现的位置切分区块
    const blocks = [];
    let current = null;
    tagged.forEach(({ el, hitKey }) => {
      if (!hitKey) return;
      if (hitKey === anchorKey) {
        current = {};
        blocks.push(current);
      }
      if (current && hitKey) {
        if (EXPERIENCE_DATE_FIELDS.has(hitKey)) {
          current[hitKey] = current[hitKey] || [];
          current[hitKey].push(el);
        } else if (!current[hitKey]) {
          current[hitKey] = el;
        }
      }
    });

    // 逐段填入对应区块
    let count = 0;
    const n = Math.min(blocks.length, items.length);
    for (let i = 0; i < n; i++) {
      const block = blocks[i];
      const data = items[i];
      for (const k of Object.keys(keywords)) {
        const field = block[k];
        const val = data[k];
        if (!field || !val) continue;
        const fields = Array.isArray(field) ? field : [field];
        const values = k === 'period'
          ? (globalThis.SemanticMapper?.splitPeriod(val) || String(val).split(/\s+(?:-|–|—|至|到)\s+/).filter(Boolean))
          : [val];
        for (let j = 0; j < fields.length; j++) {
          const el = fields[j];
          const fieldValue = values[j] || (fields.length === 1 ? val : '');
          if(globalThis.SemanticMapper&&!globalThis.SemanticMapper.compatible({label:getFieldDescriptor(el),section:formSection(el)},{id:`${type}.${i}.${k}`,label:k,value:fieldValue}))continue;
          if (!fieldValue || el.value || (el.isContentEditable&&el.innerText.trim())) continue;
          const isDateInput = ['date', 'month'].includes((el.getAttribute('type') || '').toLowerCase());
          const done = k === 'period'
            // 原生日期框直接写值，自定义日期控件走弹层策略
            ? (isDateInput
                ? setNativeValue(el, fieldValue)
                : await fillDatePicker(el, fieldValue, 'period'))
            : isSelectLike(el)
              ? await fillCustomSelect(el, fieldValue)
              : setNativeValue(el, fieldValue);
          if (done) {
            highlight(el);
            count++;
          }
        }
      }
    }
    return count;
  }

  /**
   * 自动填表主逻辑。
   * @returns {Promise<{filledCount:number}>}
   */
  async function fillFormByRules() {
    const { userProfile, customFields, experiences } = await chrome.storage.local.get([
      'userProfile', 'customFields', 'experiences'
    ]);
    const hasExp = experiences && Object.values(experiences).some((a) => a && a.length);
    if (!userProfile && (!customFields || !customFields.length) && !hasExp) {
      return { filledCount: 0, error: '未配置个人资料，请先在设置中填写' };
    }
    const profile = userProfile || {};
    const customs = customFields || [];
    const exps = {...(experiences || {})};
    exps.project = pendingProjects(exps.project);

    const elements = [
      ...document.querySelectorAll(
        'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=file]), textarea, select, [contenteditable="true"]'
      ),
      // 百度 brick-select 没有 input，实际可交互节点是这个 tabindex=0 的选择容器。
      ...document.querySelectorAll('.brick-field .brick-select-selection')
    ];

    let filledCount = 0;

    // 第一步：先填多段经历（占用重复区块），避免内置单值把第一段抢占
    for (const type of Object.keys(EXPERIENCE_KEYWORDS)) {
      filledCount += await fillExperience(type, exps[type], elements);
    }

    // 若教育经历已配置多段，则内置的 school/major/degree 交给多段处理，避免重复
    const skipBuiltin = new Set();
    if (exps.education && exps.education.length) {
      ['school', 'major', 'degree'].forEach((k) => skipBuiltin.add(k));
    }

    const usedFields = new Set();

    // 第二步：填内置单值 + 自定义字段
    for (const el of elements) {
      if (el.disabled || !isVisibleControl(el)) continue; // 跳过不可见/禁用

      const isNativeSelect = el.tagName === 'SELECT';
      const type = (el.getAttribute('type') || '').toLowerCase();
      const isDateInput = ['date', 'month'].includes(type);
      const descriptor = getFieldDescriptor(el);

      // 单选按钮的 value 通常一直存在，必须在“已有值”判断之前处理。
      if (type === 'radio' && matchField(descriptor) === 'gender' && profile.gender && !usedFields.has('gender')) {
        if (fillGenderRadio(el, profile.gender)) {
          highlight(el);
          usedFields.add('gender');
          filledCount++;
        }
        continue;
      }

      // 已有值的处理：文本框已填则不覆盖；原生 select 默认选中首项(常为占位)，
      // 仅当已选了非空的有效项时才视为“已填”而跳过。
      if (isNativeSelect) {
        if (el.value && el.selectedOptions[0] && el.selectedOptions[0].value !== '') continue;
      } else if (el.value) {
        continue;
      }

      // 先匹配内置字段
      let key = matchField(descriptor);
      if (key && skipBuiltin.has(key)) key = null;

      // 自定义弹层日期选择器：字段是日期语义且控件为选择器类，走 fillDatePicker。
      // 需在「跳过 select-like」之前判断，否则会被下方过滤掉。
      const isCustomDatePicker =
        !isNativeSelect && !isDateInput && key && DATE_FIELDS.has(key) && isSelectLike(el);
      if (isCustomDatePicker) {
        const dateVal = profile[key];
        if (dateVal && !usedFields.has(key)) {
          const done = await fillDatePicker(el, dateVal, key);
          if (done) {
            highlight(el);
            usedFields.add(key);
            filledCount++;
          }
        }
        continue;
      }

      // 跳过自定义下拉/选择器（readonly、组合框、带下拉容器的输入框），避免错填。
      // 学历字段需要兼容自定义下拉；原生 <select> 与日期输入框也放行。
      if (!isNativeSelect && !isDateInput && isSelectLike(el) && key !== 'degree') continue;

      // 控件类型与字段不兼容（如身份证号落到选择框）则放弃该元素。
      // 原生 select 例外：它就是用来选的，不套用 TEXT_ONLY 限制。
      if (key && !isNativeSelect && !isValueCompatible(key, el)) key = null;
      let value = key ? profile[key] : null;

      // 内置未命中时，再匹配自定义字段
      if (!value) {
        const cf = matchCustomField(descriptor, customs);
        if (cf) {
          key = 'custom:' + cf.label;
          value = cf.value;
        }
      }

      if (!key || !value) continue;
      if(globalThis.SemanticMapper&&!globalThis.SemanticMapper.compatible({label:descriptor,section:formSection(el)},{id:key.startsWith('custom:')?'custom.fallback':'profile.'+key,label:key.startsWith('custom:')?key.slice(7):key,group:key,value}))continue;
      // 同一字段只填第一个匹配到的，避免重复覆盖
      if (usedFields.has(key)) continue;

      // 按控件类型选择填充方式
      let ok = true;
      if (isNativeSelect) {
        ok = fillSelect(el, value);
      } else if (isDateInput) {
        const parts = parseDateParts(value);
        // 原生日期框：解析失败或不满足业务规则（如生日为未来日期）则不填
        ok = Boolean(parts) && isDateWithinRule(parts, key) && setNativeValue(el, value);
      } else if (key === 'degree' && isSelectLike(el)) {
        ok = await fillCustomSelect(el, value);
      } else {
        ok = setNativeValue(el, value);
      }
      if (!ok) continue; // select 未找到匹配项，不计数、不高亮

      highlight(el);
      usedFields.add(key);
      filledCount++;
    }

    return { filledCount };
  }

  // AI maps identifiers only. Actual resume values stay inside this isolated content script.
  function pendingProjects(items) {
    if (!Array.isArray(items)) return [];
    const text = document.body?.innerText || '';
    const editing = items.find(item => item.name && Array.from(document.querySelectorAll('input')).some(el => isVisibleControl(el) && el.value === item.name));
    if (editing) return [editing];
    return items.filter(item => !item.name || !text.includes(item.name));
  }
  function controlValue(el) {
    if (el.isContentEditable) return el.innerText.trim();
    if (el.type === 'radio') return el.checked ? el.value : '';
    return displayedControlValue(el);
  }
  function recordDisplayAnchors(existing){
    const result=[];
    for(const label of document.querySelectorAll('label,div,span,dt')){
      if(!isVisibleControl(label)||label.querySelector('input,textarea,select'))continue;
      const caption=cleanText(label.textContent).replace(/[＊*：:\s]/g,'');
      const type=globalThis.SemanticMapper?.recordAnchorType(caption);if(!type)continue;
      for(let parent=label.parentElement,depth=0;parent&&depth<3;parent=parent.parentElement,depth++){
        if(existing.some(el=>parent.contains(el)&&globalThis.SemanticMapper.recordAnchorType(getFieldDescriptor(el))))break;
        const candidates=Array.from(parent.querySelectorAll('span,div,[role=combobox]')).filter(n=>!n.children.length&&!label.contains(n)&&n!==label&&isVisibleControl(n)&&!n.matches('input,textarea,select')&&!/^[\s\uE000-\uF8FF]*$/.test(n.textContent));
        const values=candidates.map(n=>({el:n,current:cleanText(n.textContent)})).filter(x=>x.current&&x.current!==caption&&!/^请|添加|编辑|删除|学校|公司|项目名称|其他/.test(x.current));
        if(values.length===1){result.push({...values[0],label:caption,recordType:type});break;}
        if(parent.querySelectorAll('input,textarea,select').length>1)break;
      }
    }
    return result.filter((r,i,a)=>a.findIndex(x=>x.el===r.el)===i);
  }
  function formSection(el) {
    const titleText=node=>cleanText(Array.from(node.childNodes||[]).filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ')||node.textContent).replace(/[＊*：:\s]/g,'').replace(/必填/g,'').replace(/\([^)]*\)|（[^）]*）/g,'');
    const known=/^(个人信息|基本信息|基础信息|应聘信息|教育经历|教育背景|学习经历|工作经历|工作经验|实习经历|实习经验|项目经历|项目经验|校园经历|社团经历|英语能力|其他外语能力|语言能力|计算机能力|IT技能|技能证书|证书|获奖|获奖情况|竞赛获奖|其他荣誉|论文|研究成果|学术成果|获奖信息|奖励荣誉|竞赛情况|实践活动|在校职务|专业技能|语言|作品集|其他信息|家庭状况|原始简历|附件|声明|自我评价)$/;
    // 新站点常用白名单之外的标题（如「实习与工作经历」「在校表现」「荣誉奖项」）。
    // 白名单全部落空后，再用「2-10 字纯标题 + 区段后缀词」兜底；带描述/名称等字段后缀的不算区段。
    const generic=/^[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9]{1,9}$/;
    const sectionSuffix=/经历|信息|情况|能力|奖项|荣誉|技能|证书|语言|论文|成果|实践|活动|作品|意向|背景|奖励|职务|教育|其他/;
    const fieldish=/描述|说明|内容|名称|全称|链接|时间|日期|年月|编号|地址|网址|备注/;
    const pick=test=>{
      for(let parent=el.parentElement,depth=0;parent&&depth<24;parent=parent.parentElement,depth++){
        const headings=Array.from(parent.querySelectorAll('legend,h1,h2,h3,h4,h5,div,span,p,dt'));
        const preceding=headings.filter(node=>test(titleText(node))&&!node.contains(el)&&
          !node.closest('nav,aside,[role="navigation"],button,a,[role="button"]')&&
          !node.querySelector('input,textarea,select,[contenteditable="true"]')&&
          (node.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)&&
          node.getClientRects().length>0);
        // Nearest structural section wins, even when its heading is an ordinary div.
        if(preceding.length)return titleText(preceding[preceding.length-1]);
      }
      return '';
    };
    return pick(title=>known.test(title))||pick(title=>generic.test(title)&&sectionSuffix.test(title)&&!fieldish.test(title));
  }
  /* ---------- 「其他」兜底：下拉里没有能对上的选项时，选兜底项 + 在说明框补真值 ---------- */

  /** 下拉里代表「我的情况不在列表中」的兜底项。 */
  const GENERIC_OPTION = /^(其他|其它|other)$/i;

  /**
   * 允许「选其他 + 在说明里补真值」的字段，**只开给获奖/竞赛类**。
   * 理由：这类字段承认自己不在列表里是无害的（简历上写「奖项名称：其他 + 说明里写清全称」，
   * 正是真人会做的事）。而学历、性别、政治面貌等身份字段一旦选了「其他」，
   * 简历内容就是**失实**的，属于安全红线，**永久禁止**。
   */
  const OTHER_FALLBACK_LABEL = /(奖项名称|获奖名称|奖项或竞赛全称|竞赛名称|获奖项|奖励名称|荣誉名称|奖项等级|获奖等级|奖项级别|获奖级别|奖项类型|获奖类型)/;

  /** 可作为「补充说明」载体的字段标签。 */
  const OTHER_DETAIL_LABEL = /(说明|描述|备注|补充|详情)/;

  /** 该字段是否允许走「选其他」这条路。 */
  function allowsOtherFallback(el) {
    const label = getFieldDescriptor(el);
    return OTHER_FALLBACK_LABEL.test(label) && /奖|竞赛|荣誉|奖励/.test(label);
  }

  /**
   * 在同一条记录里找一个**空的**文本输入框来承载补充说明。
   * 从字段本身向上逐层找、取最近的一个，避免串到相邻的那条记录（如获奖信息-1 抢了 -2 的说明框）。
   */
  function findDetailField(el) {
    const TEXT_INPUT = 'input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=file]):not([type=submit]):not([type=button]),textarea,[contenteditable="true"]';
    for (let node = el.parentElement, depth = 0; node && node !== document.body && depth < 8; node = node.parentElement, depth++) {
      const found = Array.from(node.querySelectorAll(TEXT_INPUT))
        .filter((x) => x !== el && isVisibleControl(x) && !x.disabled && !x.readOnly && !controlValue(x))
        .find((x) => OTHER_DETAIL_LABEL.test(getFieldDescriptor(x)));
      if (found) return found;
    }
    return null;
  }

  /** 选中当前下拉里的兜底项（原生 select 与自定义下拉都支持）。 */
  async function fillGenericOption(el) {
    if (!allowsOtherFallback(el)) return false;
    if (el.tagName === 'SELECT') {
      const option = Array.from(el.options)
        .find((o) => !o.disabled && o.value !== '' && GENERIC_OPTION.test(o.textContent.trim()));
      if (!option) return false;
      const setter = (window.HTMLSelectElement ? Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set : null);
      if (setter) setter.call(el, option.value); else el.value = option.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dataset.ojtGeneric = '1';
      return true;
    }
    simulateOpen(el);
    await sleep(180);
    const options = Array.from(document.querySelectorAll(
      '[role="option"], [class*="option" i], [class*="menu-item" i], li, .brick-select-option, .brick-select-dropdown-item'
    )).filter((option) => isVisibleControl(option));
    const match = options.find((option) => GENERIC_OPTION.test(option.textContent.trim()));
    if (!match) { if (el.tagName === 'INPUT') setNativeValue(el, ''); return false; }
    simulateOpen(match);
    await sleep(80);
    el.dataset.ojtGeneric = '1';
    return true;
  }

  /**
   * 「其他」兜底填写：下拉没有能对上的选项时，选中兜底项，并把真值补写进同一条记录的说明框。
   * 两条前提缺一不可——① 字段在获奖/竞赛白名单内；② 同一条记录里存在可写的说明框。
   * 缺少说明框就返回 null 并保持留空，绝不把真值丢掉。
   * @returns {Promise<{detailEl:Element}|null>} 成功时返回被写入的说明框
   */
  async function writeOtherFallback(el, value) {
    const text = String(value || '').trim();
    if (!text || !allowsOtherFallback(el)) return null;
    const detail = findDetailField(el);
    if (!detail) return null;
    if (!(await fillGenericOption(el))) return null;
    const written = detail.isContentEditable
      ? setNativeValue(detail, text)
      : setNativeValue(detail, formatLongText(text, getMaxLength(detail)));
    await sleep(100);
    return written && controlValue(detail) ? { detailEl: detail } : null;
  }

  async function writeMappedField(el, source, replace=false, semanticApproved=false) {
    if (!el.isConnected || el.disabled || !isVisibleControl(el)) return false;
    if (!replace && controlValue(el)) return false;
    if(!semanticApproved&&globalThis.SemanticMapper&&!globalThis.SemanticMapper.compatible({label:getFieldDescriptor(el),section:formSection(el)},source))return false;
    const value=source.value;
    if (['date','month'].includes(el.type) && source.kind !== 'date') return false;
    const key=source.id.startsWith('profile.')?source.id.slice(8):'period';
    if (source.kind!=='date'&&!isValueCompatible(key,el)) return false;
    if (source.kind==='date' && (!parseDateParts(value) || !isDateWithinRule(parseDateParts(value),key))) return false;
    if (el.type==='radio') return key==='gender' && fillGenderRadio(el,value);
    if (source.kind==='date' && dateSegment(el) && (!el.readOnly||el.tagName==='SELECT'||el.closest('[class*=select i],[role=combobox]'))) {
      const part=dateSegmentValue(el,value);if(part===null)return false;
      const ok=await (el.tagName==='SELECT'?fillSelect(el,part):isSelectLike(el)?fillCustomSelect(el,part):setNativeValue(el,part));
      if(ok&&dateSegment(el)==='year')el.dataset.ojtDatePrecision='year';
      return ok;
    }
    if (source.kind==='date' && !['date','month'].includes(el.type)) return fillDatePicker(el,value,key);
    if (isSelectLike(el) && el.tagName!=='SELECT') return fillCustomSelect(el,value);
    if (el.isContentEditable && replace) {
      el.focus();el.textContent='';
    }
    const ok=setNativeValue(el,value,Boolean(source.preserveOriginal));
    await sleep(100);
    return ok && Boolean(controlValue(el));
  }
  function showMappingReview(rows, bank, title) {
    document.getElementById('ojt-semantic-review')?.remove();
    const host=document.createElement('div');host.id='ojt-semantic-review';
    host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647;width:390px;max-width:calc(100vw - 32px)';
    const shadow=host.attachShadow({mode:'closed'});
    const style=document.createElement('style');style.textContent='*{box-sizing:border-box}section{font:13px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif;background:#fff;color:#1d1d1f;border:1px solid #e8e8ed;border-radius:17px;box-shadow:0 1px 2px rgba(16,18,20,.05),0 14px 34px rgba(16,18,20,.10);padding:16px}header{font-weight:650;display:flex;justify-content:space-between;align-items:center;gap:8px}p{color:#6e6e73;margin:6px 0 0}article{border-top:1px solid #f0f0f3;padding:10px 0}select{max-width:100%;width:100%;padding:7px 9px;margin:6px 0;border:1px solid #e8e8ed;border-radius:10px;font:inherit;color:#1d1d1f;background:#fff}button{cursor:pointer;border:1px solid #e8e8ed;border-radius:10px;padding:6px 10px;background:#fff;color:#1d1d1f;font:inherit;transition:border-color .15s,background .15s}button:hover{border-color:#d6d6dc;background:#fcfcfd}small{display:block;color:#6e6e73}.rows{max-height:340px;overflow:auto}';shadow.appendChild(style);
    const section=document.createElement('section');shadow.appendChild(section);
    const header=document.createElement('header');header.textContent=title;section.appendChild(header);
    const close=document.createElement('button');close.textContent='收起';close.onclick=()=>host.remove();header.appendChild(close);
    const help=document.createElement('p');help.textContent='请直接检查原网页里的内容，有误可直接修改。紫色边框表示 AI 填入。';section.appendChild(help);
    const detail=document.createElement('button');detail.textContent='查看填写结果';section.appendChild(detail);
    const list=document.createElement('div');list.className='rows';list.hidden=true;section.appendChild(list);detail.onclick=()=>{list.hidden=!list.hidden;detail.textContent=list.hidden?'查看填写结果':'收起详情';};
    for (const row of rows) {
      const article=document.createElement('article');list.appendChild(article);
      const label=document.createElement('strong');label.textContent=row.label.slice(0,100)||row.id;article.appendChild(label);
      const status=document.createElement('small');status.textContent=row.status;article.appendChild(status);
      const select=document.createElement('select');const empty=document.createElement('option');empty.value='';empty.textContent='不填充 / 选择正确的简历字段';select.appendChild(empty);
      for (const source of bank) {const option=document.createElement('option');option.value=source.id;option.textContent=source.group+' · '+source.label;select.appendChild(option);}
      select.value=row.sourceId||'';article.appendChild(select);
      const apply=document.createElement('button');apply.textContent='修正并填入';article.appendChild(apply);
      apply.onclick=async()=>{
        const source=bank.find(b=>b.id===select.value);if(!source){status.textContent='已选择不填充，请在原表单中调整已有内容。';return;}
        apply.disabled=true;
        try {
          const ok=await writeMappedField(row.el,source,true);
          status.textContent=ok?'已按你的选择修正，请检查原表单':'该控件需要在原表单中手动选择';
          if(ok){row.el.style.outline='2px solid #5aa81f';row.sourceId=source.id;} // AI 填写：品牌绿
        } finally {apply.disabled=false;}
      };
      label.style.cursor='pointer';label.onclick=()=>{row.el.scrollIntoView({block:'center'});row.el.focus();};
    }
    document.documentElement.appendChild(host);
  }
  async function fillExactProjectFields(elements, projects) {
    if(projects.length!==1)return 0;
    const project=projects[0];
    let count=0;
    for(const el of elements){
      if(el.disabled||!isVisibleControl(el))continue;
      const label=getFieldDescriptor(el);
      const existing=controlValue(el);
      const stub=normalize(existing).replace(/项目$/, '');
      const expandDraft=/项目描述/.test(label)&&existing.length<=20&&stub.length>=2&&normalize(project.name).includes(stub)&&String(project.description||'').length>existing.length;
      if(existing&&!expandDraft)continue;
      let value='';
      if(/项目描述/.test(label)&&!/项目业绩|项目成果/.test(label))value=project.description||'';
      if(/项目业绩|项目成果/.test(label)){
        value=String(project.description||'').split(/\n/).filter(line=>/^[·●•\s]*(项目落地|项目交付|验证落地|协作验证|系统落地|交付成果)[：:]/.test(line)).join('\n');
      }
      if(value && await writeMappedField(el,{id:'project.0.description',value,kind:'longtext'},expandDraft)){highlight(el);count++;}
    }
    return count;
  }
  async function fillCampusFields(elements, bank, customs) {
    const sources=bank.filter(s=>s.id.startsWith('campus.'));
    if(!sources.length)return 0;
    const groups=[...new Set(sources.map(s=>s.id.split('.')[1]))];
    if(groups.length!==1)return 0; // Multiple experiences require explicit block mapping.
    let count=0;
    for(const el of elements){
      if(!isVisibleControl(el)||el.disabled)continue;
      const label=getFieldDescriptor(el),section=formSection(el);
      if(!/校园经历|学生干部|社团经历/.test(label+' '+section))continue;
      const suffix=/开始|起始/.test(label)?'start':/结束/.test(label)?'end':/描述|职责|内容/.test(label)?'description':/角色|职务/.test(label)?'role':/名称/.test(label)?'name':'';
      const source=sources.find(s=>s.id.endsWith('.'+suffix));
      if(!suffix||!source)continue;
      const current=controlValue(el);
      // Repair only exact copies of a known composite source, never arbitrary user edits.
      const mistaken=current&&(customs||[]).some(cf=>/学生干部|校园经历|社团经历/.test(cf.label||'')&&cf.value===current);
      if(current&&!mistaken)continue;
      if(await writeMappedField(el,source,Boolean(mistaken))){highlight(el);count++;}
    }
    return count;
  }
  let fillingForm=false;
  async function fillForm() {
    if(fillingForm)return {filledCount:0,message:'正在处理，请稍候'};
    fillingForm=true;
    try {
      document.getElementById('ojt-semantic-review')?.remove();
      const pageAtStart=location.href;
      const data=await chrome.storage.local.get(['userProfile','experiences','customFields','knowledgeLibrary']);
      const mapper=globalThis.SemanticMapper;
      if(globalThis.EasyFormAdapter||data.knowledgeLibrary?.authority?.active){if(globalThis.__ojtStartAgent){await globalThis.__ojtStartAgent();return {filledCount:0,message:'已启动资料库填写，请查看页面进度'};}return {filledCount:0,message:'请刷新页面后使用资料库填写'};}
      if(!mapper)return await fillFormByRules();
      const labels=Object.fromEntries(Object.entries(FIELD_KEYWORDS).map(([key,kws])=>[key,kws[0]]));
      const bank=mapper.buildBank(data,labels);
      const pending=new Set(pendingProjects(data.experiences?.project));
      const availableBank=bank.filter(b=>!b.id.startsWith('project.')||pending.has(data.experiences.project[Number(b.id.split('.')[1])]));
      const elements=Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=file]):not([type=password]),textarea,select,[contenteditable="true"],.brick-field .brick-select-selection'));
      const exactCount=await fillExactProjectFields(elements,[...pending])+await fillCampusFields(elements,availableBank,data.customFields);
      let missingLinks=0;
      const rows=elements.filter(el=>!el.disabled&&isVisibleControl(el)&&!controlValue(el)).slice(0,120).map((el,i)=>({el,id:'f'+i,label:getFieldDescriptor(el),placeholder:el.placeholder||el.getAttribute('data-placeholder')||'',type:el.isContentEditable?'richtext':el.type||el.tagName.toLowerCase(),section:/项目|该项目/.test(getFieldDescriptor(el))?'项目经历':formSection(el),options:el.tagName==='SELECT'?Array.from(el.options).map(o=>o.textContent.trim()):[]})).filter(row=>!/兑换码|验证码|搜索|password|captcha/i.test(row.label)).filter(row=>{if(/项目链接/.test(row.label)&&!availableBank.some(b=>/^project\.\d+\.(url|link)$/.test(b.id))){missingLinks++;return false;}return true;});
      if(!rows.length)return {ok:true,filledCount:exactCount,message:(exactCount?`已补全 ${exactCount} 项，其他已有内容已保留`:'已有内容已保留，无需重复填写')+(missingLinks?'；未提供项目专属链接，已留空':'')};
      let result;
      try {result=await chrome.runtime.sendMessage({type:'MAP_FORM_FIELDS',payload:{fields:rows.map(({el,...f})=>f),bank:mapper.metadata(availableBank),projectEvidence:availableBank.filter(b=>/^project\.\d+\.description$/.test(b.id)).map(b=>({id:b.id,text:b.value.slice(0,10000)}))}});} catch {result={ok:false};}
      if(location.href!==pageAtStart)return {filledCount:0,message:'页面已切换，已停止填写，请在当前表单重新点击'};
      if(!result?.ok) {
        const fallback=await fillFormByRules();fallback.filledCount+=exactCount;
        const unresolved=rows.filter(r=>!controlValue(r.el)).map(r=>({...r,status:'规则未匹配，可手动指定对应字段'}));
        if(unresolved.length)showMappingReview(unresolved,bank,`已填写 ${fallback.filledCount} 项`);
        return {...fallback,message:`已按规则填写 ${fallback.filledCount} 项${result?.disabled?'（AI 未启用）':`（${result?.error || 'AI 暂不可用'}）`}${unresolved.length?'；其余请检查网页填写内容':''}`};
      }
      // Revalidate in content context; confidence and source IDs are not trusted from the model.
      const mappings=mapper.validateMappings(result.mappings,rows,availableBank,result.threshold);
      let filledCount=exactCount;
      for(const row of rows){
        const mapping=mappings.find(m=>m.fieldId===row.id);
        row.sourceId=mapping?.sourceId;
        row.status=!mapping?'未找到可靠映射':!mapping.accepted?`置信度 ${Math.round(mapping.confidence*100)}%，已跳过`:'待填写';
        if(!mapping?.accepted)continue;
        if(getFieldDescriptor(row.el)!==row.label){row.status='表单已变化，请重新识别';continue;}
        let source=availableBank.find(s=>s.id===mapping.sourceId);
        if(mapping.quotes?.length)source={...source,value:mapping.quotes.join('\n')};
        const ok=await writeMappedField(row.el,source);
        row.status=ok?`AI 填充 · ${Math.round(mapping.confidence*100)}%`:'已跳过：字段已有内容或控件需手动选择';
        if(ok){filledCount++;row.el.style.outline='2px solid #5aa81f';row.el.style.outlineOffset='2px';}
      }
      showMappingReview(rows,bank,`已填写 ${filledCount} 项`);
      return {filledCount,message:`已填写 ${filledCount} 项，${Math.max(0,rows.length-(filledCount-exactCount))} 项待确认；请检查网页填写内容`};
    } finally {fillingForm=false;}
  }

  // ============ 进度抓取模块 ============

  // 长状态优先，避免「投递简历」被短词「投递」提前截断。
  const STATUS_KEYWORDS = [
    // 终止/结束态优先，避免被后面的泛化词（投递/面试）抢先命中
    '综合评估不通过', '流程终止', '流程结束', '感谢信', '不通过',
    '简历筛选中', '简历筛选', 'HR筛选', 'HR审核', '人才库储备', '投递成功', '投递简历',
    '录用评估', '面试中', '待筛选', '简历初筛', '筛选中', '待评估',
    '待处理', '已查看', '待安排', '待测评', '待笔试', '待面试',
    '已投递', '已录用', '不合适', '未通过', '已结束', '已淘汰',
    '测评', '笔试', 'offer', '录用', '人才库', '投递', '初筛',
    '面试', '一面', '二面', '三面', '终面', '淘汰'
  ];

  /**
   * 统一面向用户展示的状态术语。只有明确命中词典时才返回标准状态，
   * 不能可靠归类的文本统一返回“状态未知”，不根据上下文臆测。
   */
  function normalizeApplicationStatus(raw) {
    const text = cleanText(raw).toLowerCase();
    if (!text || text === '状态未知') return '状态未知';
    const glossary = [
      ['已拒绝', /综合评估不通过|未通过|不通过|不合适|已淘汰|淘汰|拒绝|感谢信|reject/],
      ['流程结束', /流程终止|流程结束|已结束|职位关闭|申请关闭|撤销申请|已撤回/],
      ['人才库', /人才库储备|人才库|候选人库|储备人才/],
      ['已录用', /已录用|正式录用|录用成功|入职成功|已入职/],
      ['Offer', /offer|发放录用|录用通知/],
      ['录用评估', /录用评估|录用审批|薪酬审批|待录用/],
      ['面试中', /终面|三面|二面|一面|复试|面试中|待面试|面试安排|面试/],
      ['笔试', /待笔试|笔试中|笔试/],
      ['测评', /待测评|测评中|在线测评|人才测评|测评/],
      ['简历筛选', /hr\s*筛选|hr\s*审核|简历筛选中|简历筛选|简历初筛|待筛选|筛选中|初筛|待评估/],
      ['已查看', /已查看|hr已读|招聘方已查看|简历已读/],
      ['已投递', /投递成功|投递简历|已投递|申请成功|已申请|投递|待处理/]
    ];
    const match = glossary.find(([, pattern]) => pattern.test(text));
    return match ? match[0] : '状态未知';
  }

  /** 终止/结束语义：一旦某个进度步骤命中，即视为该条投递的最终进度 */
  const TERMINAL_STATUS_RE = /流程终止|综合评估不通过|未通过|不通过|已淘汰|不合适|流程结束|已结束|感谢信/;

  const POSITION_NOISE = [
    '应聘记录', '投递记录', '申请记录', '首页', '校园招聘', '校园招聘官网',
    '校招', '实习招聘', '社会招聘', '招聘官网', '职位列表', '职位详情',
    '修改申请', '撤回', '查看详情', '投递简历', '内推投递',
    // 列表区标题/分组标题（含计数），不是岗位名称
    '已完成的投递', '进行中的投递', '暂存的投递', '全部投递', '已完成投递',
    '已完成', '进行中', '暂存',
    // 进度条步骤标签（简历投递→筛选→面试→Offer→入职），是投递进度不是岗位名称
    '简历投递', '筛选', '面试', '入职', '综合评估不通过', '待评估', '撤销申请',
    // 进度步骤的子状态文案（简历投递「成功」、筛选「待评估」等），不是岗位名称
    '成功', '失败', 'offer', 'Offer'
  ];

  function isPositionText(text, profile) {
    const value = cleanText(text);
    if (!isSaneValue(value, 80) || !JobValidator.isLikelyPosition(value, profile)) return false;
    if (POSITION_NOISE.some((item) => value === item || value.includes(item))) return false;
    // 状态词只能作为投递进度，不能作为岗位名称。
    if (STATUS_KEYWORDS.some((item) => value.toLowerCase() === item.toLowerCase())) return false;
    if (/第\s*\d+\s*志愿|投递时间|申请时间/.test(value)) return false;
    // 意向岗位/意向城市等元信息标签行，不是岗位名称本身。
    if (/意向岗位|意向城市|意向地点|意向工作地|意向城市/.test(value)) return false;
    if (/[,，、|｜]/.test(value)) return false;
    // 形如「已完成的投递 (2)」的列表区计数标题：末尾为纯数字括号计数。
    // 真实岗位编号（如「AI产品经理(J20074)」）括号内含字母，不会被误伤。
    if (/[（(]\s*\d+\s*[）)]\s*$/.test(value)) return false;
    return true;
  }

  /** 从投递卡片的字段顺序中提取岗位：岗位通常位于意向地点/项目等元数据之前。 */
  function extractPositionByRecordOrder(card) {
    const metaPattern = /意向地点|意向城市|招聘类型|投递时间|申请时间|项目[：:]/;
    const texts = Array.from(card.querySelectorAll('*'))
      .filter((el) => el.children.length === 0)
      .map((el) => cleanText(el.textContent))
      .filter((text) => text && text.length <= 80);
    const metaIndex = texts.findIndex((text) => metaPattern.test(text));
    const candidates = (metaIndex > 0 ? texts.slice(0, metaIndex) : texts)
      .filter((text) => isPositionText(text));
    // 候选中优先选择最长的标题文本，避免把“投递记录”等短标题当岗位。
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0] || '';
  }

  /**
   * 清洗抓取到的文本：合并连续空白/换行为单个空格并去首尾空白。
   * 页面元素的 textContent 常含大量换行和缩进，直接用会很脏。
   */
  function cleanText(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim();
  }

  /**
   * 判断一段抓取文本是否是「合理的单值」，而非误抓的一整块列表/多条记录。
   * 用于岗位名、公司名、城市等字段，避免把整页文字塞进一个单元格。
   * 判定为「不合理」的情形：
   *  - 为空；
   *  - 超过 maxLen 长度上限（单个岗位名不会那么长）；
   *  - 含有多条记录/操作按钮的特征词（状态:、修改申请、撤回、查看详情等）。
   * @param {string} text 已清洗文本
   * @param {number} maxLen 该字段允许的最大长度
   */
  function isSaneValue(text, maxLen) {
    if (!text) return false;
    if (text.length > maxLen) return false;
    // 列表页把多条记录揉在一起时，往往包含这些操作/状态标记
    const LIST_NOISE = ['状态:', '状态：', '修改申请', '撤回', '查看详情', '项目:', '项目：'];
    if (LIST_NOISE.some((n) => text.includes(n))) return false;
    return true;
  }

  /**
   * 从页面标题中挑出最像「公司名」的一段。
   * 标题常见写法有「应聘记录 - 小米实习生招聘」「某公司招聘官网」等，
   * 直接取第一段会得到「应聘记录」这类页面名，因此按段打分：
   * 含招聘/校招等站点后缀的段优先（去掉后缀后即公司名），
   * 并排除「应聘记录/投递记录」这类纯页面名。
   */
  function companyFromTitle() {
    const PAGE_WORDS = ['应聘记录', '投递记录', '申请记录', '我的简历', '个人中心',
      '职位列表', '职位详情', '首页', '登录', '注册'];
    const SITE_SUFFIX = /(招聘官网|招聘网|校园招聘|实习生招聘|社会招聘|校招|招聘|官网)$/;
    const segs = String(document.title || '')
      .split(/[-_|·—\/]/)
      .map((s) => cleanText(s))
      .filter(Boolean)
      .filter((s) => !PAGE_WORDS.includes(s));
    // 优先：带招聘类后缀的段，剥掉后缀就是公司名
    for (const s of segs) {
      if (SITE_SUFFIX.test(s)) {
        const name = s.replace(SITE_SUFFIX, '').trim();
        if (name) return name.slice(0, 60);
      }
    }
    return (segs[0] || '').slice(0, 60);
  }

  /** 尝试从常见 meta / 元素中获取公司名 */
  function extractCompany() {
    const selectors = [
      '[class*="company" i]',
      '[itemprop="hiringOrganization"]', 'meta[property="og:site_name"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = cleanText(el.content || el.textContent);
        if (isSaneValue(text, 60)) return text.slice(0, 60);
      }
    }
    // 兜底：从站点标题中挑出公司名
    return companyFromTitle();
  }

  /** 详情页用“投递岗位：”标签精确提取岗位，避免把进度条节点当成岗位。 */
  function extractLabeledPosition() {
    const text = cleanText(document.body && document.body.innerText);
    const match = text.match(/投递岗位\s*[：:]\s*([^\n]+?)(?=\s+(?:当前状态|投递时间|招聘类型|投递渠道|姓名|候选人|申请人|求职者|手机(?:号|号码|尾号)?|联系电话|联系方式)\s*[：:]|$)/);
    const position = cleanText(match && match[1]);
    return isPositionText(position) ? position.slice(0, 80) : '';
  }

  /** 当前页面是否为单岗位进度详情页，而不是投递记录列表。 */
  function isJobProgressDetailPage() {
    const text = cleanText(document.body && document.body.innerText);
    return /投递岗位\s*[：:]/.test(text) && /当前状态\s*[：:]/.test(text);
  }

  /** 尝试提取岗位名 */
  function extractPosition() {
    const labeledPosition = extractLabeledPosition();
    if (labeledPosition) return labeledPosition;
    const selectors = [
      // 快手投递记录页的真实岗位节点：.apply-record-container-header > h3
      '.apply-record-container-header h3',
      '.apply-record-container h3',
      'h1', 'h2', 'h3', 'h4',
      '[class*="job-title" i]', '[class*="jobtitle" i]',
      '[class*="position" i]', '[itemprop="title"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const text = cleanText(purePositionText(el));
      if (isPositionText(text)) return text.slice(0, 80);
    }
    // 详情页没有可靠岗位标题时不猜测，避免把「投递记录」或导航写入 Excel。
    return '';
  }

  /** 尝试提取工作城市 */
  function extractCity() {
    const selectors = [
      '[class*="city"]', '[class*="City"]',
      '[class*="location"]', '[class*="Location"]',
      '[itemprop="jobLocation"]', '[itemprop="addressLocality"]'
    ];
    const labeled = (document.body.innerText || '').match(/(?:意向工作地|意向地点|意向城市|工作地点|工作城市|城市|地点)\s*[：:]\s*([^\n]+)/);
    if (labeled && isSaneValue(labeled[1].trim(), 40)) return labeled[1].trim().slice(0, 40);
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = cleanText(el && (el.content || el.textContent));
      if (isSaneValue(text, 40)) return text.slice(0, 40);
    }
    return '';
  }

  /** 尝试从整页文本中识别投递状态 */
  function extractStatus() {
    const bodyText = document.body.innerText || '';
    const labeled = bodyText.match(/当前状态\s*[：:]\s*([^\n]+)/);
    if (labeled && cleanText(labeled[1])) return normalizeApplicationStatus(labeled[1]);
    for (const kw of STATUS_KEYWORDS) {
      if (bodyText.includes(kw)) return normalizeApplicationStatus(kw);
    }
    return '状态未知';
  }

  /**
   * 提取岗位信息，返回 JSON。
   * @returns {{company:string, position:string, city:string, status:string, source:string}}
   */
  function extractJobInfo() {
    return {
      company: extractCompany(),
      position: extractPosition(),
      city: extractCity(),
      status: extractStatus(),
      source: location.hostname
    };
  }

  // ============ 列表页多卡片抓取 ============

  /**
   * 在一张卡片元素内提取岗位名。
   * 优先卡片内的标题类元素（h1~h4 / 带 title|job|position 类），
   * 取其中第一个「合理单值」文本。
   */
  function extractPositionInCard(card) {
    // 美团投递记录的真实岗位节点是 .jobName .title，不能先取外层 .jobName，
    // 否则会把“志愿一”和“应届”等标签一起当成岗位文本。
    const exactTitle = card.querySelector('.jobName .title');
    if (exactTitle) {
      const exactText = cleanText(exactTitle.textContent);
      if (isPositionText(exactText)) return exactText.slice(0, 80);
    }
    const candidates = card.querySelectorAll(
      'h1,h2,h3,h4,[class*="title" i],[class*="job" i],[class*="position" i],' +
      '[class*="name" i],[class*="heading" i]'
    );
    const positionCandidates = [];
    for (const el of candidates) {
      // 跳过明显的公司名元素，避免把公司名当成岗位名
      const cls = (el.className && String(el.className) || '').toLowerCase();
      if (cls.includes('company') || /user|candidate|applicant|person|profile|phone|mobile|contact|account/.test(cls)) continue;
      const text = cleanText(purePositionText(el));
      if (isPositionText(text)) positionCandidates.push({ el, text, cls });
    }
    if (positionCandidates.length) {
      // 剔除「多标签容器」：若某候选内部还包含 2 个以上其他候选，说明它的文本是
      // 多个并列标签的拼接（如 OPPO 的岗位/实习生/产品类三段同级 name），
      // 而不是单个岗位名，否则会得到「AI产品经理实习生产品类」。
      const specific = positionCandidates.filter((c) => {
        const inner = positionCandidates.filter((o) => o !== c && c.el.contains(o.el));
        return inner.length < 2;
      });
      const finalists = specific.length ? specific : positionCandidates;
      // 同一张卡片可能同时有简称和完整岗位名，优先保留更完整的连续原文。
      finalists.sort((a, b) => {
        const aRich = /(实习生|经理|工程师|专员|顾问|开发|设计|运营|算法|研究员)/.test(a.text) ? 1 : 0;
        const bRich = /(实习生|经理|工程师|专员|顾问|开发|设计|运营|算法|研究员)/.test(b.text) ? 1 : 0;
        return bRich - aRich || b.text.length - a.text.length;
      });
      return finalists[0].text.slice(0, 80);
    }
    const orderedPosition = extractPositionByRecordOrder(card);
    if (orderedPosition) return orderedPosition.slice(0, 80);
    // 兜底：类名混淆的 SPA（如 Moka 招聘系统）标题元素无语义类名，
    // 退而取卡片内第一个「合理短文本」的叶子元素作为岗位名，
    // 排除按钮、状态、"状态:/项目:" 标签、时间戳、占位符等噪声。
    const leaves = Array.from(card.querySelectorAll('*')).filter((n) => n.children.length === 0);
    const NOISE_EXACT = ['状态:', '状态：', '项目:', '项目：', '修改申请', '撤回', '查看详情', '-'];
    for (const el of leaves) {
      const cls = (el.className && String(el.className) || '').toLowerCase();
      if (cls.includes('company') || cls.includes('button') || cls.includes('status') ||
          /user|candidate|applicant|person|profile|phone|mobile|contact|account/.test(cls)) continue;
      const text = cleanText(el.textContent);
      if (!text || NOISE_EXACT.includes(text)) continue;
      if (STATUS_KEYWORDS.includes(text)) continue;
      if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(text)) continue; // 时间戳
      if (isPositionText(text)) return text.slice(0, 80);
    }
    return '';
  }

  /**
   * 从标题元素中提取「纯岗位名」：剔除其内部标签类后代的文本
   * （如「第 N 志愿」志愿标签、「内推投递」投递标签、状态标签等），
   * 避免岗位名被污染成「产品经理实习生第 1 志愿内推投递」。
   */
  function purePositionText(el) {
    const TAG_HINTS = ['tag', 'badge', 'status', 'delivery', 'volunteer'];
    const noise = Array.from(el.querySelectorAll('*'))
      .filter((n) => {
        const cls = (n.className && String(n.className) || '').toLowerCase();
        return TAG_HINTS.some((h) => cls.includes(h));
      })
      .map((n) => n.textContent)
      .filter(Boolean);
    let text = el.textContent || '';
    for (const frag of noise) text = text.split(frag).join(' ');
    return text;
  }

  /**
   * 在一张卡片内提取投递状态。
   * 顺序：① status 类元素；② 流程条中「高亮/激活」的当前步骤（如小米的
   * `step step-highlight` → 投递简历）；③ 关键词兜底。
   */
  const FAILED_STEP_SIGNAL_RE = /不通过|未通过|失败|淘汰|拒绝|终止|不合适|[×✕✖❌]|fail(?:ed|ure)?|error|reject(?:ed)?|cross|wrong|invalid/i;
  const PASSED_STEP_SIGNAL_RE = /成功|已通过|已完成|[✓✔✅]|success|passed|complete(?:d)?|finish(?:ed)?|(?:^|[\s_-])check(?:ed|mark)?(?:$|[\s_-])/i;
  const ACTIVE_STEP_SIGNAL_RE = /处理中|进行中|待处理|processing|current|active/i;

  /** 从步骤容器的文本、属性和图标标识中识别勾号、叉号及进行中状态。 */
  function detectStepOutcome(step) {
    if (!step) return 'unknown';
    const nodes = [step, ...Array.from(step.querySelectorAll('*'))];
    const signals = nodes.map((node) => {
      const attrs = ['class', 'id', 'title', 'aria-label', 'alt', 'src', 'href', 'xlink:href', 'data-status', 'data-state'];
      return attrs.map((name) => node.getAttribute && node.getAttribute(name) || '').join(' ');
    });
    // 部分站点用背景图、mask 或伪元素绘制勾叉，需把可计算样式也纳入信号。
    if (typeof getComputedStyle === 'function') {
      for (const node of nodes) {
        for (const pseudo of [null, '::before', '::after']) {
          try {
            const style = getComputedStyle(node, pseudo);
            signals.push(`${style.content || ''} ${style.backgroundImage || ''} ${style.maskImage || ''}`);
          } catch (_) {}
        }
      }
    }
    signals.push(cleanText(step.innerText || step.textContent || ''));
    const signal = signals.join(' ');
    // 同一节点同时存在 processing 与失败图标时，失败结果优先。
    if (FAILED_STEP_SIGNAL_RE.test(signal)) return 'failed';
    if (PASSED_STEP_SIGNAL_RE.test(signal)) return 'passed';
    if (ACTIVE_STEP_SIGNAL_RE.test(signal)) return 'processing';
    return 'unknown';
  }

  function getStepTitle(text) {
    const match = cleanText(text).match(/简历投递|投递简历|简历筛选|简历初筛|HR筛选|HR审核|初筛|测评|笔试|综合评估|录用评估|终面|一面|二面|三面|面试|待入职|预入职|入职|录用|Offer/i);
    return match ? match[0] : cleanText(text);
  }

  function statusWithOutcome(text, outcome) {
    const title = getStepTitle(text);
    if (outcome === 'failed') return `${title}不通过`;
    if (outcome === 'passed') return `${title}成功`;
    return title;
  }

  // 仅暴露纯状态逻辑，供 Node 回归测试复用；浏览器运行不受影响。
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      detectStepOutcome,
      getStepTitle,
      statusWithOutcome,
      normalizeApplicationStatus, parseDateParts, matchesDate, fillSelect, getFieldDescriptor, displayedControlValue, fillExperience, setNativeValue, pendingProjects, fillExactProjectFields, fillCampusFields
    };
  }

  function extractRawStatusInCard(card) {
    const statusText = (el) => cleanText(
      (el.querySelector('[class*="action" i],[class*="name" i],[class*="title" i]') || el).textContent
    ).replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}.*$/, '').replace(/\s*ⓘ.*$/, '').trim();

    const kuaishouCurrent = card.querySelector(
      '.status-item-container.processing .status-text,.status-text.processing'
    );
    if (kuaishouCurrent) {
      const step = kuaishouCurrent.closest('.status-item-container') || kuaishouCurrent;
      const outcome = detectStepOutcome(step);
      if (outcome !== 'unknown') return statusWithOutcome(statusText(kuaishouCurrent), outcome);
    }

    // 优先读取语义明确的当前步骤属性，避免被流程中第一个「投递」抢先命中。
    const current = card.querySelector(
      '[aria-current="step"],[aria-selected="true"],[data-state="active" i],' +
      '[data-active="true" i],[data-status]'
    );
    if (current) {
      const t = cleanText(current.getAttribute('data-status') || statusText(current));
      const outcome = detectStepOutcome(current);
      if (t && t.length <= 20 && STATUS_KEYWORDS.some((kw) => t.includes(kw))) {
        return statusWithOutcome(t, outcome);
      }
    }

    // 进度条必须先按步骤容器解析，避免只读取 status-text 标题而丢失旁边的勾号/叉号。
    const fromSteps = extractStatusFromProgressSteps(card);
    if (fromSteps) return fromSteps;

    const stEl = Array.from(card.querySelectorAll('[class*="status" i]'))
      .filter((el) => !el.closest('[class*="step" i],[class*="stage" i],[class*="process" i]'))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (stEl) {
      const t = statusText(stEl);
      if (t && t.length <= 20 && STATUS_KEYWORDS.some((kw) => t.includes(kw)) &&
          !/[→➜]|投递简历.*简历筛选/.test(t)) return t;
    }

    // 流程步骤：取被标记为当前/高亮/激活的那一步的文案。
    // 需排除志愿/投递标签（如「第 1 志愿」的 volunteer-tag-active），它们不是进度。
    const TAG_HINTS = ['tag', 'label', 'badge', 'volunteer', 'delivery'];
    const activeStep = Array.from(card.querySelectorAll(
      '[class*="highlight" i],[class*="active" i],[class*="current" i]'
    )).find((n) => {
      const c = (n.className && String(n.className) || '').toLowerCase();
      return !TAG_HINTS.some((h) => c.includes(h));
    });
    if (activeStep) {
      // 优先取步骤内的动作文案节点，避免把日期一起带上
      const actEl = activeStep.querySelector('[class*="action" i],[class*="name" i]');
      const t = cleanText((actEl || activeStep).textContent)
        .replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}.*$/, '').trim();
      if (t && t.length <= 20) return t;
    }
    const text = card.innerText || card.textContent || '';
    // 已检测到完整流程结构但缺少可靠结果时不得按标题猜测，统一返回状态未知。
    const progressTitleCount = ['投递简历', '简历筛选', '面试', '录用评估', 'Offer', '预入职']
      .filter((title) => text.includes(title)).length;
    if (progressTitleCount >= 3) return '';
    // 关键词兜底前，先剔除「未发生的流程占位步骤」词，避免把进度条末尾的
    // 「面试/Offer/入职」当成当前进度（它们只是尚未开始的占位标题）。
    const FUTURE_STEP_ONLY = ['入职', 'Offer', 'offer'];
    for (const kw of STATUS_KEYWORDS) {
      if (FUTURE_STEP_ONLY.includes(kw)) continue;
      if (text.includes(kw)) return kw;
    }
    return '';
  }

  /** 识别卡片状态并统一为标准术语；证据不足时返回“状态未知”。 */
  function extractStatusInCard(card) {
    return normalizeApplicationStatus(extractRawStatusInCard(card));
  }

  /**
   * 解析卡片内的进度条步骤序列，返回当前进度文案。
   * 规则：枚举步骤 → 判定每步是否「已发生」→ 取最后一个已发生的步骤。
   * 未发生的灰色占位步骤（面试/Offer/入职）只有标题、没有日期或子状态文案。
   * 解析不可靠时返回空串，交由上层关键词兜底，避免给出更差的结果。
   * @param {HTMLElement} card
   * @returns {string}
   */
  function extractStatusFromProgressSteps(card) {
    const DATE_RE = /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/;

    // 枚举候选步骤节点：同一父容器下、结构同质的一组元素。
    const nodes = Array.from(card.querySelectorAll(
      '[class*="step" i],[class*="node" i],[class*="stage" i],[class*="process" i]'
    )).filter((n) => n.offsetParent !== null && cleanText(n.textContent));
    // 按「基础类名 + 父容器类名」把同级同构的节点归为一组，取最大的一组作为步骤序列。
    // 不能直接取最内层节点：OPPO 把标题与状态拆成 step-item__label 与
    // step-item__state__text 两个平级叶子，取叶子会让「简历投递」和「成功」分家，
    // 步骤与其状态无法配对，进而误判每一步是否已发生。
    const groups = new Map();
    for (const n of nodes) {
      const base = String(n.className || '').split(/\s+/)
        .find((c) => /step|node|stage|process/i.test(c)) || 'unknown';
      const key = base.split('--')[0] + '@' + String(n.parentElement && n.parentElement.className || '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    }
    const textLen = (list) => list.reduce((sum, n) => sum + cleanText(n.textContent).length, 0);
    let steps = [];
    for (const list of groups.values()) {
      // 同样多的节点时取文本更完整的一组（父级步骤容器含标题+状态，优于纯标题组）。
      if (list.length > steps.length ||
          (list.length === steps.length && textLen(list) > textLen(steps))) {
        steps = list;
      }
    }
    // 步骤节点枚举失败（如整条进度条渲染为单个节点）时，改用纯文本配对解析。
    if (steps.length < 2) return extractStatusFromProgressText(card);

    const parsed = steps.map((n) => {
      const raw = cleanText(n.innerText || n.textContent);
      const cls = String(n.className || '').toLowerCase();
      const hasDate = DATE_RE.test(raw);
      const withoutDate = raw.replace(DATE_RE, '').trim();

      // 优先按结构拆出「步骤标题」与「结果状态」两个子节点：中文文案之间没有空格
      // （如「简历投递成功」），只靠分词无法判断是否带子状态。
      const titleEl = n.querySelector('[class*="label" i],[class*="title" i],[class*="name" i]');
      const stateWrap = n.querySelector('[class*="state" i],[class*="status" i],[class*="result" i]');
      // 状态容器里常混入操作按钮（如 OPPO 的「撤销申请」custom-link），
      // 优先取容器内更具体的文本节点（state__text），避免把按钮文案当成进度。
      const stateEl = stateWrap
        ? (stateWrap.querySelector('[class*="text" i],[class*="state" i],[class*="status" i]') || stateWrap)
        : null;
      const paired = titleEl && stateEl && stateEl !== titleEl && !titleEl.contains(stateEl);
      const subText = paired ? cleanText(stateEl.textContent).replace(DATE_RE, '').trim() : '';
      const text = paired
        ? `${cleanText(titleEl.textContent).replace(DATE_RE, '').trim()} ${subText}`.trim()
        : withoutDate;
      // 未开始的灰色步骤只有标题、状态节点为空；已发生的步骤才有结果文案。
      const hasSubText = paired
        ? Boolean(subText)
        : withoutDate.split(/\s+/).filter(Boolean).length >= 2;

      const outcome = detectStepOutcome(n);
      return {
        text,
        title: getStepTitle(text),
        date: (raw.match(DATE_RE) || [])[0] || '',
        cls,
        outcome,
        hasClassHint: outcome !== 'unknown',
        hasDate,
        hasSubText
      };
    });

    // 强信号：子状态文案或发生日期。未发生的灰色占位步骤只有孤立标题，二者皆无。
    const strong = parsed.filter((s) => s.hasSubText || s.hasDate);

    // 类名信号只有在「步骤间存在差异」时才可信。OPPO 这类页面所有步骤共享同一
    // 类名（亮暗靠图标/内联样式表达），若据此判定会让全部步骤都算已发生，
    // 最终错误地取到最后一步（如「入职」）。
    const hinted = parsed.filter((s) => s.hasClassHint);
    const signalsDiffer = new Set(parsed.map((s) => s.outcome)).size > 1;
    const hintReliable = signalsDiffer && hinted.length > 0 && hinted.length < parsed.length;

    // 两类信号取并集：小米这类页面进行中的步骤只有 highlight 类名、没有日期，
    // 只看强信号会停留在上一步。并集后仍按原始顺序排列。
    const effective = hintReliable
      ? parsed.filter((s) => strong.includes(s) || hinted.includes(s))
      : strong;

    // 防护：节点上无可靠信号时，退到纯文本配对解析；仍不可靠则放弃本层。
    if (!effective.length) return extractStatusFromProgressText(card);

    // 失败/终止信号优先于 processing：部分站点用 processing 表示流程停留位置，
    // 同一节点的叉号或 fail/reject 属性才表示真实结果。
    const terminal = effective.find(
      (s) => s.outcome === 'failed' || TERMINAL_STATUS_RE.test(s.text)
    );
    if (terminal) {
      return terminal.outcome === 'failed'
        ? statusWithOutcome(terminal.title, 'failed')
        : pickStepStatusText(terminal.text);
    }

    // 防护 1：倒序时间线（最新进度在最上方）时，取第一个而非最后一个。
    const dates = effective.map((s) => s.date).filter(Boolean);
    const descending = dates.length >= 2 && dates[0] > dates[dates.length - 1];
    const current = descending ? effective[0] : effective[effective.length - 1];
    return current.outcome === 'passed'
      ? statusWithOutcome(current.title, 'passed')
      : pickStepStatusText(current.text);
  }

  /**
   * 纯文本兜底：整条进度条被渲染成单个节点时，按「流程标题 + 紧随其后的子文案」
   * 配对判断每一步是否已发生，取最后一个已发生的步骤。
   * 未开始的步骤只有孤立标题（如「入职」），既无日期也无子状态文案。
   * @param {HTMLElement} card
   * @returns {string}
   */
  function extractStatusFromProgressText(card) {
    const STEP_TITLE_RE = new RegExp(
      '^(简历投递|投递简历|简历筛选|简历初筛|初筛|筛选中|筛选|测评|笔试|综合评估' +
      '|录用评估|终面|一面|二面|三面|面试|流程终止|流程结束|待入职|入职|录用|Offer|offer)'
    );
    const DATE_RE = /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/;
    // 子状态文案：只有已发生的步骤才会带上结果或进行态描述。
    const SUB_STATUS_RE = /成功|失败|通过|不通过|进行中|已完成|完成|终止|淘汰|待安排|安排中|评估中|筛选中|已查看/;

    const lines = String(card.innerText || card.textContent || '')
      .split('\n')
      .map((l) => cleanText(l))
      .filter(Boolean);

    const steps = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(STEP_TITLE_RE);
      if (!m) continue;
      // 同行标题之后的残余文案，以及下一处标题之前的所有行，都算这一步的明细。
      const detail = [lines[i].slice(m[0].length)];
      for (let j = i + 1; j < lines.length && !STEP_TITLE_RE.test(lines[j]); j++) {
        detail.push(lines[j]);
      }
      const detailText = cleanText(detail.join(' '));
      steps.push({
        title: m[0],
        detail: detailText,
        occurred: DATE_RE.test(detailText) || SUB_STATUS_RE.test(detailText)
      });
    }
    // 步骤不足两个，说明不是进度条文本，放弃本层。
    if (steps.length < 2) return '';

    const occurred = steps.filter((s) => s.occurred);
    if (!occurred.length) return '';

    const terminal = occurred.find(
      (s) => TERMINAL_STATUS_RE.test(s.title) || TERMINAL_STATUS_RE.test(s.detail)
    );
    const current = terminal || occurred[occurred.length - 1];
    return pickStepStatusText(`${current.title} ${current.detail}`);
  }

  /**
   * 从单个步骤的文案中挑选最合适的进度表述：
   * 有子状态时优先用更具体的子状态（如「综合评估不通过」优于「筛选」）。
   * @param {string} text
   * @returns {string}
   */
  function pickStepStatusText(text) {
    const parts = cleanText(text).split(/\s+/).filter(Boolean)
      // 日期不是进度表述，先剔除，避免把「2026-08-20」当成当前进度。
      .filter((p) => !/^\(?20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/.test(p));
    if (!parts.length) return '';
    // 结果词单独出现时语义不完整，需拼回步骤名（如「简历投递成功」「综合评估不通过」）。
    const BARE_RESULT_RE = /^(成功|失败|通过|不通过|未通过|完成|已完成|进行中)$/;
    const specific = parts.find((p) => TERMINAL_STATUS_RE.test(p));
    const value = specific || parts[parts.length - 1];
    const full = BARE_RESULT_RE.test(value) && parts.length >= 2 ? parts[0] + value : value;
    return full.length <= 20 ? full : full.slice(0, 20);
  }

  /** 在一张卡片内提取公司名，缺省回退到页面级公司名 */
  function extractCompanyInCard(card, fallbackCompany) {
    const el = card.querySelector('[class*="company" i]');
    if (el) {
      const text = cleanText(el.textContent);
      if (isSaneValue(text, 60)) return text.slice(0, 60);
    }
    return fallbackCompany || '';
  }

  /** 在一张卡片内提取投递渠道，优先读取日期/投递文案附近的渠道文本。 */
  function extractSourceInCard(card) {
    const text = cleanText(card.innerText || card.textContent || '');
    const labeled = text.match(/(?:投递渠道|投递方式|招聘类型)\s*[：:]\s*([^\n|]+)/);
    if (labeled && isSaneValue(labeled[1].trim(), 40)) return labeled[1].trim().slice(0, 40);
    const channel = text.match(/(?:校招|社招|春招|秋招|专项招聘|内推|官网投递|官方投递|校园大使)/);
    if (channel) return channel[0];
    return location.hostname;
  }

  /**
   * 在一张卡片内提取城市。
   * 注意：不能直接取第一个匹配元素——像小米的 `cityAndSource` 容器同时包含
   * 城市、招聘类型、职位类别，整块取会得到「北京校招 - 实习产品类」这种脏值。
   * 因此收集所有候选后，取「文本最短且不含分隔噪声」的那个（通常是最内层的纯城市节点）。
   */
  function extractCityInCard(card) {
    const els = Array.from(card.querySelectorAll(
      '[class*="city" i],[class*="location" i]'
    ));
    const texts = [];
    const addText = (raw) => {
      let text = cleanText(raw);
      text = text.replace(/^(?:意向工作地|意向地点|意向城市|工作地点|工作城市|城市|地点)\s*[：:]\s*/, '')
        .replace(/^\d+\s*/, '');
      if (!text) return;
      // 组合字段中通常第一个片段就是城市，例如“北京-校招”“北京 | 实习”。
      const first = text.split(/\s*[-—|｜]\s*/)[0].trim();
      if (first && isSaneValue(first, 20)) texts.push(first);
      if (text !== first && isSaneValue(text, 20) && !/[、,，]/.test(text)) texts.push(text);
    };

    // 优先读取带 city/location 语义的节点。
    const cardText = card.innerText || card.textContent || '';
    const labeledCities = cardText.match(/(?:意向工作地|意向地点|意向城市|工作地点|工作城市|城市|地点)\s*[：:]\s*([^\n]+)/g) || [];
    labeledCities.forEach(addText);
    for (const el of els) {
      let text = cleanText(el.textContent);
      // 剥离「意向城市：1北京」这类前缀标签与序号
      text = text.replace(/^[^：:]{0,6}[：:]\s*/, '').replace(/^\d+\s*/, '');
      // 含分隔符/多段信息的说明是聚合容器，跳过
      if (!text || /[-—|,、]/.test(text)) continue;
      if (isSaneValue(text, 20)) texts.push(text);
    }
    if (!texts.length) return '';
    // 最短者最可能是纯城市名
    texts.sort((a, b) => a.length - b.length);
    return texts[0].slice(0, 40);
  }

  /**
   * 在页面中定位「岗位卡片列表」，返回卡片元素数组。
   * 思路：遍历一组常见列表容器/条目选择器，找到「同类兄弟元素数量 ≥ 2」的一组，
   * 认为它就是卡片列表（每条一个岗位）。选出候选后再逐张校验是否含岗位特征
   * （标题文本 + 状态关键词），过滤掉页眉/页脚等噪声。
   * @returns {HTMLElement[]} 卡片元素数组；找不到返回空数组
   */
  function findJobCards() {
    const isNavigationElement = (node) => !node || JobValidator.isNavigationCandidate(
      node.innerText || node.textContent || '',
      node.className,
      node.id,
      node.getAttribute && node.getAttribute('role')
    );
    // 说明：属性选择器默认大小写敏感，而不少站点用 CSS Modules 生成
    // 形如 `applicationListItem`、`listItem__29d94f` 的哈希类名（含大写 Item），
    // 因此统一加 `i` 标志做大小写不敏感匹配，避免整类卡片漏判。
    const GROUP_SELECTORS = [
      // 语义化标记优先：部分站点用 data-test/data-testid 标注列表条目，最可靠
      '[data-test*="listitem" i]', '[data-testid*="listitem" i]',
      '[data-test*="application" i]', '[data-testid*="application" i]',
      'table tbody tr', 'tr[class]',
      '[class*="application" i]', '[class*="job-card" i]', '[class*="jobcard" i]',
      '[class*="application-card" i]', '[class*="applicationcard" i]',
      '[class*="jobName" i]', '[class*="job-name" i]',
      '[class*="list-item" i]', '[class*="listitem" i]',
      '[class*="card" i]'
    ];
    const SINGLE_CARD_SELECTORS = new Set([
      '[data-test*="application" i]', '[data-testid*="application" i]',
      '[class*="application-card" i]', '[class*="applicationcard" i]',
      '[class*="job-card" i]', '[class*="jobcard" i]'
    ]);
    // 该站点使用 .jobName 作为岗位标题容器，外层记录卡片没有稳定 class。
    // 从标题向上寻找同时包含“投递/当前进度”的最小记录容器。
    const siteCards = [];
    for (const title of Array.from(document.querySelectorAll('.jobName .title'))) {
      let node = title.parentElement;
      while (node && node !== document.body) {
        const text = cleanText(node.innerText || node.textContent || '');
        if (/投递(?:于|时间)?|当前进度|简历筛选|撤销/.test(text) && text.length <= 1200) {
          siteCards.push(node);
          break;
        }
        node = node.parentElement;
      }
    }
    const siteCardResult = dedupeNested(siteCards).filter((card) => {
      const position = extractPositionInCard(card);
      const text = cleanText(card.innerText || card.textContent || '');
      return Boolean(position) && !isNavigationElement(card) &&
        /投递|当前进度|状态\s*[：:]|简历筛选|HR筛选|撤销/.test(text);
    });
    if (siteCardResult.length >= 1) return siteCardResult;

    // Moka 单条投递页没有稳定卡片类名：以“状态：”短文本为锚点，向上寻找
    // 同时包含项目/日期和真实岗位标题的最小容器。该路径允许只有一条记录。
    if (/\.mokahr\.com$/i.test(location.hostname) && /candidateHome\/applications/i.test(location.href)) {
      const mokaAnchors = Array.from(document.querySelectorAll('*')).filter((node) => {
        if (node.offsetParent === null || node.children.length > 3) return false;
        const text = cleanText(node.innerText || node.textContent || '');
        return text.length <= 40 && /^状态\s*[：:]/.test(text);
      });
      const mokaCards = [];
      for (const anchor of mokaAnchors) {
        let node = anchor.parentElement;
        for (let depth = 0; node && node !== document.body && depth < 8; depth++, node = node.parentElement) {
          const text = cleanText(node.innerText || node.textContent || '');
          const hasMeta = /项目\s*[：:]|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}/.test(text);
          const position = extractPositionInCard(node);
          if (hasMeta && position && !isNavigationElement(node) && text.length <= 1200) {
            mokaCards.push(node);
            break;
          }
        }
      }
      const mokaResult = dedupeNested(mokaCards).filter((card) => Boolean(extractPositionInCard(card)));
      if (mokaResult.length) return mokaResult;
    }

    for (const sel of GROUP_SELECTORS) {
      const nodes = Array.from(document.querySelectorAll(sel))
        .filter((n) => n.offsetParent !== null && !isNavigationElement(n)); // 仅保留可见的非导航元素
      // 语义明确的投递卡片允许只有一条；泛化选择器必须至少两个同类节点。
      if (!nodes.length || (!SINGLE_CARD_SELECTORS.has(sel) && nodes.length < 2)) continue;

      // 卡片需「像一条投递记录」：含合理岗位标题，且带投递记录特征
      //（状态关键词，或“状态/撤回/查看详情/修改申请”这类操作与标签）。
      // 不再强依赖状态关键词命中，避免「人才库储备」等未收录状态导致整条卡片被丢弃。
      const RECORD_HINTS = ['状态', '撤回', '查看详情', '修改申请', '投递时间', '投递日期', '申请时间', '申请日期', '意向地点', '意向城市', '工作地点', '工作城市', '招聘类型', '投递于', '投递'];
      const PROCESS_ONLY = ['投递', '投递简历', '简历筛选', '简历筛选中', '面试', '录用评估', 'offer', '预入职'];
      const cards = nodes.filter((n) => {
        const title = extractPositionInCard(n);
        if (!title || PROCESS_ONLY.includes(title.trim())) return false;
        const txt = cleanText(n.innerText || n.textContent || '');
        const hasRecordMeta = RECORD_HINTS.some((h) => txt.includes(h));
        const hasProcessOnlyText = PROCESS_ONLY.includes(txt);
      return hasRecordMeta && !hasProcessOnlyText;
      });
      // 至少识别出 2 张卡片，才认为这是列表结果。
      const singleCardText = cards.length === 1
        ? cleanText(cards[0].innerText || cards[0].textContent || '')
        : '';
      const isStrongSingleCard = cards.length === 1 &&
        /状态\s*[：:]|当前进度/.test(singleCardText) &&
        (/项目\s*[：:]|投递时间|申请时间|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}/.test(singleCardText));
      if (cards.length >= 2 || (cards.length === 1 && (SINGLE_CARD_SELECTORS.has(sel) || isStrongSingleCard))) {
        // 单条记录只有同时具备明确状态和业务元数据时才接受，避免个人资料卡片误入。
        return dedupeNested(cards);
      }
    }
    // 兜底：类名混淆的 SPA（如 Moka 招聘系统）用「状态锚点」通用识别。
    const anchored = findCardsByStatusAnchor();
    if (anchored.length >= 2) return anchored;
    // 二级兜底：一张卡片内含多状态进度条（如 OPPO 校招「简历投递→筛选→面试→
    // Offer→入职」）时，状态锚点会失效。改用每卡唯一出现的「意向岗位/意向城市」
    // 元信息标签反推卡片。
    const metaAnchored = findCardsByMetaAnchor();
    if (metaAnchored.length >= 1) return metaAnchored;
    return [];
  }

  /**
   * 通用卡片识别兜底之二：靠每张投递卡片唯一出现的「意向岗位/意向城市/意向地点」
   * 元信息标签反推卡片，适配「一张卡片含多状态进度条」的布局（状态锚点失效场景）。
   * @returns {HTMLElement[]}
   */
  function findCardsByMetaAnchor() {
    const META_LABEL = /意向岗位|意向城市|意向地点|意向工作地/;
    // 标签常写成「意向岗位：<span>第一意向</span>」，标签文字与值分处不同节点，
    // 因此不能只看叶子节点。取「文本含标签且没有更内层元素也含标签」的最小元素。
    const matched = Array.from(document.querySelectorAll('*')).filter((n) => {
      if (n.offsetParent === null) return false;
      const t = cleanText(n.textContent);
      return t && t.length <= 40 && META_LABEL.test(t);
    });
    const anchors = matched.filter(
      (n) => !matched.some((other) => other !== n && n.contains(other))
    );
    if (!anchors.length) return [];
    const cards = [];
    for (const anchor of anchors) {
      let node = anchor.parentElement, chosen = null;
      for (let d = 0; node && node !== document.body && d < 8; d++, node = node.parentElement) {
        const text = cleanText(node.innerText || node.textContent || '');
        // 卡片需同时含有效岗位名与进度步骤，才是一条完整投递记录。
        if (extractPositionInCard(node) && /简历投递|筛选|面试|offer|入职|录用/i.test(text)) {
          chosen = node;
          break;
        }
      }
      if (chosen && !cards.includes(chosen)) cards.push(chosen);
    }
    return dedupeNested(cards).filter((card) => Boolean(extractPositionInCard(card)));
  }

  /**
   * 通用卡片识别兜底：不依赖业务类名，靠「投递状态」反推卡片。
   * 思路：
   *  1) 找到页面上所有「状态值」元素（带 status 类，或文本恰为某个状态关键词）；
   *  2) 每个状态元素向上冒泡，取「仍只包含它自己这一个状态元素」的最大祖先容器；
   *  3) 这些容器即每条投递记录的卡片，最后剔除相互嵌套者。
   * @returns {HTMLElement[]}
   */
  function findCardsByStatusAnchor() {
    const all = Array.from(document.querySelectorAll('*'))
      .filter((n) => n.offsetParent !== null); // 仅可见
    const statusEls = all.filter((n) => {
      const cls = (n.className && String(n.className) || '').toLowerCase();
      const t = cleanText(n.textContent);
      if (cls.includes('status') && t && t.length <= 20) return true;
      // 叶子节点：文本恰为状态词，或是「投递简历」这类含状态词的短进度文案。
      // 用「包含」而非「全等」，以覆盖各站点的流程步骤写法（如小米的「投递简历」）。
      if (n.children.length !== 0 || !t || t.length > 12) return false;
      return STATUS_KEYWORDS.some((kw) => t === kw || t.includes(kw));
    });
    if (!statusEls.length) return [];
    // 单条投递页：从唯一状态节点向上取首个同时包含岗位、状态和项目/时间的最小容器。
    if (statusEls.length === 1) {
      let node = statusEls[0].parentElement;
      for (let depth = 0; node && node !== document.body && depth < 8; depth++, node = node.parentElement) {
        const text = cleanText(node.innerText || node.textContent || '');
        const position = extractPositionInCard(node);
        const hasMeta = /项目\s*[：:]|投递时间|申请时间|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}/.test(text);
        if (position && hasMeta && text.length <= 1200) return [node];
      }
      return [];
    }
    const cards = [];
    for (const se of statusEls) {
      let node = se.parentElement, chosen = null;
      for (let d = 0; node && d < 8; d++, node = node.parentElement) {
        const inside = statusEls.filter((x) => node.contains(x));
        if (inside.length === 1) chosen = node; // 仍只含自己 → 继续向上扩大
        else break; // 一旦跨到含多个状态，停在上一个 chosen
      }
      if (chosen && !cards.includes(chosen)) cards.push(chosen);
    }
    return dedupeNested(cards).filter((card) => {
      const text = cleanText(card.innerText || card.textContent || '');
      const position = extractPositionInCard(card);
      const hasRecordMeta = /意向地点|意向城市|招聘类型|投递时间|投递日期|申请时间|申请日期|投递于|投递|项目[：:]/.test(text);
      return Boolean(position) && hasRecordMeta && !/^(投递|投递简历|简历筛选|面试|录用评估|offer|预入职)$/.test(position.trim());
    });
  }

  /** 从一组候选中只保留「最内层」的独立卡片，避免整个列表容器被当成一条记录 */
  function dedupeNested(elements) {
    // 若一个候选包含了另一个候选，说明它是聚合容器而非单条记录，应剔除；
    // 只保留不再包含其它候选的叶子卡片。否则多条记录会被压成一条
    //（小米投递记录页的 listItem 外层容器即属此类）。
    const inner = elements.filter(
      (el) => !elements.some((other) => other !== el && el.contains(other))
    );
    return inner.length ? inner : elements;
  }

  /**
   * 列表页多岗位抓取：返回记录数组，每条对应一个岗位。
   * 找不到卡片列表时，退回单条 [extractJobInfo()]，保证旧的详情页场景不受影响。
   * @returns {Array<{company,position,city,status,source}>}
   */
  function extractJobList() {
    // 详情页的“投递岗位/当前状态”是同一岗位信息，进度条中的测评、面试、Offer 不是岗位。
    if (isJobProgressDetailPage()) return [extractJobInfo()];
    const cards = findJobCards();
    if (!cards.length) {
      // 无法识别为列表页 → 按单岗位详情页处理
      return [extractJobInfo()];
    }
    const pageCompany = extractCompany(); // 列表页公司名通常是全局共用
    const records = [];
    const seen = new Set();
    for (const card of cards) {
      const position = extractPositionInCard(card);
      if (!position) continue; // 无岗位名的卡片跳过
      const company = extractCompanyInCard(card, pageCompany);
      const key = `${company.trim()}\u0000${position.trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const record = {
        company,
        position,
        city: extractCityInCard(card),
        status: extractStatusInCard(card),
        source: extractSourceInCard(card),
        url: location.href
      };
      // 保留页面中的每一张独立投递卡片，不能因岗位名称相同而丢失记录。
      records.push(record);
    }
    // 极端情况下卡片都无有效岗位名 → 兜底单条
    return records.length ? records : [extractJobInfo()];
  }

  /**
   * 生成「带 DOM 层级轮廓的结构化文本」，供大模型自行定位并分条投递记录。
   * 相比纯 innerText：保留每个文本块的缩进深度与 class 关键词，
   * 让模型能区分「岗位标题 / 志愿标签 / 状态标签 / 城市 / 时间」的边界，
   * 从根本上避免「揉成一团」和「选错容器」的问题（平台无关）。
   *
   * 做法：从 body 起做深度优先遍历，对每个可见元素，
   * 若它拥有「直接文本」（不含子元素贡献的部分），输出一行：
   *   `<缩进><标签/class提示>: <该行文本>`
   * 跳过 script/style/svg 等无意义节点；整体截断控制 token。
   * @returns {string}
   */
  function buildStructuredText() {
    const SKIP_TAG = new Set(['SCRIPT', 'STYLE', 'SVG', 'PATH', 'NOSCRIPT', 'IMG', 'LINK', 'META']);
    const lines = [];
    const MAX_LINES = 400;

    /** 取元素「自身直接文本」（拼接直接子文本节点，忽略子元素文本） */
    function ownText(el) {
      let s = '';
      for (const node of el.childNodes) {
        if (node.nodeType === 3) s += node.nodeValue; // TEXT_NODE
      }
      return cleanText(s);
    }
    /** 从 class 中挑出对语义有帮助的关键词，作为行前缀提示 */
    function classHint(el) {
      const cls = (el.className && String(el.className) || '').toLowerCase();
      const HINTS = ['title', 'name', 'position', 'job', 'status', 'tag', 'label',
        'city', 'location', 'date', 'time', 'company', 'delivery', 'volunteer',
        'step', 'action', 'item', 'card'];
      const hit = HINTS.filter((h) => cls.includes(h));
      return hit.length ? `[${hit.slice(0, 3).join(',')}]` : '';
    }

    function walk(el, depth) {
      if (lines.length >= MAX_LINES) return;
      if (!el || SKIP_TAG.has(el.tagName)) return;
      // 不可见元素跳过（offsetParent 为 null 且非 fixed）
      if (el.offsetParent === null && el.tagName !== 'BODY') {
        const st = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        if (!st || (st.width === 0 && st.height === 0)) return;
      }
      const t = ownText(el);
      if (t) {
        const indent = '  '.repeat(Math.min(depth, 12));
        const hint = classHint(el);
        lines.push(`${indent}${hint}${t}`);
      }
      for (const child of el.children) walk(child, depth + 1);
    }

    walk(document.body, 0);
    return lines.join('\n').slice(0, 12000);
  }

  /**
   * 优先用大模型从结构化文本解析投递记录（平台无关）；失败或未启用时回退规则法。
   * 返回 { records, via }：via 标记本次数据来源（'llm' | 'rule'），供 UI 提示。
   * @returns {Promise<{records:Array<object>, via:string}>}
   */
  async function extractJobListSmart() {
    // 规则法与 LLM 同时作为候选。列表 DOM 已明确识别出多张卡片时，
    // 不能因 LLM 漏抽而把 2 条记录降成 1 条。
    const { userProfile = {} } = await chrome.storage.local.get('userProfile');
    const cards = findJobCards();
    const recordCards = cards.map((card) => cleanText(card.innerText || card.textContent).slice(0, 3000));
    const ruleRecords = extractJobList().filter((record) => isPositionText(record.position, userProfile));
    const text = buildStructuredText();
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'PARSE_RECORDS_LLM',
        payload: {
          text,
          // 额外传递每张真实投递卡片和整页可见文本，帮助 LLM 在 class 不具语义时定位岗位。
          recordCards,
          pageVisibleText: cleanText(document.body.innerText || document.body.textContent).slice(0, 16000),
          recordCountHint: cards.length,
          pageCompany: extractCompany(),
          url: location.href,
          host: location.hostname
        }
      });
      if (res && res.ok && Array.isArray(res.records) && res.records.length) {
        const pageText = cleanText(document.body.innerText || document.body.textContent);
        const llmRecords = res.records.filter((record) => {
          const position = cleanText(record.position);
          const rawStatus = cleanText(record.status);
          const normalizedStatus = normalizeApplicationStatus(rawStatus);
          // 模型输出的岗位必须能在页面原文中找到；状态必须有页面原文证据，否则标记未知。
          const positionHasEvidence = position && (recordCards.length
            ? recordCards.some((cardText) => cardText.includes(position))
            : pageText.includes(position));
          record.status = rawStatus && pageText.toLowerCase().includes(rawStatus.toLowerCase())
            ? normalizedStatus
            : '状态未知';
          return isPositionText(position, userProfile) && positionHasEvidence;
        });
        const ruleHasMissingPosition = ruleRecords.some((record) => !isPositionText(record.position));
        if (llmRecords.length && ruleHasMissingPosition) {
          console.warn('[EasyOffer] 规则法未找到可靠岗位名称，采用 LLM 识别结果。');
          return { records: llmRecords, via: 'llm' };
        }
        // 规则法直接读取投递卡片 DOM，岗位名称比 LLM 的摘要结果更可信。
        // 只要规则结果中的岗位都可靠，就不要让 LLM 用简称覆盖原始岗位名。
        const ruleHasReliablePositions = ruleRecords.length > 0 &&
          ruleRecords.every((record) => isPositionText(record.position));
        // 记录数量不一致时优先保留数量更多的一方，避免列表页只同步一条。
        // 数量一致时优先规则结果，避免 LLM 将完整岗位简称成“产品生”。
        if ((!recordCards.length || llmRecords.length <= recordCards.length) &&
            llmRecords.length > ruleRecords.length) {
          console.warn(
            `[EasyOffer] LLM 识别 ${llmRecords.length} 条，规则法识别 ${ruleRecords.length} 条，` +
            '采用数量更多的 LLM 结果，避免漏掉投递记录。'
          );
          return { records: llmRecords, via: 'llm' };
        }
        if (ruleHasReliablePositions) return { records: ruleRecords, via: 'rule' };
        if (llmRecords.length) return { records: llmRecords, via: 'llm' };
      }
      if (res && !res.ok) {
        console.warn('[EasyOffer] LLM 解析未生效，回退规则法：', res.error);
      }
    } catch (err) {
      console.warn('[EasyOffer] 调用 LLM 解析异常，回退规则法：', err && err.message);
    }
    return { records: ruleRecords, via: 'rule' };
  }

  // 末尾几个是为「可测试性」额外导出的只读钩子：夹具直接调用它们验证下拉匹配规则与「其他」兜底，
  // 不必把整套 agent 流程跑起来。它们只做选值/写入，不含任何额外副作用。
  globalThis.OJTFormCore={periodEndpoints,periodEndpoint,dateTargetPrecision,dateControlMatches,dateSegment,dateSegmentValue,selectedOptions,isSelectLike,formSection,recordDisplayAnchors,getFieldDescriptor, displayedControlValue,writeMappedField,writeOtherFallback,matchesDate,parseDateParts,labels:Object.fromEntries(Object.entries(FIELD_KEYWORDS).map(([key,kws])=>[key,kws[0]])),fillSelect,pickOption,optionMatches,allowsOtherFallback,findDetailField};
  // ============ 消息监听 ============
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    const listener=(message, sender, sendResponse) => {
      if(message.type==='OJT_VERSION'){sendResponse({version:'5.0.3'});return;}
      if (message.type === 'FILL_FORM') {
        fillForm()
          .then((res) => sendResponse({ ok: res.filledCount > 0, ...res }))
          .catch((err) => sendResponse({ ok: false, error: String(err) }));
        return true; // 异步响应
      }
      if (message.type === 'EXTRACT_JOB') {
        // 先试大模型语义抽取，失败回退规则法；整体异步
        extractJobListSmart()
          .then(({ records, via }) => sendResponse({ ok: true, records, via }))
          .catch((err) => sendResponse({ ok: false, error: String(err) }));
        return true;
      }
    };
    globalThis.__ojtListener=listener;
    chrome.runtime.onMessage.addListener(listener);
  }
})();
