const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const DIR=path.join(__dirname,'..','integrations','openjobtracker');
const read=f=>fs.readFileSync(path.join(DIR,f),'utf8');

// 版本号分散在多个文件里；升级时必须一起改，否则 popup 会一直认为内容脚本过期。
const manifest=JSON.parse(read('manifest.json')).version;
const content=read('content.js').match(/OJT_VERSION'\)\{sendResponse\(\{version:'([^']+)'\}/);
const agent=read('application-agent.js').match(/const VERSION='([^']+)'/);
const dom=read('agent-dom.js').match(/__ojtAgentVersion='([^']+)'/);
assert.ok(content,'content.js 必须上报版本号');
assert.ok(agent,'application-agent.js 必须有 VERSION');
assert.ok(dom,'agent-dom.js 必须标记注入版本');
assert.equal(content[1],manifest,`content.js 版本 ${content[1]} 与 manifest ${manifest} 不一致`);
assert.equal(agent[1],manifest,`application-agent.js 版本 ${agent[1]} 与 manifest ${manifest} 不一致`);
assert.equal(dom[1],manifest,`agent-dom.js 版本 ${dom[1]} 与 manifest ${manifest} 不一致`);

// popup 的过期检测必须以 manifest 为基准，不能写死版本号。
const popup=read('popup.js');
assert(/version\?\.version!==chrome\.runtime\.getManifest\(\)\.version/.test(popup),'popup.js 的版本校验必须读取 manifest 版本');
assert(!/version\?\.version!=='[\d.]+'/.test(popup),'popup.js 不应写死版本号');

console.log('PASS: manifest/content/agent-dom 版本一致，popup 以 manifest 版本判定内容脚本是否过期');
