import {activePromptEntries,cleanPreset} from '../src/domain/presets.ts';
import {personaDescription} from './participants.mjs';
import {expandTavernMacros} from './tavern-macros.mjs';
const modelError=(status,code)=>Object.assign(new Error(code),{status,code});
export function applyPromptEntries(messages,entries,persona,charName,generationType='normal'){
  if(entries===undefined)return messages;
  if(!Array.isArray(entries))throw modelError(400,'INVALID_PRESET');
  let list;try{list=entries.map(cleanPreset);}catch{throw modelError(400,'INVALID_PRESET');}
  const names={user:persona.name,char:charName||'群星共振世界卡',persona:personaDescription(persona),charifnotgroup:charName||'群星共振世界卡'};
  // Single pass: text inside a persona or name is data, never a second macro program.
  let enabled;try{enabled=expandTavernMacros(activePromptEntries(list,generationType).map(p=>({...p,content:p.content.replace(/<(USER|BOT|CHAR)>/gi,(_,name)=>name.toLowerCase()==='user'?'{{user}}':'{{char}}')})),{input:messages.findLast(m=>m.role==='user')?.content||'',history:messages,user:persona.name,char:names.char,persona:names.persona,group:names.char});}catch{throw modelError(400,'PRESET_CONTEXT_TOO_LARGE');}
  if(enabled.reduce((n,p)=>n+p.content.length,0)>300000)throw modelError(400,'PRESET_CONTEXT_TOO_LARGE');
  const message=p=>({role:p.role||'system',content:p.content});
  const before=enabled.filter(p=>!p.position||p.position==='before').map(message),after=enabled.filter(p=>p.position==='after').map(message);
  const chat=messages.slice(3),positions=new Map();
  enabled.filter(p=>p.position==='in-chat').forEach((p,index)=>{const at=Math.max(0,chat.length-(p.depth??4));const group=positions.get(at)||[];group.push({p,index});positions.set(at,group);});
  // SillyTavern populationInjectionPrompts builds descending priority groups,
  // then reverses the message list: final order is priority ascending,
  // assistant / user / system within each priority group.
  const rank={assistant:0,user:1,system:2};
  const history=[];for(let i=0;i<=chat.length;i++){const injected=positions.get(i)||[];injected.sort((a,b)=>(a.p.order??100)-(b.p.order??100)||rank[a.p.role||'system']-rank[b.p.role||'system']||a.index-b.index);history.push(...injected.map(x=>message(x.p)));if(i<chat.length)history.push(chat[i]);}
  return [...messages.slice(0,3),...before,...history,...after];
}
