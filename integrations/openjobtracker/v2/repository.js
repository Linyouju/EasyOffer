(function(root){'use strict';
class Repository{
 constructor(name='easyoffer-v2'){this.name=name;}
 async open(){if(this.db)return this.db;this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open(this.name,1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return this.db;}
 async transact(reducer){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),read=store.get('authority');let result;read.onsuccess=()=>{try{const state=read.result||ApplicationCore.empty();result=reducer(state);if(result?.then)throw Error('Repository reducers must be synchronous');store.put(state,'authority');}catch(e){tx.abort();reject(e);}};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Transaction aborted'));});}
 snapshot(){return this.transact(s=>structuredClone(s));}
 observe(o){return this.transact(s=>ApplicationCore.observe(s,o).result);}
 command(c){return this.transact(s=>ApplicationCore.command(s,c).result);}
 migrate(records,op){return this.transact(s=>{ApplicationCore.migrate(s,records,op);return {revision:s.revision};});}
 ack(channel,rows){return this.transact(s=>{for(const r of rows){const a=s.applications.find(a=>a.id===r.applicationId);if(a&&r.revision<=a.revision)s.deliveries[channel][r.applicationId]=Math.max(s.deliveries[channel][r.applicationId]||0,r.revision);}return true;});}
 session(key,update){return this.transact(s=>{const current=s.sessions[key];if(update)s.sessions[key]=update(current);return structuredClone(s.sessions[key]);});}
}
root.EasyOfferRepository=Repository;if(typeof module!=='undefined')module.exports=Repository;
})(globalThis);
