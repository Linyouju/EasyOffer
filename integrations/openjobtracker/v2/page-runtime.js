(() => {
  'use strict';
  if (globalThis.__easyV2Page) return;
  globalThis.__easyV2Page = true;
  let busy = false, last = '', timer, retryTimer, retries = 0, enabled = false, lastUrl = location.href;
  const rpc = async message => {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw Error(response?.error || '请求失败');
    return response.result;
  };
  async function sync(force = false) {
    if (force) await rpc({type:'EASY_V2_TRACK_ORIGIN'});
    if (busy) return {busy:true};
    const page = PageObserver.observe();
    if (!force && page.fingerprint === last) return {unchanged:true};
    busy = true;
    const remember=(status,error='')=>rpc({type:'EASY_V2_SYNC_TASK',task:{status,fingerprint:page.fingerprint,error}});
    try {
      await remember('pending');
      page.taskId = crypto.randomUUID();
      let plan = await rpc({type:'EASY_V2_PLAN', purpose:'application', page});
      plan = await SemanticPlanner.continueTools(plan,page,{
        observer:PageObserver,
        request:(nextPage,toolResults)=>rpc({type:'EASY_V2_PLAN',purpose:'application',page:nextPage,toolResults})
      });
      if(location.href!==page.url)throw Error('页面已切换，等待在新页面重新检查');
      if (!plan.observations.length && plan.diagnostics?.length) throw Error('发现投递信息，但尚未核实：'+plan.diagnostics.map(d=>d.message||d.code).join('；'));
      if (!plan.observations.length) { const excluded=plan.excluded||[];await remember(excluded.length?'complete':'no-records');last = page.fingerprint;return {noRecords:!excluded.length,excluded}; }
      const result = await rpc({type:'EASY_V2_APPLY_OBSERVATIONS', observations:plan.observations});
      const incomplete=Boolean(plan.diagnostics?.length||result.results?.some(r=>r.pending));
      result.unresolved=plan.diagnostics||[];
      result.excluded=[...(plan.excluded||[]),...(result.excluded||[])];
      await remember(incomplete?'pending':'complete',incomplete?'部分记录尚未核实':'');retries=0;clearTimeout(retryTimer);
      last = incomplete?'':page.fingerprint;
      return result;
    } catch(error) {
      await remember('pending',error.message).catch(()=>{});
      if(enabled&&retries++<2){clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(enabled&&document.visibilityState==='visible')sync().catch(()=>{});},30000*retries);}
      throw error;
    } finally { busy = false; }
  }
  chrome.runtime.onMessage.addListener((message,sender,respond) => {
    if (message.type === 'EASY_V2_SYNC_PAGE') {
      sync(true).then(result=>respond({ok:true,result})).catch(e=>respond({ok:false,error:e.message}));
      return true;
    }
    if (message.type === 'EASY_V2_OBSERVE') respond({ok:true,result:PageObserver.observe()});
  });
  function schedule() {
    clearTimeout(timer);
    if (enabled) timer = setTimeout(() => {
      if (document.visibilityState === 'visible') sync().catch(() => {});
    }, 1200);
  }
  new MutationObserver(changes => {
    if (changes.some(c=>!c.target.parentElement?.closest('#ojt-application-agent,[data-easyoffer-ui]'))) schedule();
  }).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-current','data-state','data-status']});
  window.addEventListener('popstate',schedule);
  window.addEventListener('hashchange',schedule);
  // Isolated-world history wrappers do not see main-world pushState calls.
  setInterval(() => { if(location.href!==lastUrl) {lastUrl=location.href;last='';schedule();} }, 1500);
  chrome.storage.onChanged.addListener((changes,area) => {
    if (area==='local' && changes.easyOfferV2) {
      const config=changes.easyOfferV2.newValue;
      if(config?.excludeInternships!==changes.easyOfferV2.oldValue?.excludeInternships)last='';
      enabled=Boolean(config?.autoSync && config.autoSyncSites?.includes(location.origin));
      schedule();
    }
  });
  rpc({type:'EASY_V2_CONFIG'}).then(c=>{enabled=c.autoSync;schedule();}).catch(()=>{});
  globalThis.EasyOfferPage={sync};
})();
