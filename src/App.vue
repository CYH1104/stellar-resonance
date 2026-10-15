<script setup lang="ts">
import { reactive, ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useWorkspace } from './app/useWorkspace';
import type { Panel } from './domain/contracts';
import HomeView from './components/HomeView.vue';
import StoryView from './components/StoryView.vue';
import StatusBar from './components/StatusBar.vue';
import TheaterRail from './components/TheaterRail.vue';
import TheaterSettings from './components/TheaterSettings.vue';
import GameSettingsView from './components/GameSettingsView.vue';
import MemoryView from './components/MemoryView.vue';
import WorldView from './components/WorldView.vue';
import SettingsView from './components/SettingsView.vue';
import SavesView from './components/SavesView.vue';
import OpeningView from './components/OpeningView.vue';
import PersonaLibrary from './components/PersonaLibrary.vue';
import type {Persona} from './domain/contracts';
import {setMasterPersona,masterPersonaKey} from './domain/masterPersona';
import PresetManager from './components/PresetManager.vue';
import {restorePersonaMedia} from './storage/personaMedia';
const library=ref(false);

const w = reactive(useWorkspace());
const mainSessionKey='academy:main-session:v1';
const mainSessionId=ref((()=>{try{return localStorage.getItem(mainSessionKey)||'';}catch{return '';}})());
const sessionDrafts=new Map<string,string>();
const mainSession=computed(()=>w.active||w.sessions.find(session=>session.id===mainSessionId.value));
watch(()=>w.active?.id,id=>{if(id){mainSessionId.value=id;try{localStorage.setItem(mainSessionKey,id);}catch{}}},{flush:'sync'});
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
watch(()=>w.loading,loading=>{if(!loading&&!w.active){try{if(localStorage.getItem(masterPersonaKey))return;}catch{}const recent=[...w.sessions].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];if(recent)setMasterPersona(recent.persona);}});
const fullPage=computed(()=>library.value||!['story','theaters','status'].includes(w.panel));
const embedded=!!document.getElementById('academy-workspace');
const entry=ref<'opening'|'new'|'continue'>(embedded?'new':'opening');
function start(){library.value=false;w.home();w.resetNewGameDraft();entry.value='new';w.ensureApiConfiguration();}
function resume(){library.value=false;w.home();entry.value='continue';}
function settings(){library.value=false;w.home();entry.value='new';w.panel='settings';}
function opening(){if(w.busy||w.workingMemory||w.workingPersona||w.creatingGame)return;if(embedded){window.dispatchEvent(new Event('academy:home'));return;}w.home();entry.value='opening';}
function terminalNavigate(event:Event){
  const detail=(event as CustomEvent).detail;
  if(!embedded||w.busy||w.workingMemory||w.workingPersona||w.creatingGame||!detail)return;
  if(w.loading){pendingNavigation=detail;return;}
  if(typeof detail.insert==='string'&&detail.insert.trim())pendingText=[pendingText,detail.insert.trim()].filter(Boolean).join('\n\n').slice(0,16000);
  library.value=detail.entry==='personas';
  if(library.value){entry.value='new';return;}
  if(detail.entry==='conversation'){
    entry.value='new';
    if(w.active){w.enterStory();flushInsertedText();return;}
    const recent=mainSession.value||[...w.sessions].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
    if(recent){w.open(recent.id);flushInsertedText();}else{w.home();w.notice='还没有对话，填写人物档案后开始新会话。插入的文字会保留到新会话。';}
    return;
  }
  if(detail.entry==='continue'){resume();return;}
  if(detail.entry==='new'){if(w.active)w.home();entry.value='new';w.panel='story';return;}
  const panels:Panel[]=['story','memory','relations','map','forum','game-settings','theaters','status','settings','presets','saves'];
  if(panels.includes(detail.panel)){
    entry.value='new';
    if(['memory','relations','theaters','status'].includes(detail.panel)&&!w.active){w.panel='story';w.notice='创建或继续一个会话后，即可使用这个功能。';return;}
    if(detail.panel==='story'&&!w.active)w.panel='story';else navigate(detail.panel);
  }
}
let pendingNavigation:unknown;
let pendingText='';
function flushInsertedText(){if(w.active&&pendingText){w.input=[w.input,pendingText].filter(Boolean).join('\n\n').slice(0,16000);pendingText='';}}
watch(()=>w.active?.id,flushInsertedText);
watch(()=>w.loading,loading=>{if(!loading&&pendingNavigation){const detail=pendingNavigation;pendingNavigation=undefined;terminalNavigate(new CustomEvent('academy:navigate',{detail}));}});
onMounted(()=>{window.addEventListener('academy:navigate',terminalNavigate);window.addEventListener('academy:insert',insertCampusText);window.addEventListener('academy:campus-access',campusAccess);window.dispatchEvent(new Event('academy:ready'));void restorePersonaMedia();});
onUnmounted(()=>{window.removeEventListener('academy:navigate',terminalNavigate);window.removeEventListener('academy:insert',insertCampusText);window.removeEventListener('academy:campus-access',campusAccess);});
function navigate(panel:Panel){library.value=false;if(panel==='map'&&embedded){window.dispatchEvent(new Event('academy:map'));return;}if(panel==='story')w.enterStory();else w.panel=panel;}
function usePersona(persona:Persona){setMasterPersona(persona);w.home();Object.assign(w.newGameDraft.persona,persona);w.newGameDraft.title=persona.name+'的旅程';entry.value='new';library.value=false;}
const tabs: { id: Panel; label: string; no: string; needsGame?: boolean }[] = [
  { id: 'story', label: '剧情', no: '01' },
  { id: 'memory', label: '记忆', no: '02', needsGame: true },
  { id: 'relations', label: '人物关系', no: '03', needsGame: true },
  { id: 'map', label: '地图', no: '04' },
  { id: 'forum', label: '小剧场设置', no: '05' },
  { id: 'game-settings', label: '游戏设置', no: '06' },
  { id: 'settings', label: '模型设置', no: '07' },
  { id: 'presets', label: '预设管理', no: '08' },
  { id: 'saves', label: '存档与导出', no: '09' }
];
</script>

<template>
  <OpeningView v-if="entry==='opening'" :w="w" @start="start" @continue="resume" @settings="settings" />
  <div v-else class="app-shell">
    <header class="top-shell">
      <div class="app-header">
        <div class="header-actions">
          <span v-if="w.active" class="current-journey">{{ w.active.name }}</span>
          <template v-if="embedded"><button :disabled="w.busy||w.workingMemory||w.workingPersona||w.creatingGame" @click="start">新建旅程</button><button :disabled="w.busy||w.workingMemory||w.workingPersona||w.creatingGame" @click="resume">继续存档</button></template>
          <button :disabled="w.busy || w.workingMemory || w.workingPersona || w.creatingGame" @click="opening">{{embedded?'返回学院':'返回开场'}}</button>
        </div>
      </div>
      <nav class="navigation" aria-label="游戏模块">
        <button v-if="w.active" class="mobile-only" :class="{selected:w.panel==='status'}" @click="w.panel='status'">人物状态</button>
        <button v-if="w.active" class="compact-only" :class="{selected:w.panel==='theaters'}" @click="w.panel='theaters'">查看小剧场</button>
        <button v-for="tab in tabs" :key="tab.id" :class="{selected:w.panel===tab.id}" :disabled="tab.needsGame && !w.active" @click="navigate(tab.id)"><span>{{ tab.no }}</span>{{ tab.label }}</button>
      </nav>
    </header>

    <div class="workspace" :class="{'game-layout':!!w.active&&!fullPage,'forum-focus':w.panel==='theaters','status-focus':w.panel==='status'}">
      <aside v-if="w.active&&!fullPage" class="status-rail" aria-label="左侧人物状态"><StatusBar :w="w" /></aside>
      <main class="center-pane">
        <div v-if="w.problem" class="error-banner" role="alert"><span>{{ w.problem }}</span><button @click="w.problem=''">收起提示</button></div>
        <div class="center-content">
          <div v-if="w.loading" class="empty">正在打开本地数据库…</div>
          <template v-else>
            <PersonaLibrary v-if="library" :sessions="w.sessions" @use="usePersona" @master="setMasterPersona" />
            <HomeView v-else-if="!w.active && w.panel==='story'" :w="w" :mode="entry==='continue'?'continue':'new'" />
            <StoryView v-else-if="w.panel==='story'&&w.apiReady" :w="w" />
            <SettingsView v-else-if="w.panel==='story'" :w="w" />
            <MemoryView v-else-if="w.panel==='memory'" :w="w" />
            <WorldView v-else-if="w.panel==='relations' || w.panel==='map'" :w="w" :kind="w.panel" />
            <TheaterSettings v-else-if="w.panel==='forum'" :w="w" />
            <GameSettingsView v-else-if="w.panel==='game-settings'" :w="w" />
            <TheaterRail v-else-if="w.panel==='theaters'" :w="w" />
            <StatusBar v-else-if="w.panel==='status'" :w="w" />
            <SettingsView v-else-if="w.panel==='settings'" :w="w" />
            <section v-else-if="w.panel==='presets'" class="surface preset-page"><header class="panel-heading"><div><p class="eyebrow">PRESETS / 预设管理</p><h1>导入与编辑预设</h1></div><button @click="w.save()">保存配置</button></header><PresetManager :w="w" /></section>
            <SavesView v-else-if="w.panel==='saves'" :w="w" />
          </template>
        </div>
      </main>
      <aside v-if="w.active && !fullPage && w.panel!=='theaters'" class="forum-rail" aria-label="右侧小剧场"><TheaterRail :w="w" /></aside>
    </div>

    <footer class="app-footer"><span role="status">{{ w.notice }}</span><small v-if="w.lastSaved">最近保存 {{ new Date(w.lastSaved).toLocaleTimeString() }}</small><small>星际终端 · v0.15.0</small></footer>
  </div>
</template>
