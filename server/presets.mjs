import {activePromptEntries,cleanPreset} from '../src/domain/presets.ts';
const modelError=(status,code)=>Object.assign(new Error(code),{status,code});
export function applyPromptEntries(messages,entries,persona,charName,generationType='normal'){
  if(entries===undefined)return messages;
  if(!Array.isArray(entries))throw modelError(400,'INVALID_PRESET');
  let list;try{list=entries.map(cleanPreset);}catch{throw modelError(400,'INVALID_PRESET');}
  const expand=s=>s.replace(/\{\{user\}\}/gi,()=>persona.name).replace(/\{\{char\}\}/gi,()=>charName||'当前场景中的角色');
  const enabled=activePromptEntries(list,generationType);
  if(enabled.reduce((n,p)=>n+p.content.length,0)>300000)throw modelError(400,'PRESET_CONTEXT_TOO_LARGE');
  const message=p=>({role:p.role||'system',content:expand(p.content)});
  const before=enabled.filter(p=>!p.position||p.position==='before').map(message),after=enabled.filter(p=>p.position==='after').map(message);
  const chat=messages.slice(3),positions=new Map();
  enabled.filter(p=>p.position==='in-chat').forEach((p,index)=>{const at=Math.max(0,chat.length-(p.depth??4));const group=positions.get(at)||[];group.push({p,index});positions.set(at,group);});
  const rank={user:0,assistant:1,system:2};
  const history=[];for(let i=0;i<=chat.length;i++){const injected=positions.get(i)||[];injected.sort((a,b)=>rank[a.p.role||'system']-rank[b.p.role||'system']||(a.p.order??100)-(b.p.order??100)||a.index-b.index);history.push(...injected.map(x=>message(x.p)));if(i<chat.length)history.push(chat[i]);}
  return [...messages.slice(0,3),...before,...history,...after];
}
