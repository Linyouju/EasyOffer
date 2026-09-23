(() => {
  const origin = 'https://autumn-career-desk-qpc.linyouju.chatgpt.site';
  if (location.origin !== origin || window.top !== window) return;
  let ready = false, sending = false;
  window.addEventListener('message',async e=>{if(e.source!==window||e.origin!==origin)return;if(e.data?.type==='EASY_V2_READY'){window.postMessage({type:'EASY_V2_HELLO'},origin);return;}if(e.data?.type!=='EASY_V2_DESK_REQUEST')return;try{const r=await chrome.runtime.sendMessage({type:'EASY_V2_DESK',command:e.data.command});window.postMessage({type:'EASY_V2_DESK_RESPONSE',requestId:e.data.requestId,...r},origin);}catch{window.postMessage({type:'EASY_V2_DESK_RESPONSE',requestId:e.data.requestId,ok:false,error:'插件连接中断'},origin);}});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.easyOfferRevision)window.postMessage({type:'EASY_V2_HELLO'},origin);});
  window.postMessage({type:'EASY_V2_HELLO'},origin);
  async function pull() {
    if (!ready || sending) return;
    sending = true;
    try {
      const result = await chrome.runtime.sendMessage({type:'OFFERLY_PULL'});
      window.postMessage({type:'OFFERLY_EXTENSION_RECORDS',records:result.records||[]},origin);
    } catch { window.postMessage({type:'OFFERLY_EXTENSION_ERROR'},origin); }
    finally { sending = false; }
  }
  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== origin) return;
    if(e.data?.type === 'OFFERLY_READY') { window.postMessage({type:'EASY_V2_HELLO'},origin); }
    if(e.data?.type === 'OFFERLY_SAVED' && Array.isArray(e.data.ids) && e.data.ids.length) chrome.runtime.sendMessage({type:'OFFERLY_ACK',ids:e.data.ids}).catch(()=>{});
  });
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.offerlyOutbox)pull();});
  window.postMessage({type:'OFFERLY_EXTENSION_HELLO'},origin);
})();
