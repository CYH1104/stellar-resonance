import {randomUUID} from 'node:crypto';
import {PrivateNativeCompiler} from './privateCompiler.mjs';
import {projectNativeWorldScopes,cleanNativeWorldbookRequest} from '../../src/domain/nativeWorldbooks.ts';
import {cleanNativeEffects,cleanNativeVariables} from '../../src/domain/nativeWorldState.ts';
import {nativeTaskProjection,nativeTaskActors} from '../../server/native-task-context.mjs';
const fail=(code,status=400)=>Object.assign(Error(code),{code,status});
const prefix='academy-native-ticket:';
const copy=v=>JSON.parse(JSON.stringify(v));
function authorBook(card){const entries=Object.fromEntries(card.world.entries.map((e,uid)=>[uid,{...e,uid}]));for(const c of card.characters){const uid=Object.keys(entries).length;entries[uid]={uid,key:[c.name,c.id],keysecondary:[],comment:c.name,content:c.hiddenPrompt||[c.title,c.str,c.shos,c.intro,c.quote].filter(Boolean).join('\n'),constant:false,disable:false,order:100,position:0,depth:4,role:0,probability:100,useProbability:true};}return {id:'academy-author',name:'学院基础资料',worldbook:{entries}};}
function privateFields(card){return [...card.world.entries.map(e=>e.content),...card.characters.flatMap(c=>[c.hiddenPrompt,c.intro,c.str,c.shos])].filter(v=>typeof v==='string'&&v.length>=16);}
/** Private messages stay server-side; the original SDK transports a single-use account ticket. */
export function privateGeneration({catalog,tasks,terminal,compiler=new PrivateNativeCompiler(),clock=Date.now}){
 const pending=new Map();const prune=()=>{for(const [key,row]of pending)if(row.expires<clock())pending.delete(key);};
 process.once('exit',()=>{void compiler.close();});
 return {
  async prepare(owner,body,signal){
   prune();if(pending.size>=64)throw fail('NATIVE_TASK_BUSY',429);
   if(!['tasks','terminal'].includes(body.family)||typeof body.token!=='string'||!body.pipeline||!body.profile)throw fail('INVALID_NATIVE_TASK');
   const source=body.family==='terminal'?terminal.preparation(owner,body.token):(await tasks()).preparation(owner,body.token),input=body.pipeline,card=source.authorCard||(await catalog()).card;
   const anonymous=source.input.task==='command'||source.input.task==='divination'&&source.input.context?.divination?.kind==='npc';
   const projection=anonymous?{userName:'User',persona:''}:nativeTaskProjection(source.input);
   const books=cleanNativeWorldbookRequest(input.books||[]);if(source.input.task!=='command')books.unshift(authorBook(card));
   const registry=[...card.characters.map(c=>({id:c.id,name:c.name})),...nativeTaskActors(source.input)];
   const scoped=projectNativeWorldScopes(books,registry);
   const history=source.task==='story'?input.history:source.messages.filter(m=>m.role==='user'||m.role==='assistant');
   if(!Array.isArray(history)||!history.length||history.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'))throw fail('NATIVE_PROMPT_INVALID');
   const result=await compiler.compile({history,instruction:source.messages.filter(m=>m.role==='system'||m.role==='developer').map(m=>m.content).join('\n\n'),user:projection.userName,persona:projection.persona,anonymous:source.task!=='story'||anonymous,preset:input.preset,profile:body.profile,books:books.map(({id,name})=>({id,name})),selectedBooks:books.map(b=>b.name),scopedBooks:scoped.map(({name,worldbook})=>({name,worldbook})),effects:cleanNativeEffects(input.effects),variables:anonymous?{}:input.variables||{},globals:anonymous?{}:input.globals||{},type:source.input.generationType||'normal'},signal);
   signal.throwIfAborted();const state=cleanNativeVariables({variables:result.variables,globals:result.globals});
   const serialized=JSON.stringify(state);if(privateFields(card).some(value=>serialized.includes(value)||serialized.includes(JSON.stringify(value).slice(1,-1))))throw fail('PRIVATE_VARIABLE_EXPORT_FORBIDDEN',403);
   const token=randomUUID();pending.set(token,{owner,family:body.family,sourceToken:body.token,messages:result.messages,profile:copy(body.profile),expires:clock()+660000});
   return {messages:[{role:'user',content:prefix+token}],effects:result.effects,...state};
  },
  consume(owner,body){prune();const value=body.messages?.length===1&&body.messages[0]?.content;if(typeof value!=='string'||!value.startsWith(prefix))return;
   const token=value.slice(prefix.length),entry=pending.get(token);if(!entry||entry.owner!==owner)throw fail('NATIVE_GENERATION_EXPIRED',409);
   const base=value=>String(value||'').replace(/\/+$/,'').replace(/\/chat\/completions$/,'');
   if(body.model!==entry.profile.model||base(body.custom_url)!==base(entry.profile.apiBaseUrl)||Number(body.max_tokens)!==entry.profile.maxTokens)throw fail('NATIVE_GENERATION_PROFILE_CHANGED',409);
   pending.delete(token);return entry.messages;
  },
  cancel(owner,family,token){for(const [id,row]of pending)if(row.owner===owner&&row.family===family&&row.sourceToken===token)pending.delete(id);},
  close:()=>compiler.close(),
 };
}
