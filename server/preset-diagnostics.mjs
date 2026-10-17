import {AsyncLocalStorage} from 'node:async_hooks';
const scope=new AsyncLocalStorage();
export function tracePresets(fn){const entries=[];return scope.run(entries,()=>({result:fn(),entries}));}
export function recordFilteredPreset(p){const sink=scope.getStore();if(!sink)return;sink.push({id:String(p.id||''),name:String(p.name||'').slice(0,200),identifier:String(p.identifier||p.id||''),enabled:false,reason:'separate-state-rule-filter',role:['user','assistant'].includes(p.role)?p.role:'system',position:p.position||'before',depth:p.depth??4,order:p.order??100,characters:0,expanded:'',truncated:false});}
export function recordPresetDiagnostics(list,expanded,generationType){
 const sink=scope.getStore();if(!sink)return;let budget=80000;
 for(const p of list){const applied=expanded.find(e=>e.id===p.id);const reason=p.included===false?'not-in-order':!p.enabled?'disabled':p.group?.enabled===false?'group-disabled':p.marker?'server-placeholder':!p.content.trim()?'empty':p.triggers?.length&&!p.triggers.includes(generationType)?'trigger-mismatch':applied?'included':'filtered';const content=applied?.content||'',limit=Math.min(16000,budget);budget-=Math.min(limit,content.length);
  sink.push({id:p.id,name:p.name,identifier:p.identifier||p.id,enabled:!!applied,reason,role:p.role||'system',position:p.position||'before',depth:p.depth??4,order:p.order??100,characters:content.length,expanded:content.slice(0,limit),truncated:content.length>limit});
 }
}
