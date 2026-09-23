/* Extract only visible, labelled recruiting information; never infer application progress. */
(() => {
 const text=(document.body?.innerText||'').replace(/\r/g,'');
 const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
 const clean=s=>String(s||'').trim();
 const labelled=labels=>{for(let i=0;i<lines.length;i++){for(const label of labels){const m=lines[i].match(new RegExp('^'+label+'\\s*[:：]\\s*(.+)$'));if(m)return m[1];if(lines[i]===label&&lines[i+1])return lines[i+1];}}return '';};
 const date=value=>{const m=String(value).match(/(20\d{2})[年.\/-](\d{1,2})[月.\/-](\d{1,2})/);if(!m)return '';const out=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');const parsed=new Date(out+'T00:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===out?out:'';};
 const meeting=labelled(['面试时间','面试日期']);const day=date(meeting);const hour=meeting.match(/(\d{1,2}):(\d{2})/);
 const fields={salary:labelled(['薪资范围','薪资待遇','职位薪资','薪资']),city:labelled(['工作地点','工作城市','职位地点','工作地']),deadline:date(labelled(['报名截止日期','报名截止','投递截止','截止日期','招聘截止时间'])),interview:day&&hour?day+'T'+hour[1].padStart(2,'0')+':'+hour[2]:'',interviewNote:labelled(['面试地点','面试方式','面试安排','参加面试的城市']),channel:location.hostname==='join.qq.com'||/(^|\.)oppo\.com$/.test(location.hostname)?'官网':/(^|\.)zhipin\.com$/.test(location.hostname)?'BOSS 直聘':''};
 const start=lines.findIndex(s=>/^(岗位描述|职位描述|工作职责|岗位职责|职位职责)[:：]?$/.test(s));
 if(start<0)return {fields};
 let end=lines.findIndex((s,i)=>i>start&&/^(投递简历|立即投递|立即申请|投递岗位|申请职位|推荐职位|相关职位|相关岗位推荐|关注腾讯招聘|公司介绍|关于我们|分享职位|收藏职位)$/.test(s));if(end<0)end=lines.length;
 const summary=lines.slice(start,end).join('\n').slice(0,10000);
 let company=location.hostname==='join.qq.com'?'腾讯':/(^|\.)oppo\.com$/.test(location.hostname)?'OPPO':/(^|\.)lenovo\.com\.cn$/.test(location.hostname)?'联想':labelled(['公司名称','招聘公司']);
 const headings=[...document.querySelectorAll('h1,h2,[class*="job-name"],[class*="jobName"],[class*="post-title"],[class*="postTitle"]')].map(e=>clean(e.innerText));
 const valid=s=>s.length>=3&&s.length<=80&&/(设计|工程师|经理|运营|开发|分析|研究|产品|专员)/.test(s)&&!/(岗位描述|岗位要求|职位描述|工作职责|任职要求|校园招聘|岗位投递|招聘动态|求职攻略|请输入)/.test(s);
 const stripStatus=s=>s.replace(/\s*(已投递|立即投递|投递简历|收藏|分享)\s*$/g,'').trim();
 const candidates=lines.slice(0,start).map(stripStatus);
 const position=candidates.find(s=>valid(s)&&!/(招聘|发布|应届生|保密信息)/.test(s))||headings.map(stripStatus).find(valid);
 const city=lines.slice(0,start).find(s=>/^(北京|上海|深圳|广州|杭州|南京|成都|东莞|重庆|武汉)(市)?$/.test(s));if(city)fields.city=city;
 fields.department=labelled(['所属部门','部门']);
 if(company)fields.channel='官网';
 // Only recruiting content is sent for detail-page AI extraction, excluding the account header.
 const evidence={pageKind:'detail',pageCompany:company,host:location.hostname,url:location.href,pageVisibleText:[position,company,fields.city,fields.department,summary].filter(Boolean).join('\n')};
 if(!company||!position||summary.length<20)return {fields,evidence};
 return {fields,evidence,record:{...fields,company,position,summary,status:'状态未知',source:location.hostname,url:location.href,sourceType:'detail'}};
})();
