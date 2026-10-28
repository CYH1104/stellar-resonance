<script setup lang="ts">
const CloudBackupView=defineAsyncComponent(()=>import('./components/CloudBackupView.vue'));
import DialogShell from './components/DialogShell.vue';
import {useConfigurationDraft} from './app/useConfigurationDraft';
import {configurationEditorsKey} from './app/configurationEditors';
import {provide,defineAsyncComponent} from 'vue';
import {disposeRetrieval} from './memory/retrieval';
onUnmounted(disposeRetrieval);
import {preloadRegexWorker,disposeRegexWorker} from './domain/regexRunner';
import {localCharacterImage,localImageRevision} from './app/localCharacterImages';
import {majorCharacter} from './domain/characterImages';
import SaveStatus from './components/SaveStatus.vue';
import DismissibleNotice from './components/DismissibleNotice.vue';
import NoticeHost from './components/NoticeHost.vue';
import CompletionPulse from './components/CompletionPulse.vue';
import {showNotice} from './app/notices';
import WorkspaceNavigation from './components/WorkspaceNavigation.vue';

import {accountStorage} from './storage/accountScope';


import { reactive, ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
onMounted(()=>{void preloadRegexWorker();});
onUnmounted(disposeRegexWorker);

import ResizeHandle from './components/ResizeHandle.vue';
import {useWorkspaceLayout} from './app/useWorkspaceLayout';
import {installMvuBridge} from './app/mvuBridge';

import { useWorkspace } from './app/useWorkspace';

import type { Panel } from './domain/contracts';

import HomeView from './components/HomeView.vue';

import StoryView from './components/StoryView.vue';
const FormatErrorsView=defineAsyncComponent(()=>import('./components/FormatErrorsView.vue'));

import StatusBar from './components/StatusBar.vue';


import FloatingGroupChat from './components/FloatingGroupChat.vue';
import TheaterRail from './components/TheaterRail.vue';

const TheaterSettings=defineAsyncComponent(()=>import('./components/TheaterSettings.vue'));

const GameSettingsView=defineAsyncComponent(()=>import('./components/GameSettingsView.vue'));

const MemoryView=defineAsyncComponent(()=>import('./components/MemoryView.vue'));

const WorldView=defineAsyncComponent(()=>import('./components/WorldView.vue'));

const SettingsView=defineAsyncComponent(()=>import('./components/SettingsView.vue'));

const SavesView=defineAsyncComponent(()=>import('./components/SavesView.vue'));

import OpeningView from './components/OpeningView.vue';

const PersonaLibrary=defineAsyncComponent(()=>import('./components/PersonaLibrary.vue'));
import {PersonaLibrary as PersonaRepository} from './storage/personaLibrary';

import type {Persona} from './domain/contracts';

import {setMasterPersona,masterPersonaKey} from './domain/masterPersona';

const PresetManager=defineAsyncComponent(()=>import('./components/PresetManager.vue'));
const WorldbookManager=defineAsyncComponent(()=>import('./components/WorldbookManager.vue'));

import {restorePersonaMedia} from './storage/personaMedia';

const library=ref(false);
const firstSetup=ref<'persona'|'api'|'name'|null>(null);
const firstSetupKey='academy:first-journey:v1';
function needsFirstSetup(){try{return !w.sessions.length&&!accountStorage.getItem(firstSetupKey);}catch{return !w.sessions.length;}}
function savedFirstPersona(persona:Persona){if(firstSetup.value!=='persona')return;usePersona(persona);firstSetup.value='api';w.panel='settings';}
function savedFirstApi(){if(firstSetup.value!=='api'||!w.apiReady)return;firstSetup.value='name';library.value=false;entry.value='new';w.panel='story';}
async function beginFirstSetup(sequence:number){if(!needsFirstSetup())return;const files=await new PersonaRepository().list();if(sequence!==navigationSequence)return;if(!files.length){firstSetup.value='persona';library.value=true;}else{usePersona(files[0]!.persona);firstSetup.value='api';w.panel='settings';}}




const w = reactive(useWorkspace());
const configuration=useConfigurationDraft(w);
provide(configurationEditorsKey,configuration.registerEditor);
const pendingConfigurationPanel=ref<Panel>();let pendingConfigurationAction:(()=>void)|undefined;let allowConfigurationNavigation=false;
// Read-only panels and the configuration editor itself neither edit nor discard the draft, so they must open even
// while it is dirty; only leaving that area for a real panel still asks to save or discard.
const draftFreePanels=new Set<Panel>(['format-errors','settings']);
function guardNavigation(action:()=>void){if(allowConfigurationNavigation||!configuration.dirty.value)return false;pendingConfigurationAction=action;pendingConfigurationPanel.value=w.panel;return true;}
function cancelConfigurationLeave(){pendingConfigurationPanel.value=undefined;pendingConfigurationAction=undefined;}
watch(()=>w.panel,(target,old)=>{if(allowConfigurationNavigation||target===old||draftFreePanels.has(target)||!configuration.dirty.value)return;pendingConfigurationPanel.value=target;allowConfigurationNavigation=true;w.panel=old;allowConfigurationNavigation=false;},{flush:'sync'});
async function leaveConfiguration(save:boolean){if(save&&!await configuration.save())return;if(!save)await configuration.discard();const target=pendingConfigurationPanel.value,action=pendingConfigurationAction;pendingConfigurationPanel.value=undefined;pendingConfigurationAction=undefined;if(target){allowConfigurationNavigation=true;if(action)action();else w.panel=target;allowConfigurationNavigation=false;}}
const saveToastExpired=ref(false);
let saveToastTimer:ReturnType<typeof setTimeout>|undefined;
watch(()=>[w.storageStatus,w.lastSaved,w.storageError],()=>{
 clearTimeout(saveToastTimer);saveToastExpired.value=false;
 if(w.storageStatus==='saved'&&!w.storageError)saveToastTimer=setTimeout(()=>{saveToastExpired.value=true;},5000);
},{immediate:true});
onUnmounted(()=>clearTimeout(saveToastTimer));
function campusNotice(event:Event){const value=(event as CustomEvent).detail;if(typeof value?.message==='string')showNotice(value.message.slice(0,2000),value.error===true);}
onMounted(()=>window.addEventListener('academy:notice',campusNotice));
onUnmounted(()=>window.removeEventListener('academy:notice',campusNotice));
const workspaceEl=ref<HTMLElement>();
const layout=useWorkspaceLayout(w.preferences,workspaceEl,()=>w.panel!=='theaters');
const disposeMvu=installMvuBridge(w);

onUnmounted(disposeMvu);

const mainSessionKey='academy:main-session:v1';

const mainSessionId=ref((()=>{try{return accountStorage.getItem(mainSessionKey)||'';}catch{return '';}})());

const sessionDrafts=new Map<string,string>();

const mainSession=computed(()=>w.active||w.sessions.find(session=>session.id===mainSessionId.value));

watch(()=>w.active?.id,id=>{if(id){mainSessionId.value=id;try{accountStorage.setItem(mainSessionKey,id);}catch{}}},{flush:'sync'});

watch(()=>[w.sessionId,w.input] as const,([id,text])=>{if(id)sessionDrafts.set(id,text);},{flush:'sync'});

function insertCampusText(event:Event){

  const detail=(event as CustomEvent).detail;

  if(!detail)return;

  detail.ok=false;

  if(!mainSession.value){detail.reason=w.notice='请建立一个会话才可进入校园';return;}

  if(w.loading||w.busy||w.workingMemory||w.workingPersona||w.creatingGame){detail.reason=w.notice='请等待当前操作完成后再进入校园';return;}

  const target=mainSession.value;

  const before=w.active?.id===target.id?w.input:sessionDrafts.get(target.id)||'';

  const resolveUser=(value:string)=>value.replaceAll('{{user}}',()=>target.persona.name);

  const text=typeof detail.text==='string'?resolveUser(detail.text.trim()):'';

  const previous=typeof detail.replace==='string'?resolveUser(detail.replace):'';

  w.sessionId=target.id;

  if(text)w.input=(previous&&before.includes(previous)?before.replace(previous,()=>text):[before,text].filter(Boolean).join('\n\n')).slice(0,16000);

  else w.input=before;

  if(detail.show){library.value=false;entry.value='new';w.panel='story';}

  detail.ok=true;

}

function campusAccess(event:Event){const detail=(event as CustomEvent).detail;if(!detail)return;detail.ok=!!mainSession.value&&!w.loading&&!w.busy&&!w.workingMemory&&!w.workingPersona&&!w.creatingGame;if(!detail.ok)detail.reason=w.notice=mainSession.value?'请等待当前操作完成后再进入校园':'请建立一个会话才可进入校园';}

watch(()=>w.active?.persona,persona=>{if(persona)setMasterPersona(persona);},{deep:true});

watch(()=>w.newGameDraft.persona,persona=>{if(!w.backupWorking&&!w.active&&persona.name.trim())setMasterPersona(persona);},{deep:true});

watch(()=>w.loading,loading=>{if(!loading&&!w.active){try{if(accountStorage.getItem(masterPersonaKey))return;}catch{}const recent=[...w.sessions].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];if(recent)setMasterPersona(recent.persona);}});

const fullPage=computed(()=>library.value||!['story','theaters'].includes(w.panel));

const embedded=!!document.getElementById('academy-workspace');

const entry=ref<'opening'|'new'|'continue'>(embedded?'new':'opening');

watch(()=>[w.panel,library.value,entry.value,w.active?.id],async()=>{await nextTick();window.dispatchEvent(new Event('academy:page-transition'));});

function start(){if(guardNavigation(start))return;if(!w.loading&&needsFirstSetup()){w.home();w.resetNewGameDraft();entry.value='new';void beginFirstSetup(++navigationSequence);return;}pendingText='';library.value=false;w.home();w.resetNewGameDraft();entry.value='new';w.panel='story';}

function resume(){if(guardNavigation(resume))return;pendingText='';library.value=false;w.home();entry.value='continue';}

function settings(){if(guardNavigation(settings))return;library.value=false;w.home();entry.value='new';w.panel='settings';}

function opening(){if(guardNavigation(opening))return;if(w.workingPersona||w.creatingGame)return;if(embedded){window.dispatchEvent(new Event('academy:home'));return;}w.home();entry.value='opening';}

let navigationSequence=0;
async function terminalNavigate(event:Event){

  const detail=(event as CustomEvent).detail;

  if(detail)detail.accepted=false;
  if(detail&&guardNavigation(()=>void terminalNavigate(event))){detail.accepted=true;return;}

  if(!embedded||w.workingPersona||w.creatingGame||!detail)return;

  detail.accepted=true;
  const sequence=++navigationSequence;

  if(w.loading){pendingNavigation=detail;return;}

  if(detail.entry==='new'){if(w.busy||w.workingMemory){w.notice='生成期间可浏览其他页面，新建存档请先等待或停止生成。';return;}
    pendingText=typeof detail.insert==='string'?detail.insert.trim().slice(0,16000):'';
    pendingExistingSessions=pendingText?new Set(w.sessions.map(session=>session.id)):undefined;
    if(w.active)w.home();w.resetNewGameDraft();library.value=false;entry.value='new';w.panel='story';
    if(pendingText)w.notice='请先建立新会话，选中角色的邂逅提示会保留到剧情输入框，不会自动发送。';
    if(!w.sessions.length){try{await beginFirstSetup(sequence);}catch{w.problem='无法读取人设档案，请重试。';}}
    return;
  }

  if(typeof detail.insert==='string'&&detail.insert.trim())pendingText=[pendingText,detail.insert.trim()].filter(Boolean).join('\n\n').slice(0,16000);

  library.value=detail.entry==='personas';

  if(library.value){entry.value='new';return;}

  if(detail.entry==='conversation'){

    entry.value='new';

    if(w.active){w.enterStory();flushInsertedText();return;}

    const recent=mainSession.value||[...w.sessions].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];

    if(!recent){try{await beginFirstSetup(sequence);if(sequence!==navigationSequence||firstSetup.value)return;}catch{w.problem='无法读取人设档案，请重试。';return;}}

    if(recent){w.open(recent.id);flushInsertedText();}else{w.home();w.notice='还没有对话，填写人物档案后开始新会话。插入的文字会保留到新会话。';}

    return;

  }

  if(detail.entry==='continue'){resume();return;}


  const panels:Panel[]=['format-errors','cloud-backup','story','memory','relations','map','forum','game-settings','theaters','status','settings','presets','saves','worldbooks'];

  if(panels.includes(detail.panel)){

    entry.value='new';



    if(detail.panel==='story'&&!w.active)w.panel='story';else navigate(detail.panel);

  }

}

let pendingNavigation:unknown;

let pendingText='';
let pendingExistingSessions:Set<string>|undefined;

function flushInsertedText(){if(w.active&&pendingText&&!pendingExistingSessions?.has(w.active.id)){w.input=[w.input,pendingText].filter(Boolean).join('\n\n').slice(0,16000);pendingText='';pendingExistingSessions=undefined;}}

watch(()=>w.active?.id,flushInsertedText);
watch(()=>[w.active?.id,w.creatingGame] as const,([id,creating])=>{if(!id||creating||!firstSetup.value)return;try{accountStorage.setItem(firstSetupKey,'complete');}catch{}firstSetup.value=null;library.value=false;w.panel='story';});

watch(()=>w.loading,loading=>{if(!loading&&pendingNavigation){const detail=pendingNavigation;pendingNavigation=undefined;terminalNavigate(new CustomEvent('academy:navigate',{detail}));}});

function refreshCardDefaults(event:Event){const cards=(event as CustomEvent).detail;if(!Array.isArray(cards)||!w.localService?.majorCharacters)return;w.localService.majorCharacters=w.localService.majorCharacters.map(a=>({...a,img:cards.find(c=>c.id===a.id)?.img||''}));}
onMounted(()=>window.addEventListener('academy:character-card-defaults',refreshCardDefaults));
onUnmounted(()=>window.removeEventListener('academy:character-card-defaults',refreshCardDefaults));
watch(()=>[w.preferences.characterImages,w.localService,localImageRevision.value],()=>{const images=(w.localService?.majorCharacters||w.localService?.characters||[]).map(a=>{const card=majorCharacter(a.name);return card?{no:card.no,url:(localCharacterImage(a.id)||w.preferences.characterImages?.[a.id])?.url||(a as {img?:string}).img||card.url}:undefined;}).filter(Boolean);window.dispatchEvent(new CustomEvent('academy:character-images',{detail:images}));},{deep:true,immediate:true});
onMounted(()=>{window.addEventListener('academy:navigate',terminalNavigate);window.addEventListener('academy:insert',insertCampusText);window.addEventListener('academy:campus-access',campusAccess);window.dispatchEvent(new Event('academy:ready'));void restorePersonaMedia();});

onUnmounted(()=>{window.removeEventListener('academy:navigate',terminalNavigate);window.removeEventListener('academy:insert',insertCampusText);window.removeEventListener('academy:campus-access',campusAccess);});

function navigate(panel:Panel){if(!draftFreePanels.has(panel)&&guardNavigation(()=>navigate(panel)))return;library.value=false;if(panel==='game-settings')w.settingsTab='theaters';if(panel==='map'&&embedded){window.dispatchEvent(new Event('academy:map'));return;}if(['memory','relations','theaters','status'].includes(panel)&&!w.active&&mainSession.value){w.open(mainSession.value.id);if(!w.active)return;}if(panel==='story')w.enterStory();else w.panel=panel;}

function usePersona(persona:Persona){setMasterPersona(persona);w.home();w.resetNewGameDraft();Object.assign(w.newGameDraft.persona,persona);entry.value='new';library.value=false;}

</script>



<template>
  <section v-if="w.unsafeNativeDrafts" class="surface" role="alert"><p>旧预设草稿含凭据，已暂停写入和模型调用。清理仅移除此草稿，已保存预设、剧情和其他草稿保留。</p><button type="button" :disabled="w.loading" @click="w.clearUnsafeNativeDrafts">清理旧预设草稿</button></section>
  <div class="workspace-save-status" :class="{'mobile-save-expired':saveToastExpired}"><button type="button" :disabled="w.loading||w.storageStatus==='saving'" @click="configuration.dirty.value?configuration.save():w.save()">立即保存</button><SaveStatus :status="w.storageStatus" :saved-at="w.lastSaved" :error="w.storageError" /></div><NoticeHost /><CompletionPulse :busy="w.busy" /><DismissibleNotice :message="w.problem" error /><DismissibleNotice :message="['正在保存…','已保存在本机'].includes(w.notice)?'':w.notice" />

  <OpeningView v-if="entry==='opening'" :w="w" @start="start" @continue="resume" @settings="settings" />

  <div v-else class="app-shell" :inert="w.backupWorking||undefined"><FloatingGroupChat v-if="w.active && w.terminalEnabled" :visible="!library&&w.panel==='story'" :w="w" />

    <WorkspaceNavigation :w="w" :embedded="embedded" @navigate="navigate" @start="start" @resume="resume" @home="opening" @reset="layout.reset()" @personas="guardNavigation(()=>{library=true})||(library=true)" />



    <div v-if="configuration.dirty.value" class="configuration-save-bar" role="status"><span>设置有未保存的修改</span><button :disabled="configuration.saving.value" @click="configuration.save()">保存设置</button><button :disabled="configuration.saving.value" @click="configuration.discard()">取消修改</button><span v-if="configuration.error.value" role="alert">{{configuration.error.value}}</span></div>
    <DialogShell v-if="pendingConfigurationPanel" title="设置尚未保存" @close="cancelConfigurationLeave"><p>保存修改后再离开？</p><p v-if="configuration.error.value" role="alert">{{configuration.error.value}}</p><div class="actions"><button :disabled="configuration.saving.value" @click="leaveConfiguration(true)">保存并离开</button><button :disabled="configuration.saving.value" @click="leaveConfiguration(false)">放弃修改</button><button @click="cancelConfigurationLeave">继续编辑</button></div></DialogShell>
    <div ref="workspaceEl" class="workspace resizable-workspace" :style="layout.style.value" :class="{'game-layout':!!w.active&&!fullPage,'forum-focus':w.panel==='theaters','status-focus':w.panel==='status'}">

      <aside v-if="w.active&&!fullPage" class="status-rail" aria-label="左侧人物状态"><StatusBar :w="w" /></aside>
      <ResizeHandle v-if="w.active&&!fullPage" class="column-resizer left-resizer" axis="x" label="调整左栏宽度" @resize="dx=>layout.resize('left',dx)" />
      <main class="center-pane">



        <div class="center-content">

          <div v-if="w.loading" class="empty">正在打开本地数据库…</div>

          <template v-else>

            <p v-if="!w.active&&entry==='new'&&pendingText" class="muted encounter-draft-notice" role="status">建立新存档后，所选角色的邂逅提示会填入剧情输入框，不会自动发送。</p>

            <PersonaLibrary v-if="library" :w="w" :sessions="w.sessions" @settings="navigate('settings')" @use="persona=>firstSetup==='persona'?savedFirstPersona(persona):usePersona(persona)" @saved="savedFirstPersona" />

            <FormatErrorsView v-else-if="w.panel==='format-errors'" :w="w" /><HomeView @personas="library=true" v-else-if="!w.active && w.panel==='story'" :w="w" :mode="entry==='continue'?'continue':'new'" :first-setup="firstSetup==='name'" />

            <StoryView v-else-if="w.panel==='story'&&w.apiReady" :w="w" />

            <SettingsView v-else-if="w.panel==='story'" :w="configuration.view" @saved="savedFirstApi" />

            <section v-else-if="!w.active&&['memory','relations','theaters','status'].includes(w.panel)" class="surface session-required"><h1>请先建立或继续一个会话</h1><p class="muted">这个功能会显示当前会话的资料。</p><div class="actions"><button @click="start">新建存档</button><button @click="resume">过往存档</button></div></section>

            <MemoryView v-else-if="w.panel==='memory'" :w="w" />

            <WorldView v-else-if="w.panel==='relations' || w.panel==='map'" :w="w" :kind="w.panel" />

            <TheaterSettings v-else-if="w.panel==='forum'" :w="configuration.view" />

            <GameSettingsView v-else-if="w.panel==='game-settings'" :w="configuration.view" />

            <TheaterRail v-else-if="w.panel==='theaters'" :w="w" />

            <StatusBar v-else-if="w.panel==='status'" :w="w" />

            <SettingsView v-else-if="w.panel==='settings'" :w="configuration.view" @saved="savedFirstApi" />

            <section v-else-if="w.panel==='presets'" class="surface preset-page"><header class="panel-heading"><div><p class="eyebrow">PRESETS / 预设管理</p><h1>导入与编辑预设</h1></div></header><PresetManager :w="configuration.view" /></section>

            <WorldbookManager v-else-if="w.panel==='worldbooks'" :w="configuration.view" />

            <CloudBackupView v-else-if="w.panel==='cloud-backup'" :w="w" />
            <SavesView v-else-if="w.panel==='saves'" :w="w" />

          </template>

        </div>

      </main>
      <ResizeHandle v-if="w.active&&!fullPage&&w.panel!=='theaters'" class="column-resizer right-resizer" axis="x" label="调整右栏宽度" @resize="dx=>layout.resize('right',dx)" />
      <aside v-if="w.active && !fullPage && w.panel!=='theaters'" class="forum-rail" aria-label="右侧小剧场"><TheaterRail :w="w" /></aside>

    </div>





  </div>

</template>


<style scoped>.configuration-save-bar{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;padding:8px 16px;border-bottom:1px solid var(--line);background:var(--surface);font-size:13px}.configuration-save-bar button{margin:0;padding:5px 12px}.terminal-followup-status{display:flex;flex-wrap:wrap;gap:8px;padding:8px 0}.workspace-save-status{position:fixed;right:16px;bottom:8px;z-index:40;pointer-events:none;padding:3px 8px;border-radius:4px;background:var(--surface,#f5f1e9)}.workspace-save-status button{pointer-events:auto} @media(max-width:768px){.workspace-save-status.mobile-save-expired{display:none}}</style>

