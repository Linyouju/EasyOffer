/* Durable outbox. Serialize writes so concurrent popup actions cannot lose records. */
let deskTask = Promise.resolve();
function deskSerial(fn) { const task = deskTask.then(fn); deskTask = task.catch(() => {}); return task; }
async function queueDesk(records) {
  return deskSerial(async () => {
    const list = Array.isArray(records) ? records : [records];
    await assertWritableJobs(list);
    if (list.some(r => {try{return new URL(r.url).hostname === 'autumn-career-desk-qpc.linyouju.chatgpt.site';}catch{return false;}})) throw Error('请在招聘网站采集，工作台页面不能作为岗位来源');
    if (list.some(r => !String(r.company || '').trim())) throw Error('缺少公司名称，未保存');
    const { offerlyOutbox = [] } = await chrome.storage.local.get('offerlyOutbox');
    const next = [...offerlyOutbox];
    for (const r of list) {
      const item = { id: crypto.randomUUID(), company: String(r.company).trim().slice(0,120), position: String(r.position).trim().slice(0,160), city: String(r.city || '').slice(0,200), status: String(r.status || '').slice(0,80), source: String(r.source || '').slice(0,200), url: String(r.url || '').slice(0,2000), department:String(r.department||"").slice(0,120), summary:String(r.summary||'').slice(0,10000), salary:String(r.salary||'').slice(0,200), deadline:String(r.deadline||''), interview:String(r.interview||''), interviewNote:String(r.interviewNote||'').slice(0,200), channel:String(r.channel||''), sourceType:r.sourceType==='detail'?'detail':'progress', capturedAt: Date.now() };
      const key = x => (x.company+'\0'+x.position+'\0'+x.city).normalize('NFKC').toLowerCase();
      const index = next.findIndex(x => key(x) === key(item));
      if(index < 0) next.push(item); else {
        const rank = s => ({'已投递':1,'投递成功':1,'简历筛选':1,'已申请':1,'笔试':2,'笔试中':2,'待笔试':2,'面试':3,'面试中':3,'待面试':3,'offer':4,'已录用':4,'已拒绝':5,'未通过':5,'不合适':5}[String(s).toLowerCase()]||0);
        if(rank(item.status)<rank(next[index].status))item.status=next[index].status;
        for(const field of ['summary','salary','deadline','interview','interviewNote','channel'])if(!item[field])item[field]=next[index][field]||'';
        next[index] = item;
      }
    }
    await chrome.storage.local.set({offerlyOutbox:next});
    return list.length;
  });
}
const deskOrigin = 'https://autumn-career-desk-qpc.linyouju.chatgpt.site';
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!['OFFERLY_PULL','OFFERLY_ACK'].includes(message?.type)) return;
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0 || new URL(sender.url).origin !== deskOrigin) return;
  const task = message.type === 'OFFERLY_PULL' ? chrome.storage.local.get('offerlyOutbox').then(x=>({records:x.offerlyOutbox||[]})) : deskSerial(async()=>{
    const ids = new Set(Array.isArray(message.ids)?message.ids.filter(x=>typeof x==='string'):[]);
    const {offerlyOutbox=[]}=await chrome.storage.local.get('offerlyOutbox');
    await chrome.storage.local.set({offerlyOutbox:offerlyOutbox.filter(x=>!ids.has(x.id))});
    return {ok:true};
  });
  task.then(respond).catch(e=>respond({error:e.message})); return true;
});
