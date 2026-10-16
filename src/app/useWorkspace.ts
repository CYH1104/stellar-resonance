import {activeCommitments,buildRecallQuery,memoryContext,memoryReady,memorySignature,memoryState,memoryText,normalizeMemoryResult,vectorCurrent,visibleSourceStillMatches,type MemoryRequest} from '../domain/memories';
import {isSpiritDiary} from '../domain/spiritDiary';
import {syncCharacterFacts} from '../domain/characterFacts';
import {defaultJourneyName} from '../domain/journeyName';
import { computed, reactive, ref, watch, type UnwrapNestedRefs } from 'vue';
import type { Gateway, GenerateRequest, LocalService, Memory, Panel, Persona, Preferences, Profile, Session, Snapshot, Variant } from '../domain/contracts';
import {addForumAIReply,backup, effectiveEvents, cleanPreferences, copy, defaults, editMessage, finishVariant, likeForum, newSession, now, parseBackup, replyForum, rollDice, selected, selectVariant, stateAt, truncate, uid, visibleForum, visibleMemories } from '../domain/story';
import { IndexedDbRepository } from '../storage/repository';
import {apiAddress,type LocalApiCredentials} from '../storage/apiCredentials';
import {drawSpecialEvent,awaitingSpecialEvent} from '../domain/randomEvents';
import { MockGateway } from '../gateway/mock';
import { HttpGateway } from '../gateway/http';
import { retrieve } from '../memory/retrieval';
import { blankPersona, mergePersonaDraft, normalizePersona } from '../domain/persona';
import {activePromptEntries,importTavernPreset,exportTavernPreset,presetGroups,setId,cleanSampling,pinnedPromptIds,reorderPresetEntries,newPresetEntries} from '../domain/presets';
import {defaultTheaters,visibleTheaters} from '../domain/theaters';
import {apiConfigurationIssues,apiFieldIssues,auxiliaryApis,requiredApis,storyApi,taskApi,textApiTasks} from '../domain/apis';

export function useWorkspace() {
  const preferences=reactive<Preferences>({...defaults(),activePreset:'legacy',theaters:defaultTheaters()});
  const presetWarnings=ref<string[]>([]);
  const presetSets=computed(()=>presetGroups(preferences.presets));
  const currentPreset=computed(()=>presetSets.value.find(g=>g.id===preferences.activePreset)?.id||presetSets.value[0]?.id||'legacy');
  const presetParameters=computed(()=>{const map=preferences.presetParameters||=( {});return map[currentPreset.value]||=(cleanSampling(taskApi(preferences,'story')||preferences.profiles[0]));});
  const presetEntries=computed(()=>preferences.presets.filter(p=>setId(p)===currentPreset.value));
  const sessions=ref<Session[]>([]), sessionId=ref(''), panel=ref<Panel>('story');
  const inputDrafts=new Map<string,string>();
  function rememberInput(){if(sessionId.value)inputDrafts.set(sessionId.value,input.value);}
  const workingForumReply=ref(''),forumReplyPost=ref(''),forumReplyError=ref('');let forumController:AbortController|undefined;
  function stopForumReply(){forumController?.abort();}
  watch(()=>[preferences.forumReplyEnabled,preferences.forumReplyProfile,sessionId.value],()=>forumController?.abort());
  const settingsTab=ref<'persona'|'theaters'|'shortcuts'>('persona');
  const localService=ref<LocalService>();
  const newGameDraft=reactive({title:defaultJourneyName(sessions.value.map(s=>s.name)),opening:'',wish:'',persona:blankPersona()});
  const workingPersona=ref(false),creatingGame=ref(false),personaNotice=ref('');
  let personaController:AbortController|undefined;
  function resetNewGameDraft(){if(workingPersona.value||creatingGame.value)return;Object.assign(newGameDraft,{title:defaultJourneyName(sessions.value.map(s=>s.name)),opening:'',wish:'',persona:blankPersona()});personaNotice.value='';}
  function stopPersona(){personaController?.abort();}
  async function assistPersona(){
    if(workingPersona.value||creatingGame.value||busy.value)return;
    if(!newGameDraft.wish.trim()){problem.value='先写下你想玩的人设，再点击 AI 帮我写。';return;}
    if(!localService.value){problem.value='AI 人设填写需要连接本机世界卡后台。';return;}
    const p=personaProfile.value!;
    if(!ensureApiConfiguration())return;
    if(!connectionReady(p)||!key(p)){problem.value='请先在API 设置填写地址、模型名和 Key，并确认使用此服务；人设草稿会保留。';panel.value='settings';return;}
    workingPersona.value=true;problem.value='';personaNotice.value='AI 正在结合世界观补全人设…';personaController=new AbortController();
    try{const result=await http.assistPersona(newGameDraft.wish,copy(newGameDraft.persona),copy(p),key(p),personaController.signal);personaController.signal.throwIfAborted();Object.assign(newGameDraft.persona,mergePersonaDraft(newGameDraft.persona,result));personaNotice.value='已补全空白栏位，原有内容保留。请检查并修改，满意后再开始游戏。';}
    catch(e){personaNotice.value='现有表格已保留。';problem.value=personaController.signal.aborted?'已取消人设生成，表格未修改。':message(e);}
    finally{workingPersona.value=false;personaController=undefined;}
  }
  const credentials=reactive<Record<string,string>>({});
  watch(()=>{const p=preferences.profiles.find(p=>p.id===(preferences.forumReplyProfile||preferences.mainProfile));return[p?.apiBaseUrl,p?.model,credentials[p?.id||'']];},()=>forumController?.abort());
  const rememberApiKeys=ref(true);
  const approved=reactive<Record<string,string>>({});
  const connectionSignature=(p:Profile)=>JSON.stringify([apiAddress(p.apiBaseUrl),p.model,credentials[p.id]||'']);
  const connectionReady=(p:Profile)=>approved[p.id]===connectionSignature(p);
  async function connectProfile(p:Profile){try{const missing=apiFieldIssues(p,credentials[p.id]);if(missing.length)throw new Error(`请填写：${missing.join('、')}`);const signature=connectionSignature(p);await http.configure(copy(p));if(signature!==connectionSignature(p))throw new Error('配置已改变，请重新确认。');approved[p.id]=signature;problem.value='';if(!loading.value)await persist();notice.value=rememberApiKeys.value?'当前接口已确认并保存在此浏览器；尚未进行模型生成测试。':'当前接口已确认，仅在本次页面使用。';return true;}catch(e){problem.value=message(e);return false;}}
  async function fetchModels(p:Profile,signal:AbortSignal){if(!localService.value)throw new Error('请先连接本机后台，再获取模型。');return http.models(p.apiBaseUrl||'',key(p),signal);}
  async function testProfile(p:Profile,embedding:boolean,signal:AbortSignal){if(!localService.value)throw new Error('本机后台未连接，请用启动预览.bat 启动。');const issues=apiFieldIssues(p,key(p));if(issues.length)throw new Error('请填写：'+issues.join('、'));return http.probe(copy(p),key(p),embedding?'embedding':'text',signal);}
  const generationPhase=ref(''),generationStarted=ref(0);
  const loading=ref(true), authorized=ref(false), busy=ref(false), workingMemory=ref(false);
  const configuringApis=ref(false),pendingSessionId=ref(''),continuationAttempt=ref(0),repairingState=ref(false);
  const auxiliaryProfiles=computed(()=>auxiliaryApis(preferences));
  const storyProfile=computed(()=>storyApi(preferences));
  const summaryProfile=computed(()=>taskApi(preferences,'summary'));
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
  const pendingRandomEvent=computed(()=>active.value?.turns.some(t=>awaitingSpecialEvent(t.randomEvent))||false);
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
      try{const service=await http.bootstrap();if(service){localService.value=service;for(const session of sessions.value)syncCharacterFacts(session,service.dataset,service.characterFacts);preferences.mode='server';await Promise.resolve();authorized.value=true;notice.value='服务器角色卡已载入 · 请在API 设置连接 AI';}}catch{problem.value='本机资料后台不可用；请使用新版 bat 启动。';}
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
    try{const session=newSession(name,persona,opening);if(localService.value){const game=await http.newGame(copy(persona));session.initial=game.initial;session.opening=opening.trim()||game.opening;session.sourceDataset=game.dataset;}rememberInput();sessions.value.unshift(session);sessionId.value=session.id;panel.value='story';input.value='';problem.value='';await safePersist();}catch(e){problem.value=message(e);}finally{creatingGame.value=false;}
  }
  function open(id:string) {if(busy.value)return;if(!ensureApiConfiguration()){pendingSessionId.value=id;return;}rememberInput();pendingSessionId.value='';sessionId.value=id;panel.value='story';input.value=inputDrafts.get(id)||'';problem.value='';}
  function home() {if(busy.value)return;rememberInput();pendingSessionId.value='';sessionId.value='';panel.value='story';input.value='';}
  function deleteSession(id:string):Promise<boolean>{
    if(loading.value||busy.value||workingMemory.value||workingPersona.value||creatingGame.value||deletionTask)return Promise.resolve(false);
    const target=sessions.value.find(s=>s.id===id);if(!target)return Promise.resolve(false);
    if(!storageReady){problem.value='本地存储不可用，未删除存档。';return Promise.resolve(false);}
    const value=snapshot();value.sessions=value.sessions.filter(s=>s.id!==id);
    busy.value=true;deletingSessionId.value=id;problem.value='';notice.value='正在删除存档…';
    // Share the write queue; later autosaves wait until the in-memory removal is committed.
    const write=writes.catch(()=>{}).then(()=>repository.write(value));writes=write;
    deletionTask=(async()=>{
      try{await write;inputDrafts.delete(id);sessions.value=sessions.value.filter(s=>s.id!==id);if(pendingSessionId.value===id)pendingSessionId.value='';if(sessionId.value===id){sessionId.value='';input.value='';panel.value='saves';}lastSaved.value=now();notice.value=`已删除存档《${target.name}》`;return true;}
      catch(e){problem.value=`删除失败，存档仍保留：${message(e)}`;notice.value='存档未删除，请重试';return false;}
      finally{busy.value=false;deletingSessionId.value='';deletionTask=undefined;}
    })();return deletionTask;
  }
  function stop(){controller?.abort();}
  let memoryController:AbortController|undefined;
  function stopMemory(){memoryController?.abort();}
  function memoryLedger(session:Session,before=session.turns.length){const order=new Map(session.turns.map((t,i)=>[t.id,i]));return visibleMemories(session,before).slice().sort((a,b)=>(order.get(a.sourceTurn||'')??-1)-(order.get(b.sourceTurn||'')??-1));}
  function roundMemoryInput(session:Session,index:number):MemoryRequest{
    const turn=session.turns[index],v=turn&&selected(turn);if(!v||v.status!=='complete'||!v.outcome)throw new Error('只能整理已完成的剧情。');
    return {turnId:turn.id,variantId:v.id,input:turn.input,story:v.text,event:v.outcome.event,diceEvent:copy(v.outcome.diceEvent),before:memoryState(stateAt(session,index)),after:memoryState(stateAt(session,index+1)),priorCommitments:activeCommitments(memoryLedger(session,index))};
  }
  function memoryNeedsWork(session:Session,index:number){const turn=session.turns[index],v=turn&&selected(turn);if(!v||v.status!=='complete'||!v.outcome)return false;const m=session.memories.find(m=>m.kind==='event'&&m.sourceTurn===turn.id&&m.sourceVariant===v.id);return !m||!memoryReady(m)||m.sourceFingerprint!==memorySignature(roundMemoryInput(session,index));}
  const pendingMemoryCount=computed(()=>active.value?active.value.turns.filter(t=>{const v=selected(t);return v?.status==='complete'&&v.outcome&&!active.value!.memories.some(m=>m.kind==='event'&&m.sourceTurn===t.id&&m.sourceVariant===v.id&&memoryReady(m));}).length:0);
  function vectorStatus(m:Memory){if(m.kind==='event'&&!memoryReady(m))return m.status==='failed'?'补记失败':'待补记';if(m.indexError)return '索引失败';const p=profile(preferences.embeddingProfile);if(vectorCurrent(m,fingerprint(p)))return '已建索引';return m.vector?'索引待更新':preferences.vectorEnabled?'待建索引':'未开启向量';}
  async function encodeMemories(session:Session,items:Memory[],signal:AbortSignal){
    if(!preferences.vectorEnabled)return;const p=copy(profile(preferences.embeddingProfile)),model=fingerprint(p),signature=connectionSignature(p);
    if(localService.value&&(!connectionReady(p)||apiFieldIssues(p,key(p)).length))throw new Error('请先保存向量 API。');
    const pending=items.filter(m=>memoryReady(m)&&!vectorCurrent(m,model));
    for(let i=0;i<pending.length;i+=16){signal.throwIfAborted();const batch=pending.slice(i,i+16),texts=batch.map(m=>m.text);
      const vectors=await gateway().embed(texts,p,key(p),signal);signal.throwIfAborted();
      if(vectors.length!==texts.length||vectors.some(v=>!Array.isArray(v)||!v.length||v.length>8192||v.some(n=>!Number.isFinite(n))))throw new Error('向量结果不完整，记忆文字已保留。');
      if(!sessions.value.includes(session)||signature!==connectionSignature(profile(p.id))||!preferences.vectorEnabled)throw new Error('向量配置或存档已改变，请重试索引。');
      batch.forEach((m,j)=>{if(session.memories.includes(m)&&m.text===texts[j]&&memoryReady(m)){m.vector={model,values:vectors[j],text:texts[j]};delete m.indexError;}});await persist();
    }
  }
  async function writeRoundMemory(session:Session,index:number,signal:AbortSignal){
    const request=copy(roundMemoryInput(session,index)),sourceFingerprint=memorySignature(request),p=copy(summaryProfile.value!);
    let m=session.memories.find(m=>m.kind==='event'&&m.sourceTurn===request.turnId&&m.sourceVariant===request.variantId);
    if(m?.record&&memoryReady(m)&&m.sourceFingerprint===sourceFingerprint)return;
    if(!m){m={id:uid(),kind:'event',text:'本轮记忆待整理。',createdAt:now(),sourceTurn:request.turnId,sourceVariant:request.variantId};session.memories.push(m);m=session.memories.find(x=>x.id===m!.id)!;}
    const target=m;target.status='pending';target.sourceFingerprint=sourceFingerprint;delete target.record;delete target.vector;delete target.error;await persist();
    try{
      if(localService.value&&(!connectionReady(p)||apiFieldIssues(p,key(p)).length))throw new Error('请先保存记忆整理 API。');
      const signature=connectionSignature(p),result=normalizeMemoryResult(await gateway().memory(request,p,key(p),signal),request);signal.throwIfAborted();
      if(!sessions.value.includes(session)||!visibleSourceStillMatches(session,request.turnId,request.variantId)||memorySignature(roundMemoryInput(session,index))!==sourceFingerprint||signature!==connectionSignature(profile(p.id)))throw new Error('剧情或接口已改变，本次记忆未应用。');
      target.record=result;target.status='ready';target.text=memoryText(target);delete target.error;delete target.indexError;
    }catch(e){target.status=signal.aborted?'pending':'failed';target.error=signal.aborted?'记忆整理已停止。':'记忆整理失败，请补记。';await safePersist();throw e;}
    await persist();
    if(preferences.vectorEnabled){try{await encodeMemories(session,[target],signal);}catch(e){target.indexError=signal.aborted?'索引已停止。':'索引失败，记忆文字已保留。';await safePersist();if(signal.aborted)throw e;notice.value='记忆已保存，向量索引待重试。';}}
  }
  async function retryMemory(id?:string){
    const session=active.value;if(!session||busy.value||workingMemory.value)return;if(!ensureApiConfiguration())return;
    workingMemory.value=true;problem.value='';const current=new AbortController();memoryController=current;
    try{for(let i=0;i<session.turns.length;i++){const t=session.turns[i],v=selected(t);if(!v||!memoryNeedsWork(session,i))continue;const m=session.memories.find(m=>m.sourceTurn===t.id&&m.sourceVariant===v.id&&m.kind==='event');if(id&&m?.id!==id)continue;current.signal.throwIfAborted();await writeRoundMemory(session,i,current.signal);}notice.value='记忆已保存。';}
    catch(e){problem.value=message(e);}finally{workingMemory.value=false;if(memoryController===current)memoryController=undefined;await safePersist();}
  }
  async function recall(session:Session,text:string,before=session.turns.length,contextual=true):Promise<Memory[]> {
    const list=memoryLedger(session,before).filter(memoryReady).reverse();if(!list.length)return [];
    const contextState=stateAt(session,before),recent=session.turns.slice(0,before).flatMap(t=>{const v=selected(t);return v?.status==='complete'&&v.outcome?[v.outcome.event]:[];});
    const query=contextual?buildRecallQuery(text,contextState,recent,memoryLedger(session,before).filter(m=>m.record&&memoryReady(m)).at(-1)?.record?.location):text;let vector:number[]|undefined;const p=copy(profile(preferences.embeddingProfile));
    if(preferences.vectorEnabled&&(preferences.mode==='demo'||key(p)))try{vector=(await gateway().embed([query],p,key(p),controller?.signal||new AbortController().signal))[0];}catch(e){if(controller?.signal.aborted)throw e;notice.value='向量接口不可用，已退回关键词检索';}
    return retrieve(list,query,fingerprint(p),vector);
  }
  async function prepareRandomEvent(session:Session,index:number){
    const turn=session.turns[index],gate=turn.randomEvent;if(!gate||(gate.status!=='preparing'&&gate.status!=='failed'))return;const kind=gate.kind,p=copy(profile(preferences.randomEventProfile||preferences.mainProfile));
    turn.randomEvent={status:'preparing',kind};busy.value=true;problem.value='';generationStarted.value=Date.now();generationPhase.value='正在生成随机事件候选，正文尚未开始…';const current=new AbortController();controller=current;await safePersist();
    try{
      const proposal=localService.value?await http.randomEvent({kind,persona:copy(session.persona),input:turn.input,history:session.turns.slice(Math.max(0,index-6),index).flatMap(t=>{const v=selected(t);return v?.status==='complete'?[{role:'user' as const,content:t.input.slice(-12000)},{role:'assistant' as const,content:v.text.slice(-12000)}]:[];}),presentCharacterIds:stateAt(session,index).characters.filter(c=>c.present).map(c=>c.id)},p,key(p),current.signal):{kind,title:'【演示】'+kind,description:'眼前出现了一个尚未发生的意外情境。你可以拒绝，也可以掷骰决定事件结果。'};
      current.signal.throwIfAborted();turn.randomEvent={status:'pending',proposal};notice.value='随机事件候选已准备，请拒绝或掷骰后再生成正文。';
    }catch(e){turn.randomEvent={status:'failed',kind};problem.value=message(e);notice.value='事件候选未完成，正文尚未生成。可重试或跳过本轮事件。';}
    finally{busy.value=false;if(controller===current)controller=undefined;await safePersist();}
  }
  async function decideRandomEvent(index:number,accept:boolean){
    const session=active.value;if(!session||busy.value||workingMemory.value)return;const turn=session.turns[index],gate=turn?.randomEvent;if(!gate)return;
    if(gate.status==='pending'){turn.randomEvent={status:accept?'accepted':'declined',proposal:gate.proposal};if(accept)turn.dice=rollDice();else delete turn.dice;}
    else if(!accept&&(gate.status==='preparing'||gate.status==='failed')){turn.randomEvent={status:'skipped'};delete turn.dice;}else return;
    await safePersist();await generate(undefined,index);
  }
  async function generate(text?:string,turnIndex?:number,continuePartial=false,stateOnly=false) {
    const session=active.value;if(!session||busy.value||workingMemory.value)return;
    if(!authorized.value){problem.value='请先验证访问资格';return;}
    const p=storyProfile.value!;
    if(!ensureApiConfiguration())return;
    if(localService.value&&session.sourceDataset!==localService.value.dataset){problem.value='这是旧版演示存档，请新建一份服务器世界卡存档测试。原存档仍保留。';return;}
    if(localService.value&&!connectionReady(p)){problem.value='请在API 设置填写服务地址、模型名称，并确认使用此服务。';panel.value='settings';return;}
    if(preferences.mode==='server'&&gateway().capabilities.keyRequired!==false&&!key(p)){problem.value='请在API 设置填写当前接口的 Key';panel.value='settings';return;}
    let index:number;
    if(turnIndex===undefined){if(pendingRandomEvent.value){problem.value='请先决定或跳过当前随机事件，再发送下一轮行动。';return;}const content=(text??input.value).trim();if(!content){problem.value='请先输入本轮行动';return;}if(content.length>16000){problem.value='单条输入超过首版长度限制';return;}const kind=preferences.diceEnabled?drawSpecialEvent():undefined;session.turns.push({id:uid(),input:content,randomEvent:kind?{status:'preparing',kind}:{status:'none'},variants:[],selected:0});index=session.turns.length-1;input.value='';}
    else{index=turnIndex;if(!session.turns[index])return;if(continuePartial&&(!stateOnly&&selected(session.turns[index])?.status!=='incomplete'||!selected(session.turns[index])?.text)){problem.value='当前没有需要续写的正文。';return;}truncate(session,index+1);}
    const turn=session.turns[index];session.suggestions=[];if(turn.randomEvent?.status==='preparing'||turn.randomEvent?.status==='failed'){await prepareRandomEvent(session,index);return;}if(turn.randomEvent?.status==='pending'){notice.value='请先拒绝或掷骰，再生成本轮正文。';return;}const firstAttempt=turn.variants.length===0;const partial=continuePartial?selected(turn)?.text||'':'';if(!continuePartial){turn.variants.push({id:uid(),text:'',status:'incomplete',createdAt:now()});turn.selected=turn.variants.length-1;}const variant=turn.variants[turn.selected];const previousOutcome=stateOnly&&variant.status==='complete'?copy(variant.outcome):undefined;if(!previousOutcome)delete variant.outcome;
    const generationType=continuePartial?'continue':firstAttempt?'normal':'regenerate';continuationAttempt.value=0;repairingState.value=stateOnly;
    busy.value=true;problem.value='';generationStarted.value=Date.now();generationPhase.value='正在检索本地记忆…';controller=new AbortController();let done=false, checkpoint=Date.now();await safePersist();
    try {
      const recalled=stateOnly?visibleMemories(session,index).slice(-8):await recall(session,turn.input,index);
      const request:GenerateRequest={suggestionsEnabled:preferences.suggestionsEnabled!==false,specialEvent:turn.randomEvent?.status==='accepted'?copy(turn.randomEvent.proposal):undefined,sessionId:session.id,turnId:turn.id,persona:copy(session.persona),opening:session.opening,input:turn.input,historyStart:Math.max(0,index-12),history:session.turns.slice(Math.max(0,index-12),index).flatMap(t=>{const v=selected(t);return v?.status==='complete'?[{role:'user' as const,content:t.input},{role:'assistant' as const,content:v.text}]:[];}),memories:memoryContext(recalled,activeCommitments(memoryLedger(session,index))),state:stateAt(session,index),dice:copy(turn.dice),profile:copy(p),presets:[],promptEntries:copy(activePromptEntries(presetEntries.value,generationType)),generationType,theaterSettings:copy(preferences.theaters),continuation:partial?{partial,...(stateOnly?{mode:'state' as const}:{})}:undefined,forumContext:visibleForum(session,index).slice(0,6).map(post=>({authorName:post.authorName,content:post.content.slice(0,1000),replies:(session.forumActivity?.[post.key]?.replies||[]).slice(-3).map(reply=>(reply.kind==='ai'?reply.authorName:session.persona.name)+'：'+reply.text)}))};
      generationPhase.value='等待模型返回（单次请求最长180秒）…';
      for await(const event of gateway().generate(request,key(p),controller.signal)) {
        if(controller.signal.aborted)throw new DOMException('已停止','AbortError');
        if(event.type==='progress'){generationPhase.value=event.phase==='hidden'?'中转站正在返回数据，目前尚无可展示正文（思考内容保持隐藏）…':event.phase==='receiving'?'正在接收正文和隐藏状态…':'等待模型返回…';}
        else if(event.type==='delta'){generationPhase.value='正在接收正文…';if(repairingState.value)continue;variant.text+=event.text;if(Date.now()-checkpoint>700){checkpoint=Date.now();await safePersist();}}
        else if(event.type==='repair'){generationPhase.value='正文已保留，正在补修状态…';repairingState.value=true;continuationAttempt.value=event.attempt;notice.value=`正在补修状态 ${event.attempt}/${event.maxAttempts}：${event.reason}`;}
        else if(event.type==='continuation'){generationPhase.value='回复截断，正在自动续写…';repairingState.value=false;continuationAttempt.value=event.attempt;notice.value=`检测到截断，正在自动续写 ${event.attempt}/${event.maxAttempts}…`;}
        else if(event.type==='done'){
          let outcome=event.outcome;
          if(previousOutcome){outcome={...outcome,event:previousOutcome.event,suggestions:outcome.suggestions?.length?outcome.suggestions:previousOutcome.suggestions,player:{...previousOutcome.player,...outcome.player},...(previousOutcome.diceEvent?{diceEvent:previousOutcome.diceEvent}:{}),forum:previousOutcome.forum?.length?previousOutcome.forum:outcome.forum,theaters:outcome.theaters?.map(scene=>previousOutcome.theaters?.find(old=>old.slot===scene.slot&&old.kind===scene.kind&&(!(preferences.theaters||[]).some(t=>t.slot===scene.slot&&isSpiritDiary(t))||!!old.diary)&&(old.content.trim()||old.messages?.some(m=>m.content.trim())))||scene)};}
          finishVariant(session,index,variant,outcome);variant.suggestions=[...(outcome.suggestions||[])];done=true;
        }
      }
      if(!done)throw new Error('未收到完整回复，已保留部分内容。');
      generationPhase.value='正文已完成，正在整理本轮记忆…';
      try{await writeRoundMemory(session,index,controller.signal);}catch(e){notice.value='正文已保存，本轮记忆待补记。';problem.value=message(e);}
      if(stateOnly&&!problem.value)notice.value='状态与记忆已保存。';
    }catch(e){problem.value=message(e);}
    finally{busy.value=false;continuationAttempt.value=0;repairingState.value=false;controller=undefined;session.updatedAt=now();await safePersist();const last=session.memories.find(m=>m.kind==='event'&&m.sourceTurn===turn.id&&m.sourceVariant===variant.id);if(last&&!memoryReady(last))notice.value='正文已保存，本轮记忆待补记。';else if(last?.indexError)notice.value='记忆已保存，向量索引待重试。';}
  }
  async function changeVariant(index:number,variant:number){if(!active.value||busy.value)return;try{selectVariant(active.value,index,variant);await safePersist();}catch(e){problem.value=message(e);}}
  async function rewind(count:number){if(!active.value||busy.value)return;try{truncate(active.value,count);await safePersist();notice.value='已恢复对应剧情状态与记忆';}catch(e){problem.value=message(e);}}
  async function edit(index:number,role:'user'|'assistant',text:string){if(!active.value||busy.value)return;try{editMessage(active.value,index,role,text);await safePersist();notice.value='修改已保存，已保留后续对话和已有状态';}catch(e){problem.value=message(e);}}
  async function savePersona(persona:Persona){if(!active.value||busy.value)return;try{const value=normalizePersona(persona);active.value.persona=value;Object.assign(active.value.initial.player,{mentalPowerLevel:value.mentalPowerLevel||undefined,name:value.name,primaryGender:value.primaryGender,secondaryGender:value.secondaryGender,identity:value.identity,spiritAnimal:value.spiritAnimal});await safePersist();}catch(e){problem.value=message(e);}}
  async function loadPlace(id:string){try{return await http.place(id);}catch(e){problem.value=message(e);return undefined;}}
  async function toggleForumLike(key:string){if(!active.value||busy.value||workingMemory.value)return;try{likeForum(active.value,key);await safePersist();}catch(e){problem.value=message(e);}}
  async function replyToForum(keyValue:string,text:string):Promise<boolean>{
    const session=active.value;if(!session||busy.value||workingMemory.value||workingForumReply.value)return false;
    let replyId:string;try{replyId=replyForum(session,keyValue,text);await persist();}catch(e){problem.value=message(e);return false;}
    notice.value='评论已保存到本机';if(!preferences.forumReplyEnabled)return true;
    await requestForumReply(session,keyValue,replyId);return true;
  }
  async function retryForumReply(keyValue:string,replyId:string){
    const session=active.value;if(!session||busy.value||workingMemory.value||workingForumReply.value||!preferences.forumReplyEnabled)return;
    await requestForumReply(session,keyValue,replyId);
  }
  async function requestForumReply(session:Session,keyValue:string,replyId:string){
    const selectedPost=visibleForum(session).find(post=>post.key===keyValue),activity=session.forumActivity?.[keyValue];const parent=activity?.replies.findIndex(r=>r.id===replyId&&r.kind!=='ai')??-1;
    if(!selectedPost||!activity||parent<0||activity.replies.some(r=>r.kind==='ai'&&r.replyTo===replyId))return;
    forumReplyPost.value=keyValue;forumReplyError.value='';const p=copy(profile(preferences.forumReplyProfile||preferences.mainProfile));
    if(!localService.value||apiFieldIssues(p,key(p)).length||!connectionReady(p)){forumReplyError.value='你的评论已保存。请先保存所选论坛回复 API 的配置。';return true;}
    const comments=[...(selectedPost.comments||[]).map(c=>({authorName:c.authorName,content:c.content})),...activity.replies.slice(0,parent+1).map(r=>({authorName:r.kind==='ai'?r.authorName!:session.persona.name,content:r.text}))].slice(-12);
    const signature=connectionSignature(p),current=new AbortController();forumController=current;workingForumReply.value=keyValue;
    try{
      const reply=await http.forumReply({userName:session.persona.name,post:{authorName:selectedPost.authorName,content:selectedPost.content},comments},p,key(p),current.signal);
      current.signal.throwIfAborted();if(!sessions.value.some(s=>s.id===session.id)||signature!==connectionSignature(profile(p.id)))throw new Error('存档或接口已改变，本次回复未应用。');
      addForumAIReply(session,keyValue,replyId,reply);await persist();notice.value='角色／NPC 已回复你的评论';
    }catch(e){const detail=current.signal.aborted?'AI 回复已停止。':message(e);forumReplyError.value=detail+(/评论已(?:保留|保存)/.test(detail)?'':' 你的评论已保留。');}
    finally{if(forumController===current){forumController=undefined;workingForumReply.value='';}}return true;
  }
  async function saveMemory(text:string,id?:string){const session=active.value;if(!session||busy.value||workingMemory.value)return;const m=session.memories.find(x=>x.id===id);if(m?.record){if(text.length>3000){problem.value='记忆补充最多3000字。';return;}m.annotation=text.trim();m.text=memoryText(m);delete m.vector;delete m.indexError;}else if(text.trim()){if(m){m.text=text.trim();delete m.vector;delete m.indexError;}else session.memories.push({id:uid(),text:text.trim(),kind:'note',createdAt:now()});}await safePersist();}
  async function removeMemory(id:string){if(!active.value||busy.value||workingMemory.value)return;active.value.memories=active.value.memories.filter(m=>m.id!==id);await safePersist();}
  async function indexMemories(){const session=active.value;if(!session||busy.value||workingMemory.value)return;if(!preferences.vectorEnabled){problem.value='请先开启向量检索并配置向量 API。';return;}workingMemory.value=true;problem.value='';const current=new AbortController();memoryController=current;try{await encodeMemories(session,visibleMemories(session),current.signal);notice.value='记忆索引已保存。';}catch(e){for(const m of visibleMemories(session))if(memoryReady(m)&&!vectorCurrent(m,fingerprint(profile(preferences.embeddingProfile))))m.indexError='索引失败，记忆文字已保留。';problem.value=message(e);}finally{workingMemory.value=false;if(memoryController===current)memoryController=undefined;await safePersist();}}
  async function searchMemory(query:string):Promise<Memory[]>{if(!active.value)return[];if(!query.trim())return memories.value;try{return await recall(active.value,query,active.value.turns.length,false);}catch(e){problem.value=message(e);return[];}}
  function download(filename:string,content:string,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportBackup(){download(`群星共振-备份-${new Date().toISOString().slice(0,10)}.json`,backup(snapshot()));notice.value='备份已导出，不包含 Key';}
  async function importBackup(text:string,replace=false){if(busy.value||workingMemory.value)return;try{const value=parseBackup(text);if(localService.value)for(const session of value.sessions)syncCharacterFacts(session,localService.value.dataset,localService.value.characterFacts);if(replace){inputDrafts.clear();sessions.value=value.sessions;Object.assign(preferences,value.preferences);sessionId.value='';}else{for(const s of value.sessions){s.id=uid();s.name+= '（导入）';sessions.value.push(s);}}await persist();problem.value='';notice.value='备份已恢复';}catch(e){problem.value=message(e);}}
  function exportBook(){const s=active.value;if(!s)return;const escape=(x:string)=>x.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');const body=s.turns.map(t=>{const v=selected(t);return v?.status==='complete'?`<section><p class="action">${escape(t.input)}</p><p>${escape(v.text)}</p></section>`:'';}).join('');download(`${s.name}-故事.html`,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(s.name)}</title><style>body{max-width:44rem;margin:3rem auto;padding:0 1.5rem;font:18px/1.8 system-ui;color:#222}p{white-space:pre-wrap}.action{color:#666}section{margin-bottom:2rem}</style><h1>${escape(s.name)}</h1><p>${escape(s.opening)}</p>${body}</html>`,'text/html');}
  function addProfile(){if(preferences.profiles.length>=30){problem.value='接口总数最多30个，请先移除不需要的副 API。';return '';}const id=uid();preferences.profiles.push({id,name:`副 API ${(preferences.auxiliaryProfiles?.length||0)+1}`,providerId:'approved-provider',model:'',temperature:0.7,maxTokens:1600});(preferences.auxiliaryProfiles||=[]).push(id);preferences.auxiliaryProfile=preferences.auxiliaryProfiles[0]||preferences.mainProfile;return id;}
  function removeProfile(id:string){if(id===preferences.mainProfile||id===preferences.embeddingProfile)return;preferences.profiles=preferences.profiles.filter(p=>p.id!==id);delete credentials[id];delete approved[id];preferences.auxiliaryProfiles=(preferences.auxiliaryProfiles||[]).filter(value=>value!==id);preferences.auxiliaryProfile=preferences.auxiliaryProfiles[0]||preferences.mainProfile;for(const task of textApiTasks)if(preferences[task.field]===id)preferences[task.field]=preferences.mainProfile;if(preferences.suggestionsProfile===id)preferences.suggestionsProfile=preferences.mainProfile;if(preferences.randomEventProfile===id)preferences.randomEventProfile=preferences.mainProfile;if(preferences.forumReplyProfile===id){preferences.forumReplyProfile=preferences.mainProfile;forumController?.abort();}}
  function moveAuxiliary(index:number,offset:number){const ids=preferences.auxiliaryProfiles||[],to=index+offset;if(to<0||to>=ids.length||busy.value)return;[ids[index],ids[to]]=[ids[to],ids[index]];preferences.auxiliaryProfile=ids[0]||preferences.mainProfile;}
  function importPreset(text:string,filename?:string){if(busy.value)return;try{const result=importTavernPreset(text,filename);preferences.presets.push(...result.entries);preferences.activePreset=result.id;(preferences.presetParameters||={})[result.id]={...cleanSampling(taskApi(preferences,'story')||profile(preferences.mainProfile)),...result.parameters};presetWarnings.value=result.warnings;problem.value='';notice.value=`已导入 ${result.name}，共 ${result.entries.length} 条；采样参数与当前预设单独保存，切换预设会一并切换。`;}catch(e){problem.value=message(e);}}
  function exportPreset(){download(`${presetSets.value.find(s=>s.id===currentPreset.value)?.name||'预设'}.json`,exportTavernPreset(copy(presetEntries.value),storyProfile.value||profile(preferences.mainProfile)));}
  function addPresetSet(){const id=uid();preferences.activePreset=id;preferences.presets.push(...newPresetEntries(id,'新预设'));(preferences.presetParameters||={})[id]=cleanSampling(taskApi(preferences,'story')||preferences.profiles[0]);presetWarnings.value=[];}
  function addPresetEntry(){const name=presetSets.value.find(s=>s.id===currentPreset.value)?.name||'原有预设';preferences.presets.push({id:uid(),setId:currentPreset.value,setName:name,name:'新条目',identifier:uid(),role:'system',position:'before',depth:4,order:100,content:'',enabled:true});}
  function removePresetSet(){if(busy.value)return;delete preferences.presetParameters?.[currentPreset.value];preferences.presets=preferences.presets.filter(p=>setId(p)!==currentPreset.value);preferences.activePreset=presetGroups(preferences.presets)[0]?.id;if(!preferences.presets.length)addPresetSet();presetWarnings.value=[];}
  function movePresetTo(from:number,to:number){if(busy.value)return;const rows=reorderPresetEntries(presetEntries.value,from,to);let i=0;preferences.presets=preferences.presets.map(p=>setId(p)===currentPreset.value?rows[i++]:p);}
  function movePreset(index:number,offset:number){movePresetTo(index,index+offset);}
  function duplicatePresetSet(){if(busy.value)return;const rows=copy(presetEntries.value),params=copy(presetParameters.value),id=uid(),name=(presetSets.value.find(s=>s.id===currentPreset.value)?.name||'预设')+'（副本）';preferences.presets.push(...rows.map(p=>({...p,id:uid(),setId:id,setName:name})));(preferences.presetParameters||={})[id]=params;preferences.activePreset=id;}
  function removePresetEntry(id:string){if(busy.value)return;const p=presetEntries.value.find(p=>p.id===id);if(!p||pinnedPromptIds.includes(p.identifier||''))return;preferences.presets=preferences.presets.filter(p=>p.id!==id);}
  void boot();
  return {retryMemory,pendingMemoryCount,stopMemory,vectorStatus,retryForumReply,pendingRandomEvent,decideRandomEvent,workingForumReply,forumReplyPost,forumReplyError,stopForumReply,settingsTab,deleteSession,deletingSessionId,preferences,sessions,sessionId,panel,credentials,loading,authorized,busy,workingMemory,newGameDraft,workingPersona,creatingGame,personaNotice,resetNewGameDraft,assistPersona,stopPersona,notice,problem,input,lastSaved,active,state,memories,forum,theaters,presetEntries,presetSets,currentPreset,presetParameters,duplicatePresetSet,removePresetEntry,movePresetTo,presetWarnings,addPresetSet,addPresetEntry,removePresetSet,localService,rememberApiKeys,setRememberApiKeys,clearApiKeys,connectionReady,connectProfile,fetchModels,testProfile,generationPhase,generationStarted,auxiliaryProfiles,storyProfile,summaryProfile,personaProfile,apiSelectable,apiIssues,apiReady,configuringApis,continuationAttempt,repairingState,confirmAllApis,ensureApiConfiguration,enterStory,moveAuxiliary,canContinue,authorize,create,open,home,stop,generate,repairState:(index:number)=>generate(undefined,index,true,true),changeVariant,rewind,edit,savePersona,loadPlace,toggleForumLike,replyToForum,saveMemory,removeMemory,indexMemories,searchMemory,exportBackup,importBackup,exportBook,addProfile,removeProfile,importPreset,exportPreset,movePreset,save:safePersist};
}
export type Workspace = ReturnType<typeof useWorkspace>;
export type ViewModel = UnwrapNestedRefs<Workspace>;
