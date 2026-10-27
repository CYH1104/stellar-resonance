import {copy} from '../domain/story';
import type {Preferences,Profile} from '../domain/contracts';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export const configurationConflict='设置已在其他操作中改变，请取消后重新编辑';

function mergeProfiles(current:Profile[],origin:Profile[]|undefined,draft:Profile[]|undefined):Profile[]{
  if(!draft)return copy(current);
  const byId=(rows:Profile[]|undefined)=>new Map((rows||[]).map(p=>[p.id,p]));
  const live=byId(current),before=byId(origin),next=byId(draft),result:Profile[]=[];
  for(const p of draft){
    const was=before.get(p.id),now=live.get(p.id);
    if(was===undefined){if(now&&!same(now,p))throw Error(configurationConflict);result.push(copy(p));continue;}
    // Deleted live while the draft still lists it: keep the deletion, unless the draft edited it meanwhile.
    if(now===undefined){if(same(was,p))continue;throw Error(configurationConflict);}
    // Untouched by the draft: keep whatever is live so a concurrent edit to another interface survives.
    if(same(was,p)){result.push(copy(now));continue;}
    if(!same(now,was)&&!same(now,p))throw Error(configurationConflict);
    result.push(copy(p));
  }
  for(const p of current){
    if(next.has(p.id))continue;
    const was=before.get(p.id);
    // Added live and never part of the draft baseline: an unrelated new interface, so it survives this save.
    if(was===undefined){result.push(copy(p));continue;}
    if(!same(was,p))throw Error(configurationConflict);
    // Removed by the draft and untouched live: the deletion must win instead of coming back on the next save.
  }
  return result;
}
/** Three-way merge so a save writes only what the draft changed and refuses to clobber anything edited meanwhile. */
export function mergeConfiguration(current:Preferences,origin:Preferences,draft:Preferences):Preferences{
  const result=copy(current) as unknown as Record<string,unknown>;
  const old=origin as unknown as Record<string,unknown>,next=draft as unknown as Record<string,unknown>,now=current as unknown as Record<string,unknown>;
  for(const key of new Set([...Object.keys(old),...Object.keys(next)])){
    if(key==='profiles')continue;
    if(same(old[key],next[key]))continue;
    if(!same(now[key],old[key])&&!same(now[key],next[key]))throw Error(configurationConflict);
    if(next[key]===undefined)delete result[key];else result[key]=copy(next[key]);
  }
  result.profiles=mergeProfiles((now.profiles||[]) as Profile[],(old.profiles||undefined) as Profile[]|undefined,(next.profiles||undefined) as Profile[]|undefined);
  return result as unknown as Preferences;
}
export function mergeCredentials(current:Record<string,string>,origin:Record<string,string>,draft:Record<string,string>):Record<string,string>{
  const result:Record<string,string>={...current};
  for(const id of new Set([...Object.keys(origin),...Object.keys(draft)])){
    if(origin[id]===draft[id])continue;
    if(current[id]!==origin[id]&&current[id]!==draft[id])throw Error(configurationConflict);
    if(draft[id]===undefined)delete result[id];else result[id]=draft[id];
  }
  return result;
}
