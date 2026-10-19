import type {ActorState} from './contracts';
import {validAffinity} from './affinity.ts';
/** IDs win; name fallback is allowed only when it identifies exactly one actor. */
export function resolveActorId(actors:Iterable<{id:string;name?:string}>,value:unknown):string|undefined{
 const rows=[...actors],object=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
 const id=typeof value==='string'?value:object?.id;
 if(typeof id==='string'&&rows.some(a=>a.id===id))return id;
 const name=typeof value==='string'?value:typeof object?.name==='string'?object.name:id;
 if(typeof name!=='string')return;
 const normalized=name.normalize('NFKC').replace(/\s+/gu,'');if(!normalized)return;
 const matches=rows.filter(a=>a.name?.normalize('NFKC').replace(/\s+/gu,'')===normalized);
 return matches.length===1?matches[0].id:undefined;
}
export const validActorId=(id:unknown):id is string=>typeof id==='string'&&id.length<=128&&/^[\p{L}\p{N}_.:-]+$/u.test(id)&&!['player','__proto__','prototype','constructor'].includes(id);
/** New NPCs require an explicit identity; no story text or JavaScript is evaluated. */
export function newDynamicActor(value:unknown):ActorState{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('新角色格式不正确');
 const v=value as Record<string,unknown>;
 if(!validActorId(v.id)||typeof v.name!=='string'||!v.name.trim()||v.name.length>80)throw Error('新角色需要有效 ID 和姓名');
 const actor:ActorState={id:v.id,name:v.name,present:false,affinity:0};
 const limits:Record<string,number>={name:80,ability:2000,mentalPowerLevel:100,identity:200,primaryGender:100,secondaryGender:100,relationship:200,innerThought:2000,spiritAnimal:1500,spiritThought:2000};
 for(const [k,x]of Object.entries(v)){
  if(k==='id')continue;
  if(k==='present'){if(typeof x!=='boolean')throw Error('角色在场格式不正确');actor.present=x;}
  else if(k==='affinity'){if(!validAffinity(x))throw Error('NPC 好感度必须在 -100 到 200 之间');actor.affinity=x;}
  else if(k==='energy'||k==='focus'){if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>100)throw Error('旧版角色数值不正确');Object.assign(actor,{[k]:x});}
  else if(limits[k]){if(typeof x!=='string'||x.length>limits[k])throw Error('角色字段格式不正确');Object.assign(actor,{[k]:x});}
  else throw Error('角色包含不支持的字段');
 }
 return actor;
}
