import { computed, reactive, ref, watch, type UnwrapNestedRefs } from 'vue';
import type { Gateway, GenerateRequest, Memory, Panel, Persona, Preferences, Profile, Session, Snapshot, Variant } from '../domain/contracts';
import { backup, chronicle, cleanPreferences, copy, defaults, editMessage, finishVariant, newSession, now, parseBackup, rollDice, selected, selectVariant, stateAt, truncate, uid, visibleMemories } from '../domain/story';
import { IndexedDbRepository } from '../storage/repository';
import { MockGateway } from '../gateway/mock';
import { HttpGateway } from '../gateway/http';
import { retrieve } from '../memory/retrieval';

export function useWorkspace() {
  const preferences=reactive<Preferences>(defaults());
  const sessions=ref<Session[]>([]), sessionId=ref(''), panel=ref<Panel>('story');
  const credentials=reactive<Record<string,string>>({});
  const loading=ref(true), authorized=ref(false), busy=ref(false), workingMemory=ref(false);
  const notice=ref('正在读取本地存档…'), problem=ref(''), input=ref(''), lastSaved=ref('');
  const repository=new IndexedDbRepository(); let writes=Promise.resolve(); let controller:AbortController|undefined;let storageReady=false;
  const mock=new MockGateway(), http=new HttpGateway();
  const gateway=():Gateway=>preferences.mode==='demo'?mock:http;
  const active=computed(()=>sessions.value.find(s=>s.id===sessionId.value));
  const state=computed(()=>active.value?stateAt(active.value):undefined);
  const memories=computed(()=>active.value?visibleMemories(active.value):[]);
  const events=computed(()=>active.value?chronicle(active.value):[]);
  const canContinue=computed(()=>authorized.value&&gateway().capabilities.continue);
  const profile=(id:string):Profile=>preferences.profiles.find(p=>p.id===id) || preferences.profiles[0];
  const key=(p:Profile)=>credentials[p.id] || '';
  const fingerprint=(p:Profile)=>`${preferences.mode}:${p.providerId}:${p.model}`;
  const snapshot=():Snapshot=>({version:1,sessions:copy(sessions.value),preferences:cleanPreferences(preferences)});
  async function persist() {
    if(!storageReady){problem.value='无法读取旧存档，已阻止覆盖。请导出当前内容并检查浏览器存储权限。';throw new Error(problem.value);}
    const value=snapshot(); notice.value='正在保存…';
    const task=writes.catch(()=>{}).then(()=>repository.write(value)); writes=task;
    try {await task;lastSaved.value=now();notice.value='已保存在本机';} catch(e) {problem.value=message(e);notice.value='未保存，请导出备份';throw e;}
  }
  const safePersist=()=>persist().catch(()=>{});
  const message=(e:unknown)=> e instanceof Error ? (e.name==='AbortError'?'生成已停止，已收到的内容保留。':e.message) : '操作未完成，请重试。';
  async function boot() {
    try {const value=await repository.read();if(value){sessions.value=value.sessions;Object.assign(preferences,value.preferences);}storageReady=true;notice.value=sessions.value.length?'本地存档已载入':'新建一段旅程，数据会保存在本机';authorized.value=preferences.mode==='demo';}
    catch(e){problem.value=message(e);notice.value='本地存储暂不可用，请勿覆盖旧数据';}
    finally {loading.value=false;}
  }
  let timer:ReturnType<typeof setTimeout>;
  watch(preferences,()=>{if(loading.value)return;clearTimeout(timer);timer=setTimeout(()=>{void safePersist();},500);},{deep:true});
  watch(()=>preferences.mode,()=>{authorized.value=preferences.mode==='demo';for(const id of Object.keys(credentials))delete credentials[id];});
  async function authorize(invite:string) {try{await gateway().authorize(invite);authorized.value=true;notice.value=preferences.mode==='demo'?'演示访问已开启':'访问验证成功';problem.value='';}catch(e){authorized.value=false;problem.value=message(e);}}
  async function create(name:string,persona:Persona,opening:string) {
    if(!authorized.value){problem.value='请先验证访问资格';return;}
    const session=newSession(name,persona,opening);sessions.value.unshift(session);sessionId.value=session.id;panel.value='story';input.value='';problem.value='';await safePersist();
  }
  function open(id:string) {if(busy.value)return;sessionId.value=id;panel.value='story';input.value='';problem.value='';}
  function home() {if(busy.value)return;sessionId.value='';panel.value='story';input.value='';}
  function stop(){controller?.abort();}
  async function recall(session:Session,text:string,before=session.turns.length):Promise<Memory[]> {
    const list=visibleMemories(session,before).slice().reverse(); let vector:number[]|undefined;const p=profile(preferences.embeddingProfile);
    if(preferences.vectorEnabled && (preferences.mode==='demo'||key(p))) {
      try{vector=(await gateway().embed([text],p,key(p),controller?.signal||new AbortController().signal))[0];}catch(e){if(controller?.signal.aborted)throw e;notice.value='向量接口不可用，已退回关键词检索';}
    }
    return retrieve(list,text,fingerprint(p),vector);
  }
  async function generate(text?:string,turnIndex?:number,continuePartial=false) {
    const session=active.value;if(!session||busy.value||workingMemory.value)return;
    if(!authorized.value){problem.value='请先验证访问资格';return;}
    const p=profile(preferences.mainProfile);
    if(preferences.mode==='server'&&!key(p)){problem.value='请在模型设置填写当前接口的 Key';panel.value='settings';return;}
    let index:number;
    if(turnIndex===undefined){const content=(text??input.value).trim();if(!content){problem.value='请先输入本轮行动';return;}if(content.length>16000){problem.value='单条输入超过首版长度限制';return;}session.turns.push({id:uid(),input:content,dice:preferences.diceEnabled?rollDice():undefined,variants:[],selected:0});index=session.turns.length-1;input.value='';}
    else{index=turnIndex;if(!session.turns[index])return;truncate(session,index+1);}
    const turn=session.turns[index];const partial=continuePartial?selected(turn)?.text||'':'';turn.variants.push({id:uid(),text:partial,status:'incomplete',createdAt:now()});turn.selected=turn.variants.length-1;const variant=turn.variants[turn.selected];
    busy.value=true;problem.value='';controller=new AbortController();let done=false, checkpoint=Date.now();await safePersist();
    try {
      const recalled=await recall(session,turn.input,index);
      const request:GenerateRequest={sessionId:session.id,turnId:turn.id,persona:copy(session.persona),opening:session.opening,input:turn.input,history:session.turns.slice(Math.max(0,index-12),index).flatMap(t=>{const v=selected(t);return v?.status==='complete'?[{role:'user' as const,content:t.input},{role:'assistant' as const,content:v.text}]:[];}),memories:recalled.map(m=>m.text.slice(0,1000)),state:stateAt(session,index),dice:copy(turn.dice),profile:copy(p),presets:preferences.presets.filter(p=>p.enabled).map(p=>p.content),continuation:partial?{partial}:undefined};
      for await(const event of gateway().generate(request,key(p),controller.signal)) {
        if(controller.signal.aborted)throw new DOMException('已停止','AbortError');
        if(event.type==='delta'){variant.text+=event.text;if(Date.now()-checkpoint>700){checkpoint=Date.now();await safePersist();}}
        else{try{finishVariant(session,index,variant,event.outcome);}catch(e){variant.status='complete';delete variant.outcome;problem.value=`剧情已收到，状态更新未通过：${message(e)}`;}done=true;}
      }
      if(!done)throw new Error('未收到完整回复，已保留部分内容。');
      const aux=profile(preferences.auxiliaryProfile), utilityProfile=preferences.mode==='server'&&!key(aux)?p:aux;
      try {
        session.suggestions=await gateway().utility('suggestions',[turn.input,variant.text],utilityProfile,key(utilityProfile),controller.signal);
        const complete=chronicle(session);
        if(variant.outcome&&complete.length && complete.length%5===0){const summary=await gateway().utility('summary',complete.slice(-5).map(e=>e.title),utilityProfile,key(utilityProfile),controller.signal);if(summary[0]?.trim())session.memories.push({id:uid(),text:summary[0],kind:'chapter',createdAt:now(),sourceTurn:turn.id,sourceVariant:variant.id});}
      } catch {notice.value='剧情已完成，摘要或建议暂不可用';}
    }catch(e){problem.value=message(e);}
    finally{busy.value=false;controller=undefined;session.updatedAt=now();await safePersist();}
  }
  async function changeVariant(index:number,variant:number){if(!active.value||busy.value)return;try{selectVariant(active.value,index,variant);await safePersist();}catch(e){problem.value=message(e);}}
  async function rewind(count:number){if(!active.value||busy.value)return;try{truncate(active.value,count);await safePersist();notice.value='已恢复对应剧情状态与记忆';}catch(e){problem.value=message(e);}}
  async function edit(index:number,role:'user'|'assistant',text:string){if(!active.value||busy.value)return;try{editMessage(active.value,index,role,text);await safePersist();notice.value='修改已保存，请重演以重新计算这一幕状态';}catch(e){problem.value=message(e);}}
  async function savePersona(persona:Persona){if(!active.value||busy.value)return;active.value.persona=copy(persona);active.value.initial.player.name=persona.name||'玩家';await safePersist();}
  async function saveMemory(text:string,id?:string){const s=active.value;if(!s||busy.value||workingMemory.value||!text.trim())return;const m=s.memories.find(x=>x.id===id);if(m){m.text=text.trim();delete m.vector;}else s.memories.push({id:uid(),text:text.trim(),kind:'note',createdAt:now()});await safePersist();}
  async function removeMemory(id:string){if(!active.value||busy.value||workingMemory.value)return;active.value.memories=active.value.memories.filter(m=>m.id!==id);await safePersist();}
  async function indexMemories(){const s=active.value;if(!s||busy.value||workingMemory.value)return;const p=profile(preferences.embeddingProfile);if(preferences.mode==='server'&&!key(p)){problem.value='请填写向量接口 Key';panel.value='settings';return;}workingMemory.value=true;problem.value='';try{const pending=visibleMemories(s).filter(m=>m.vector?.model!==fingerprint(p)||m.vector.text!==m.text);for(let i=0;i<pending.length;i+=16){const batch=pending.slice(i,i+16);const vectors=await gateway().embed(batch.map(m=>m.text),copy(p),key(p),new AbortController().signal);batch.forEach((m,j)=>m.vector={model:fingerprint(p),values:vectors[j],text:m.text});}await safePersist();notice.value=preferences.mode==='demo'?'演示索引已生成（字频示例，不是真实语义向量）':'记忆向量已生成并保存本地';}catch(e){problem.value=message(e);}finally{workingMemory.value=false;}}
  async function searchMemory(query:string):Promise<Memory[]>{if(!active.value)return[];if(!query.trim())return memories.value;try{return await recall(active.value,query);}catch(e){problem.value=message(e);return[];}}
  function download(filename:string,content:string,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportBackup(){download(`群星共振-备份-${new Date().toISOString().slice(0,10)}.json`,backup(snapshot()));notice.value='备份已导出，不包含 Key';}
  async function importBackup(text:string,replace=false){if(busy.value||workingMemory.value)return;try{const value=parseBackup(text);if(replace){sessions.value=value.sessions;Object.assign(preferences,value.preferences);sessionId.value='';}else{for(const s of value.sessions){s.id=uid();s.name+= '（导入）';sessions.value.push(s);}}await persist();problem.value='';notice.value='备份已恢复';}catch(e){problem.value=message(e);}}
  function exportBook(){const s=active.value;if(!s)return;const escape=(x:string)=>x.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');const body=s.turns.map(t=>{const v=selected(t);return v?.status==='complete'?`<section><p class="action">${escape(t.input)}</p><p>${escape(v.text)}</p></section>`:'';}).join('');download(`${s.name}-故事.html`,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(s.name)}</title><style>body{max-width:44rem;margin:3rem auto;padding:0 1.5rem;font:18px/1.8 system-ui;color:#222}p{white-space:pre-wrap}.action{color:#666}section{margin-bottom:2rem}</style><h1>${escape(s.name)}</h1><p>${escape(s.opening)}</p>${body}</html>`,'text/html');}
  function addProfile(){const id=uid();preferences.profiles.push({id,name:'新接口档案',providerId:'approved-provider',model:'',temperature:0.7,maxTokens:1600});return id;}
  function removeProfile(id:string){if(preferences.profiles.length<=1)return;preferences.profiles=preferences.profiles.filter(p=>p.id!==id);delete credentials[id];for(const role of ['mainProfile','auxiliaryProfile','embeddingProfile'] as const)if(preferences[role]===id)preferences[role]=preferences.profiles[0].id;}
  function importPreset(text:string){try{const value=JSON.parse(text) as {name:string;content:string;enabled?:boolean};if(!value||typeof value.name!=='string'||typeof value.content!=='string'||(value.enabled!==undefined&&typeof value.enabled!=='boolean')||Object.keys(value).some(k=>!['name','content','enabled'].includes(k)))throw new Error('首版预设支持 name、content、enabled；其他字段暂不支持');preferences.presets.push({id:uid(),name:value.name,content:value.content,enabled:value.enabled!==false});notice.value='预设已导入';}catch(e){problem.value=message(e);}}
  function exportPreset(id:string){const p=preferences.presets.find(p=>p.id===id);if(p)download(`${p.name}-预设.json`,JSON.stringify({name:p.name,content:p.content,enabled:p.enabled},null,2));}
  function movePreset(index:number,offset:number){const to=index+offset;if(to<0||to>=preferences.presets.length)return;const p=preferences.presets.splice(index,1)[0];preferences.presets.splice(to,0,p);}
  void boot();
  return {preferences,sessions,sessionId,panel,credentials,loading,authorized,busy,workingMemory,notice,problem,input,lastSaved,active,state,memories,events,canContinue,authorize,create,open,home,stop,generate,changeVariant,rewind,edit,savePersona,saveMemory,removeMemory,indexMemories,searchMemory,exportBackup,importBackup,exportBook,addProfile,removeProfile,importPreset,exportPreset,movePreset,save:safePersist};
}
export type Workspace = ReturnType<typeof useWorkspace>;
export type ViewModel = UnwrapNestedRefs<Workspace>;
