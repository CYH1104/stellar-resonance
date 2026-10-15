import { computed, reactive, ref, watch, type UnwrapNestedRefs } from 'vue';
import type { Gateway, GenerateRequest, LocalService, Memory, Panel, Persona, Preferences, Profile, Session, Snapshot, Variant } from '../domain/contracts';
import { backup, effectiveEvents, cleanPreferences, copy, defaults, editMessage, finishVariant, likeForum, newSession, now, parseBackup, replyForum, rollDice, selected, selectVariant, stateAt, truncate, uid, visibleForum, visibleMemories } from '../domain/story';
import { IndexedDbRepository } from '../storage/repository';
import {apiAddress,type LocalApiCredentials} from '../storage/apiCredentials';
import { MockGateway } from '../gateway/mock';
import { HttpGateway } from '../gateway/http';
import { retrieve } from '../memory/retrieval';
import { blankPersona, mergePersonaDraft, normalizePersona } from '../domain/persona';
import {activePromptEntries,importTavernPreset,exportTavernPreset,presetGroups,setId} from '../domain/presets';
import {defaultTheaters,visibleTheaters} from '../domain/theaters';
import {apiConfigurationIssues,apiFieldIssues,auxiliaryApis,requiredApis,storyApi,taskApi,textApiTasks} from '../domain/apis';

export function useWorkspace() {
  const preferences=reactive<Preferences>({...defaults(),activePreset:'legacy',theaters:defaultTheaters()});
  const presetWarnings=ref<string[]>([]);
  const presetSets=computed(()=>presetGroups(preferences.presets));
  const currentPreset=computed(()=>presetSets.value.find(g=>g.id===preferences.activePreset)?.id||presetSets.value[0]?.id||'legacy');
  const presetEntries=computed(()=>preferences.presets.filter(p=>setId(p)===currentPreset.value));
  const sessions=ref<Session[]>([]), sessionId=ref(''), panel=ref<Panel>('story');
  const localService=ref<LocalService>();
  const newGameDraft=reactive({title:'新的旅程',opening:'',wish:'',persona:blankPersona()});
  const workingPersona=ref(false),creatingGame=ref(false),personaNotice=ref('');
  let personaController:AbortController|undefined;
  function resetNewGameDraft(){if(workingPersona.value||creatingGame.value)return;Object.assign(newGameDraft,{title:'新的旅程',opening:'',wish:'',persona:blankPersona()});personaNotice.value='';}
  function stopPersona(){personaController?.abort();}
  async function assistPersona(){
    if(workingPersona.value||creatingGame.value||busy.value)return;
    if(!newGameDraft.wish.trim()){problem.value='先写下你想玩的人设，再点击 AI 帮我写。';return;}
    if(!localService.value){problem.value='AI 人设填写需要连接本机世界卡后台。';return;}
    const p=personaProfile.value!;
    if(!ensureApiConfiguration())return;
    if(!connectionReady(p)||!key(p)){problem.value='请先在模型设置填写地址、模型名和 Key，并确认使用此服务；人设草稿会保留。';panel.value='settings';return;}
    workingPersona.value=true;problem.value='';personaNotice.value='AI 正在结合世界观补全人设…';personaController=new AbortController();
    try{const result=await http.assistPersona(newGameDraft.wish,copy(newGameDraft.persona),copy(p),key(p),personaController.signal);personaController.signal.throwIfAborted();Object.assign(newGameDraft.persona,mergePersonaDraft(newGameDraft.persona,result));personaNotice.value='已补全空白栏位，原有内容保留。请检查并修改，满意后再开始游戏。';}
    catch(e){personaNotice.value='现有表格已保留。';problem.value=personaController.signal.aborted?'已取消人设生成，表格未修改。':message(e);}
    finally{workingPersona.value=false;personaController=undefined;}
  }
  const credentials=reactive<Record<string,string>>({});
  const rememberApiKeys=ref(true);
  const approved=reactive<Record<string,string>>({});
  const connectionSignature=(p:Profile)=>JSON.stringify([apiAddress(p.apiBaseUrl),p.model,credentials[p.id]||'']);
  const connectionReady=(p:Profile)=>approved[p.id]===connectionSignature(p);
  async function connectProfile(p:Profile){try{const missing=apiFieldIssues(p,credentials[p.id]);if(missing.length)throw new Error(`请填写：${missing.join('、')}`);const signature=connectionSignature(p);await http.configure(copy(p));if(signature!==connectionSignature(p))throw new Error('配置已改变，请重新确认。');approved[p.id]=signature;problem.value='';if(!loading.value)await persist();notice.value=rememberApiKeys.value?'当前接口已确认并保存在此浏览器；尚未进行模型生成测试。':'当前接口已确认，仅在本次页面使用。';return true;}catch(e){problem.value=message(e);return false;}}
  async function fetchModels(p:Profile,signal:AbortSignal){if(!localService.value)throw new Error('请先连接本机后台，再获取模型。');return http.models(p.apiBaseUrl||'',key(p),signal);}
  const loading=ref(true), authorized=ref(false), busy=ref(false), workingMemory=ref(false);
  const configuringApis=ref(false),pendingSessionId=ref(''),continuationAttempt=ref(0);
  const auxiliaryProfiles=computed(()=>auxiliaryApis(preferences));
  const storyProfile=computed(()=>storyApi(preferences));
  const summaryProfile=computed(()=>taskApi(preferences,'summary'));
  const suggestionsProfile=computed(()=>taskApi(preferences,'suggestions'));
  const personaProfile=computed(()=>taskApi(preferences,'persona'));
  const apiSelectable=(p:Profile)=>!apiFieldIssues(p,key(p)).length;
  const apiIssues=computed(()=>apiConfigurationIssues(preferences,credentials,connectionReady));
  const apiReady=computed(()=>!loading.value&&authorized.value&&!!localService.value&&!apiIssues.value.length);
  function ensureApiConfiguration(){if(apiReady.value)return true;problem.value=apiIssues.value[0]||'请先连接本机后台并完成 API 配置。';panel.value='settings';return false;}
  function enterStory(){if(!ensureApiConfiguration())return false;if(pendingSessionId.value){const id=pendingSessionId.value;pendingSessionId.value='';open(id);}else panel.value='story';return true;}
  async function confirmAllApis(){if(configuringApis.value||busy.value)return;const structural=apiConfigurationIssues(preferences,credentials,()=>true);if(structural.length){problem.value=structural[0];return;}configuringApis.value=true;try{for(const p of [...new Map([...requiredApis(preferences),...auxiliaryApis(preferences).filter(apiSelectable)].map(p=>[p.id,p])).values()])if(!await connectProfile(p))return;notice.value='必需的 API 配置已就绪，可以进入游戏。';await safePersist();}finally{configuringApis.value=false;}}
  const notice=ref('正在读取本地存档…'), problem=ref(''), input=ref(''), lastSaved=ref('');
  const repository=new IndexedDbRepository(); let writes=Promise.resolve(); let controller:AbortController|undefined;let storageReady=false,apiStorageReady=false;
  const deletingSessionId=ref('');let deletionTask:Promise<boolean>|undefined;
  const mock=new MockGateway(), http=new HttpGateway();
  const gateway=():Gateway=>localService.value?http:preferences.mode==='demo'?mock:http;
  const active=computed(()=>sessions.value.find(s=>s.id===sessionId.value));
  const state=computed(()=>active.value?stateAt(active.value):undefined);
  const memories=computed(()=>active.value?visibleMemories(active.value):[]);
  const forum=computed(()=>active.value?visibleForum(active.value):[]);
  const theaters=computed(()=>active.value?visibleTheaters(active.value):[]);
  const canContinue=computed(()=>authorized.value&&gateway().capabilities.continue);
  const profile=(id:string):Profile=>preferences.profiles.find(p=>p.id===id) || preferences.profiles[0];
  const key=(p:Profile)=>credentials[p.id] || '';
  const fingerprint=(p:Profile)=>`${preferences.mode}:${p.apiBaseUrl||''}:${p.providerId}:${p.model}`;
  const snapshot=():Snapshot=>({version:1,sessions:copy(sessions.value),preferences:cleanPreferences(preferences)});
  function credentialsSnapshot():LocalApiCredentials{
    const profiles=preferences.profiles.filter(p=>!!credentials[p.id]);
    return {version:1,remember:rememberApiKeys.value,keys:rememberApiKeys.value?Object.fromEntries(profiles.map(p=>[p.id,credentials[p.id]])):{},confirmed:rememberApiKeys.value?Object.fromEntries(profiles.filter(connectionReady).map(p=>[p.id,{apiBaseUrl:apiAddress(p.apiBaseUrl),model:p.model}])):{}};
  }
  async function setRememberApiKeys(remember:boolean){rememberApiKeys.value=remember;apiStorageReady=true;try{await persist();notice.value=remember?'已启用在此浏览器保存 Key。':'已删除本机保存的 Key；当前页面仍可使用，重新打开后需填写。';}catch{}}
  async function clearApiKeys(){for(const id of Object.keys(credentials))delete credentials[id];for(const id of Object.keys(approved))delete approved[id];apiStorageReady=true;try{await persist();notice.value='已清除本机保存和当前页面中的全部 API Key。';}catch{}}
  async function persist() {
    if(deletionTask)await deletionTask;
    if(!storageReady){problem.value='无法读取旧存档，已阻止覆盖。请导出当前内容并检查浏览器存储权限。';throw new Error(problem.value);}
    const value=snapshot(),privateValue=credentialsSnapshot(); notice.value='正在保存…';
    const task=writes.catch(()=>{}).then(async()=>{await repository.write(value);if(apiStorageReady)await repository.writeApiCredentials(privateValue);}); writes=task;
    try {await task;lastSaved.value=now();notice.value='已保存在本机';} catch(e) {problem.value=message(e);notice.value='未保存，请导出备份';throw e;}
  }
  const safePersist=()=>persist().catch(()=>{});
  const message=(e:unknown)=> e instanceof Error ? (e.name==='AbortError'?'生成已停止，已收到的内容保留。':e.message) : '操作未完成，请重试。';
  async function boot() {
    try {const value=await repository.read();if(value){sessions.value=value.sessions;Object.assign(preferences,value.preferences);}storageReady=true;notice.value=sessions.value.length?'本地存档已载入':'新建一段旅程，数据会保存在本机';authorized.value=preferences.mode==='demo';}
    catch(e){problem.value=message(e);notice.value='本地存储暂不可用，请勿覆盖旧数据';}
    finally {
      try{const service=await http.bootstrap();if(service){localService.value=service;preferences.mode='server';await Promise.resolve();authorized.value=true;notice.value='服务器角色卡已载入 · 请在模型设置连接 AI';}}catch{problem.value='本机资料后台不可用；请使用新版 bat 启动。';}
      try{const saved=await repository.readApiCredentials();apiStorageReady=true;if(saved){rememberApiKeys.value=saved.remember;if(saved.remember){for(const p of preferences.profiles)if(saved.keys[p.id])credentials[p.id]=saved.keys[p.id];await Promise.resolve();if(localService.value)for(const p of preferences.profiles){const previous=saved.confirmed[p.id];if(previous&&previous.apiBaseUrl===apiAddress(p.apiBaseUrl)&&previous.model===p.model&&!apiFieldIssues(p,key(p)).length)await connectProfile(p);}}}}catch(e){rememberApiKeys.value=false;problem.value=message(e);}
      loading.value=false;if(apiReady.value)notice.value='已恢复本机 API 配置，可以继续游戏。';
    }
  }
  let timer:ReturnType<typeof setTimeout>;
  const scheduleSave=()=>{if(loading.value)return;clearTimeout(timer);timer=setTimeout(()=>{void safePersist();},500);};
  watch(preferences,scheduleSave,{deep:true});
  watch([credentials,approved],scheduleSave,{deep:true});
  watch(()=>preferences.mode,()=>{authorized.value=preferences.mode==='demo';for(const id of Object.keys(credentials))delete credentials[id];});
  watch(credentials,()=>{for(const id of Object.keys(approved)){const p=preferences.profiles.find(profile=>profile.id===id);if(!p||approved[id]!==connectionSignature(p))delete approved[id];}});
  watch([apiReady,panel],()=>{if(active.value&&panel.value==='story'&&!apiReady.value&&!loading.value){panel.value='settings';problem.value=apiIssues.value[0]||'请完成 API 配置后继续。';}});
  async function authorize(invite:string) {try{await gateway().authorize(invite);authorized.value=true;notice.value=preferences.mode==='demo'?'演示访问已开启':'访问验证成功';problem.value='';}catch(e){authorized.value=false;problem.value=message(e);}}
  async function create(name:string,persona:Persona,opening:string) {
    if(creatingGame.value||workingPersona.value||busy.value)return;
    try{persona=normalizePersona(persona);}catch(e){problem.value=message(e);return;}
    if(!authorized.value){problem.value='请先验证访问资格';return;}
    if(!ensureApiConfiguration())return;
    creatingGame.value=true;
    try{const session=newSession(name,persona,opening);if(localService.value){const game=await http.newGame(copy(persona));session.initial=game.initial;session.opening=opening.trim()||game.opening;session.sourceDataset=game.dataset;}sessions.value.unshift(session);sessionId.value=session.id;panel.value='story';input.value='';problem.value='';await safePersist();}catch(e){problem.value=message(e);}finally{creatingGame.value=false;}
  }
  function open(id:string) {if(busy.value)return;if(!ensureApiConfiguration()){pendingSessionId.value=id;return;}pendingSessionId.value='';sessionId.value=id;panel.value='story';input.value='';problem.value='';}
  function home() {if(busy.value)return;pendingSessionId.value='';sessionId.value='';panel.value='story';input.value='';}
  function deleteSession(id:string):Promise<boolean>{
    if(loading.value||busy.value||workingMemory.value||workingPersona.value||creatingGame.value||deletionTask)return Promise.resolve(false);
    const target=sessions.value.find(s=>s.id===id);if(!target)return Promise.resolve(false);
    if(!storageReady){problem.value='本地存储不可用，未删除存档。';return Promise.resolve(false);}
    const value=snapshot();value.sessions=value.sessions.filter(s=>s.id!==id);
    busy.value=true;deletingSessionId.value=id;problem.value='';notice.value='正在删除存档…';
    // Share the write queue; later autosaves wait until the in-memory removal is committed.
    const write=writes.catch(()=>{}).then(()=>repository.write(value));writes=write;
    deletionTask=(async()=>{
      try{await write;sessions.value=sessions.value.filter(s=>s.id!==id);if(pendingSessionId.value===id)pendingSessionId.value='';if(sessionId.value===id){sessionId.value='';input.value='';panel.value='saves';}lastSaved.value=now();notice.value=`已删除存档《${target.name}》`;return true;}
      catch(e){problem.value=`删除失败，存档仍保留：${message(e)}`;notice.value='存档未删除，请重试';return false;}
      finally{busy.value=false;deletingSessionId.value='';deletionTask=undefined;}
    })();return deletionTask;
  }
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
    const p=storyProfile.value!;
    if(!ensureApiConfiguration())return;
    if(localService.value&&session.sourceDataset!==localService.value.dataset){problem.value='这是旧版演示存档，请新建一份服务器世界卡存档测试。原存档仍保留。';return;}
    if(localService.value&&!connectionReady(p)){problem.value='请在模型设置填写服务地址、模型名称，并确认使用此服务。';panel.value='settings';return;}
    if(preferences.mode==='server'&&gateway().capabilities.keyRequired!==false&&!key(p)){problem.value='请在模型设置填写当前接口的 Key';panel.value='settings';return;}
    let index:number;
    if(turnIndex===undefined){const content=(text??input.value).trim();if(!content){problem.value='请先输入本轮行动';return;}if(content.length>16000){problem.value='单条输入超过首版长度限制';return;}session.turns.push({id:uid(),input:content,dice:preferences.diceEnabled?rollDice():undefined,variants:[],selected:0});index=session.turns.length-1;input.value='';}
    else{index=turnIndex;if(!session.turns[index])return;if(continuePartial&&(selected(session.turns[index])?.status!=='incomplete'||!selected(session.turns[index])?.text)){problem.value='当前没有需要续写的正文。';return;}truncate(session,index+1);}
    const turn=session.turns[index];const partial=continuePartial?selected(turn)?.text||'':'';if(!continuePartial){turn.variants.push({id:uid(),text:'',status:'incomplete',createdAt:now()});turn.selected=turn.variants.length-1;}const variant=turn.variants[turn.selected];delete variant.outcome;
    const generationType=continuePartial?'continue':turnIndex===undefined?'normal':'regenerate';continuationAttempt.value=0;
    busy.value=true;problem.value='';controller=new AbortController();let done=false, checkpoint=Date.now();await safePersist();
    try {
      const recalled=await recall(session,turn.input,index);
      const request:GenerateRequest={sessionId:session.id,turnId:turn.id,persona:copy(session.persona),opening:session.opening,input:turn.input,historyStart:Math.max(0,index-12),history:session.turns.slice(Math.max(0,index-12),index).flatMap(t=>{const v=selected(t);return v?.status==='complete'?[{role:'user' as const,content:t.input},{role:'assistant' as const,content:v.text}]:[];}),memories:recalled.map(m=>m.text.slice(0,1000)),state:stateAt(session,index),dice:copy(turn.dice),profile:copy(p),presets:[],promptEntries:copy(activePromptEntries(presetEntries.value,generationType)),generationType,theaterSettings:copy(preferences.theaters),continuation:partial?{partial}:undefined,forumContext:visibleForum(session,index).slice(0,6).map(post=>({authorName:post.authorName,content:post.content.slice(0,1000),replies:(session.forumActivity?.[post.key]?.replies||[]).slice(-3).map(reply=>reply.text)}))};
      for await(const event of gateway().generate(request,key(p),controller.signal)) {
        if(controller.signal.aborted)throw new DOMException('已停止','AbortError');
        if(event.type==='delta'){variant.text+=event.text;if(Date.now()-checkpoint>700){checkpoint=Date.now();await safePersist();}}
        else if(event.type==='continuation'){continuationAttempt.value=event.attempt;notice.value=`检测到截断，正在自动续写 ${event.attempt}/${event.maxAttempts}…`;}
        else if(event.type==='done'){finishVariant(session,index,variant,event.outcome);done=true;}
      }
      if(!done)throw new Error('未收到完整回复，已保留部分内容。');
      const suggestionsApi=suggestionsProfile.value!,summaryApi=summaryProfile.value!;
      let auxiliaryFailed=false;
      try{session.suggestions=await gateway().utility('suggestions',[turn.input,variant.text],suggestionsApi,key(suggestionsApi),controller.signal);}catch{auxiliaryFailed=true;}
      const complete=effectiveEvents(session);
      if(!controller.signal.aborted&&variant.outcome&&complete.length&&complete.length%5===0){
        try{const summary=await gateway().utility('summary',complete.slice(-5).map(e=>e.title),summaryApi,key(summaryApi),controller.signal);if(summary[0]?.trim())session.memories.push({id:uid(),text:summary[0],kind:'chapter',createdAt:now(),sourceTurn:turn.id,sourceVariant:variant.id});}catch{auxiliaryFailed=true;}
      }
      if(auxiliaryFailed)notice.value='剧情已完成，摘要或建议暂不可用';
    }catch(e){problem.value=message(e);}
    finally{busy.value=false;continuationAttempt.value=0;controller=undefined;session.updatedAt=now();await safePersist();}
  }
  async function changeVariant(index:number,variant:number){if(!active.value||busy.value)return;try{selectVariant(active.value,index,variant);await safePersist();}catch(e){problem.value=message(e);}}
  async function rewind(count:number){if(!active.value||busy.value)return;try{truncate(active.value,count);await safePersist();notice.value='已恢复对应剧情状态与记忆';}catch(e){problem.value=message(e);}}
  async function edit(index:number,role:'user'|'assistant',text:string){if(!active.value||busy.value)return;try{editMessage(active.value,index,role,text);await safePersist();notice.value='修改已保存，请重演以重新计算这一幕状态';}catch(e){problem.value=message(e);}}
  async function savePersona(persona:Persona){if(!active.value||busy.value)return;try{const value=normalizePersona(persona);active.value.persona=value;Object.assign(active.value.initial.player,{name:value.name,primaryGender:value.primaryGender,secondaryGender:value.secondaryGender,identity:value.identity,spiritAnimal:value.spiritAnimal});await safePersist();}catch(e){problem.value=message(e);}}
  async function loadPlace(id:string){try{return await http.place(id);}catch(e){problem.value=message(e);return undefined;}}
  async function toggleForumLike(key:string){if(!active.value||busy.value||workingMemory.value)return;try{likeForum(active.value,key);await safePersist();}catch(e){problem.value=message(e);}}
  async function replyToForum(key:string,text:string):Promise<boolean>{if(!active.value||busy.value||workingMemory.value)return false;try{replyForum(active.value,key,text);await persist();notice.value='评论已保存到本机，将作为后续剧情的上下文';return true;}catch(e){problem.value=message(e);return false;}}
  async function saveMemory(text:string,id?:string){const s=active.value;if(!s||busy.value||workingMemory.value||!text.trim())return;const m=s.memories.find(x=>x.id===id);if(m){m.text=text.trim();delete m.vector;}else s.memories.push({id:uid(),text:text.trim(),kind:'note',createdAt:now()});await safePersist();}
  async function removeMemory(id:string){if(!active.value||busy.value||workingMemory.value)return;active.value.memories=active.value.memories.filter(m=>m.id!==id);await safePersist();}
  async function indexMemories(){const s=active.value;if(!s||busy.value||workingMemory.value)return;if(!preferences.vectorEnabled){problem.value='请先开启向量检索并配置向量 API。';return;}const p=copy(profile(preferences.embeddingProfile));if(apiFieldIssues(p,key(p)).length||!connectionReady(p)){problem.value='请先填写并确认向量 API 的地址、模型和 Key。';panel.value='settings';return;}workingMemory.value=true;problem.value='';try{const pending=visibleMemories(s).filter(m=>m.vector?.model!==fingerprint(p)||m.vector.text!==m.text);for(let i=0;i<pending.length;i+=16){const batch=pending.slice(i,i+16);const vectors=await gateway().embed(batch.map(m=>m.text),copy(p),key(p),new AbortController().signal);batch.forEach((m,j)=>m.vector={model:fingerprint(p),values:vectors[j],text:m.text});}await safePersist();notice.value=preferences.mode==='demo'?'演示索引已生成（字频示例，不是真实语义向量）':'记忆向量已生成并保存本地';}catch(e){problem.value=message(e);}finally{workingMemory.value=false;}}
  async function searchMemory(query:string):Promise<Memory[]>{if(!active.value)return[];if(!query.trim())return memories.value;try{return await recall(active.value,query);}catch(e){problem.value=message(e);return[];}}
  function download(filename:string,content:string,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportBackup(){download(`群星共振-备份-${new Date().toISOString().slice(0,10)}.json`,backup(snapshot()));notice.value='备份已导出，不包含 Key';}
  async function importBackup(text:string,replace=false){if(busy.value||workingMemory.value)return;try{const value=parseBackup(text);if(replace){sessions.value=value.sessions;Object.assign(preferences,value.preferences);sessionId.value='';}else{for(const s of value.sessions){s.id=uid();s.name+= '（导入）';sessions.value.push(s);}}await persist();problem.value='';notice.value='备份已恢复';}catch(e){problem.value=message(e);}}
  function exportBook(){const s=active.value;if(!s)return;const escape=(x:string)=>x.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');const body=s.turns.map(t=>{const v=selected(t);return v?.status==='complete'?`<section><p class="action">${escape(t.input)}</p><p>${escape(v.text)}</p></section>`:'';}).join('');download(`${s.name}-故事.html`,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(s.name)}</title><style>body{max-width:44rem;margin:3rem auto;padding:0 1.5rem;font:18px/1.8 system-ui;color:#222}p{white-space:pre-wrap}.action{color:#666}section{margin-bottom:2rem}</style><h1>${escape(s.name)}</h1><p>${escape(s.opening)}</p>${body}</html>`,'text/html');}
  function addProfile(){if(preferences.profiles.length>=30){problem.value='接口总数最多30个，请先移除不需要的副 API。';return '';}const id=uid();preferences.profiles.push({id,name:`副 API ${(preferences.auxiliaryProfiles?.length||0)+1}`,providerId:'approved-provider',model:'',temperature:0.7,maxTokens:1600});(preferences.auxiliaryProfiles||=[]).push(id);preferences.auxiliaryProfile=preferences.auxiliaryProfiles[0]||preferences.mainProfile;return id;}
  function removeProfile(id:string){if(id===preferences.mainProfile||id===preferences.embeddingProfile)return;preferences.profiles=preferences.profiles.filter(p=>p.id!==id);delete credentials[id];delete approved[id];preferences.auxiliaryProfiles=(preferences.auxiliaryProfiles||[]).filter(value=>value!==id);preferences.auxiliaryProfile=preferences.auxiliaryProfiles[0]||preferences.mainProfile;for(const task of textApiTasks)if(preferences[task.field]===id)preferences[task.field]=preferences.mainProfile;}
  function moveAuxiliary(index:number,offset:number){const ids=preferences.auxiliaryProfiles||[],to=index+offset;if(to<0||to>=ids.length||busy.value)return;[ids[index],ids[to]]=[ids[to],ids[index]];preferences.auxiliaryProfile=ids[0]||preferences.mainProfile;}
  function importPreset(text:string,filename?:string){if(busy.value)return;try{const result=importTavernPreset(text,filename);preferences.presets.push(...result.entries);preferences.activePreset=result.id;Object.assign(storyProfile.value||profile(preferences.mainProfile),result.parameters);presetWarnings.value=result.warnings;problem.value='';notice.value=`已导入 ${result.name}，共 ${result.entries.length} 条；受支持的采样参数已应用到当前剧情接口。`;}catch(e){problem.value=message(e);}}
  function exportPreset(){download(`${presetSets.value.find(s=>s.id===currentPreset.value)?.name||'预设'}.json`,exportTavernPreset(copy(presetEntries.value),storyProfile.value||profile(preferences.mainProfile)));}
  function addPresetSet(){const id=uid();preferences.activePreset=id;preferences.presets.push({id:uid(),setId:id,setName:'新预设',name:'主提示词',identifier:'main',role:'system',position:'before',depth:4,order:100,content:'',enabled:true});presetWarnings.value=[];}
  function addPresetEntry(){const name=presetSets.value.find(s=>s.id===currentPreset.value)?.name||'原有预设';preferences.presets.push({id:uid(),setId:currentPreset.value,setName:name,name:'新条目',identifier:uid(),role:'system',position:'before',depth:4,order:100,content:'',enabled:true});}
  function removePresetSet(){preferences.presets=preferences.presets.filter(p=>setId(p)!==currentPreset.value);preferences.activePreset=presetGroups(preferences.presets)[0]?.id;if(!preferences.presets.length)addPresetSet();presetWarnings.value=[];}
  function movePreset(index:number,offset:number){const list=presetEntries.value,to=index+offset;if(to<0||to>=list.length)return;const a=preferences.presets.indexOf(list[index]),b=preferences.presets.indexOf(list[to]);[preferences.presets[a],preferences.presets[b]]=[preferences.presets[b],preferences.presets[a]];}
  void boot();
  return {deleteSession,deletingSessionId,preferences,sessions,sessionId,panel,credentials,loading,authorized,busy,workingMemory,newGameDraft,workingPersona,creatingGame,personaNotice,resetNewGameDraft,assistPersona,stopPersona,notice,problem,input,lastSaved,active,state,memories,forum,theaters,presetEntries,presetSets,currentPreset,presetWarnings,addPresetSet,addPresetEntry,removePresetSet,localService,rememberApiKeys,setRememberApiKeys,clearApiKeys,connectionReady,connectProfile,fetchModels,auxiliaryProfiles,storyProfile,summaryProfile,suggestionsProfile,personaProfile,apiSelectable,apiIssues,apiReady,configuringApis,continuationAttempt,confirmAllApis,ensureApiConfiguration,enterStory,moveAuxiliary,canContinue,authorize,create,open,home,stop,generate,changeVariant,rewind,edit,savePersona,loadPlace,toggleForumLike,replyToForum,saveMemory,removeMemory,indexMemories,searchMemory,exportBackup,importBackup,exportBook,addProfile,removeProfile,importPreset,exportPreset,movePreset,save:safePersist};
}
export type Workspace = ReturnType<typeof useWorkspace>;
export type ViewModel = UnwrapNestedRefs<Workspace>;
