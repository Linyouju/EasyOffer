/* 面板「未填原因」的拆解规则（parseMissing）。
 *
 * 背景：业务侧产出的未填原因有两种形状——
 *   1) 「前缀：区块 / 字段」  例：必填项未填写：获奖信息-1 / 奖项名称
 *   2) 「前缀：字段」        例：请手动检查选择项：获奖类型、未能确认填写成功：奖项名称
 *   3) 「前缀：值」          例：请核对学历：本科（冒号后是值，不是字段名）
 *
 * 面板的标题必须是「字段名」。曾经这里把「前缀」当成标题，导致每一条都显示
 * 「请手动检查选择项 / 需手动选择」——用户完全看不出是哪个字段没填上。
 * 本测试锁死这个行为，避免再退化。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

// 允许用 OJT_PANEL_DIR 指向另一份 agent-dom.js（用于「旧代码必须失败」的负向验证）。
const DIR = process.env.OJT_PANEL_DIR || path.join(__dirname, '..', 'integrations', 'openjobtracker');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
const win = dom.window;

global.window = win;
global.document = win.document;
global.Node = win.Node;
global.getComputedStyle = win.getComputedStyle.bind(win);
global.matchMedia = () => ({ matches: false });
global.chrome = {
  runtime: {
    onMessage: { addListener() {}, removeListener() {} },
    sendMessage: () => Promise.resolve({ ok: true }),
  },
  storage: { local: { get: () => Promise.resolve({}) } },
};

// agent-dom.js 是 IIFE，需要这两个核心对象存在才会继续执行。
global.OJTFormCore = { labels: {} };
global.ApplicationAgent = {};
global.SemanticMapper = {};

const source = fs.readFileSync(path.join(DIR, 'agent-dom.js'), 'utf8');
win.eval(source);

const assets = global.__ojtPanelAssets;
assert.ok(assets, 'agent-dom.js 必须暴露 __ojtPanelAssets 只读钩子');
assert.equal(typeof assets.parseMissing, 'function', '__ojtPanelAssets 必须暴露 parseMissing 供测试校验');
const p = assets.parseMissing;

// 1) 「前缀：区块 / 字段」→ 标题＝字段名，副标题带区块
{
  const r = p('必填项未填写：获奖信息-1 / 奖项名称');
  assert.equal(r.title, '奖项名称', '标题必须是字段名，不能是前缀');
  assert.equal(r.section, '获奖信息-1');
  assert.match(r.sub, /获奖信息-1/, '存在区块时副标题应带上区块名');
  assert.match(r.sub, /必填项/, '副标题应保留简短原因');
  assert.equal(r.label, '奖项名称', 'label 用于点击定位，必须是字段名');
  assert.equal(r.plain, false);
}

// 2) 「前缀：字段」（无区块）→ 标题＝字段名，副标题＝简短原因【本次修复的核心场景】
{
  const r = p('请手动检查选择项：获奖类型');
  assert.equal(r.title, '获奖类型', '标题必须是字段名，不能是「请手动检查选择项」');
  assert.notEqual(r.sub, r.title, '标题与副标题不能重复同一句话');
  assert.match(r.sub, /勾选|手动/, '副标题应说明需要用户手动操作');
  assert.equal(r.label, '获奖类型');
}

{
  const r = p('未能确认填写成功：奖项名称');
  assert.equal(r.title, '奖项名称');
  assert.match(r.sub, /手动/, '副标题应提示需要手动确认');
}

// 3) 多条不同的未填原因必须产生不同的标题（防止又退化成清一色相同文案）
{
  const items = [
    '请手动检查选择项：获奖类型',
    '请手动检查选择项：无获奖信息',
    '未能确认填写成功：奖项名称',
    '必填项未填写：获奖信息-1 / 奖项说明',
  ].map(p);
  const titles = items.map((r) => r.title);
  assert.equal(new Set(titles).size, titles.length, '不同字段的未填原因必须显示不同的标题：' + titles.join(' | '));
}

// 4) 「前缀：值」→ 值不能冒充字段名，标题保留原因，值进副标题
{
  const r = p('请核对学历：本科');
  assert.equal(r.title, '请核对学历', '冒号后是值，不能拿它当标题');
  assert.match(r.sub, /本科/, '副标题必须带上需要核对的值');
}

// 5) 没有冒号的原因：整条原文当标题，不做拆解
{
  const r = p('页面结构已变化');
  assert.equal(r.plain, true);
  assert.equal(r.title, '页面结构已变化');
  assert.equal(r.sub, '');
}

// 6) 空值 / undefined 不能抛错
{
  for (const bad of ['', null, undefined, 0]) {
    const r = p(bad);
    assert.equal(typeof r.title, 'string');
  }
}

console.log('PASS: 未填原因拆解以字段名为标题，不同类型的未填项显示不同标题，值不会被误当作字段名');
