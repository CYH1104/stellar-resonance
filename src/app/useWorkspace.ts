import {cleanNativePresetConfig,type NativePresetConfig} from '../domain/nativePreset';
import {randomEventsAvailable} from '../domain/featureAvailability';
import {createCloudSave,parseCloudSave,parseWorkspaceBackup,mergeCloudSession} from '../domain/cloudBackup';
import {remapBackupArchive,cleanBackupArchive} from '../domain/backupArchive';
import {collectWorkspaceArchive,applyWorkspaceArchive} from '../storage/workspaceArchive';
import {flushBackupEditors} from './backupFlushers';
import {ensureTerminalCodes} from './terminalCodeRegistry';
import {applyTerminalBatch} from '../domain/terminalMain';
import {planTerminalAuto,applyTerminalAuto,terminalAutoJob,terminalAutoJobId,terminalJobFacts,terminalCommittedFacts,terminalSocialSignal,type TerminalAutoMode} from '../domain/terminalAuto';
import {saveOnLeave} from './saveOnLeave';
import {terminalFollowupJob} from '../domain/terminalFollowup';
import {terminalAnchor,terminalAnchorActive,terminalJobTurnIndex} from '../domain/terminalLedger';
import {factAudienceCovers} from '../domain/knowledge';
import {markGenerationComplete,startGeneration,finishGeneration} from './generationCompletion';
import {terminalRecall,syncTerminalMemoryNotes,isTerminalMemoryNote,terminalLatestBucket,terminalNoteKey,terminalNoteIsPrivate,terminalSegmentCandidates,formatTerminalSegment,memoryChunks} from '../domain/terminalLedger';
import {recallScoped,labelNarratorFacts,derivedFacts} from '../memory/recall';
import {variableChangeLog} from '../domain/variableChangeLog';
import {readCloudToken} from '../storage/cloudTokens';
import {generationSections,type RecallTrace} from '../domain/runLogSections';
import {stateUpdateDetails as logStateDetails} from '../domain/stateUpdate';
import {missingRepairPlan,repairNeedsState} from '../domain/repairPlan';
import {prepareForumLikes} from '../domain/forumLikes';
import {createRepairAudit} from '../domain/repairAudit';
import {mergeRepairOutcome,compareRepair,type RepairComparison} from '../domain/stateRepair';
import {replayIssues} from '../domain/stateReplay';
import {captureRevision,migrateMemoryLedger,sourceFor,taskFor,rebindMemorySources} from '../domain/memoryLedger';
import {confirmPresetCompatibility} from '../domain/presetCompatibility';
import {runRegex} from '../domain/regexRunner';
import {exportApiSettings,parseApiSettings} from '../domain/apiTransfer';
import {accountStorage} from '../storage/accountScope';
import {useFormatErrors} from './useFormatErrors';
import {recordDiagnostic} from './developerDiagnostics';
import {mergeRepairTheaters,reconcileRepairScenes} from '../domain/roundHealth';
import {useWorldbooks,mergeWorldbookBackup,sessionLore} from './useWorldbooks';
import {activeCommitments,buildRecallQuery,memoryContext,memoryReady,memorySignature,memoryState,memoryText,normalizeMemoryResult,vectorCurrent,visibleSourceStillMatches,type MemoryRequest} from '../domain/memories';
import {factId,factLabel} from '../domain/knowledge';
import {syncCharacterFacts} from '../domain/characterFacts';
import {defaultJourneyName} from '../domain/journeyName';
import { computed, reactive, ref, watch, nextTick, onScopeDispose, type UnwrapNestedRefs } from 'vue';
import type { Gateway, GenerateRequest, LocalService, Memory, Panel, Persona, Preferences, Profile, Session, Snapshot, Variant, WorldState } from '../domain/contracts';
import {addForumAIReply,addForumAIReplies,backup, effectiveEvents, cleanPreferences, copy, defaults, editMessage, finishVariant, likeForum, newSession, now, parseBackup, replyForum, rollDice, saveFailureLocation, selected, selectVariant, stateAt, truncate, uid, visibleForum, visibleMemories } from '../domain/story';
import { IndexedDbRepository } from '../storage/repository';
import {apiAddress,type LocalApiCredentials} from '../storage/apiCredentials';
import {drawSpecialEvent,awaitingSpecialEvent} from '../domain/randomEvents';
import { MockGateway } from '../gateway/mock';
import { HttpGateway } from '../gateway/http';
import { blankPersona, mergePersonaDraft, normalizePersona } from '../domain/persona';
import {activePromptEntries,importTavernPreset,exportTavernPreset,presetGroups,setId,cleanSampling,pinnedPromptIds,reorderPresetEntries,newPresetEntries} from '../domain/presets';
import {defaultTheaters,visibleTheaters} from '../domain/theaters';
import {apiConfigurationIssues,apiFieldIssues,auxiliaryApis,requiredApis,storyApi,taskApi,terminalApiIssues,textApiTasks} from '../domain/apis';
import {setHttpFailureSink,httpNoticeKeyOf,attachHttpNotice} from '../gateway/requestFailure';
import {clearHttpNotices,noticeKeyFor,noticeTextFor,registerHttpNotice,showNotice,httpNoticeDuration} from './notices';
import {safeLogText} from '../domain/logText';
import {httpFailureNotice,httpFailureLog} from './httpFailureText';
import {mergeConfiguration,mergeCredentials} from './configurationMerge';
export interface ConfigurationCommitOptions{
  /** Draft baseline; when present the write is re-merged against live state instead of replacing it. */
  origin?:{preferences?:Preferences;credentials?:Record<string,string>};
  /** Profile ids this save is allowed to confirm over the network. */
  scope?:string[];
}

export function useWorkspace() {
  const repairReport=ref<{sessionId:string;turnId:string;rows:RepairComparison[];problem?:string}>();
  const developerTraces=ref<import('../domain/contracts').DeveloperTrace[]>([]);
  const formatErrors=useFormatErrors(()=>[...Object.values(credentials),readCloudToken('github'),readCloudToken('gitee')]);
  function reportHttpFailureNotice(failure:import('../gateway/requestFailure').HttpFailure):string|undefined{
    // Every channel that reports this failure must produce the same text and the same dedup key, so a raw code,
    // message or task name is redacted before it can reach the top bar or the run log.
    const secrets=[...Object.values(credentials),readCloudToken('github'),readCloudToken('gitee')];
    const redact=(text:string)=>safeLogText(text,secrets,4000);
    const notice=httpFailureNotice({...failure,task:redact(failure.task),...(failure.code!==undefined?{code:redact(failure.code)}:{}),message:redact(failure.message)});
    if(!notice)return;
    registerHttpNotice(notice.message,notice.key);
    showNotice(notice.message,true,httpNoticeDuration,notice.key);
    void formatErrors.record(httpFailureLog({...failure,task:redact(failure.task),...(failure.code!==undefined?{code:redact(failure.code)}:{}),message:redact(failure.message)}),'HTTP_ERROR',active.value?.id||'','','runtime').catch(()=>{});
    return notice.key;
  }
  const disposeHttpFailureSink=setHttpFailureSink(reportHttpFailureNotice);
  onScopeDispose(()=>{disposeHttpFailureSink();clearHttpNotices();});
  const hideFloors=ref((()=>{try{return accountStorage.getItem('academy:auto-hide-floors')!=='false';}catch{return true;}})());
  watch(hideFloors,value=>{try{accountStorage.setItem('academy:auto-hide-floors',String(value));}catch{}});
  const preferences=reactive<Preferences>({...defaults(),activePreset:'legacy',theaters:defaultTheaters()});
  const presetWarnings=ref<string[]>([]);
  const worldbookRuntimeWarnings=ref<string[]>([]);
  const worldbookRuntimeDiagnostics=ref<import('../domain/worldbooks').LoreDiagnostic[]>([]);
  const presetSets=computed(()=>presetGroups(preferences.presets));
  const currentPreset=computed(()=>presetSets.value.find(g=>g.id===preferences.activePreset)?.id||presetSets.value[0]?.id||'legacy');
  const presetParameters=computed(()=>{const map=preferences.presetParameters||=( {});return map[currentPreset.value]||=({...cleanSampling(taskApi(preferences,'story')||preferences.profiles[0]),maxTokens:32000});});
  const presetEntries=computed(()=>preferences.presets.filter(p=>setId(p)===currentPreset.value));
  const sessions=ref<Session[]>([]), sessionId=ref(''), panel=ref<Panel>('story');
  const inputDrafts=new Map<string,string>();
  function rememberInput(){if(sessionId.value)inputDrafts.set(sessionId.value,input.value);}
  const workingForumReply=ref(''),forumReplyPost=ref(''),forumReplyError=ref('');let forumController:AbortController|undefined;
  function stopForumReply(){forumController?.abort();}
  watch(()=>[preferences.forumReplyEnabled,preferences.forumReplyProfile,sessionId.value],()=>forumController?.abort());
  const settingsTab=ref<'persona'|'theaters'|'shortcuts'>('persona');
  const localService=ref<LocalService>();
  const nativePreset=ref<NativePresetConfig|null>(),nativeDefaultPreset=ref<NativePresetConfig>(),savingNativePreset=ref(false),unsafeNativeDrafts=ref(false);
  const requireSafeDrafts=()=>{if(unsafeNativeDrafts.value)throw Error('旧预设草稿含凭据，请先点击“清理旧预设草稿”；原存档仍保留。');};
  async function clearUnsafeNativeDrafts(){try{const task=writes.catch(()=>{}).then(async()=>{const drafts=await repository.readEditorDrafts();await repository.writeEditorDraft('preset:native-runtime',drafts['preset:native-runtime']??null);});writes=task;await task;unsafeNativeDrafts.value=repository.hasUnsafeNativeDrafts();if(nativePreset.value===undefined&&nativeDefaultPreset.value&&!restoreInterrupted.value)await saveNativePreset(nativeDefaultPreset.value);problem.value='';storageError.value='';storageStatus.value='saved';lastSaved.value=now();notice.value='已清理旧预设草稿，已保存预设、剧情和其他草稿保留。';}catch(e){problem.value=message(e);}}
  async function saveNativePreset(value:NativePresetConfig|null){
    requireSafeDrafts();
    if(!storageReady||backupWorking.value||busy.value||workingMemory.value||terminalBusy.value||savingNativePreset.value||restoreInterrupted.value)throw Error('请等待或停止当前任务后保存预设。');
    const safe=value===null?null:cleanNativePresetConfig(value),expected=nativePreset.value===undefined?undefined:copy(nativePreset.value);
    savingNativePreset.value=true;
    try{const task=writes.catch(()=>{}).then(()=>repository.writeNativePreset(safe,expected,cleanPreferences(preferences)));writes=task;await task;nativePreset.value=safe;notice.value='原生预设已保存在本机，完整备份会包含它。';}
    finally{savingNativePreset.value=false;}
  }
  const newGameDraft=reactive({title:defaultJourneyName(sessions.value.map(s=>s.name)),opening:'',wish:'',persona:blankPersona()});
  const workingPersona=ref(false),creatingGame=ref(false),personaNotice=ref('');
  let personaController:AbortController|undefined;
  function resetNewGameDraft(){if(workingPersona.value||creatingGame.value)return;Object.assign(newGameDraft,{title:defaultJourneyName(sessions.value.map(s=>s.name)),opening:'',wish:'',persona:blankPersona()});personaNotice.value='';}
  function stopPersona(){personaController?.abort();}
  async function assistPersona(){
    if(workingPersona.value||creatingGame.value||busy.value||backupWorking.value)return;
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
  async function connectProfile(p:Profile){try{const missing=apiFieldIssues(p,credentials[p.id]);if(missing.length)throw new Error(`请填写：${missing.join('、')}`);const signature=connectionSignature(p);await http.configure(copy(p));if(signature!==connectionSignature(p))throw new Error('配置已改变，请重新确认。');problem.value='';if(!loading.value){const saved=credentialsSnapshot();if(saved.remember)saved.confirmed[p.id]={apiBaseUrl:apiAddress(p.apiBaseUrl),model:p.model};const next=cleanPreferences(preferences);const task=writes.catch(()=>{}).then(()=>repository.writeConfiguration(next,saved));writes=task;await task;}approved[p.id]=signature;notice.value=rememberApiKeys.value?'当前接口已确认并保存在此浏览器；尚未进行模型生成测试。':'当前接口已确认，仅在本次页面使用。';return true;}catch(e){problem.value=message(e);return false;}}
  async function fetchModels(p:Profile,signal:AbortSignal,kind?:'embedding',draftKey?:string){try{if(!localService.value)throw new Error('请先连接本机后台，再获取模型。');return await http.models(p.apiBaseUrl||'',draftKey??key(p),signal,kind);}catch(e){if(!signal.aborted)logRuntime(e,'获取模型');throw e;}}
  async function testProfile(p:Profile,embedding:boolean,signal:AbortSignal,draftKey?:string){try{if(!localService.value)throw new Error('本机后台未连接，请用启动预览.bat 启动。');const issues=apiFieldIssues(p,draftKey??key(p));if(issues.length)throw new Error('请填写：'+issues.join('、'));return await http.probe(copy(p),draftKey??key(p),embedding?'embedding':'text',signal);}catch(e){if(!signal.aborted)logRuntime(e,'测试连接');throw e;}}
  const generationPhase=ref(''),generationStarted=ref(0);
  const terminalBusy=ref(false),backupWorking=ref(false),restoreInterrupted=ref(false);
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
  async function useMainForAll(){if(busy.value||workingMemory.value)return;for(const task of textApiTasks)preferences[task.field]=preferences.mainProfile;preferences.suggestionsProfile=preferences.randomEventProfile=preferences.forumReplyProfile=preferences.mainProfile;preferences.vectorEnabled=false;await safePersist();notice.value='全部文字功能使用主 API，记忆采用本地检索。';}
  async function confirmAllApis(){if(configuringApis.value||busy.value)return;const structural=apiConfigurationIssues(preferences,credentials,()=>true);if(structural.length){problem.value=structural[0];return;}configuringApis.value=true;try{for(const p of [...new Map([...requiredApis(preferences),...auxiliaryApis(preferences).filter(apiSelectable)].map(p=>[p.id,p])).values()])if(!await connectProfile(p))return;notice.value='必需的 API 配置已就绪，可以进入游戏。';await safePersist();}finally{configuringApis.value=false;}}
  const storageStatus=ref<'idle'|'pending'|'saving'|'saved'|'failed'>('idle');
  const notice=ref('正在读取本地存档…'), problem=ref(''), input=ref(''), lastSaved=ref('');
  let activeCallId='';
  let reportingSaveFailure=false;
  function logRuntime(error:unknown,stage='运行错误'){
    if(reportingSaveFailure)return;
    if(error instanceof Error&&error.name==='AbortError')return;
    const detail=error instanceof Error?error.message:String(error);if(!detail.trim())return;
    // The HTTP sink already wrote this failure to the run log with its full sanitized detail.
    if(noticeKeyFor(detail)!==undefined)return;
    const session=active.value,turn=session?.turns.at(-1);
    void formatErrors.record(detail,stage,session?.id||'',turn?.id||'','runtime',{...(activeCallId?{callId:activeCallId}:{})});
  }
  watch(problem,value=>{if(value)logRuntime(value,generationPhase.value||'运行错误');},{flush:'sync'});
  watch(forumReplyError,value=>{if(value)logRuntime(value,'论坛 AI 回复');},{flush:'sync'});
  const repository=new IndexedDbRepository(); let writes=Promise.resolve(); let controller:AbortController|undefined;let storageReady=false,apiStorageReady=false;
  const deletingSessionId=ref('');let deletionTask:Promise<boolean>|undefined;
  const mock=new MockGateway(), http=new HttpGateway(()=>{requireSafeDrafts();if(nativePreset.value===undefined)throw Error('请先在预设页面保存原生预设。');return nativePreset.value||nativeDefaultPreset.value;});
  const gateway=():Gateway=>localService.value?http:preferences.mode==='demo'?mock:http;
  const active=computed(()=>sessions.value.find(s=>s.id===sessionId.value));
  const pendingRandomEvent=computed(()=>randomEventsAvailable&&(active.value?.turns.some(t=>awaitingSpecialEvent(t.randomEvent))||false));
  const state=computed(()=>active.value?stateAt(active.value):undefined);
  const replayWarnings=computed(()=>{if(!active.value)return [];stateAt(active.value);return replayIssues(active.value);});
  const memories=computed(()=>active.value?visibleMemories(active.value):[]);
  const forum=computed(()=>active.value?visibleForum(active.value):[]);
  const theaters=computed(()=>active.value?visibleTheaters(active.value):[]);
  const canContinue=computed(()=>authorized.value&&gateway().capabilities.continue);
  // 三个独立状态：服务端是否有手机功能面、用户是否开启、终端 API 是否明确配置并确认。
  // 顶栏停用只关掉用户开关，不能把浮窗最小化当成停用，也不删任何历史记录。
  const terminalCapability=computed(()=>gateway().capabilities.terminal!==false);
  // 手机终端的功能面由服务端通道决定：稳定版没有入口，也不发终端提示词、不做缺额补修和手机专用召回。
  const profile=(id:string):Profile=>preferences.profiles.find(p=>p.id===id) || preferences.profiles[0];
  const key=(p:Profile)=>credentials[p.id] || '';
  const terminalProfile=computed(()=>taskApi(preferences,'terminal'));
  const terminalIssues=computed(()=>terminalApiIssues(preferences,credentials,connectionReady));
  const terminalConfigured=computed(()=>!!preferences.terminalProfile&&!!terminalProfile.value&&!terminalIssues.value.length);
  const terminalEnabled=computed(()=>terminalCapability.value&&preferences.terminalEnabled===true&&terminalConfigured.value);
  const terminalOrder=computed<TerminalAutoMode>(()=>preferences.terminalOrder==='terminal-first'?'terminal-first':'story-first');
  const fingerprint=(p:Profile)=>`${preferences.mode}:${p.apiBaseUrl||''}:${p.providerId}:${p.model}`;
  let protectedGeneration:{sessionId:string;turnId:string;variantId:string;checkpoint:Variant}|undefined;
  const snapshot=():Snapshot=>({version:1,sessions:sessions.value.map(s=>s.id===protectedGeneration?.sessionId?{...s,turns:s.turns.map(t=>t.id===protectedGeneration!.turnId?{...t,variants:t.variants.map(v=>v.id===protectedGeneration!.variantId?copy(protectedGeneration!.checkpoint):v)}:t)}:s),preferences:cleanPreferences(preferences),...(nativePreset.value!==undefined?{archive:{version:1 as const,nativePreset:copy(nativePreset.value)}}:{})});
  function credentialsSnapshot():LocalApiCredentials{
    const profiles=preferences.profiles.filter(p=>!!credentials[p.id]);
    return {version:1,remember:rememberApiKeys.value,keys:rememberApiKeys.value?Object.fromEntries(profiles.map(p=>[p.id,credentials[p.id]])):{},confirmed:rememberApiKeys.value?Object.fromEntries(profiles.filter(connectionReady).map(p=>[p.id,{apiBaseUrl:apiAddress(p.apiBaseUrl),model:p.model}])):{}};
  }
  /** Bounded so one unreachable address can never hang a configuration save forever. */
  const configureTimeoutMs=15000;
  async function confirmConnection(p:Profile){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),configureTimeoutMs);
   try{await http.configure(copy(p),controller.signal);}
   // The new Error keeps the failure's notice key so the UI resolves the canonical text instead of a second, longer
   // copy of the same failure: the interface name is diagnostic detail, the sink already logged it with full context.
   catch(e){throw attachHttpNotice(Error(controller.signal.aborted?`${p.name}：确认超时（${configureTimeoutMs/1000} 秒），接口地址无法连接，请修改或移除此接口后重试。`:`${p.name}：${e instanceof Error?e.message:'接口确认失败'}`),httpNoticeKeyOf(e));}
   finally{clearTimeout(timer);}
  }
  /**
   * `origin` is the draft's baseline; when it is given the write is re-merged against live state instead of replacing
   * it, so a concurrent change to another interface or to a global setting is preserved instead of silently overwritten.
   * `scope` names the interfaces this save may confirm; the rest keep their current state and never hit the network.
   */
  async function commitConfiguration(next:Preferences,keys:Record<string,string>,remember:boolean,bindings:{id:string;ids:string[];before?:string[]}[]=[],options:ConfigurationCommitOptions={}){
    if(!storageReady||backupWorking.value)throw Error('请等待存档载入或恢复完成');
    const baseline={preferences:copy(options.origin?.preferences||preferences),credentials:copy(options.origin?.credentials||credentials)};
    const resolvePreferences=(draft:Preferences)=>mergeConfiguration(copy(preferences),baseline.preferences,draft);
    const resolveKeys=(draft:Record<string,string>)=>mergeCredentials({...credentials},baseline.credentials,draft);
    const validate=(staged:Preferences,stagedKeys:Record<string,string>)=>{
      for(const p of staged.profiles){
        if(p.model.length>150||(stagedKeys[p.id]||'').length>8192)throw Error(`${p.name}：模型名称或 Key 超过长度限制`);
        const issues=apiFieldIssues(p,stagedKeys[p.id]||'').filter(x=>x!=='模型名称'&&x!=='Key'&&!(x==='API 地址'&&!p.apiBaseUrl?.trim()));
        if(issues.length)throw Error(`${p.name}：${issues.join('、')}`);
      }
    };
    let staged=resolvePreferences(next),stagedKeys=resolveKeys(keys);
    validate(staged,stagedKeys);
    // Connection inputs already committed before this save. Unchanged interfaces are never re-confirmed and never
    // upgraded to "ready": an unrelated old auxiliary API that was never confirmed must not block saving everything else.
    const previous=new Map(preferences.profiles.map(p=>[p.id,JSON.stringify([apiAddress(p.apiBaseUrl),p.model,credentials[p.id]||''])]));
    // Address/model only: the key is compared against this save's own input, so unrelated credential changes cannot abort it.
    const previousEndpoint=new Map(preferences.profiles.map(p=>[p.id,JSON.stringify([apiAddress(p.apiBaseUrl),p.model])]));
    const confirmations:Record<string,string>={},confirmed:LocalApiCredentials['confirmed']={};
    for(const p of staged.profiles){
      if(apiFieldIssues(p,stagedKeys[p.id]||'').length)continue;
      const signature=JSON.stringify([apiAddress(p.apiBaseUrl),p.model,stagedKeys[p.id]||'']);
      // Only an exact existing approval may be carried over; a stale one would mark a different endpoint as ready.
      const ready=approved[p.id]===signature,unchanged=previous.get(p.id)===signature,scoped=options.scope?options.scope.includes(p.id):!unchanged;
      if(ready&&unchanged){confirmations[p.id]=signature;continue;}
      // Whatever this save does not target must neither be requested nor change readiness, so an unrelated interface
      // can never be confirmed or turned ready by someone else's save. Anything the save does target is confirmed even
      // when its address, model and key are already committed: clicking "confirm" on it has to take effect.
      if(!scoped)continue;
      await confirmConnection(p);
      // Late response guard: reject confirmations whose input changed while the request was in flight.
      if((keys[p.id]||'')!==(stagedKeys[p.id]||''))throw Error(`${p.name}：Key 在保存期间已改变，请重新保存。`);
      const live=preferences.profiles.find(x=>x.id===p.id);
      const liveEndpoint=live?JSON.stringify([apiAddress(live.apiBaseUrl),live.model]):undefined;
      if(!(liveEndpoint===undefined&&!previousEndpoint.has(p.id)||liveEndpoint!==undefined&&previousEndpoint.get(p.id)===liveEndpoint))throw Error(`${p.name}：接口在保存期间已被其他操作修改，请取消后重新编辑。`);
      confirmations[p.id]=signature;
    }
    // Re-merged after the confirmations so anything that changed while they were in flight is preserved or refused.
    staged=resolvePreferences(next);stagedKeys=resolveKeys(keys);
    validate(staged,stagedKeys);
    for(const p of staged.profiles){
      const signature=JSON.stringify([apiAddress(p.apiBaseUrl),p.model,stagedKeys[p.id]||'']);
      if(confirmations[p.id]===signature)confirmed[p.id]={apiBaseUrl:apiAddress(p.apiBaseUrl),model:p.model};
      else delete confirmations[p.id];
    }
    const safe=cleanPreferences(staged),allowed=new Set(safe.profiles.map(p=>p.id));
    const saved:LocalApiCredentials={version:1,remember,keys:remember?Object.fromEntries(Object.entries(stagedKeys).filter(([id])=>allowed.has(id))):{},confirmed:remember?confirmed:{}};
    for(const binding of bindings){const session=sessions.value.find(s=>s.id===binding.id);if(!session||JSON.stringify(session.worldbookIds||[])!==JSON.stringify(binding.before||[]))throw Error('世界书绑定已改变，请重新编辑');}
    const liveBeforeWrite=JSON.stringify([preferences,credentials]);
    const task=writes.catch(()=>{}).then(()=>{
      if(JSON.stringify([preferences,credentials])!==liveBeforeWrite)throw Error('设置在等待保存时已改变，请重新保存；当前修改已保留。');
      return repository.writeConfiguration(safe,saved,bindings);
    });writes=task;
    storageStatus.value='saving';try{await task;}catch(e){storageStatus.value='failed';storageError.value=message(e);throw e;}
    Object.assign(preferences,safe);for(const binding of bindings)sessions.value.find(s=>s.id===binding.id)!.worldbookIds=copy(binding.ids);for(const id of Object.keys(credentials))delete credentials[id];Object.assign(credentials,Object.fromEntries(Object.entries(stagedKeys).filter(([id])=>allowed.has(id))));
    for(const id of Object.keys(approved))delete approved[id];Object.assign(approved,confirmations);rememberApiKeys.value=remember;apiStorageReady=true;storageStatus.value='saved';storageError.value='';lastSaved.value=now();notice.value='设置已保存；未填写模型的接口仍需补全后才能生成。';problem.value='';
  }
  async function setRememberApiKeys(remember:boolean){try{await commitConfiguration(preferences,credentials,remember);}catch(e){problem.value=message(e);}}
  async function clearApiKeys(){try{await commitConfiguration(preferences,{},rememberApiKeys.value);notice.value='已清除本机保存和当前页面中的全部 API Key。';}catch(e){problem.value=message(e);}}
  const storageError=ref('');let timer:ReturnType<typeof setTimeout>|undefined;let saveRevision=0;
  async function persist() {
   await nextTick();
   const revision=++saveRevision;
   clearTimeout(timer);timer=undefined;
   try{
    if(deletionTask)await deletionTask;
    if(!storageReady){storageStatus.value='failed';problem.value='无法读取旧存档，已阻止覆盖。请导出当前内容并检查浏览器存储权限。';throw new Error(problem.value);}
    storageStatus.value='saving';storageError.value='';notice.value='正在保存…';
    const task=writes.catch(()=>{}).then(async()=>{await repository.write(snapshot());}); writes=task;
    await task;lastSaved.value=now();if(revision===saveRevision){storageStatus.value='saved';storageError.value='';notice.value='已保存在本机';}
   }catch(e){if(revision===saveRevision){storageStatus.value='failed';storageError.value=message(e);reportingSaveFailure=true;problem.value=storageError.value;reportingSaveFailure=false;notice.value='未保存，请导出备份';const at=saveFailureLocation(e);void formatErrors.record('保存失败：'+storageError.value+'；当前内存数据保留，请下载备份后重试。','WORKSPACE_SAVE_FAILED',at.sessionId||'',at.turnId||'','runtime',at.variantId||at.round?{...(at.variantId?{variantId:at.variantId}:{}),...(at.round?{round:at.round}:{})}:undefined).catch(()=>{});}throw e;}
  }
  const safePersist=()=>persist().catch(()=>{});
  async function saveTerminal(session:Session){if(!storageReady)throw Error('存档尚未载入');storageStatus.value='saving';storageError.value='';const task=writes.catch(()=>{}).then(()=>repository.writeTerminalSession(session));writes=task;try{await task;lastSaved.value=now();storageStatus.value='saved';}catch(e){storageStatus.value='failed';storageError.value=message(e);problem.value=storageError.value;throw e;}}
  async function saveEditorDraft(id:string,text:string|null){if(!storageReady)throw Error('存档尚未载入');const task=writes.catch(()=>{}).then(()=>repository.writeEditorDraft(id,text));writes=task;await task;}
  async function readEditorDraft(id:string){await writes.catch(()=>{});return (await repository.readEditorDrafts())[id];}
  async function collectFullArchive(){requireSafeDrafts();const archive=await collectWorkspaceArchive(copy(newGameDraft));if(nativePreset.value!==undefined)archive.nativePreset=copy(nativePreset.value);const drafts=await repository.readEditorDrafts();if(repository.hasUnsafeNativeDrafts())throw Error('请先清理旧预设草稿，再备份。');delete drafts['new-game'];if(Object.keys(drafts).length)archive.editorDrafts=drafts;return archive;}
  const lorebooks=useWorldbooks(preferences,active,()=>sessions.value,()=>busy.value||workingMemory.value||backupWorking.value,safePersist,s=>problem.value=s,s=>notice.value=s,download);
  /** An already-reported HTTP failure keeps its canonical text everywhere, so one failure is one notice. */
  const message=(e:unknown)=>{
    const key=httpNoticeKeyOf(e),text=key?noticeTextFor(key):undefined;
    if(text)return text;
    return e instanceof Error ? (e.name==='AbortError'?'生成已停止，已收到的内容保留。':e.message) : '操作未完成，请重试。';
  };
  async function boot() {
    try {const value=await repository.read();unsafeNativeDrafts.value=repository.hasUnsafeNativeDrafts();if(value){for(const session of value.sessions)for(const task of session.memoryTasks||[])if(task.status==='running'){task.status='failed';task.error='页面关闭时任务中断，请手动重试。';}for(const session of value.sessions)for(const job of session.terminal?.jobs||[])if(job.status==='running'){job.status='failed';job.error='页面关闭时任务中断，可在终端中重试。';}sessions.value=value.sessions;for(const session of sessions.value)prepareForumLikes(session);Object.assign(preferences,value.preferences);nativePreset.value=value.archive?.nativePreset;}restoreInterrupted.value=await repository.hasInterruptedRestore();storageReady=true;notice.value=sessions.value.some(s=>s.affinityMigration?.records.length)?'本地存档已载入；旧版超过 100 的好感度已迁移到新范围，原始状态与补丁保留在导出备份的 affinityMigration 记录中，旧记忆待重整':sessions.value.length?'本地存档已载入':'新建一段旅程，数据会保存在本机';authorized.value=preferences.mode==='demo';}
    catch(e){problem.value=message(e);notice.value='本地存储暂不可用，请勿覆盖旧数据';}
    finally {
      try{const service=await http.bootstrap();if(service){localService.value=service;for(const session of sessions.value)syncCharacterFacts(session,service.dataset,service.characterFacts);preferences.mode='server';await Promise.resolve();authorized.value=true;notice.value='服务器角色卡已载入 · 请在API 设置连接 AI';}}catch{problem.value='本机资料后台不可用；请使用新版 bat 启动。';}
      try{if(localService.value?.capabilities.native&&storageReady&&!restoreInterrupted.value){const existing=await http.readNativePreset();nativeDefaultPreset.value=cleanNativePresetConfig({version:1,preset:existing.defaultPreset});if(nativePreset.value===undefined){const initial=cleanNativePresetConfig({version:1,preset:existing.preset});if(unsafeNativeDrafts.value)nativeDefaultPreset.value=initial;else await saveNativePreset(initial);}}}catch(e){problem.value=message(e);}
      try{const drafts=await repository.readEditorDrafts();if(drafts['new-game']){const saved=cleanBackupArchive({version:1,newGameDraft:JSON.parse(drafts['new-game'])}).newGameDraft!;Object.assign(newGameDraft,saved);}}catch(e){problem.value=message(e);}
      try{const saved=await repository.readApiCredentials();apiStorageReady=true;if(saved){rememberApiKeys.value=saved.remember;if(saved.remember){for(const p of preferences.profiles)if(saved.keys[p.id])credentials[p.id]=saved.keys[p.id];await Promise.resolve();if(localService.value)for(const p of preferences.profiles){const previous=saved.confirmed[p.id];if(previous&&previous.apiBaseUrl===apiAddress(p.apiBaseUrl)&&previous.model===p.model&&!apiFieldIssues(p,key(p)).length)await connectProfile(p);}}}}catch(e){rememberApiKeys.value=false;problem.value=message(e);}
      loading.value=false;if(apiReady.value)notice.value='已恢复本机 API 配置，可以继续游戏。';if(restoreInterrupted.value)problem.value='上次备份恢复中断，请先在云端备份中恢复覆盖前的完整副本。';
    }
  }
  const inputDraftStatus=ref(''),inputDraftError=ref('');const pendingInputDrafts=new Map<string,string>();let inputDraftTimer:ReturnType<typeof setTimeout>|undefined;
  async function flushInputDrafts(){clearTimeout(inputDraftTimer);const pending=[...pendingInputDrafts];for(const [id,text]of pending){if(!sessions.value.some(s=>s.id===id)){pendingInputDrafts.delete(id);continue;}try{const task=writes.catch(()=>{}).then(()=>repository.writeInputDraft(id,text));writes=task;await task;if(pendingInputDrafts.get(id)===text)pendingInputDrafts.delete(id);inputDraftStatus.value='输入草稿已保存';inputDraftError.value='';}catch(e){inputDraftStatus.value='输入草稿保存失败';inputDraftError.value=message(e);throw e;}}}
  watch(input,text=>{const session=active.value;if(!session||loading.value||backupWorking.value)return;session.draftInput=text;inputDrafts.set(session.id,text);pendingInputDrafts.set(session.id,text);inputDraftStatus.value='输入草稿待保存';clearTimeout(inputDraftTimer);inputDraftTimer=setTimeout(()=>void flushInputDrafts().catch(()=>{}),400);});
  let newGameDraftTimer:ReturnType<typeof setTimeout>|undefined;
  watch(newGameDraft,()=>{if(loading.value||backupWorking.value)return;clearTimeout(newGameDraftTimer);newGameDraftTimer=setTimeout(()=>{void saveEditorDraft('new-game',JSON.stringify(newGameDraft)).catch(e=>{inputDraftError.value=message(e);});},400);},{deep:true});
  watch(()=>preferences.mode,()=>{authorized.value=preferences.mode==='demo';for(const id of Object.keys(credentials))delete credentials[id];});
  watch(credentials,()=>{for(const id of Object.keys(approved)){const p=preferences.profiles.find(profile=>profile.id===id);if(!p||approved[id]!==connectionSignature(p))delete approved[id];}});
  watch([apiReady,panel],()=>{if(active.value&&panel.value==='story'&&!apiReady.value&&!loading.value){panel.value='settings';problem.value=apiIssues.value[0]||'请完成 API 配置后继续。';}});
  async function authorize(invite:string) {try{await gateway().authorize(invite);authorized.value=true;notice.value=preferences.mode==='demo'?'演示访问已开启':'访问验证成功';problem.value='';}catch(e){authorized.value=false;problem.value=message(e);}}
  async function create(name:string,persona:Persona,opening:string) {
    if(creatingGame.value||workingPersona.value||busy.value||backupWorking.value||restoreInterrupted.value)return;
    try{persona=normalizePersona(persona);}catch(e){problem.value=message(e);return;}
    if(!authorized.value){problem.value='请先验证访问资格';return;}
    if(!ensureApiConfiguration())return;
    creatingGame.value=true;
    try{const session=newSession(name,persona,opening);session.memoryEngine='candidate';session.worldbookIds=[...(preferences.defaultWorldbookIds||[])];if(localService.value){const game=await http.newGame(copy(persona));session.initial=game.initial;session.memoryEngine='candidate';session.opening=opening.trim()||game.opening;session.sourceDataset=game.dataset;}ensureTerminalCodes(session);rememberInput();sessions.value.unshift(session);sessionId.value=session.id;panel.value='story';input.value='';problem.value='';await safePersist();}catch(e){problem.value=message(e);}finally{creatingGame.value=false;}
  }
  function open(id:string) {if(busy.value||backupWorking.value)return;if(!ensureApiConfiguration()){pendingSessionId.value=id;return;}rememberInput();pendingSessionId.value='';sessionId.value=id;panel.value='story';input.value=inputDrafts.get(id)??active.value?.draftInput??'';problem.value='';}
  function home() {if(busy.value||backupWorking.value)return;rememberInput();pendingSessionId.value='';sessionId.value='';panel.value='story';input.value='';}
  function deleteSession(id:string):Promise<boolean>{
    if(loading.value||busy.value||backupWorking.value||workingMemory.value||workingPersona.value||creatingGame.value||deletionTask)return Promise.resolve(false);
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
  function stop(){controller?.abort();stopTerminal();}
  /**
   * Every terminal request is bound to the epoch and the route it started with. Disabling the
   * phone, switching the order or replacing the terminal interface bumps the epoch, so a reply
   * that ignored the abort signal can never be written back, and re-enabling never revives an
   * older request.
   */
  const terminalEpoch=ref(0);
  /** The user's current terminal selection together with its full interface and key signature. */
  const terminalRouteSignature=()=>`${preferences.terminalProfile||''}|${terminalProfile.value?connectionSignature(terminalProfile.value):''}`;
  watch(terminalRouteSignature,()=>{terminalEpoch.value++;},{flush:'sync'});
  let terminalController:AbortController|undefined;
  function stopTerminal(){terminalController?.abort();terminalController=undefined;terminalEpoch.value++;}
  /** Top-bar switch. Enabling requires an explicit, confirmed terminal API and an idle app;
   * disabling stays available during generation — it aborts the terminal stage only, keeps every
   * stored record and lets the prose continue. */
  async function setTerminalEnabled(next:boolean):Promise<boolean>{
    if(backupWorking.value)return false;
    if(next){
      if(busy.value||terminalBusy.value)return false;
      if(!terminalCapability.value){problem.value='当前版本没有手机终端入口。';return false;}
      if(!preferences.terminalProfile){problem.value='请先在「API 设置」里为终端 API 选择一个接口，再开启手机。';panel.value='settings';return false;}
      const p=terminalProfile.value;
      if(!p){problem.value='终端 API 引用不正确，请重新选择。';panel.value='settings';return false;}
      if(!connectionReady(p)&&!await connectProfile(p)){problem.value='终端 API 尚未确认，手机没有开启。';panel.value='settings';return false;}
      if(terminalIssues.value.length){problem.value=terminalIssues.value[0]||'终端 API 尚未就绪。';panel.value='settings';return false;}
    }else stopTerminal();
    preferences.terminalEnabled=next;terminalEpoch.value++;
    await safePersist();
    notice.value=next?'手机终端已开启；终端通讯使用单独接口，不再随正文生成。':'手机终端已停用；历史通讯全部保留，正文照常生成。';
    return true;
  }
  async function setTerminalOrder(order:TerminalAutoMode){
    if(busy.value||terminalBusy.value)return;
    preferences.terminalOrder=order==='terminal-first'?'terminal-first':'story-first';
    await safePersist();
    notice.value=order==='terminal-first'?'已改为先产生终端通讯，正文再依据已确认的通讯推进。':'已改为先写正文，再依据本轮正文产生终端通讯。';
  }
  /** One independent terminal request per turn. Never falls back to the prose API and never
   * writes a late response into another save, branch, interface, order or disabled phone. */
  async function runTerminalStage(index:number,options:{automatic?:boolean;socialOnly?:boolean;mode?:TerminalAutoMode}={}):Promise<{ok:boolean;facts:string}>{
    const session=active.value;
    if(!terminalEnabled.value||!session||terminalBusy.value)return {ok:false,facts:''};
    const p=terminalProfile.value,apiKey=p?key(p):'';
    if(!p||!localService.value)return {ok:false,facts:''};
    if(apiFieldIssues(p,apiKey).length||!connectionReady(p)){
      if(!options.automatic){problem.value='终端 API 尚未确认，正文已保存，请配置后重试终端部分。';panel.value='settings';}
      return {ok:false,facts:''};
    }
    // A retry keeps the stage the failed job actually executed, even if the order changed since.
    const mode=options.mode??terminalOrder.value,socialOnly=options.socialOnly===true;
    const jobId=terminalAutoJobId(session,index,mode,socialOnly);
    const hadJob=!!terminalAutoJob(session,jobId);
    const planned=planTerminalAuto(session,index,mode,{socialOnly});
    if(!planned){
      // 该阶段已经提交：把当时的通讯事实原样交回正文，不再调用模型、不再写消息。
      const committed=terminalAutoJob(session,jobId);
      return {ok:true,facts:committed?terminalJobFacts(session,committed):''};
    }
    const turn=session.turns[index],variant=turn.variants[turn.selected];
    const boundary=socialOnly||mode==='story-first'?index+1:index;
    const signature=terminalRouteSignature(),epoch=terminalEpoch.value,connection=new AbortController(),callId=uid();
    // 迟到的回包即使忽略 abort 也必须作废：停用、换终端接口、切顺序、换存档、换分支都算。
    const stale=()=>epoch!==terminalEpoch.value||signature!==terminalRouteSignature()||!terminalEnabled.value;
    // 作废时不留一个可重试的幽灵任务；之前就存在的失败任务保留原错误。
    const abandon=()=>{const live=active.value?.terminal?.jobs;const job=live?.find(j=>j.id===jobId);if(!live||!job||job.status==='ready')return;if(!hadJob)active.value!.terminal!.jobs=live.filter(j=>j!==job);else{job.status='failed';job.error='终端请求已作废：手机已停用或终端接口已改变。';}};
    terminalController=connection;terminalBusy.value=true;startGeneration(callId);
    try{
      await persist();
      const state=stateAt(session,boundary);
      const contacts=session.terminal?.contacts||[];
      const characters=[...(state.characters||[]),...contacts.filter(c=>!(state.characters||[]).some(a=>a.id===c.id))];
      const actorIds=[...new Set(characters.map(a=>a.id).filter(id=>id!=='player'))];
      const stageMode=socialOnly?'story-first':mode;
      const batch=await http.terminal({task:'main-auto',sessionId:session.id,turnId:turn.id,mode:stageMode,actorIds,input:turn.input.slice(0,2000),persona:copy(session.persona),context:{state:{characters,player:state.player},mainContext:planned.context,story:(stageMode==='story-first'?variant?.text||'':'').slice(0,16000),allowSocial:planned.plan.social}},p,apiKey,connection.signal) as import('../domain/terminalMain').TerminalMainBatch;
      connection.signal.throwIfAborted();
      if(stale()){abandon();await safePersist();return {ok:false,facts:''};}
      const current=active.value;
      if(!current||current.id!==session.id){abandon();return {ok:false,facts:''};}
      const liveTurn=session.turns[index];
      if(!liveTurn||liveTurn.id!==turn.id||liveTurn.variants[liveTurn.selected]?.id!==variant?.id)throw Error('剧情分支已变化，迟到终端结果未应用。');
      // 应用与落盘是一次事务：写不进去就把内存里的通讯、任务和派生记忆一起回滚，重试仍能落盘。
      const before=copy(session.terminal),beforeMemories=copy(session.memories);
      let result:ReturnType<typeof applyTerminalAuto>;
      try{result=applyTerminalAuto(session,planned.plan,batch);await persist();}
      catch(e){session.terminal=before;session.memories=beforeMemories;throw e;}
      if(result.status==='ready')markGenerationComplete(callId);
      if(!options.automatic)notice.value=result.status==='ready'?`终端本轮已保存 ${result.added} 条通讯。`:result.error||'终端部分未完成';
      return {ok:result.status==='ready',facts:result.facts};
    }catch(e){
      // Keep the failed stage visible and retryable; only the active save may be touched.
      if(active.value?.id===session.id){
        if(stale()){abandon();await safePersist();}
        else{
          const job=terminalAutoJob(session,jobId);
          if(job&&terminalAnchorActive(session,job.anchor)){
            job.status='failed';
            job.error=connection.signal.aborted?'终端请求已停止，本轮终端通讯未生成。':'终端部分未完成：'+message(e);
            await safePersist();
            if(!options.automatic)problem.value=job.error;
          }
        }
      }
      return {ok:false,facts:''};
    }finally{finishGeneration(callId);if(terminalController===connection)terminalController=undefined;terminalBusy.value=false;}
  }
  let memoryController:AbortController|undefined;const memoryQueue=new Set<Session>();
  function stopMemory(){memoryController?.abort();}
  function memoryLedger(session:Session,before=session.turns.length){const order=new Map(session.turns.map((t,i)=>[t.id,i]));return visibleMemories(session,before).slice().sort((a,b)=>(order.get(a.sourceTurn||'')??-1)-(order.get(b.sourceTurn||'')??-1));}
  function roundMemoryInput(session:Session,index:number):MemoryRequest{
    const turn=session.turns[index],v=turn&&selected(turn);if(!v||v.status!=='complete'||!v.outcome)throw new Error('只能整理已完成的剧情。');
    return {turnId:turn.id,variantId:v.id,input:turn.input,story:v.text,event:v.outcome.event,diceEvent:copy(v.outcome.diceEvent),before:memoryState(stateAt(session,index)),after:memoryState(stateAt(session,index+1)),priorCommitments:activeCommitments(memoryLedger(session,index))};
  }
  function memoryNeedsWork(session:Session,index:number){const turn=session.turns[index],v=turn&&selected(turn);if(!v||v.status!=='complete'||!v.outcome)return false;const m=session.memories.find(m=>m.kind==='event'&&m.sourceTurn===turn.id&&m.sourceVariant===v.id);return !m||!memoryReady(m)||session.memoryEngine==='candidate'&&!m.source||m.sourceFingerprint!==memorySignature(roundMemoryInput(session,index));}
  const pendingMemoryCount=computed(()=>active.value?active.value.turns.filter((_,i)=>memoryNeedsWork(active.value!,i)).length:0);
  const chatRoundCount=computed(()=>active.value?.turns.filter(t=>t.input.trim()).length||0);
  const effectiveMemoryCount=computed(()=>active.value?active.value.turns.filter((t,i)=>{const v=selected(t);return v?.status==='complete'&&v.outcome&&!memoryNeedsWork(active.value!,i);}).length:0);
  const memoryEntries=computed<Memory[]>(()=>{
    const session=active.value;if(!session)return[];
    return [...session.turns.flatMap(t=>{const v=selected(t);if(v?.status!=='complete'||!v.outcome)return[];return[session.memories.find(m=>m.kind==='event'&&m.sourceTurn===t.id&&m.sourceVariant===v.id)||{id:`missing:${t.id}`,kind:'event' as const,text:'本轮记忆待补记。',createdAt:v.createdAt,sourceTurn:t.id,sourceVariant:v.id,status:'pending' as const}];}),...memories.value.filter(m=>m.kind!=='event')];
  });
  function memoryNeedsRepair(m:Memory){const session=active.value,index=session?.turns.findIndex(t=>t.id===m.sourceTurn)??-1;return !!session&&index>=0&&memoryNeedsWork(session,index);}
  const missingVectorCount=computed(()=>!preferences.vectorEnabled?0:memories.value.filter(m=>memoryReady(m)&&!vectorCurrent(m,fingerprint(profile(preferences.embeddingProfile)))).length);
  function vectorStatus(m:Memory){if(!preferences.vectorEnabled)return '本地关键词检索';if(m.kind==='event'&&!memoryReady(m))return m.status==='failed'?'补记失败':'等待逐轮整理';if(m.indexError)return '索引失败';const p=profile(preferences.embeddingProfile);if(vectorCurrent(m,fingerprint(p)))return '已建索引';return m.vector?'索引待更新':preferences.vectorEnabled?'待建索引':'未开启向量';}
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
  /** Terminal notes lose their vector whenever their text changes; rebuild instead of leaving them unreachable. */
  async function reindexTerminalNotes(session:Session,signal:AbortSignal){
    // 稳定版停用手机专用模型调用：旧存档里的手机记忆与向量原样保留，但不再为它们花额度重建索引。
    // 用户暂停手机时历史通讯仍是剧情事实，索引与召回照常保留，只有请求被停用。
    if(!preferences.vectorEnabled||!terminalCapability.value)return;
    const stale=session.memories.filter(m=>isTerminalMemoryNote(m)&&!vectorCurrent(m,fingerprint(profile(preferences.embeddingProfile))));
    if(!stale.length)return;
    try{await encodeMemories(session,stale,signal);}
    catch(e){if(signal.aborted)return;logRuntime(e,'终端记忆索引');const reason=message(e);for(const m of stale)if(!vectorCurrent(m,fingerprint(profile(preferences.embeddingProfile))))m.indexError='索引失败（'+reason+'），记忆文字已保留。';}
  }
  function indexTerminalNotes(){const s=active.value;if(!s||workingMemory.value)return;void (async()=>{try{await reindexTerminalNotes(s,new AbortController().signal);await indexFactVectors(s,new AbortController().signal);}catch(e){logRuntime(e,'终端记忆索引');}})();}
  /** Stable-id resolver: a name mapping to several ids is ambiguous and must resolve to nothing. */
  function nameResolver(state:WorldState):(name:string)=>string|undefined{const byName=new Map<string,string[]>();for(const a of [state.player,...state.characters])if(a?.id&&a?.name){const name=String(a.name).trim(),ids=byName.get(name)||[];if(!ids.includes(String(a.id)))ids.push(String(a.id));byName.set(name,ids);}return name=>{const ids=byName.get(String(name).trim());return ids&&ids.length===1?ids[0]:undefined;};}
  /** Every independently retrievable fact/segment candidate with its stable id and exact text. */
  function factCandidates(session:Session){const out:{m:Memory;id:string;text:string}[]=[];const resolve=nameResolver(stateAt(session));
   for(const m of session.memories){
    if(!memoryReady(m))continue;
    if(m.kind==='event'&&m.record){
     m.record.facts?.forEach((f,i)=>out.push({m,id:factId(m.id,i),text:f.text}));
     for(const d of derivedFacts(m,resolve))out.push({m,id:d.id,text:d.text});
    }else if(isTerminalMemoryNote(m)){
     // 稳定版不为手机专属内容建立或更新事实向量：这些文本不能成为向量模型的输入。
     if(!terminalCapability.value)continue;
     const b=session.terminal?.memories?.find(b=>b.anchor.key===terminalNoteKey(m));if(!b)continue;
     const priv=terminalNoteIsPrivate(m);
     for(const entry of [...b.chats,...b.games])if(('group' in entry&&!entry.group)===priv)out.push({m,id:m.id+'#seg:'+entry.id,text:formatTerminalSegment(entry)});
    }
   }
   return out;}
  /** Indexes fact/segment candidates in batched embed calls; changed text or scope invalidates the old vector. */
  async function indexFactVectors(session:Session,signal:AbortSignal){
   if(!preferences.vectorEnabled)return;const p=copy(profile(preferences.embeddingProfile)),model=fingerprint(p),signature=connectionSignature(p);
   if(localService.value&&(!connectionReady(p)||apiFieldIssues(p,key(p)).length))throw new Error('请先保存向量 API。');
   const candidates=factCandidates(session).filter(c=>{const v=c.m.factVectors?.find(v=>v.id===c.id);return !v||v.model!==model||v.text!==c.text;});
   if(!candidates.length)return;
   for(const m of new Set(candidates.map(c=>c.m)))if(m.factVectors)m.factVectors=m.factVectors.filter(v=>v.model===model);
   for(let i=0;i<candidates.length;i+=16){signal.throwIfAborted();const batch=candidates.slice(i,i+16),texts=batch.map(c=>c.text);
    const vectors=await gateway().embed(texts,p,key(p),signal);signal.throwIfAborted();
    if(vectors.length!==texts.length||vectors.some(v=>!Array.isArray(v)||!v.length||v.length>8192||v.some(n=>!Number.isFinite(n))))throw new Error('向量结果不完整，记忆文字已保留。');
    if(!sessions.value.includes(session)||signature!==connectionSignature(profile(p.id))||!preferences.vectorEnabled)throw new Error('向量配置或存档已改变，请重试索引。');
    batch.forEach((c,j)=>{if(!session.memories.includes(c.m))return;c.m.factVectors=(c.m.factVectors||[]).filter(v=>v.id!==c.id);c.m.factVectors.push({id:c.id,text:c.text,model,values:vectors[j]});});
    await persist();
   }
  }
  async function writeRoundMemory(session:Session,index:number,signal:AbortSignal){
    const request=copy(roundMemoryInput(session,index)),sourceFingerprint=memorySignature(request),p=copy(summaryProfile.value!);
    let m=session.memories.find(m=>m.kind==='event'&&m.sourceTurn===request.turnId&&m.sourceVariant===request.variantId);
    if(m?.record&&memoryReady(m)&&m.sourceFingerprint===sourceFingerprint){if(session.memoryEngine==='candidate'&&!m.source){m.source=sourceFor(session,request);try{await persist();}catch(e){delete m.source;throw e;}}return;}
    if(!m){m={id:uid(),kind:'event',text:'本轮记忆待整理。',createdAt:now(),sourceTurn:request.turnId,sourceVariant:request.variantId};session.memories.push(m);m=session.memories.find(x=>x.id===m!.id)!;}
    const target=m,originalTarget=copy(m);if(!target.record)target.status='pending';delete target.error;await persist();
    try{
      if(localService.value&&(!connectionReady(p)||apiFieldIssues(p,key(p)).length))throw new Error('请先保存记忆整理 API。');
      const signature=connectionSignature(p),memoryDiagnostics:string[]=[],result=normalizeMemoryResult(await gateway().memory(request,p,key(p),signal),request,memoryDiagnostics);if(memoryDiagnostics.length)recordDiagnostic({kind:'memory-audience',sessionId:session.id,turnId:request.turnId,issues:memoryDiagnostics});signal.throwIfAborted();
      if(!sessions.value.includes(session)||!visibleSourceStillMatches(session,request.turnId,request.variantId)||memorySignature(roundMemoryInput(session,index))!==sourceFingerprint||signature!==connectionSignature(profile(p.id)))throw new Error('剧情或接口已改变，本次记忆未应用。');
      if(target.record)captureRevision(target);target.source=sourceFor(session,request);target.sourceFingerprint=sourceFingerprint;target.revision||=1;target.record=result;target.status='ready';target.text=memoryText(target);delete target.error;delete target.indexError;taskFor(session,request).status='ready';
      try{await persist();}catch(e){Object.keys(target).forEach(k=>delete (target as any)[k]);Object.assign(target,originalTarget);throw e;}
    }catch(e){if(!target.record)target.status=signal.aborted?'pending':'failed';target.error=signal.aborted?'记忆整理已停止。':'记忆整理失败，请补记。';await safePersist();throw e;}
    if(preferences.vectorEnabled){try{await encodeMemories(session,[target],signal);await indexFactVectors(session,signal);}catch(e){if(!signal.aborted)logRuntime(e,'记忆索引');target.indexError=signal.aborted?'索引已停止。':'索引失败，记忆文字已保留。';await safePersist();if(signal.aborted)throw e;notice.value='记忆已保存，向量索引待重试。';}}
  }
  async function writeMemoryBatch(session:Session,indices:number[],signal:AbortSignal){
    const requests=indices.map(index=>copy(roundMemoryInput(session,index))),fingerprints=requests.map(memorySignature),p=copy(summaryProfile.value!);
    if(localService.value&&(!connectionReady(p)||apiFieldIssues(p,key(p)).length))throw new Error('请先保存记忆整理 API。');
    const signature=connectionSignature(p),records=await gateway().memoryBatch(requests,{...p,maxTokens:Math.min(32000,Math.max(p.maxTokens,requests.length*1200))},key(p),signal);signal.throwIfAborted();
    if(records.length!==requests.length||!sessions.value.includes(session)||signature!==connectionSignature(profile(p.id))||requests.some((r,i)=>!visibleSourceStillMatches(session,r.turnId,r.variantId)||memorySignature(roundMemoryInput(session,indices[i]))!==fingerprints[i]))throw new Error('剧情或接口已改变，本批记忆未应用。');
    const commitments=new Map();const batchDiagnostics:string[]=[];const normalized=records.map((r,i)=>{for(const c of requests[i].priorCommitments)if(!commitments.has(c.id))commitments.set(c.id,c);const record=normalizeMemoryResult(r,{...requests[i],priorCommitments:[...commitments.values()]},batchDiagnostics);for(const c of record.commitments)commitments.set(c.id,c);return record;});if(batchDiagnostics.length)recordDiagnostic({kind:'memory-audience',sessionId:session.id,issues:batchDiagnostics});
    const originalMemories=copy(session.memories);const targets=normalized.map((record,i)=>{const r=requests[i];let m=session.memories.find(m=>m.kind==='event'&&m.sourceTurn===r.turnId&&m.sourceVariant===r.variantId);if(!m){m={id:uid(),kind:'event',text:'',createdAt:now(),sourceTurn:r.turnId,sourceVariant:r.variantId};session.memories.push(m);}if(m.record)captureRevision(m);m.source=sourceFor(session,r);m.revision||=1;m.record=record;m.status='ready';m.sourceFingerprint=fingerprints[i];m.text=memoryText(m);delete m.vector;delete m.error;delete m.indexError;taskFor(session,r).status='ready';return m;});
    try{await persist();}catch(e){session.memories=originalMemories;throw e;}if(preferences.vectorEnabled)try{await encodeMemories(session,targets,signal);await indexFactVectors(session,signal);}catch(e){for(const m of targets)m.indexError='索引失败，记忆文字已保留。';await safePersist();if(signal.aborted)throw e;notice.value='记忆已保存，向量索引待重试。';}
  }
  async function flushMemoryInterval(session:Session,signal:AbortSignal){
    // One request per completed round. Failed tasks wait for explicit retry and
    // must not prevent newer rounds from being summarized and indexed.
    const index=session.turns.map((_,i)=>i).reverse().find(i=>{
      const turn=session.turns[i],variant=selected(turn);if(!variant?.text.trim()||!memoryNeedsWork(session,i))return false;
      const request=roundMemoryInput(session,i),existing=session.memories.find(m=>m.kind==='event'&&m.sourceTurn===turn.id&&m.sourceVariant===variant.id);
      // Changed author projections must not silently rebill already saved summaries.
      if(existing&&memoryReady(existing)&&existing.sourceFingerprint!==memorySignature(request))return false;
      return taskFor(session,request).status!=='failed';
    });
    if(index===undefined)return;
    const batch=[index],attempt=batch.map(i=>{const r=roundMemoryInput(session,i);return r.turnId+':'+r.variantId+':'+memorySignature(r);}).join('|');
    if(session.memoryBatchAttempt===attempt)return;session.memoryBatchAttempt=attempt;await safePersist();
    await executeMemoryBatch(session,batch,signal);
  }
  async function executeMemoryBatch(session:Session,batch:number[],signal:AbortSignal){
 const tasks=batch.map(i=>taskFor(session,roundMemoryInput(session,i)));
 tasks.forEach(t=>{t.status='running';t.attempts++;t.updatedAt=now();delete t.error;});
 try{await persist();if(batch.length===1)await writeRoundMemory(session,batch[0],signal);else await writeMemoryBatch(session,batch,signal);tasks.forEach(t=>{t.status='ready';t.updatedAt=now();});await persist();}
 catch(e){tasks.forEach(t=>{if(t.status==='stale')return;t.status=signal.aborted?'pending':'failed';t.error='记忆整理未完成，可重试；正文已保留。';t.updatedAt=now();});await safePersist();throw e;}
 }
 async function scheduleMemoryWork(session:Session){
 if(loading.value)return;memoryQueue.add(session);if(workingMemory.value||backupWorking.value)return;
 workingMemory.value=true;const current=new AbortController();memoryController=current;
 try{while(memoryQueue.size){const next=memoryQueue.values().next().value!;memoryQueue.delete(next);if(!sessions.value.includes(next))continue;
  for(;;){const previous=next.memoryBatchAttempt;try{await flushMemoryInterval(next,current.signal);await reindexTerminalNotes(next,current.signal);await indexFactVectors(next,current.signal);}catch(e){if(current.signal.aborted)throw e;logRuntime(e,'后台记忆整理');}if(previous===next.memoryBatchAttempt)break;current.signal.throwIfAborted();}
 }}catch(e){if(!current.signal.aborted)logRuntime(e,'后台记忆整理');}finally{workingMemory.value=false;if(memoryController===current)memoryController=undefined;await safePersist();}
 }
  watch(backupWorking,value=>{if(!value&&memoryQueue.size)void scheduleMemoryWork(memoryQueue.values().next().value!);});
  async function retryMemory(id?:string){
    const session=active.value;if(!session||busy.value||workingMemory.value)return;if(!ensureApiConfiguration())return;
    workingMemory.value=true;problem.value='';const current=new AbortController();memoryController=current;
    try{const indices=session.turns.map((_,i)=>i).filter(i=>{const t=session.turns[i],m=session.memories.find(m=>m.sourceTurn===t.id&&m.sourceVariant===selected(t)?.id&&m.kind==='event');return selected(t)?.text.trim()&&memoryNeedsWork(session,i)&&(!id||m?.id===id||id===`missing:${t.id}`);});for(const index of indices){current.signal.throwIfAborted();await executeMemoryBatch(session,[index],current.signal);}notice.value='记忆已保存。';}
    catch(e){problem.value=message(e);}finally{workingMemory.value=false;if(memoryController===current)memoryController=undefined;await safePersist();}
  }
  async function recall(session:Session,text:string,before=session.turns.length,contextual=true,trace?:(value:RecallTrace)=>void,audience?:string[]):Promise<Memory[]> {
    // Idempotent: rewrite derived notes from committed terminal.memories so legacy archives
    // loaded before the public/private split still gain their #private siblings before any
    // retrieval. Never touches real terminal records, only derived note texts and vectors.
    syncTerminalMemoryNotes(session);
    const list=memoryLedger(session,before).filter(memoryReady).filter(m=>terminalCapability.value?(!isTerminalMemoryNote(m)||m.terminalKey!==undefined):!isTerminalMemoryNote(m)).reverse();if(!list.length){trace?.({mode:'keyword',query:text,candidates:0,hits:[]});return [];}
    const contextState=stateAt(session,before),recent=session.turns.slice(0,before).flatMap(t=>{const v=selected(t);return v?.status==='complete'&&v.outcome?[v.outcome.event]:[];});
    const query=contextual?buildRecallQuery(text,contextState,recent,memoryLedger(session,before).filter(m=>m.record&&memoryReady(m)).at(-1)?.record?.location):text;let vector:number[]|undefined,fallback='';const p=copy(profile(preferences.embeddingProfile));
    if(preferences.vectorEnabled&&(preferences.mode==='demo'||key(p)))try{vector=(await gateway().embed([query],p,key(p),controller?.signal||new AbortController().signal))[0];}catch(e){if(controller?.signal.aborted)throw e;fallback='向量接口不可用，已退回关键词检索';logRuntime(e,'记忆向量检索');notice.value='向量接口不可用，已退回关键词检索';}
    const mode:RecallTrace['mode']=vector?.length?'vector+keyword':'keyword';
    const scoped=!!audience&&audience.length>0;
    const segmentLabel=(hit:Memory)=>{
     const at=hit.id.indexOf('#seg:');if(at<0)return undefined;
     const note=list.find(x=>x.id===hit.id.slice(0,at));if(!note||!isTerminalMemoryNote(note))return undefined;
     const b=session.terminal?.memories?.find(b=>b.anchor.key===terminalNoteKey(note));if(!b)return undefined;
     const entry=[...b.chats,...b.games].find(e=>e.id===hit.id.slice(at+5));
     return entry?factLabel(entry.knownBy):undefined;
    };
    const hits=await recallScoped({items:list,query,audience:scoped?audience:undefined,model:fingerprint(p),vector,candidate:session.memoryEngine==='candidate',noteCandidates:m=>terminalSegmentCandidates(session,m,scoped?audience!:[],fingerprint(p)),resolveName:nameResolver(contextState)});
    const labeled=scoped?hits:labelNarratorFacts(hits,list,segmentLabel);
    trace?.({mode,query,candidates:list.length,hits:labeled,...(fallback?{fallback}:!labeled.length?{fallback:'no-match'}:{})});
    return labeled;
  }
  async function prepareRandomEvent(session:Session,index:number){
    const turn=session.turns[index],gate=turn.randomEvent;if(!gate||(gate.status!=='preparing'&&gate.status!=='failed'))return;const kind=gate.kind,p=copy(profile(preferences.randomEventProfile||preferences.mainProfile));
    turn.randomEvent={status:'preparing',kind};busy.value=true;problem.value='';generationStarted.value=Date.now();generationPhase.value='正在生成随机事件…';const current=new AbortController();let prepared=false;controller=current;await safePersist();
    try{
      const separate=preferences.randomEventProfile&&preferences.randomEventProfile!==preferences.mainProfile&&p.id!==storyProfile.value?.id;
      const proposal=localService.value&&separate?await http.randomEvent({instruction:preferences.randomEventInstruction,kind,persona:copy(session.persona),input:turn.input,history:session.turns.slice(Math.max(0,index-6),index).flatMap(t=>{const v=selected(t);return v?.status==='complete'?[{role:'user' as const,content:t.input.slice(-12000)},{role:'assistant' as const,content:v.text.slice(-12000)}]:[];}),presentCharacterIds:stateAt(session,index).characters.filter(c=>c.present).map(c=>c.id)},p,key(p),current.signal):{kind,title:kind,description:'Create a concrete event of this category grounded in the current scene and enact it in this response.'};
      current.signal.throwIfAborted();turn.randomEvent={status:'accepted',proposal};turn.dice=rollDice();prepared=true;return true;
    }catch(e){turn.randomEvent={status:'failed',kind};problem.value=message(e);notice.value='事件候选未完成，正文尚未生成。可重试或跳过本轮事件。';}
    finally{busy.value=prepared;if(controller===current)controller=undefined;await safePersist();}
  }
  async function decideRandomEvent(index:number,accept:boolean){
    const session=active.value;if(!session||busy.value||workingMemory.value)return;const turn=session.turns[index],gate=turn?.randomEvent;if(!gate)return;
    if(gate.status==='pending'){turn.randomEvent={status:accept?'accepted':'declined',proposal:gate.proposal};if(accept)turn.dice=rollDice();else delete turn.dice;}
    else if(!accept&&(gate.status==='preparing'||gate.status==='failed')){turn.randomEvent={status:'skipped'};delete turn.dice;}else return;
    await safePersist();await generate(undefined,index);
  }
  async function generate(text?:string,turnIndex?:number,continuePartial=false,stateOnly=false) {
    const requestPreferences=copy(preferences);
    if(unsafeNativeDrafts.value){problem.value='请先清理旧预设草稿。';return;}
    if(restoreInterrupted.value){problem.value='上次恢复中断，请先恢复覆盖前的完整副本。';return;}
    const session=active.value;if(!session||busy.value||backupWorking.value)return;if(terminalBusy.value){problem.value='终端正在处理消息，请稍候再推进剧情。';return;}
    if(!authorized.value){problem.value='请先验证访问资格';return;}
    const p=copy(storyProfile.value!);const storyKey=key(p);
    if(!ensureApiConfiguration())return;
    if(localService.value&&session.sourceDataset!==localService.value.dataset){problem.value='这是旧版演示存档，请新建一份服务器世界卡存档测试。原存档仍保留。';return;}
    if(localService.value&&!connectionReady(p)){problem.value='请在API 设置填写服务地址、模型名称，并确认使用此服务。';panel.value='settings';return;}
    if(requestPreferences.mode==='server'&&gateway().capabilities.keyRequired!==false&&!key(p)){problem.value='请在API 设置填写当前接口的 Key';panel.value='settings';return;}
    let index:number;
    if(turnIndex===undefined){if(pendingRandomEvent.value){problem.value='请先决定或跳过当前随机事件，再发送下一轮行动。';return;}const content=(text??input.value).trim();if(!content){problem.value='请先输入本轮行动';return;}if(content.length>16000){problem.value='单条输入超过首版长度限制';return;}const kind=randomEventsAvailable&&requestPreferences.diceEnabled?drawSpecialEvent(requestPreferences.randomEventProbability??30):undefined;session.turns.push({id:uid(),input:content,randomEvent:kind?{status:'preparing',kind}:{status:'none'},variants:[],selected:0});index=session.turns.length-1;input.value='';}
    else{index=turnIndex;if(!session.turns[index])return;if(continuePartial&&!selected(session.turns[index])?.text){problem.value='当前没有需要续写的正文。';return;}truncate(session,index+1);}
    const turn=session.turns[index];session.suggestions=[];if(randomEventsAvailable&&(turn.randomEvent?.status==='preparing'||turn.randomEvent?.status==='failed')){if(!await prepareRandomEvent(session,index))return;}if(randomEventsAvailable&&turn.randomEvent?.status==='pending'){turn.randomEvent={status:'accepted',proposal:turn.randomEvent.proposal};turn.dice=rollDice();}if(continuePartial&&!stateOnly&&selected(turn)?.status==='complete'){turn.variants.push({...copy(selected(turn)!),id:uid(),status:'incomplete'});turn.selected=turn.variants.length-1;}const firstAttempt=turn.variants.length===0;const partial=continuePartial?selected(turn)?.text||'':'';if(!continuePartial){turn.variants.push({id:uid(),text:'',status:'incomplete',createdAt:now()});turn.selected=turn.variants.length-1;}const variant=turn.variants[turn.selected];if(variant.repairAudit?.variantId!==variant.id)delete variant.repairAudit;const previousOutcome=stateOnly&&variant.status==='complete'?copy(variant.outcome):undefined;const repairBefore=stateOnly?stateAt(session,index+1):undefined;if(stateOnly)repairReport.value=undefined;if(!previousOutcome)delete variant.outcome;
    if(!stateOnly&&terminalEnabled.value)ensureTerminalCodes(session,index);
    const logBefore=copy(repairBefore||stateAt(session,index));
    const generationType=continuePartial?'continue':firstAttempt?'normal':'regenerate';continuationAttempt.value=0;repairingState.value=stateOnly;
    protectedGeneration={sessionId:session.id,turnId:turn.id,variantId:variant.id,checkpoint:copy(variant)};busy.value=true;problem.value='';generationStarted.value=Date.now();generationPhase.value='正在检索本地记忆…';controller=new AbortController();let done=false,inputCommitted=false;const callId=crypto.randomUUID();activeCallId=callId;const callErrors:string[]=[];let modelRaw='',completionInfo='',incompleteCode='MODEL_RESPONSE_INCOMPLETE';let recallTrace:RecallTrace|undefined;let stopBinding:(()=>void)|undefined;let streamTimer:ReturnType<typeof setTimeout>|undefined,pendingDelta='';const flushStream=()=>{clearTimeout(streamTimer);streamTimer=undefined;if(pendingDelta){variant.text+=pendingDelta;pendingDelta='';}};syncTerminalMemoryNotes(session);
    try {
      await persist();inputCommitted=true;
      // 终端在前的顺序：先以已确认历史与本轮输入产生通讯，正文随后消费已确认的通讯事实。
      let terminalFacts='';
      if(!stateOnly&&!continuePartial&&terminalEnabled.value&&terminalOrder.value==='terminal-first')terminalFacts=(await runTerminalStage(index,{automatic:true})).facts;
      // 续写与仅修状态不重开通讯：直接取回这一轮已提交阶段保存的事实，不调用终端模型、
      // 不重复落库；事实随任务存进存档，页面重载后同样可恢复。
      else if((continuePartial||stateOnly)&&terminalEnabled.value)terminalFacts=terminalCommittedFacts(session,index);
      const recalled=stateOnly?visibleMemories(session,index).slice(-8):await recall(session,turn.input,index,true,trace=>{recallTrace=trace;});
      const lore=sessionLore(requestPreferences,session,index,turn.input,turn.id,localService.value?.narratorName||'星穹学院');
      worldbookRuntimeWarnings.value=lore.warnings;
      worldbookRuntimeDiagnostics.value=lore.diagnostics;
      const request:GenerateRequest={...(terminalFacts?{terminalFacts}:{}),stateEnabled:requestPreferences.stateEnabled!==false,previousTheaters:visibleTheaters(session).filter(scene=>requestPreferences.theaters?.some(t=>t.enabled&&t.slot===scene.slot)).map(({round,...scene})=>({...scene,content:scene.content.slice(0,1200),...(scene.diary?{diary:{...scene.diary,content:scene.diary.content.slice(0,1200)}}:{}),...(scene.messages?{messages:scene.messages.slice(-6).map(m=>({...m,content:m.content.slice(0,400)}))}:{})})),worldInfo:lore.entries,suggestionsEnabled:requestPreferences.suggestionsEnabled!==false,randomEventInstruction:randomEventsAvailable&&!continuePartial&&!stateOnly&&turn.randomEvent?.status==='accepted'?requestPreferences.randomEventInstruction:undefined,specialEvent:randomEventsAvailable&&!continuePartial&&!stateOnly&&turn.randomEvent?.status==='accepted'?copy(turn.randomEvent.proposal):undefined,sessionId:session.id,turnId:turn.id,persona:copy(session.persona),opening:session.opening,input:turn.input,historyStart:Math.max(0,index-12),history:session.turns.slice(Math.max(0,index-12),index).flatMap(t=>{const v=selected(t);return v?.status==='complete'?[{role:'user' as const,content:t.input},{role:'assistant' as const,content:v.text}]:[];}),memories:(()=>{const phone=terminalCapability.value;const chunks=phone?[...terminalRecall(session,index)]:[];const latestKey=phone?terminalLatestBucket(session,index)?.anchor.key:'';for(const m of recalled)if(phone&&isTerminalMemoryNote(m)&&terminalNoteKey(m)!==latestKey)chunks.push(...memoryChunks(m.text));return [...chunks,...memoryContext(recalled.filter(m=>!isTerminalMemoryNote(m)),activeCommitments(memoryLedger(session,index)))].slice(0,8);})(),state:stateAt(session,index),dice:randomEventsAvailable&&!continuePartial&&!stateOnly&&turn.randomEvent?.status==='accepted'?copy(turn.dice):undefined,profile:copy(p),presets:[],promptEntries:stateOnly?[]:copy(activePromptEntries(presetEntries.value,generationType)),generationType,theaterSettings:copy(requestPreferences.theaters)?.map(t=>t.kind==='group'?{...t,enabled:false}:t),continuation:partial?{partial,...(stateOnly?{mode:'state' as const}:{})}:undefined,forumContext:(requestPreferences.theaters?.some(t=>t.slot===1&&t.enabled)?visibleForum(session,index):[]).slice(0,6).map(post=>({authorName:post.authorName,content:post.content.slice(0,1000),replies:(session.forumActivity?.[post.key]?.replies||[]).slice(-3).map(reply=>(reply.kind==='ai'?reply.authorName:session.persona.name)+'：'+reply.text)}))};
      const repairPlan=stateOnly&&previousOutcome?missingRepairPlan(previousOutcome,repairBefore!,variant.generationRequirements?.theaters||requestPreferences.theaters,variant.generationRequirements?.stateEnabled??requestPreferences.stateEnabled!==false,requestPreferences.suggestionsEnabled!==false):undefined;
      if(repairPlan&&request.continuation){request.continuation.repairPlan=repairPlan;request.state.characters.push(...copy(repairBefore!.characters.filter(c=>!request.state.characters.some(a=>a.id===c.id))));request.stateEnabled=repairNeedsState(repairPlan);request.theaterSettings=request.theaterSettings?.map(s=>({...s,enabled:repairPlan.theaterSlots.includes(s.slot)}));request.suggestionsEnabled=repairPlan.suggestions;}
      const regexRules=copy((requestPreferences.regexRules||[]).filter(r=>!r.setId||r.setId===currentPreset.value));
      if(!stateOnly&&!continuePartial)variant.generationRequirements={stateEnabled:request.stateEnabled!==false,theaters:copy(request.theaterSettings||defaultTheaters())};
      if(regexRules.some(r=>!r.disabled&&(!r.markdownOnly||r.promptOnly))){const context={scope:'prompt' as const,user:session.persona.name,char:localService.value?.narratorName||'星穹学院'};const messages=[...request.history,{role:'user' as const,content:request.input}];const edited=session.turns.slice(Math.max(0,index-12),index).filter(t=>selected(t)?.status==='complete').flatMap(t=>[!!t.inputEdited,!!selected(t)?.edited]);edited.push(!!turn.inputEdited);for(let i=0;i<messages.length;i++){const item=messages[i];const transformed=await runRegex(item.content,regexRules,{...context,placement:item.role==='user'?1:2,edited:edited[i],depth:messages.length-1-i},controller.signal);if(transformed.errors.length)callErrors.push('REGEX_WARNING：'+transformed.errors.join('、'));item.content=transformed.text;}request.input=messages.pop()!.content;request.history=messages;for(const entry of request.worldInfo||[]){const transformed=await runRegex(entry.content,regexRules,{...context,placement:5,depth:entry.depth},controller.signal);if(transformed.errors.length)callErrors.push('REGEX_WARNING：'+transformed.errors.join('、'));entry.content=transformed.text;}}
      generationPhase.value='等待模型返回（单次请求／重试最长10分钟）…';
      let branchRevision=0;stopBinding=watch(()=>({sessionId:sessionId.value,persona:session.persona,opening:session.opening,initial:session.initial,turns:session.turns.map((t,i)=>({id:t.id,input:t.input,selected:t.selected,variants:t.variants.map(v=>i<index?{id:v.id,text:v.text,status:v.status,outcome:v.outcome,mvuOverride:v.mvuOverride}:{id:v.id})}))}),()=>{branchRevision++;},{deep:true,flush:'sync'});const expectedRevision=branchRevision;
      for await(const event of gateway().generate(request,storyKey,controller.signal)) {
        if(branchRevision!==expectedRevision)throw Error('当前分支已变化，已拒绝迟到的生成结果');
        if(controller.signal.aborted)throw new DOMException('已停止','AbortError');
        if(event.type==='developer-trace'){if(localService.value?.developerMode){developerTraces.value.unshift(event.trace);developerTraces.value=developerTraces.value.slice(0,40);}}
        else if(event.type==='format-error'){callErrors.push(event.code+'：'+event.raw);}
        else if(event.type==='diagnostic'){
          const diagnostic=event.diagnostic;recordDiagnostic(diagnostic);
          if(diagnostic.finishReason!==undefined)completionInfo=['上游结束原因：'+(diagnostic.finishReason||'未提供'),'可见输出字符：'+(diagnostic.visibleChars??0),'隐藏推理字符：'+(diagnostic.reasoningChars??0),'请求输出上限：'+request.profile.maxTokens+' tokens'].join('\n');
          if(diagnostic.stage==='rejected'&&diagnostic.code)incompleteCode=diagnostic.code;
if(event.diagnostic.code==='STATE_AUX_RETAINED')notice.value='MVU 副接口未完成更新；主接口的正文、小剧场和快捷回复已保存，原状态沿用。';if(event.diagnostic.code==='STATE_SIDE_SCENE_RETAINED')notice.value='模型遗漏了本轮已开启的部分小剧场，正文和有效内容已保存；可在回复操作中手动补全，不会自动再次调用。';if(event.diagnostic.code==='STATE_STORY_MISSING')notice.value='模型本轮仅返回状态，已有状态和有效小剧场已保存；没有收到剧情正文，可手动续写。';}
        else if(event.type==='progress'){generationPhase.value=event.phase==='hidden'?'中转站正在返回数据，目前尚无可展示正文（思考内容保持隐藏）…':event.phase==='receiving'?'正在接收正文和隐藏状态…':'等待模型返回…';}
        else if(event.type==='delta'){generationPhase.value='正在接收正文…';if(repairingState.value)continue;pendingDelta+=event.text;if(!streamTimer)streamTimer=setTimeout(flushStream,48);}
        else if(event.type==='repair'){generationPhase.value='正文已保留，正在补修状态…';repairingState.value=true;continuationAttempt.value=event.attempt;notice.value=`正在补修状态${event.attempt}/${event.maxAttempts}：${event.reason}`;}
        else if(event.type==='continuation'){generationPhase.value='回复截断，正在自动续写…';repairingState.value=false;continuationAttempt.value=event.attempt;notice.value=`检测到截断，正在自动续写 ${event.attempt}/${event.maxAttempts}…`;}
        else if(event.type==='done'){
          flushStream();modelRaw=typeof event.raw==='string'?event.raw:'';let outcome=event.outcome;
          if(previousOutcome){outcome={...mergeRepairOutcome(previousOutcome,outcome,stateAt(session,index),repairBefore!,repairPlan),theaters:mergeRepairTheaters(previousOutcome.theaters,outcome.theaters,requestPreferences.theaters,repairBefore!)};}
          if(previousOutcome)outcome=reconcileRepairScenes(outcome,requestPreferences.theaters,stateAt(session,index+1));
          protectedGeneration=undefined;finishVariant(session,index,variant,outcome);if(outcome.terminal&&terminalEnabled.value)applyTerminalBatch(session,outcome.terminal,index);if(repairBefore)variant.repairAudit=createRepairAudit(variant.id,repairBefore,stateAt(session,index+1),compareRepair(repairBefore,stateAt(session,index+1)),variant.outcome?.stateUpdate?.codes);if(repairBefore)repairReport.value={sessionId:session.id,turnId:turn.id,rows:compareRepair(repairBefore,stateAt(session,index+1))};variant.suggestions=[...(outcome.suggestions||[])];await persist();done=true;if(!stateOnly){if(terminalEnabled.value&&terminalOrder.value==='story-first')await runTerminalStage(index,{automatic:true});
            // 终端在前的顺序里，社交动作只能在正文确认后核验：绑定同一轮、只出动作、
            // 不重生成群聊或正文；正文没有接触/邀请信号时零额外请求。
            else if(terminalEnabled.value&&terminalSocialSignal(session,index))await runTerminalStage(index,{automatic:true,socialOnly:true});
            markGenerationComplete(callId);}
        }
      }
      if(!done)throw new Error('未收到完整回复，已保留部分内容。');
      notice.value=(()=>{const session=active.value;const job=session&&session.turns[index]?session.terminal?.jobs?.find(j=>j.target==='auto'&&j.anchor.turnId===session.turns[index].id&&j.status==='failed'):undefined;return job?(job.error||'正文完成，终端部分未完成'):'正文已保存，本轮记忆正在后台整理，完成后建立已启用的向量索引。';})();
      if(stateOnly&&!problem.value)notice.value='状态与记忆已保存。';
    }catch(e){flushStream();if(inputCommitted&&!stateOnly&&variant.status==='incomplete'&&variant.text.trim())variant.outcome={event:'本轮正文未完成，状态未更新',stateUpdate:{status:'retained',received:false,storyComplete:false,codes:[incompleteCode]}};if(!inputCommitted&&turnIndex===undefined){session.turns=session.turns.filter(t=>t!==turn);session.draftInput=turn.input;input.value=turn.input;inputDrafts.set(session.id,turn.input);}problem.value=message(e);callErrors.push(problem.value);if(repairBefore)variant.repairAudit=createRepairAudit(variant.id,repairBefore,stateAt(session,index+1),compareRepair(repairBefore,stateAt(session,index+1)),variant.outcome?.stateUpdate?.codes,message(e));if(repairBefore)repairReport.value={sessionId:session.id,turnId:turn.id,rows:compareRepair(repairBefore,stateAt(session,index+1)),problem:message(e)};}
    finally{flushStream();stopBinding?.();protectedGeneration=undefined;const logApplied=selected(turn)?.id===variant.id&&variant.status==='complete';const logAfter=logApplied?stateAt(session,index+1):logBefore;const variables=variableChangeLog(logBefore,logAfter,logApplied,variant.outcome?.stateUpdate?.affinityReviewedIds,logStateDetails(variant.outcome).map(d=>d.text),variant.outcome?.stateUpdate?.codes);const sections=generationSections({errors:callErrors,variant,outcome:variant.outcome,before:logBefore,after:logAfter,applied:logApplied,variables,recall:recallTrace,stateOnly,raw:modelRaw,completionInfo});void formatErrors.record(done?'本次生成完成。':problem.value||'本次生成未完成。',done?'GENERATION_COMPLETE':'GENERATION_INCOMPLETE',session.id,turn.id,'generation',{variantId:variant.id,round:index+1,variables,callId,sections}).catch(()=>{});busy.value=false;continuationAttempt.value=0;repairingState.value=false;controller=undefined;activeCallId='';if(inputCommitted&&!done){session.updatedAt=now();await safePersist();}if(recallTrace?.fallback&&!problem.value)notice.value=recallTrace.fallback;const last=session.memories.find(m=>m.kind==='event'&&m.sourceTurn===turn.id&&m.sourceVariant===variant.id);if(last?.indexError)notice.value='记忆已保存，向量索引待重试。';if(inputCommitted&&variant.status==='complete'&&storageStatus.value==='saved')void scheduleMemoryWork(session).then(()=>{if(recallTrace?.fallback&&!problem.value)notice.value=recallTrace.fallback;});}
  }
  /** Manual retry of the terminal stage. It reuses the same coordinator, so a turn that
   * already finished its terminal round is not generated twice. */
  async function retryTerminalFollowup(index:number,_automatic=false){
    if(!Number.isInteger(index)||index<0)return false;
    const result=await runTerminalStage(index,{automatic:false});
    return result.ok;
  }
  /** UI retry bound to the job's own executed stage instead of the knowledge anchor. */
  async function retryTerminalJob(jobId:string):Promise<boolean>{
    const session=active.value,job=session?.terminal?.jobs?.find(j=>j.id===jobId);
    if(!session||!job)return false;
    const index=terminalJobTurnIndex(session,job);
    if(index<0||index>=session.turns.length)return false;
    // 任务自身记录了它执行的阶段：之后切换顺序也不能把旧任务重跑到另一种阶段上。
    const mode:TerminalAutoMode=job.mode==='terminal-first'?'terminal-first':'story-first';
    return (await runTerminalStage(index,{automatic:false,socialOnly:job.mode==='social-review',mode})).ok;
  }
  async function changeVariant(index:number,variant:number){if(!active.value||busy.value||backupWorking.value)return;try{selectVariant(active.value,index,variant);await safePersist();}catch(e){problem.value=message(e);}}
  async function rewind(count:number){
    const session=active.value;if(!session||busy.value||workingMemory.value||!Number.isInteger(count)||count<0||count>=session.turns.length)return;
    const previous=copy(session);
    try{truncate(session,count);await persist();if(repairReport.value?.sessionId===session.id&&!session.turns.some(t=>t.id===repairReport.value?.turnId))repairReport.value=undefined;problem.value='';notice.value='已回溯，相关剧情状态与记忆已恢复';}
    catch(e){for(const key of Object.keys(session))if(!Object.hasOwn(previous,key))delete (session as unknown as Record<string,unknown>)[key];Object.assign(session,previous);problem.value='回溯未保存，原对话和记录已恢复：'+message(e);}
  }
  async function withdraw(index:number,expectedDraft?:string,expectedTurnId?:string):Promise<boolean>{
    const session=active.value,turn=session?.turns[index];if(!session||!turn||busy.value)return false;
    if(expectedTurnId!==undefined&&turn.id!==expectedTurnId){problem.value='消息已发生变化，请重新选择撤回。';return false;}
    if(expectedDraft!==undefined?input.value!==expectedDraft:!!input.value.trim()&&input.value!==turn.input){problem.value='输入框草稿已发生变化，请重新确认撤回与替换。';return false;}
    const previous=copy(session),previousInput=input.value;
    try{const restored=turn.input;truncate(session,index);session.draftInput=restored;input.value=restored;inputDrafts.set(session.id,restored);await persist();if(repairReport.value?.sessionId===session.id&&!session.turns.some(t=>t.id===repairReport.value?.turnId))repairReport.value=undefined;notice.value='已撤回本轮及后续对话，状态和记忆已回退，原发言已放回输入框。';problem.value='';return true;}
    catch(e){for(const key of Object.keys(session))if(!Object.hasOwn(previous,key))delete (session as unknown as Record<string,unknown>)[key];Object.assign(session,previous);input.value=previousInput;inputDrafts.set(session.id,previousInput);problem.value='撤回未保存，原对话和草稿已恢复：'+message(e);return false;}
  }
  async function edit(index:number,role:'user'|'assistant',text:string){if(!active.value||busy.value)return;try{editMessage(active.value,index,role,text);await safePersist();notice.value='修改已保存，已保留后续对话和已有状态';}catch(e){problem.value=message(e);}}
  async function savePersona(persona:Persona){const session=active.value;if(!session||busy.value)throw Error('请等待生成完成后保存人设');const before=copy(session.persona),initial=copy(session.initial.player);try{const value=normalizePersona(persona);session.persona=value;Object.assign(session.initial.player,{mentalPowerLevel:value.mentalPowerLevel||undefined,name:value.name,primaryGender:value.primaryGender,secondaryGender:value.secondaryGender,identity:value.identity,ability:value.ability,spiritAnimal:value.spiritAnimal});await persist();}catch(e){session.persona=before;session.initial.player=initial;problem.value=message(e);throw e;}}
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
      const reply=await http.forumReply({persona:copy(session.persona),state:copy(state.value),userName:session.persona.name,post:{authorName:selectedPost.authorName,content:selectedPost.content},comments,minReplies:5,participantNames:[...new Set([...(selectedPost.comments||[]).map(c=>c.authorName),...activity.replies.filter(r=>r.kind==='ai'&&r.authorName).map(r=>r.authorName!)])].slice(0,100)},p,key(p),current.signal);
      current.signal.throwIfAborted();if(!sessions.value.some(s=>s.id===session.id)||signature!==connectionSignature(profile(p.id)))throw new Error('存档或接口已改变，本次回复未应用。');
      if(Array.isArray(reply))addForumAIReplies(session,keyValue,replyId,reply);else addForumAIReply(session,keyValue,replyId,reply);await persist();notice.value=Array.isArray(reply)?`角色／NPC 已回复 ${reply.length} 条`:'角色／NPC 已回复你的评论';
    }catch(e){const detail=current.signal.aborted?'AI 回复已停止。':message(e);forumReplyError.value=detail+(/评论已(?:保留|保存)/.test(detail)?'':' 你的评论已保留。');}
    finally{if(forumController===current){forumController=undefined;workingForumReply.value='';}}return true;
  }
  async function saveMemory(text:string,id?:string){const session=active.value;if(!session||busy.value||workingMemory.value)return;const m=session.memories.find(x=>x.id===id);if(m?.record){if(text.length>3000){problem.value='记忆补充最多3000字。';return;}captureRevision(m);m.annotation=text.trim();m.text=memoryText(m);delete m.vector;delete m.indexError;}else if(text.trim()){if(m){captureRevision(m);m.text=text.trim();delete m.vector;delete m.indexError;}else session.memories.push({id:uid(),text:text.trim(),kind:'note',createdAt:now()});}await safePersist();}
  async function reviseMemoryRecord(id:string,text:string){const s=active.value,m=s?.memories.find(m=>m.id===id);if(!s||!m||busy.value||workingMemory.value)return false;try{const index=s.turns.findIndex(t=>t.id===m.sourceTurn);if(index<0)throw Error('来源不存在');const record=normalizeMemoryResult(JSON.parse(text),roundMemoryInput(s,index));captureRevision(m);m.record=record;m.text=memoryText(m);await persist();problem.value='';return true;}catch(e){problem.value=message(e);return false;}}
 function migrationPreview(){const s=active.value;if(!s)return {total:0,mappable:0,unconfirmed:0};let mappable=0;for(const m of s.memories){if(m.kind!=='event'){mappable++;continue;}const i=s.turns.findIndex(t=>t.id===m.sourceTurn);if(i>=0&&selected(s.turns[i])?.id===m.sourceVariant&&selected(s.turns[i])?.status==='complete'&&m.sourceFingerprint===memorySignature(roundMemoryInput(s,i)))mappable++;}return {total:s.memories.length,mappable,unconfirmed:s.memories.length-mappable};}
  async function activateMemoryLedger(){const s=active.value;if(!s||busy.value||workingMemory.value)return;try{migrateMemoryLedger(s,i=>roundMemoryInput(s,i));await persist();notice.value='来源账本已启用，原记忆已保留，不会自动重建向量。';}catch(e){problem.value=message(e);}}
  async function useLegacyMemory(){if(!active.value||busy.value||workingMemory.value)return;active.value.memoryEngine='legacy';await safePersist();notice.value='已回到原检索方式，新增记忆与历史记录均保留。';}
  async function restoreMemoryRevision(id:string,revision:number){const s=active.value,m=s?.memories.find(m=>m.id===id),r=m?.revisions?.find(r=>r.revision===revision);if(!s||!m||!r||busy.value||workingMemory.value)return;const saved=copy(r);captureRevision(m);m.text=saved.text;m.annotation=saved.annotation;m.record=saved.record;if(m.record)m.text=memoryText(m);await safePersist();}
  async function removeMemory(id:string){if(!active.value||busy.value||workingMemory.value)return;const removed=active.value.memories.find(m=>m.id===id);if(removed)active.value.memoryArchive=[...(active.value.memoryArchive||[]),copy(removed)];active.value.memories=active.value.memories.filter(m=>m.id!==id);await safePersist();}
  async function indexMemories(){const session=active.value;if(!session||busy.value||workingMemory.value)return;if(!preferences.vectorEnabled){problem.value='请先开启向量检索并配置向量 API。';return;}workingMemory.value=true;problem.value='';const current=new AbortController();memoryController=current;try{await encodeMemories(session,visibleMemories(session),current.signal);notice.value='记忆索引已保存。';}catch(e){for(const m of visibleMemories(session))if(memoryReady(m)&&!vectorCurrent(m,fingerprint(profile(preferences.embeddingProfile))))m.indexError='索引失败，记忆文字已保留。';problem.value=message(e);}finally{workingMemory.value=false;if(memoryController===current)memoryController=undefined;await safePersist();}}
  async function searchMemory(query:string):Promise<Memory[]>{if(!active.value)return[];if(!query.trim())return memories.value;try{return await recall(active.value,query,active.value.turns.length,false);}catch(e){problem.value=message(e);return[];}}
  function download(filename:string,content:string,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function transferBlocked(){requireSafeDrafts();return loading.value||busy.value||workingMemory.value||terminalBusy.value||workingPersona.value||creatingGame.value||workingForumReply.value||configuringApis.value||backupWorking.value;}
  async function completeBackupSnapshot():Promise<Snapshot>{
    if(restoreInterrupted.value)throw Error('上次恢复中断，请先恢复覆盖前的完整副本。');
    if(transferBlocked())throw Error('请先等待或停止当前任务，再备份。');
    await flushBackupEditors();if(transferBlocked())throw Error('当前任务状态已改变，请重试备份。');backupWorking.value=true;
    try{await flushInputDrafts();clearTimeout(newGameDraftTimer);await persist();await writes;const archive=await collectFullArchive();await persist();await writes;const value={...snapshot(),archive};parseBackup(backup(value));return value;}
    finally{backupWorking.value=false;}
  }
  function downloadWorkspace(value:Snapshot){download(`群星共振-完整备份-${new Date().toISOString().slice(0,10)}.json`,backup(value));notice.value='完整备份已下载，包含人设档案与终端记录，不包含 Key 和运行日志。';}
  async function exportBackup(){try{downloadWorkspace(await completeBackupSnapshot());return true;}catch(e){problem.value=message(e);return false;}}
  async function createCloudWorkspaceBackup(){const value=await completeBackupSnapshot();return createCloudSave(value,{...value.preferences,characterImages:{...value.preferences.characterImages,...value.archive?.characterImages}},value.archive?.nicknameImages);}
  function exportApiConfiguration(includeKeys=false){
    if(loading.value||busy.value||configuringApis.value)return;
    download(`群星共振-API设置${includeKeys?'-含Key':''}-${new Date().toISOString().slice(0,10)}.json`,exportApiSettings(preferences,credentials,includeKeys));
    notice.value=includeKeys?'API 设置已导出，文件包含明文 Key，请妥善保管。':'API 设置已导出，不包含 Key。';
  }
  async function importApiConfiguration(text:string){
    if(loading.value||busy.value||workingMemory.value||configuringApis.value||workingPersona.value||creatingGame.value||workingForumReply.value)return false;
    try{
      const imported=parseApiSettings(text);
      const retained=Object.fromEntries(imported.configuration.profiles.filter(p=>{
        const old=preferences.profiles.find(old=>old.id===p.id);return old&&apiAddress(old.apiBaseUrl)===apiAddress(p.apiBaseUrl)&&!!credentials[p.id];
      }).map(p=>[p.id,credentials[p.id]]));
      const next=cleanPreferences({...copy(preferences),...imported.configuration}),keys={...retained,...imported.keys||{}};
      const local:LocalApiCredentials={version:1,remember:rememberApiKeys.value,keys:rememberApiKeys.value?keys:{},confirmed:{}};
      const task=writes.catch(()=>{}).then(()=>repository.writeConfiguration(next,local));writes=task;await task;
      for(const id of Object.keys(approved))delete approved[id];for(const id of Object.keys(credentials))delete credentials[id];Object.assign(preferences,next);Object.assign(credentials,keys);apiStorageReady=true;
      problem.value='';notice.value='API 设置已导入，请保存 API 确认配置后使用。';return true;
    }catch(e){problem.value=message(e);return false;}
  }
  async function importBackup(text:string,replace=false){
    try{
      if(transferBlocked())throw Error('请先等待或停止当前任务，再导入备份。');
      const parsed=parseWorkspaceBackup(text),value=parsed.snapshot;
      if(localService.value)for(const session of value.sessions)syncCharacterFacts(session,localService.value.dataset,localService.value.characterFacts);
      let target=value;
      if(!replace){
        const ids=new Map<string,string>();for(const session of value.sessions){const old=session.id;session.id=uid();ids.set(old,session.id);rebindMemorySources(session);session.name+='（导入）';}
        const p=cleanPreferences(copy(preferences));mergeWorldbookBackup(p,value.preferences,value.sessions);p.characterImages={...p.characterImages,...value.preferences.characterImages};
        target={version:1,sessions:[...copy(sessions.value),...value.sessions],preferences:p,...(value.archive?{archive:remapBackupArchive(value.archive,ids)}:{})};
      }
      await replaceCloudWorkspace(target,parsed.cloud,replace?'replace':'merge',parsed.cloud||!replace);problem.value='';notice.value='备份已恢复，人设档案及终端记录已同步。';return true;
    }catch(e){problem.value=message(e);return false;}
  }
  async function saveCurrentCloudBackup(){const value=await completeBackupSnapshot();await repository.write(value,'manual-workspace');downloadWorkspace(value);}
  async function restoreCloudSave(text:string){const cloud=parseCloudSave(text),value=cloud.snapshot;if(!value.archive&&Object.keys(cloud.nicknameImages).length)value.archive={version:1,nicknameImages:cloud.nicknameImages};return replaceCloudWorkspace(value,true);}
  async function undoCloudRestore(){const saved=await repository.readCloudRecovery('workspace');if(!saved)throw Error('没有覆盖前的本地备份。');return replaceCloudWorkspace(saved,false);}
  async function replaceCloudWorkspace(incoming:Snapshot,preserveMedia:boolean,mode:'replace'|'merge'='replace',keepApis=true){
    if(transferBlocked())throw Error('请先等待或停止当前任务，再恢复备份。');
    await flushBackupEditors();if(transferBlocked())throw Error('当前任务状态已改变，请重试恢复。');backupWorking.value=true;
    let release:(()=>Promise<void>)|undefined,undo:(()=>Promise<void>)|undefined,beforeArchive:Snapshot['archive'],prepared=false;const oldDraft=copy(newGameDraft),wasInterrupted=restoreInterrupted.value;
    try{
      release=await repository.lockRestore();await persist();await writes;
      const before={...snapshot(),archive:await collectFullArchive()};beforeArchive=before.archive;
      const value=copy(incoming);parseBackup(backup(value));const incomingEditorDrafts=value.archive?.editorDrafts,incomingNativePreset=value.archive?.nativePreset;
      if(keepApis)Object.assign(value.preferences,JSON.parse(exportApiSettings(preferences,{},false)).configuration);
      if(preserveMedia){value.preferences.characterImages={...value.preferences.characterImages,...preferences.characterImages};value.sessions=value.sessions.map(s=>{const current=sessions.value.find(c=>c.id===s.id);return current?mergeCloudSession(current,s):s;});}
      for(const session of value.sessions)rebindMemorySources(session);
      if(!wasInterrupted)await repository.prepareCloudRecovery(before);prepared=true;
      if(value.archive){const applied=await applyWorkspaceArchive(value.archive,mode,preserveMedia,before.archive);undo=applied.undo;if(value.archive.newGameDraft)Object.assign(newGameDraft,copy(value.archive.newGameDraft));}
      value.archive=await collectFullArchive();if(incomingNativePreset!==undefined&&(mode==='replace'||nativePreset.value===undefined))value.archive.nativePreset=copy(incomingNativePreset);if(incomingEditorDrafts!==undefined)value.archive.editorDrafts=mode==='merge'?{...before.archive?.editorDrafts,...incomingEditorDrafts}:incomingEditorDrafts;
      const task=writes.catch(()=>{}).then(()=>repository.write(value,undefined,true));writes=task;await task;undo=undefined;restoreInterrupted.value=false;
      sessions.value=value.sessions;Object.assign(preferences,value.preferences);nativePreset.value=value.archive?.nativePreset;inputDrafts.clear();
      if(!value.sessions.some(s=>s.id===sessionId.value))sessionId.value=value.sessions[0]?.id||'';
      input.value=active.value?.draftInput||'';
      storageStatus.value='saved';storageError.value='';lastSaved.value=now();notice.value='全部存档、人设档案及终端记录已恢复，覆盖前的完整副本已保留。';
    }catch(e){Object.assign(newGameDraft,oldDraft);if(undo)try{await undo();}catch{restoreInterrupted.value=true;throw Error('恢复未完成，部分资料无法自动回退；请保留页面，使用覆盖前的完整备份恢复。');}if(prepared){restoreInterrupted.value=true;if(!wasInterrupted&&beforeArchive)try{const current=await collectFullArchive();if(JSON.stringify(current)===JSON.stringify(beforeArchive)){await repository.clearInterruptedRestore();restoreInterrupted.value=false;}}catch{}}throw e;}
    finally{try{await release?.();}finally{await nextTick();backupWorking.value=false;}}
  }
  function exportBook(){const s=active.value;if(!s)return;const escape=(x:string)=>x.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');const body=s.turns.map(t=>{const v=selected(t);return v?.status==='complete'?`<section><p class="action">${escape(t.input)}</p><p>${escape(v.text)}</p></section>`:'';}).join('');download(`${s.name}-故事.html`,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(s.name)}</title><style>body{max-width:44rem;margin:3rem auto;padding:0 1.5rem;font:18px/1.8 system-ui;color:#222}p{white-space:pre-wrap}.action{color:#666}section{margin-bottom:2rem}</style><h1>${escape(s.name)}</h1><p>${escape(s.opening)}</p>${body}</html>`,'text/html');}
  function addProfile(){if(preferences.profiles.length>=30){problem.value='接口总数最多30个，请先移除不需要的副 API。';return '';}const id=uid();preferences.profiles.push({id,name:`副 API ${(preferences.auxiliaryProfiles?.length||0)+1}`,providerId:'approved-provider',model:'',temperature:0.7,maxTokens:32000});(preferences.auxiliaryProfiles||=[]).push(id);preferences.auxiliaryProfile=preferences.auxiliaryProfiles[0]||preferences.mainProfile;return id;}
  function removeProfile(id:string){if(id===preferences.mainProfile||id===preferences.embeddingProfile)return;preferences.profiles=preferences.profiles.filter(p=>p.id!==id);delete credentials[id];delete approved[id];preferences.auxiliaryProfiles=(preferences.auxiliaryProfiles||[]).filter(value=>value!==id);preferences.auxiliaryProfile=preferences.auxiliaryProfiles[0]||preferences.mainProfile;for(const task of textApiTasks)if(preferences[task.field]===id)preferences[task.field]=preferences.mainProfile;if(preferences.suggestionsProfile===id)preferences.suggestionsProfile=preferences.mainProfile;if(preferences.randomEventProfile===id)preferences.randomEventProfile=preferences.mainProfile;if(preferences.forumReplyProfile===id){preferences.forumReplyProfile=preferences.mainProfile;forumController?.abort();}}
  function moveAuxiliary(index:number,offset:number){const ids=preferences.auxiliaryProfiles||[],to=index+offset;if(to<0||to>=ids.length||busy.value)return;[ids[index],ids[to]]=[ids[to],ids[index]];preferences.auxiliaryProfile=ids[0]||preferences.mainProfile;}
  function importPreset(text:string,filename?:string,disabledIndices?:number[]){if(busy.value||backupWorking.value)return;try{const result=importTavernPreset(text,filename,{preserveOutputs:preferences.preservePresetOutputs===true});if(disabledIndices)confirmPresetCompatibility(result.entries,disabledIndices);if((preferences.regexRules?.length||0)+result.regexRules.length>500)throw Error('正则规则最多500条');preferences.presets.push(...result.entries);(preferences.regexRules||=[]).push(...result.regexRules);preferences.activePreset=result.id;(preferences.presetParameters||={})[result.id]={...cleanSampling(taskApi(preferences,'story')||profile(preferences.mainProfile)),maxTokens:32000,...result.parameters};presetWarnings.value=result.warnings;problem.value='';notice.value=`已导入 ${result.name}，共 ${result.entries.length} 条；采样参数与当前预设单独保存，切换预设会一并切换。`;}catch(e){problem.value=message(e);}}
  function exportPreset(){download(`${presetSets.value.find(s=>s.id===currentPreset.value)?.name||'预设'}.json`,exportTavernPreset(copy(presetEntries.value),storyProfile.value||profile(preferences.mainProfile),copy((preferences.regexRules||[]).filter(r=>r.setId===currentPreset.value))));}
  function addPresetSet(){const id=uid();preferences.activePreset=id;preferences.presets.push(...newPresetEntries(id,'新预设'));(preferences.presetParameters||={})[id]={...cleanSampling(taskApi(preferences,'story')||preferences.profiles[0]),maxTokens:32000};presetWarnings.value=[];}
  function addPresetEntry(){const name=presetSets.value.find(s=>s.id===currentPreset.value)?.name||'原有预设';preferences.presets.push({id:uid(),setId:currentPreset.value,setName:name,name:'新条目',identifier:uid(),role:'system',position:'before',depth:4,order:100,content:'',enabled:true});}
  function removePresetSet(){if(busy.value||backupWorking.value)return;delete preferences.presetParameters?.[currentPreset.value];preferences.regexRules=(preferences.regexRules||[]).filter(r=>r.setId!==currentPreset.value);preferences.presets=preferences.presets.filter(p=>setId(p)!==currentPreset.value);preferences.activePreset=presetGroups(preferences.presets)[0]?.id;if(!preferences.presets.length)addPresetSet();presetWarnings.value=[];}
  function movePresetTo(from:number,to:number){if(busy.value||backupWorking.value)return;const rows=reorderPresetEntries(presetEntries.value,from,to);let i=0;preferences.presets=preferences.presets.map(p=>setId(p)===currentPreset.value?rows[i++]:p);}
  function movePreset(index:number,offset:number){movePresetTo(index,index+offset);}
  function duplicatePresetSet(){if(busy.value||backupWorking.value)return;const sourcePreset=currentPreset.value;const rules=copy((preferences.regexRules||[]).filter(r=>r.setId===sourcePreset));const rows=copy(presetEntries.value),params=copy(presetParameters.value),id=uid(),name=(presetSets.value.find(s=>s.id===currentPreset.value)?.name||'预设')+'（副本）';preferences.presets.push(...rows.map(p=>({...p,id:uid(),setId:id,setName:name})));(preferences.presetParameters||={})[id]=params;(preferences.regexRules||=[]).push(...rules.map(r=>({...r,id:uid(),setId:id})));preferences.activePreset=id;}
  function removePresetEntry(id:string){if(busy.value||backupWorking.value)return;const p=presetEntries.value.find(p=>p.id===id);if(!p||pinnedPromptIds.includes(p.identifier||''))return;preferences.presets=preferences.presets.filter(p=>p.id!==id);}
  void boot();
  return {unsafeNativeDrafts,clearUnsafeNativeDrafts,nativePreset,nativeDefaultPreset,savingNativePreset,saveNativePreset,commitConfiguration,saveTerminal,saveEditorDraft,readEditorDraft,flushInputDrafts,inputDraftStatus,inputDraftError,retryTerminalFollowup,retryTerminalJob,terminalEpoch,runTerminalStage,setTerminalEnabled,setTerminalOrder,stopTerminal,terminalCapability,terminalProfile,terminalIssues,terminalConfigured,terminalOrder,terminalFollowupStatus:(index:number)=>active.value?terminalFollowupJob(active.value,index):undefined,restoreInterrupted,backupWorking,createCloudWorkspaceBackup,saveCurrentCloudBackup,restoreCloudSave,undoCloudRestore,storageError,terminalBusy,repairReport,replayWarnings,reviseMemoryRecord,migrationPreview,activateMemoryLedger,useLegacyMemory,restoreMemoryRevision,useMainForAll,storageStatus,developerTraces,memoryEntries,memoryNeedsRepair,chatRoundCount,effectiveMemoryCount,missingVectorCount,exportApiConfiguration,importApiConfiguration,hideFloors,formatErrors,...lorebooks,worldbookRuntimeWarnings,worldbookRuntimeDiagnostics,retryMemory,pendingMemoryCount,stopMemory,vectorStatus,retryForumReply,pendingRandomEvent,decideRandomEvent,workingForumReply,forumReplyPost,forumReplyError,stopForumReply,settingsTab,deleteSession,deletingSessionId,preferences,sessions,sessionId,panel,credentials,loading,authorized,busy,workingMemory,newGameDraft,workingPersona,creatingGame,personaNotice,resetNewGameDraft,assistPersona,stopPersona,notice,problem,input,lastSaved,active,state,memories,forum,theaters,presetEntries,presetSets,currentPreset,presetParameters,duplicatePresetSet,removePresetEntry,movePresetTo,presetWarnings,addPresetSet,addPresetEntry,removePresetSet,localService,rememberApiKeys,setRememberApiKeys,clearApiKeys,connectionReady,connectProfile,fetchModels,testProfile,generationPhase,generationStarted,auxiliaryProfiles,storyProfile,summaryProfile,personaProfile,apiSelectable,apiIssues,apiReady,configuringApis,continuationAttempt,repairingState,confirmAllApis,ensureApiConfiguration,enterStory,moveAuxiliary,canContinue,terminalEnabled,authorize,create,open,home,stop,generate,repairState:(index:number)=>generate(undefined,index,true,true),changeVariant,rewind,withdraw,edit,savePersona,loadPlace,toggleForumLike,replyToForum,saveMemory,removeMemory,indexMemories,searchMemory,indexTerminalNotes,scopedRecall:async(session:Session,text:string,audience:string[],trace?:(value:RecallTrace)=>void)=>terminalCapability.value?recall(session,text,session.turns.length,true,trace,audience):[],exportBackup,importBackup,exportBook,addProfile,removeProfile,importPreset,exportPreset,movePreset,save:safePersist};
}
export type Workspace = ReturnType<typeof useWorkspace>;
export type ViewModel = UnwrapNestedRefs<Workspace>;
