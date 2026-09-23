/* A bounded observe -> plan -> execute -> verify controller. No submission action exists. */
(function(root){
 'use strict';
 const VERSION='5.0.3';
 const terminal=/提交|投递|申请|确认并|保存并|完成|支付|同意|submit|apply|finish|accept/i;
 function safeAction(action){
   const label=String(action?.label||'').trim();
   if(terminal.test(label))return false;
   if(['edit','expand'].includes(action?.kind))return /^(编辑|展开|编辑简历|编辑经历|展开详情|Edit|Expand)$/i.test(label);
   if(action?.kind==='next')return /^(下一步|下一页|继续填写|Next(?: step| page)?)$/i.test(label);
   if(action?.kind==='add')return /^(?:[+＋]\s*)?(?:添加|新增)(?:一段)?(?:教育经历|工作经历|实习经历|项目经历|校园经历|经历)?$/i.test(label)&&Boolean(action.section);
   return false;
 }
 class Runner{
   constructor(adapter){this.a=adapter;this.status='idle';this.stopped=false;this.paused=false;this.writes=[];this.steps=0;this.page=1;this.limit=80;this.generation=0;}
   emit(message,extra={}){this.a.report({status:this.status,message,page:this.page,filled:this.writes.filter(w=>w.verified!==false).length,...extra});}
   pause(){this.paused=true;this.status='paused';this.emit('已暂停，当前操作结束后不会继续填写');}
   resume(){this.paused=false;this.status='running';this.wake?.();}
   stop(){this.stopped=true;this.generation++;this.paused=false;this.wake?.();this.a.cancel?.();this.status='stopped';this.emit('已停止，已填内容保留');}
   async gate(){while(this.paused&&!this.stopped)await new Promise(resolve=>{this.wake=resolve;});if(this.stopped)throw Error('STOPPED');}
   async run(){
    if(!['idle','blocked'].includes(this.status))return;
    this.stopped=false;this.status='running';this.steps=0;const seen=new Set();
    try{
     while(this.steps++<this.limit){
      await this.gate();this.emit('正在分析当前页面');
      const snapshot=await this.a.observe();
      if(snapshot.blocker){this.status='blocked';this.emit(snapshot.blocker);return;}
      const planned=this.a.plan(snapshot);
      const batches=planned?.[Symbol.asyncIterator]?planned:(async function*(){yield await planned;})();
      const plan={fields:[]};
      for await(const batch of batches){
      await this.gate();plan.fields.push(...batch.fields);
      for(const item of batch.fields){
       await this.gate();
       if(!await this.a.valid(item,snapshot))continue;
       this.emit('正在填写：'+item.label);
       const before=await this.a.read(item);
       if(before&&!await this.a.canReplace?.(item,before))continue;
       const applied=await this.a.write(item);
       // Keep undo information even when the framework rejects the displayed result.
       const after=await this.a.read(item);
       const entry={item,before,after,verified:false};
       if(after!==before)this.writes.push(entry);
       await this.gate();
       entry.verified=Boolean(applied&&await this.a.verify(item));
       if(!entry.verified){item.failed=true;if(after!==before&&await this.a.read(item)===after&&this.a.restore)await this.a.restore(entry);}
      }
      }
      await this.gate();this.emit('正在检查填写结果');
      const result=await this.a.check(snapshot,plan);
      if(result.rescan)continue;
      if(result.missing?.length&&result.action?.kind!=='add'){this.status='blocked';this.emit('有内容需要你补充，填写后点「继续」',{missing:result.missing});return;}
      const action=result.action;
      if(!action){this.status='done';this.emit('本页检查完成，请核对内容；最终提交由你操作');return;}
      if(!safeAction(action)){this.status='done';this.emit('已停在提交或保存前，请你核对后操作');return;}
      const key=snapshot.signature+'|'+action.key;
      if(seen.has(key)){this.status='blocked';this.emit('页面没有按预期变化，已停止重复操作');return;}
      seen.add(key);await this.gate();
      if(action.kind==='next'&&this.page>=15){this.status='blocked';this.emit('已达到本次页数上限，请检查后重新开始');return;}
      await this.a.checkpoint?.(action,this.page);
      await this.gate();this.emit(action.kind==='add'?'正在添加下一段经历':'正在进入下一页');
      if(!await this.a.act(action,snapshot)){this.status='blocked';this.emit('该控件未能完成操作，请手动处理后继续');return;}
      if(action.kind==='next')this.page++;
     }
     this.status='blocked';this.emit('已达到操作上限，请检查页面');
    }catch(error){if(!this.stopped){this.status='blocked';this.emit(error.message||'处理未完成，请检查后重试');}}
    finally{if(['done','blocked','stopped'].includes(this.status))await this.a.clearCheckpoint?.();}
   }
   async undo(){this.stop();let undone=0;for(const entry of [...this.writes].reverse()){if(await this.a.read(entry.item)===entry.after){await this.a.restore(entry);undone++;}}this.writes=[];this.emit(`已撤销本页 ${undone} 项填写；新增区块保留`);}
 }
 const api={Runner,safeAction,VERSION};root.ApplicationAgent=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
