<script setup lang="ts">
import RandomEventControl from './components/RandomEventControl.vue';
import RegexPanel from './components/RegexPanel.vue';
import {accountStorage} from './storage/accountScope';


import { reactive, ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';

import ResizeHandle from './components/ResizeHandle.vue';
import {useWorkspaceLayout} from './app/useWorkspaceLayout';
import {installMvuBridge} from './app/mvuBridge';

import { useWorkspace } from './app/useWorkspace';

import type { Panel } from './domain/contracts';

import HomeView from './components/HomeView.vue';

import StoryView from './components/StoryView.vue';
import FormatErrorsView from './components/FormatErrorsView.vue';

import StatusBar from './components/StatusBar.vue';

import FloatingGroupChat from './components/FloatingGroupChat.vue';
import TheaterRail from './components/TheaterRail.vue';

import TheaterSettings from './components/TheaterSettings.vue';

import GameSettingsView from './components/GameSettingsView.vue';

import MemoryView from './components/MemoryView.vue';

import WorldView from './components/WorldView.vue';

import SettingsView from './components/SettingsView.vue';

import SavesView from './components/SavesView.vue';

import OpeningView from './components/OpeningView.vue';

import PersonaLibrary from './components/PersonaLibrary.vue';
import {PersonaLibrary as PersonaRepository} from './storage/personaLibrary';

import type {Persona} from './domain/contracts';

import {setMasterPersona,masterPersonaKey} from './domain/masterPersona';

import PresetManager from './components/PresetManager.vue';
import WorldbookManager from './components/WorldbookManager.vue';

import {restorePersonaMedia} from './storage/personaMedia';

const library=ref(false);
const firstSetup=ref<'persona'|'api'|'name'|null>(null);
const firstSetupKey='academy:first-journey:v1';
function needsFirstSetup(){try{return !w.sessions.length&&!accountStorage.getItem(firstSetupKey);}catch{return !w.sessions.length;}}
function savedFirstPersona(persona:Persona){if(firstSetup.value!=='persona')return;usePersona(persona);firstSetup.value='api';w.panel='settings';}
function savedFirstApi(){if(firstSetup.value!=='api'||!w.apiReady)return;firstSetup.value='name';library.value=false;entry.value='new';w.panel='story';}
async function beginFirstSetup(sequence:number){if(!needsFirstSetup())return;const files=await new PersonaRepository().list();if(sequence!==navigationSequence)return;if(!files.length){firstSetup.value='persona';library.value=true;}else{usePersona(files[0]!.persona);firstSetup.value='api';w.panel='settings';}}




const w = reactive(useWorkspace());

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

  const text=typeof detail.text==='string'?detail.text.trim():'';

  const previous=typeof detail.replace==='string'?detail.replace:'';

  w.sessionId=target.id;

  if(text)w.input=(previous&&before.includes(previous)?before.replace(previous,()=>text):[before,text].filter(Boolean).join('\n\n')).slice(0,16000);

  else w.input=before;

  if(detail.show){library.value=false;entry.value='new';w.panel='story';}

  detail.ok=true;

}

function campusAccess(event:Event){const detail=(event as CustomEvent).detail;if(!detail)return;detail.ok=!!mainSession.value&&!w.loading&&!w.busy&&!w.workingMemory&&!w.workingPersona&&!w.creatingGame;if(!detail.ok)detail.reason=w.notice=mainSession.value?'请等待当前操作完成后再进入校园':'请建立一个会话才可进入校园';}

watch(()=>w.active?.persona,persona=>{if(persona)setMasterPersona(persona);},{deep:true});

watch(()=>w.newGameDraft.persona,persona=>{if(!w.active&&persona.name.trim())setMasterPersona(persona);},{deep:true});

watch(()=>w.loading,loading=>{if(!loading&&!w.active){try{if(accountStorage.getItem(masterPersonaKey))return;}catch{}const recent=[...w.sessions].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];if(recent)setMasterPersona(recent.persona);}});

const fullPage=computed(()=>library.value||!['story','theaters','status'].includes(w.panel));

const embedded=!!document.getElementById('academy-workspace');

const entry=ref<'opening'|'new'|'continue'>(embedded?'new':'opening');

watch(()=>[w.panel,library.value,entry.value,w.active?.id],async()=>{await nextTick();window.dispatchEvent(new Event('academy:page-transition'));});

function start(){if(!w.loading&&needsFirstSetup()){w.home();w.resetNewGameDraft();entry.value='new';void beginFirstSetup(++navigationSequence);return;}pendingText='';library.value=false;w.home();w.resetNewGameDraft();entry.value='new';w.panel='story';}

function resume(){pendingText='';library.value=false;w.home();entry.value='continue';}

function settings(){library.value=false;w.home();entry.value='new';w.panel='settings';}

function opening(){if(w.workingPersona||w.creatingGame)return;if(embedded){window.dispatchEvent(new Event('academy:home'));return;}w.home();entry.value='opening';}

let navigationSequence=0;
async function terminalNavigate(event:Event){

  const detail=(event as CustomEvent).detail;

  if(detail)detail.accepted=false;

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


  const panels:Panel[]=['story','memory','relations','map','forum','game-settings','theaters','status','settings','presets','saves','worldbooks'];

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

onMounted(()=>{window.addEventListener('academy:navigate',terminalNavigate);window.addEventListener('academy:insert',insertCampusText);window.addEventListener('academy:campus-access',campusAccess);window.dispatchEvent(new Event('academy:ready'));void restorePersonaMedia();});

onUnmounted(()=>{window.removeEventListener('academy:navigate',terminalNavigate);window.removeEventListener('academy:insert',insertCampusText);window.removeEventListener('academy:campus-access',campusAccess);});

function navigate(panel:Panel){library.value=false;if(panel==='game-settings')w.settingsTab='theaters';if(panel==='map'&&embedded){window.dispatchEvent(new Event('academy:map'));return;}if(['memory','relations','theaters','status'].includes(panel)&&!w.active&&mainSession.value){w.open(mainSession.value.id);if(!w.active)return;}if(panel==='story')w.enterStory();else w.panel=panel;}

function usePersona(persona:Persona){setMasterPersona(persona);w.home();w.resetNewGameDraft();Object.assign(w.newGameDraft.persona,persona);entry.value='new';library.value=false;}

const tabs: { id: Panel; label: string; no: string; needsGame?: boolean }[] = [

  { id: 'story', label: '剧情', no: '01' },

  { id: 'memory', label: '记忆', no: '02', needsGame: true },

  { id: 'relations', label: '人物关系', no: '03', needsGame: true },

  { id: 'map', label: '地图', no: '04' },

  { id: 'settings', label: '模型设置', no: '07' },

  { id: 'presets', label: '预设管理', no: '08' },

  { id: 'saves', label: '存档与导出', no: '09' },

  { id: 'worldbooks', label: '世界书', no: '10' },

  { id: 'game-settings', label: '小剧场设置', no: '11' }

];

</script>



<template>

  <OpeningView v-if="entry==='opening'" :w="w" @start="start" @continue="resume" @settings="settings" />

  <div v-else class="app-shell"><FloatingGroupChat v-if="w.active" :visible="!library&&w.panel==='story'&&w.apiReady" :w="w" />

    <header class="top-shell">

      <div class="app-header">

        <div class="header-actions">

          <button v-if="w.active" @click="layout.reset()">恢复默认布局</button><span v-if="w.active" class="current-journey">{{ w.active.name }}</span>

          <template v-if="embedded"><button :disabled="w.busy||w.workingMemory||w.workingPersona||w.creatingGame" @click="start">新建存档</button><button :disabled="w.busy||w.workingMemory||w.workingPersona||w.creatingGame" @click="resume">过往存档</button></template>

          <button :disabled="w.workingPersona || w.creatingGame" @click="opening">{{embedded?'返回学院':'返回开场'}}</button>

        </div>

      </div>

      <nav class="navigation" aria-label="游戏模块">

        <button v-if="w.active" class="mobile-only" :class="{selected:w.panel==='status'}" @click="w.panel='status'">人物状态</button>

        <button v-if="w.active" class="compact-only" :class="{selected:w.panel==='theaters'}" @click="w.panel='theaters'">查看小剧场</button>

        <button v-for="tab in tabs" :key="tab.id" :class="{selected:w.panel===tab.id}" :disabled="w.workingPersona||w.creatingGame" @click="navigate(tab.id)"><span>{{ tab.no }}</span>{{ tab.label }}</button>

        <RandomEventControl :preferences="w.preferences" :disabled="w.busy" />

        <button class="random-event-toggle suggestions-toggle" :aria-pressed="w.preferences.suggestionsEnabled!==false" :disabled="w.busy" @click="w.preferences.suggestionsEnabled=w.preferences.suggestionsEnabled===false"><span>13</span>行动建议<i :class="{enabled:w.preferences.suggestionsEnabled!==false}" aria-hidden="true"></i><span class="sr-only">{{w.preferences.suggestionsEnabled!==false?'已开启':'已关闭'}}</span></button>

        <button :class="{selected:w.panel==='format-errors'}" @click="navigate('format-errors')"><span>14</span>运行日志</button><button class="random-event-toggle" :aria-pressed="w.hideFloors" @click="w.hideFloors=!w.hideFloors"><span>15</span>自动隐藏楼层<i :class="{enabled:w.hideFloors}" aria-hidden="true"></i></button>
        <RegexPanel v-if="w.panel==='story'&&w.active" :w="w" />
      </nav>

    </header>



    <div ref="workspaceEl" class="workspace resizable-workspace" :style="layout.style.value" :class="{'game-layout':!!w.active&&!fullPage,'forum-focus':w.panel==='theaters','status-focus':w.panel==='status'}">

      <aside v-if="w.active&&!fullPage" class="status-rail" aria-label="左侧人物状态"><StatusBar :w="w" /></aside>
      <ResizeHandle v-if="w.active&&!fullPage" class="column-resizer left-resizer" axis="x" label="调整左栏宽度" @resize="dx=>layout.resize('left',dx)" />
      <main class="center-pane">

        <div v-if="w.problem" class="error-banner" role="alert"><span>{{ w.problem }}</span><span v-if="w.panel==='story'">如果正文显示异常，请检查预设中是否仍开启了美化、小剧场等条目；可尝试关闭后重试。</span><button @click="w.problem=''">收起提示</button></div>

        <div class="center-content">

          <div v-if="w.loading" class="empty">正在打开本地数据库…</div>

          <template v-else>

            <p v-if="!w.active&&entry==='new'&&pendingText" class="muted encounter-draft-notice" role="status">建立新存档后，所选角色的邂逅提示会填入剧情输入框，不会自动发送。</p>

            <PersonaLibrary v-if="library" :w="w" :sessions="w.sessions" @settings="navigate('settings')" @use="persona=>firstSetup==='persona'?savedFirstPersona(persona):usePersona(persona)" @master="setMasterPersona" @saved="savedFirstPersona" />

            <FormatErrorsView v-else-if="w.panel==='format-errors'" :w="w" /><HomeView @personas="library=true" v-else-if="!w.active && w.panel==='story'" :w="w" :mode="entry==='continue'?'continue':'new'" :first-setup="firstSetup==='name'" />

            <StoryView v-else-if="w.panel==='story'&&w.apiReady" :w="w" />

            <SettingsView v-else-if="w.panel==='story'" :w="w" @saved="savedFirstApi" />

            <section v-else-if="!w.active&&['memory','relations','theaters','status'].includes(w.panel)" class="surface session-required"><h1>请先建立或继续一个会话</h1><p class="muted">这个功能会显示当前会话的资料。</p><div class="actions"><button @click="start">新建存档</button><button @click="resume">过往存档</button></div></section>

            <MemoryView v-else-if="w.panel==='memory'" :w="w" />

            <WorldView v-else-if="w.panel==='relations' || w.panel==='map'" :w="w" :kind="w.panel" />

            <TheaterSettings v-else-if="w.panel==='forum'" :w="w" />

            <GameSettingsView v-else-if="w.panel==='game-settings'" :w="w" />

            <TheaterRail v-else-if="w.panel==='theaters'" :w="w" />

            <StatusBar v-else-if="w.panel==='status'" :w="w" />

            <SettingsView v-else-if="w.panel==='settings'" :w="w" @saved="savedFirstApi" />

            <section v-else-if="w.panel==='presets'" class="surface preset-page"><header class="panel-heading"><div><p class="eyebrow">PRESETS / 预设管理</p><h1>导入与编辑预设</h1></div></header><PresetManager :w="w" /></section>

            <WorldbookManager v-else-if="w.panel==='worldbooks'" :w="w" />

            <SavesView v-else-if="w.panel==='saves'" :w="w" />

          </template>

        </div>

      </main>
      <ResizeHandle v-if="w.active&&!fullPage&&w.panel!=='theaters'" class="column-resizer right-resizer" axis="x" label="调整右栏宽度" @resize="dx=>layout.resize('right',dx)" />
      <aside v-if="w.active && !fullPage && w.panel!=='theaters'" class="forum-rail" aria-label="右侧小剧场"><TheaterRail :w="w" /></aside>

    </div>





  </div>

</template>

