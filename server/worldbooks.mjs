import {internalPrompt} from './internal-prompts.mjs';
import {readFile,readdir,realpath} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {importWorldbook,cleanLoreInsertions,resolveWorldbooks} from '../src/domain/worldbooks.ts';
import {personaDescription} from './participants.mjs';
const error=code=>Object.assign(new Error(code),{status:400,code});
/** Operator-managed private files. No client path, filename or book selection is accepted. */
export async function loadPrivateWorldbooks(root){
  const directory=resolve(root,'server/private/worldbooks');let names;
  try{names=await readdir(directory);}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const base=await realpath(directory),books=[];
  for(const name of names.filter(n=>n.toLowerCase().endsWith('.json')).sort()){
    if(books.length>=40)throw new Error('PRIVATE_WORLDBOOK_LIMIT');
    const path=await realpath(resolve(base,name));if(!path.startsWith(base+sep))throw new Error('PRIVATE_WORLDBOOK_PATH');
    try{books.push(importWorldbook(await readFile(path,'utf8'),name,'server-'+books.length));}catch{throw new Error('PRIVATE_WORLDBOOK_INVALID');}
  }return books;
}
export function storyWorldInfo(privateBooks,request,charName){
  try{
    const user=cleanLoreInsertions(request.worldInfo);
    const ctx={messages:[...(request.historyStart===0||!request.historyStart?[request.opening||'']:[]),...request.history.map(m=>m.content),request.input],userName:request.persona.name,charName,persona:personaDescription(request.persona),seed:request.turnId||request.input};
    const server=resolveWorldbooks(privateBooks,ctx).entries;
    return {user,server};
  }catch{throw error('INVALID_WORLD_INFO');}
}
export function applyWorldInfo(messages,{user,server}){
  if(!user.length&&!server.length)return messages;
  const result=messages.map(m=>({...m}));
  const build=(entries,label,position)=>entries.filter(e=>e.position===position).sort((a,b)=>a.order-b.order).map(e=>({role:'system',content:label+'\n'+e.content}));
  const at=result.findIndex(m=>m.content.startsWith('服务器私有的角色与世界定义：'));
  if(at<0)throw error('INVALID_WORLD_INFO');
  result.splice(at+1,0,...build(user,'用户补充世界书：',1),...build(server,'服务器内置世界书：',1));
  result.splice(at,0,...build(user,'用户补充世界书：',0),...build(server,'服务器内置世界书：',0));
  // Compute all depth locations against the same chat, excluding system instructions.
  const turns=result.flatMap((m,index)=>m.role==='user'||m.role==='assistant'?[index]:[]),groups=new Map();
  for(const [entries,label] of [[user,'用户补充世界书：'],[server,'服务器内置世界书：']])for(const e of entries.filter(e=>e.position===4)){
    const at=e.depth===0?result.length:turns[Math.max(0,turns.length-e.depth)]??result.length;
    const rows=groups.get(at)||[];rows.push({e,label});groups.set(at,rows);
  }
  for(const [at,rows] of [...groups].sort((a,b)=>b[0]-a[0]))result.splice(at,0,...rows.sort((a,b)=>a.e.order-b.e.order).map(({e,label})=>({role:e.role,content:label+'\n'+e.content})));
  const guard={role:'system',content:internalPrompt('worldbooks.1')};
  result.push(guard);return result;
}
