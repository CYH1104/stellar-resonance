import type {Preset,PresetPromptGroup} from './contracts';
import {presetGroupCatalog} from './presetGroupCatalog.ts';
export function cleanPromptGroup(value:unknown):PresetPromptGroup|null{
 if(value===null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('提示词分组格式不正确');
 const g=value as Record<string,unknown>;
 if(Object.keys(g).some(k=>!['id','name','order','collapsed','enabled'].includes(k))||typeof g.id!=='string'||!g.id.trim()||g.id.length>200||g.id==='__ungrouped'||typeof g.name!=='string'||!g.name.trim()||g.name.length>200||!Number.isInteger(g.order)||(g.order as number)<0||(g.order as number)>10000||typeof g.collapsed!=='boolean'||typeof g.enabled!=='boolean')throw Error('提示词分组格式不正确');
 return {id:g.id,name:g.name,order:g.order as number,collapsed:g.collapsed,enabled:g.enabled};
}
/** Read only the known, declarative folder format. No extension code is imported. */
export function importPromptGroups(value:unknown):Map<string,PresetPromptGroup|null>{
 const result=new Map<string,PresetPromptGroup|null>();const v=value as any;
 if(!v||v.version!==1||!Array.isArray(v.groups)||v.groups.length>1000||!v.prompts||typeof v.prompts!=='object'||Array.isArray(v.prompts))return result;
 const groups=new Map<string,PresetPromptGroup>();
 for(const [i,raw] of v.groups.entries())try{const g=cleanPromptGroup({id:raw?.id,name:raw?.name,order:raw?.order??i,collapsed:raw?.collapsed??true,enabled:raw?.enabled??true});if(g&&!groups.has(g.id))groups.set(g.id,g);}catch{}
 for(const [id,raw] of Object.entries(v.prompts)){const groupId=(raw as any)?.groupId;if(groupId==='__ungrouped')result.set(id,null);else if(typeof groupId==='string'&&groups.has(groupId))result.set(id,{...groups.get(groupId)!});}
 return result;
}
/** Restore metadata lost by older imports using exact identifiers; never infer from prompt text. */
export function restoreKnownPromptGroups(entries:Preset[]):Preset[]{
 const sets=new Map<string,Preset[]>();for(const p of entries){const id=p.setId||'legacy';const list=sets.get(id)||[];list.push(p);sets.set(id,list);}
 for(const list of sets.values()){
  if(list.some(p=>p.group!==undefined))continue;
  const ids=new Set(list.map(p=>p.identifier||p.id));const match=presetGroupCatalog.find(c=>c.anchors.every(id=>ids.has(id)));if(!match)continue;
  const groups=new Map(match.groups.map(g=>[g.id,g]));
  for(const p of list){const groupId=(match.prompts as Record<string,string>)[p.identifier||p.id];p.group=groupId&&groups.has(groupId)?{...groups.get(groupId)!}:null;}
 }
 return entries;
}
export function promptFolders(entries:Preset[]){
 const folders=new Map<string,{id:string;name:string;order:number;collapsed:boolean;enabled:boolean;entries:Preset[]}>();
 for(const p of entries){const g=p.group,id=g?.id||'__ungrouped';let folder=folders.get(id);if(!folder){folder={id,name:g?.name||'未分组',order:g?.order??10001,collapsed:g?.collapsed??false,enabled:g?.enabled??true,entries:[]};folders.set(id,folder);}folder.entries.push(p);}
 // Follow the first child in the original prompt order; imported folder order can be stale.
 return [...folders.values()].filter(g=>g.id!=='__ungrouped').concat(folders.has('__ungrouped')?[folders.get('__ungrouped')!]:[]);
}
export function exportPromptGroups(entries:Preset[]){
 if(!entries.some(p=>p.group!==undefined))return;
 const groups=new Map<string,PresetPromptGroup>();const prompts:Record<string,{groupId:string}>=Object.create(null);
 for(const p of entries){if(p.group)groups.set(p.group.id,{...p.group});prompts[p.identifier||p.id]={groupId:p.group?.id||'__ungrouped'};}
 return {version:1,groups:[...groups.values()].sort((a,b)=>a.order-b.order),prompts};
}
/** Preserve file order even when a folder's children are interleaved with others. */
export function orderedPromptFolders(entries:Preset[]){
 const sections:ReturnType<typeof promptFolders>=[];
 for(const p of entries){
  const id=p.group?.id||'__ungrouped',last=sections.at(-1);
  if(last?.id===id)last.entries.push(p);
  else sections.push({...promptFolders([p])[0],entries:[p]});
 }
 return sections;
}
