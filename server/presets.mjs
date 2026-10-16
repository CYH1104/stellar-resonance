import {activePromptEntries,cleanPreset} from '../src/domain/presets.ts';
import {personaDescription} from './participants.mjs';
const modelError=(status,code)=>Object.assign(new Error(code),{status,code});
export function applyPromptEntries(messages,entries,persona,charName,generationType='normal'){
  if(entries===undefined)return messages;
  if(!Array.isArray(entries))throw modelError(400,'INVALID_PRESET');
  let list;try{list=entries.map(cleanPreset);}catch{throw modelError(400,'INVALID_PRESET');}
  const names={user:persona.name,char:charName||'群星共振世界卡',persona:personaDescription(persona),charifnotgroup:charName||'群星共振世界卡'};
  // Single pass: text inside a persona or name is data, never a second macro program.
  let expandedChars=0;
  const expand=s=>{expandedChars+=s.length;if(expandedChars>300000)throw modelError(400,'PRESET_CONTEXT_TOO_LARGE');return s.replace(/\{\{(user|char|persona|charIfNotGroup)\}\}|<(USER|BOT|CHAR)>/gi,(token,macro,legacy)=>{const value=names[(macro||(legacy.toLowerCase()==='user'?'user':'char')).toLowerCase()];expandedChars+=value.length-token.length;if(expandedChars>300000)throw modelError(400,'PRESET_CONTEXT_TOO_LARGE');return value;});};
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
