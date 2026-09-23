// Legacy regression fixture dependency. Not loaded by index.html or shipped in the extension runtime.
'use strict';
function mergeExtensionRecords(current, records) {
  let next=current.map(j=>({...j})); const accepted=[]; let changed=0, skipped=0;
  const norm=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,'');
  const companyNorm=typeof companyKey==='function'?companyKey:norm;
  const mapping={'已投递':'已投递','投递成功':'已投递','简历筛选':'已投递','已申请':'已投递','笔试':'笔试','笔试中':'笔试','待笔试':'笔试','面试':'面试中','面试中':'面试中','待面试':'面试中','offer':'Offer','已录用':'Offer','已拒绝':'未通过','未通过':'未通过','不合适':'未通过'};
  for(const r of records){
    if(r?.url&&safeURL(r.url)&&new URL(r.url).hostname==='autumn-career-desk-qpc.linyouju.chatgpt.site'){accepted.push(r.id);continue;}
    if(!r||typeof r.id!=='string'||!r.company||!r.position){skipped++;continue;}
    if(/^(hi|hello|hey|岗位详情|职位详情|你好|您好)[!！\s]*$/i.test(r.position)||/^(岗位详情|职位详情|校园招聘)$/.test(r.company)){skipped++;continue;}
    if(next.some(j=>j.extensionReceipt===r.id)){accepted.push(r.id);continue;}
    const candidates=next.filter(j=>!j.demo&&j.kind!=='company'&&companyNorm(j.company)===companyNorm(r.company)&&norm(j.role)===norm(r.position));
    const exact=candidates.filter(j=>norm(j.location)===norm(r.city));
    let old=exact.length===1?exact[0]:candidates.length===1&&(!candidates[0].location||!r.city)?candidates[0]:null;
    if(!old&&candidates.length&&(!r.city||candidates.some(j=>!j.location))){skipped++;continue;}
    const plan=next.find(j=>!j.demo&&j.kind==='company'&&companyNorm(j.company)===companyNorm(r.company));
    const mapped=mapping[String(r.status||'').trim().toLowerCase()];
    const base=old||plan||{};
    let status=old?.status||mapped||'计划投递';
    if(old&&mapped&&old.status!=='Offer'&&old.status!=='未通过'&&(mapped==='未通过'||stageOf({status:mapped})>=stageOf(old)))status=mapped;
    const data={...base,kind:'job',company:old?.company||String(r.company),role:old?.role||String(r.position),status,location:base.location||r.city||'',channel:base.channel||(/zhipin|boss/i.test(r.source+' '+r.url)?'BOSS 直聘':'其他'),url:r.sourceType==='detail'?(r.url||base.url||''):(base.url||r.url||''),notes:base.notes||'',demo:false};
    for(const field of ['summary','salary','deadline','interview','interviewNote'])if(!base[field]&&r[field])data[field]=String(r[field]);
    if(r.channel&&(!base.channel||base.channel==='其他'))data.channel=r.channel;
    if(r.department&&!base.category)data.category=String(r.department);
    if(!old&&!mapped)data.notes+=(data.notes?'\n':'')+'插件采集：投递阶段待核对'+(r.status?'（原状态：'+r.status+'）':'');
    try{
      const record={...validateRecord(data),extensionReceipt:r.id};
      if(old||plan)next=next.map(j=>j.id===base.id?record:j);else next.push(record);
      accepted.push(r.id);changed++;
    }catch{skipped++;}
  }
  return {next,accepted,changed,skipped};
}
if(typeof window!=='undefined'&&window.location?.origin==='https://autumn-career-desk-qpc.linyouju.chatgpt.site'){
  const origin=window.location.origin;
  const ready=()=>window.postMessage({type:'OFFERLY_READY'},origin);
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==origin)return;
    if(event.data?.type==='OFFERLY_EXTENSION_HELLO'){ready();return;}
    if(event.data?.type==='OFFERLY_EXTENSION_ERROR'){$('#extension-status').textContent='插件连接中断，请刷新页面';return;}
    if(event.data?.type!=='OFFERLY_EXTENSION_RECORDS'||!Array.isArray(event.data.records))return;
    try{
      const stored=localStorage.getItem(KEY);const current=stored?JSON.parse(stored).map(validateRecord):jobs;
      const result=mergeExtensionRecords(current,event.data.records);
      if(result.changed&&!persist(result.next))return;
      if(result.changed)render();
      $('#extension-status').textContent=result.skipped?`插件已连接 · ${result.skipped} 条待核对，下次打开重试`:'插件已连接 · 自动接收岗位';
      if(result.changed)toast(`已接收 ${result.changed} 条插件岗位记录`);
      window.postMessage({type:'OFFERLY_SAVED',ids:result.accepted},origin);
    }catch{$('#extension-status').textContent='接收失败，记录仍保留在插件中';}
  });
  ready();
}
