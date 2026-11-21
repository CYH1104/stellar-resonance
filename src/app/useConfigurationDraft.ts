import {presetOutputParsing} from '../domain/outputParsing';
import {computed,reactive,ref,watch,onScopeDispose} from 'vue';
import type {ViewModel} from './useWorkspace';
import type {Preferences,Profile,Session} from '../domain/contracts';
import {copy,uid} from '../domain/story';
import {apiAddress} from '../storage/apiCredentials';
import {mergeConfiguration,mergeCredentials} from './configurationMerge';
import {httpNoticeKeyOf} from '../gateway/requestFailure';
import {noticeTextFor} from './notices';
import {apiFieldIssues,auxiliaryApis,storyApi,taskApi,textApiTasks} from '../domain/apis';
import {presetGroups,setId,cleanSampling,importTavernPreset,exportTavernPreset,newPresetEntries,reorderPresetEntries,pinnedPromptIds} from '../domain/presets';
import {confirmPresetCompatibility} from '../domain/presetCompatibility';
import {exportApiSettings,parseApiSettings} from '../domain/apiTransfer';
import {useWorldbooks} from './useWorldbooks';
import {sameConfigurationValue as same} from './configurationEqual';
export function useConfigurationDraft(base:ViewModel){
 const preferences=reactive(copy(base.preferences)),credentials=reactive(copy(base.credentials)),rememberApiKeys=ref(base.rememberApiKeys),presetWarnings=ref<string[]>([]);
 const busy=computed(()=>base.busy),backupWorking=computed(()=>base.backupWorking),problem=computed({get:()=>base.problem,set:v=>base.problem=v}),notice=computed({get:()=>base.notice,set:v=>base.notice=v});
 const forumController:AbortController|undefined=undefined;
 const originals=ref(copy(base.preferences)),keyOriginals=ref(copy(base.credentials));let rememberOriginal=base.rememberApiKeys;
 const bindingDrafts=reactive<Record<string,string[]>>({}),bindingOriginals=reactive<Record<string,string[]>>({});
 const editors=new Map<string,{dirty:()=>boolean;save:()=>Promise<void>;discard:()=>Promise<void>}>();const editorRevision=ref(0);
 function registerEditor(id:string,editor:{dirty:()=>boolean;save:()=>Promise<void>;discard:()=>Promise<void>}){editors.set(id,editor);editorRevision.value++;return()=>{editors.delete(id);editorRevision.value++;};}
 const preferencesDirty=computed(()=>[...new Set([...Object.keys(preferences),...Object.keys(originals.value)])].some(key=>!same((preferences as any)[key],(originals.value as any)[key])));
 const dirty=computed(()=>{void editorRevision.value;return preferencesDirty.value||!same(credentials,keyOriginals.value)||rememberApiKeys.value!==rememberOriginal||Object.keys(bindingDrafts).some(id=>!same(bindingDrafts[id],bindingOriginals[id]))||[...editors.values()].some(e=>e.dirty());});
 const saving=ref(false),error=ref('');
 function reset(){for(const key of Object.keys(preferences))if(!Object.hasOwn(base.preferences,key))delete (preferences as any)[key];Object.assign(preferences,copy(base.preferences));for(const k of Object.keys(credentials))delete credentials[k];Object.assign(credentials,copy(base.credentials));rememberApiKeys.value=base.rememberApiKeys;rememberOriginal=base.rememberApiKeys;originals.value=copy(base.preferences);keyOriginals.value=copy(base.credentials);for(const k of Object.keys(bindingDrafts))delete bindingDrafts[k];for(const k of Object.keys(bindingOriginals))delete bindingOriginals[k];error.value='';}
 watch(()=>[base.loading,base.backupWorking],()=>{if(!base.loading&&!base.backupWorking)reset();});
 // The draft baseline travels with the write so it is re-merged against live state at write time, not before it.
 function origin(){return {preferences:copy(originals.value),credentials:copy(keyOriginals.value)};}
 // Only the snapshot may clear the dirty flag: anything typed after the write started is still unsaved.
 function markSaved(saved:Preferences,savedKeys:Record<string,string>,savedRemember:boolean,bindings:{id:string;ids:string[]}[]){
  originals.value=copy(saved);keyOriginals.value=copy(savedKeys);rememberOriginal=savedRemember;
  for(const binding of bindings)bindingOriginals[binding.id]=copy(binding.ids);
 }
 function snapshotKeys(){return Object.entries(bindingDrafts).filter(([id,ids])=>!same(ids,bindingOriginals[id])).map(([id,ids])=>({id,ids:copy(ids),before:bindingOriginals[id]}));}
 /** The whole draft is captured before the first await; the live draft keeps changing while the write is in flight. */
 async function save(){
  if(saving.value)return false;saving.value=true;error.value='';
  try{
   // Editors first stage their local fields into this draft. Snapshot only after that flush,
   // then leave any edits made during network/storage awaits dirty for the next save.
   for(const editor of editors.values())if(editor.dirty())await editor.save();
   const wanted={preferences:copy(preferences),credentials:copy(credentials),remember:rememberApiKeys.value,bindings:snapshotKeys()};
   const next=mergeConfiguration(base.preferences,originals.value,wanted.preferences),keys=mergeCredentials(base.credentials,keyOriginals.value,wanted.credentials);
   await base.commitConfiguration(next,keys,wanted.remember,wanted.bindings,{origin:origin()});
   markSaved(wanted.preferences,wanted.credentials,wanted.remember,wanted.bindings);return true;
  }catch(e){error.value=base.problem=message(e);return false;}finally{saving.value=false;}
 }
 async function discard(){reset();for(const editor of editors.values())await editor.discard();}
 /**
  * Confirms only this interface. Everything the draft holds is snapshotted before the await: the live draft and its
  * key can keep changing while the confirmation is in flight, and only what was actually saved may clear the dirty flag.
  */
 async function connectProfile(p:Profile){if(saving.value)return false;saving.value=true;error.value='';const savedProfile=copy(p),savedKey=credentials[p.id]||'',savedRemember=rememberApiKeys.value;try{const next=copy(base.preferences),old=originals.value.profiles.find(x=>x.id===p.id),current=next.profiles.find(x=>x.id===p.id);if(current&&old&&!same(current,old)&&!same(current,savedProfile))throw Error('此接口已改变，请重新编辑');if(current)Object.assign(current,copy(savedProfile));else{next.profiles.push(copy(savedProfile));(next.auxiliaryProfiles||=[]).push(savedProfile.id);next.auxiliaryProfile=next.auxiliaryProfiles[0];}const keys={...base.credentials,[p.id]:savedKey};await base.commitConfiguration(next,keys,savedRemember,[],{origin:origin(),scope:[p.id]});const at=originals.value.profiles.findIndex(x=>x.id===p.id);if(at<0)originals.value.profiles.push(copy(savedProfile));else originals.value.profiles[at]=copy(savedProfile);keyOriginals.value[p.id]=savedKey;originals.value.auxiliaryProfiles=copy(base.preferences.auxiliaryProfiles);originals.value.auxiliaryProfile=base.preferences.auxiliaryProfile;rememberOriginal=savedRemember;base.notice='当前接口配置已保存；功能接口选择仍需点击“保存全部设置并应用”。';return true;}catch(e){error.value=base.problem=message(e);return false;}finally{saving.value=false;}}
 const presetSets=computed(()=>presetGroups(preferences.presets)),currentPreset=computed(()=>presetSets.value.find(g=>g.id===preferences.activePreset)?.id||presetSets.value[0]?.id||'legacy');
 const presetEntries=computed(()=>preferences.presets.filter(p=>setId(p)===currentPreset.value));
 const presetParameters=computed(()=>{const map=preferences.presetParameters||={};return map[currentPreset.value]||=({...cleanSampling(taskApi(preferences,'story')||preferences.profiles[0]),maxTokens:32000});});
 const storyProfile=computed(()=>storyApi(preferences));const profile=(id:string)=>preferences.profiles.find(p=>p.id===id)||preferences.profiles[0];
 function message(e:unknown){const key=httpNoticeKeyOf(e);return (key?noticeTextFor(key):undefined)||(e instanceof Error?e.message:'操作失败');}
 function download(name:string,text:string){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
   function addProfile(){if(preferences.profiles.length>=30){problem.value='接口总数最多30个，请先移除不需要的副 API。';return '';}const id=uid();preferences.profiles.push({id,name:`副 API ${(preferences.auxiliaryProfiles?.length||0)+1}`,providerId:'approved-provider',model:'',temperature:0.7,maxTokens:32000});(preferences.auxiliaryProfiles||=[]).push(id);preferences.auxiliaryProfile=preferences.auxiliaryProfiles[0]||preferences.mainProfile;return id;}
  function removeProfile(id:string){if(id===preferences.mainProfile||id===preferences.embeddingProfile)return;preferences.profiles=preferences.profiles.filter(p=>p.id!==id);delete credentials[id];preferences.auxiliaryProfiles=(preferences.auxiliaryProfiles||[]).filter(value=>value!==id);preferences.auxiliaryProfile=preferences.auxiliaryProfiles[0]||preferences.mainProfile;for(const task of textApiTasks)if(preferences[task.field]===id)preferences[task.field]=preferences.mainProfile;if(preferences.suggestionsProfile===id)preferences.suggestionsProfile=preferences.mainProfile;if(preferences.randomEventProfile===id)preferences.randomEventProfile=preferences.mainProfile;if(preferences.forumReplyProfile===id){preferences.forumReplyProfile=preferences.mainProfile;forumController?.abort();}}
  function moveAuxiliary(index:number,offset:number){const ids=preferences.auxiliaryProfiles||[],to=index+offset;if(to<0||to>=ids.length||busy.value)return;[ids[index],ids[to]]=[ids[to],ids[index]];preferences.auxiliaryProfile=ids[0]||preferences.mainProfile;}
  function importPreset(text:string,filename?:string,disabledIndices?:number[]){if(busy.value||backupWorking.value)return;try{const result=importTavernPreset(text,filename,{preserveOutputs:true});if(disabledIndices)confirmPresetCompatibility(result.entries,disabledIndices);if((preferences.regexRules?.length||0)+result.regexRules.length>500)throw Error('正则规则最多500条');preferences.presets.push(...result.entries);(preferences.regexRules||=[]).push(...result.regexRules);preferences.activePreset=result.id;(preferences.presetOutputParsing||={})[result.id]=result.outputParsing;(preferences.presetParameters||={})[result.id]={...cleanSampling(taskApi(preferences,'story')||profile(preferences.mainProfile)),maxTokens:32000,...result.parameters};presetWarnings.value=result.warnings;problem.value='';notice.value=`已导入 ${result.name}，共 ${result.entries.length} 条；采样参数与当前预设单独保存，切换预设会一并切换。`;}catch(e){problem.value=message(e);}}
  function exportPreset(){download(`${presetSets.value.find(s=>s.id===currentPreset.value)?.name||'预设'}.json`,exportTavernPreset(copy(presetEntries.value),storyProfile.value||profile(preferences.mainProfile),copy((preferences.regexRules||[]).filter(r=>r.setId===currentPreset.value)),presetOutputParsing(preferences,currentPreset.value)));}
  function addPresetSet(){const id=uid();preferences.activePreset=id;preferences.presets.push(...newPresetEntries(id,'新预设'));(preferences.presetParameters||={})[id]={...cleanSampling(taskApi(preferences,'story')||preferences.profiles[0]),maxTokens:32000};presetWarnings.value=[];}
  function addPresetEntry(){const name=presetSets.value.find(s=>s.id===currentPreset.value)?.name||'原有预设';preferences.presets.push({id:uid(),setId:currentPreset.value,setName:name,name:'新条目',identifier:uid(),role:'system',position:'before',depth:4,order:100,content:'',enabled:true});}
  function removePresetSet(){if(busy.value||backupWorking.value)return;delete preferences.presetParameters?.[currentPreset.value];delete preferences.presetOutputParsing?.[currentPreset.value];preferences.regexRules=(preferences.regexRules||[]).filter(r=>r.setId!==currentPreset.value);preferences.presets=preferences.presets.filter(p=>setId(p)!==currentPreset.value);preferences.activePreset=presetGroups(preferences.presets)[0]?.id;if(!preferences.presets.length)addPresetSet();presetWarnings.value=[];}
  function movePresetTo(from:number,to:number){if(busy.value||backupWorking.value)return;const rows=reorderPresetEntries(presetEntries.value,from,to);let i=0;preferences.presets=preferences.presets.map(p=>setId(p)===currentPreset.value?rows[i++]:p);}
  function movePreset(index:number,offset:number){movePresetTo(index,index+offset);}
  function duplicatePresetSet(){if(busy.value||backupWorking.value)return;const sourcePreset=currentPreset.value;const rules=copy((preferences.regexRules||[]).filter(r=>r.setId===sourcePreset));const rows=copy(presetEntries.value),params=copy(presetParameters.value),id=uid(),name=(presetSets.value.find(s=>s.id===currentPreset.value)?.name||'预设')+'（副本）';preferences.presets.push(...rows.map(p=>({...p,id:uid(),setId:id,setName:name})));(preferences.presetParameters||={})[id]=params;(preferences.presetOutputParsing||={})[id]=presetOutputParsing(preferences,sourcePreset);(preferences.regexRules||=[]).push(...rules.map(r=>({...r,id:uid(),setId:id})));preferences.activePreset=id;}
  function removePresetEntry(id:string){if(busy.value||backupWorking.value)return;const p=presetEntries.value.find(p=>p.id===id);if(!p||pinnedPromptIds.includes(p.identifier||''))return;preferences.presets=preferences.presets.filter(p=>p.id!==id);}

 const draftSessions=computed(()=>base.sessions.map(s=>{if(!bindingDrafts[s.id]){bindingDrafts[s.id]=copy(s.worldbookIds||[]);bindingOriginals[s.id]=copy(s.worldbookIds||[]);}return Object.defineProperty({...s},'worldbookIds',{enumerable:true,get:()=>bindingDrafts[s.id],set:(ids:string[])=>bindingDrafts[s.id]=ids});}));
 const active=computed(()=>draftSessions.value.find(s=>s.id===base.active?.id));
 const lore=useWorldbooks(preferences,active,()=>draftSessions.value,()=>base.backupWorking,async()=>{},s=>base.problem=s,s=>base.notice=s,download);
 async function saveOrThrow(){if(!await save())throw Error(error.value||'设置未保存');}
 const overrides=reactive({preferences,credentials,rememberApiKeys,presetSets,currentPreset,presetEntries,presetParameters,presetWarnings,storyProfile,auxiliaryProfiles:computed(()=>auxiliaryApis(preferences)),...lore,addProfile,removeProfile,moveAuxiliary,importPreset,exportPreset,addPresetSet,addPresetEntry,removePresetSet,movePresetTo,movePreset,duplicatePresetSet,removePresetEntry,connectProfile,save:saveOrThrow,
 fetchModels:(p:Profile,signal:AbortSignal,kind?:'embedding')=>base.fetchModels(p,signal,kind,credentials[p.id]||''),testProfile:(p:Profile,embedding:boolean,signal:AbortSignal)=>base.testProfile(p,embedding,signal,credentials[p.id]||''),apiSelectable:(p:Profile)=>!apiFieldIssues(p,credentials[p.id]||'').length,
 connectionReady:(p:Profile)=>{const current=base.preferences.profiles.find(x=>x.id===p.id);return !!current&&same(p,current)&&credentials[p.id]===base.credentials[p.id]&&base.connectionReady(current);},
 setRememberApiKeys:async(v:boolean)=>{rememberApiKeys.value=v;},clearApiKeys:async()=>{for(const id of Object.keys(credentials))delete credentials[id];},
 useMainForAll:async()=>{for(const task of textApiTasks)preferences[task.field]=preferences.mainProfile;preferences.suggestionsProfile=preferences.randomEventProfile=preferences.forumReplyProfile=preferences.mainProfile;preferences.vectorEnabled=false;},
 confirmAllApis:save,exportApiConfiguration:(include:boolean)=>download('api-settings.json',exportApiSettings(preferences,credentials,include)),
 importApiConfiguration:async(text:string)=>{try{const value=parseApiSettings(text);const imported=value.configuration,retained=Object.fromEntries(imported.profiles.filter(p=>preferences.profiles.some(old=>old.id===p.id&&apiAddress(old.apiBaseUrl)===apiAddress(p.apiBaseUrl))).map(p=>[p.id,credentials[p.id]||'']));Object.assign(preferences,imported);for(const id of Object.keys(credentials))delete credentials[id];Object.assign(credentials,retained,value.keys||{});base.notice='已载入设置草稿，请保存后使用。';return true;}catch(e){base.problem=message(e);return false;}}
 });
 const view=new Proxy(base,{get(target,key){return key in overrides?Reflect.get(overrides,key):Reflect.get(target,key);},set(target,key,value){if(key in overrides)return Reflect.set(overrides,key,value);return Reflect.set(target,key,value);}}) as ViewModel;
 function beforeUnload(e:BeforeUnloadEvent){if(dirty.value){e.preventDefault();e.returnValue='';}}if(typeof window!=='undefined'){window.addEventListener('beforeunload',beforeUnload);onScopeDispose(()=>window.removeEventListener('beforeunload',beforeUnload));}
 return {view,dirty,saving,error,save,discard,reset,registerEditor};
}
