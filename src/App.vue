<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import ResizeHandle from './components/ResizeHandle.vue';
import {useWorkspaceLayout} from './app/useWorkspaceLayout';
import { useWorkspace } from './app/useWorkspace';
import type { Panel } from './domain/contracts';
import HomeView from './components/HomeView.vue';
import StoryView from './components/StoryView.vue';
import StatusBar from './components/StatusBar.vue';
import TheaterRail from './components/TheaterRail.vue';
import GameSettingsView from './components/GameSettingsView.vue';
import MemoryView from './components/MemoryView.vue';
import WorldView from './components/WorldView.vue';
import SettingsView from './components/SettingsView.vue';
import SavesView from './components/SavesView.vue';
import PersonaLibrary from './components/PersonaLibrary.vue';
import type {Persona} from './domain/contracts';
import OpeningView from './components/OpeningView.vue';
import PresetManager from './components/PresetManager.vue';
import WorldbookManager from './components/WorldbookManager.vue';

const w = reactive(useWorkspace());
const workspaceEl=ref<HTMLElement>();
const layout=useWorkspaceLayout(w.preferences,workspaceEl,()=>w.panel!=='theaters');
const library=ref(false);
const fullPage=computed(()=>library.value||!['story','theaters','status'].includes(w.panel));
function openLibrary(){library.value=true;entry.value='new';}
function usePersona(persona:Persona){start();Object.assign(w.newGameDraft.persona,persona);}
const entry=ref<'opening'|'new'|'continue'>('opening');
function start(){library.value=false;w.home();w.resetNewGameDraft();entry.value='new';w.ensureApiConfiguration();}
function resume(){library.value=false;if(w.active){entry.value='new';w.enterStory();return;}w.home();entry.value='continue';}
function settings(){library.value=false;entry.value='new';w.panel='game-settings';}
function opening(){if(w.busy||w.workingMemory||w.workingPersona||w.creatingGame)return;library.value=false;entry.value='opening';}
function navigate(panel:Panel){library.value=false;if(panel==='story')w.enterStory();else w.panel=panel;}
const tabs: { id: Panel; label: string; no: string; needsGame?: boolean }[] = [
  { id: 'story', label: '剧情', no: '01' },
  { id: 'memory', label: '记忆', no: '02', needsGame: true },
  { id: 'relations', label: '人物关系', no: '03', needsGame: true },
  { id: 'map', label: '地图', no: '04', needsGame: true },
  { id: 'game-settings', label: '设置', no: '05' },
  { id: 'settings', label: 'API 设置', no: '06' },
  { id: 'presets', label: '预设', no: '07' },
  { id: 'worldbooks', label: '世界书', no: '08' },
  { id: 'saves', label: '存档与导出', no: '09' }
];
</script>

<template>
  <OpeningView v-if="entry==='opening'" :w="w" @start="start" @continue="resume" @settings="settings" @personas="openLibrary" />
  <div v-else class="app-shell">
    <header class="top-shell">
      <div class="app-header">
        <div class="brand"><span class="brand-mark">✦</span><div><strong>群星共振</strong><small>STELLAR RESONANCE</small></div></div>
        <div class="header-actions">
          <button v-if="w.active" @click="layout.reset()" title="恢复左右侧栏及所有卡片的默认大小">恢复默认布局</button>
          <span class="tag">{{ w.localService&&w.preferences.mode==='server'?'服务器世界卡 · AI 叙事':w.preferences.mode === 'demo' ? '模拟 AI · 功能预览' : '真实服务端模式' }}</span>
          <button :disabled="w.busy||w.workingPersona||w.creatingGame" @click="openLibrary">user 人设库</button>
          <span v-if="w.active" class="current-journey">{{ w.active.name }}</span>
          <button :disabled="w.busy || w.workingMemory || w.workingPersona || w.creatingGame" @click="opening">返回开场</button>
        </div>
      </div>
      <nav class="navigation" aria-label="游戏模块">
        <button v-if="w.active" class="mobile-only" :class="{selected:w.panel==='status'}" @click="w.panel='status'">人物状态</button>
        <button v-if="w.active" class="compact-only" :class="{selected:w.panel==='theaters'}" @click="w.panel='theaters'">查看小剧场</button>
        <button v-for="tab in tabs" :key="tab.id" :class="{selected:w.panel===tab.id}" :disabled="tab.needsGame && !w.active" @click="navigate(tab.id)"><span>{{ tab.no }}</span>{{ tab.label }}</button>
      </nav>
    </header>

    <div ref="workspaceEl" class="workspace" :style="layout.style.value" :class="{'game-layout':!!w.active&&!fullPage,'full-page':fullPage,'forum-focus':w.panel==='theaters','status-focus':w.panel==='status'}">
      <aside v-if="w.active&&!fullPage" class="status-rail" aria-label="左侧人物状态"><StatusBar :w="w" /></aside>
      <ResizeHandle v-if="w.active&&!fullPage" class="column-resizer left-resizer" axis="x" label="调整左侧状态栏宽度" @resize="dx=>layout.resize('left',dx)" />
      <main class="center-pane">
        <div v-if="w.problem&&w.panel!=='settings'" class="error-banner" role="alert"><span>{{ w.problem }}</span><button @click="w.problem=''">收起提示</button></div>
        <div class="center-content">
          <div v-if="w.loading" class="empty">正在打开本地数据库…</div>
          <template v-else>
            <PersonaLibrary v-if="library" :sessions="w.sessions" @use="usePersona" />
            <HomeView v-else-if="!w.active && w.panel==='story'" :w="w" :mode="entry==='continue'?'continue':'new'" />
            <StoryView v-else-if="w.panel==='story'&&w.apiReady" :w="w" />
            <SettingsView v-else-if="w.panel==='story'" :w="w" />
            <MemoryView v-else-if="w.panel==='memory'" :w="w" />
            <WorldView v-else-if="w.panel==='relations' || w.panel==='map'" :w="w" :kind="w.panel" />
            <GameSettingsView v-else-if="w.panel==='game-settings'" :w="w" />
            <TheaterRail v-else-if="w.panel==='theaters'" :w="w" />
            <StatusBar v-else-if="w.panel==='status'" :w="w" />
            <SettingsView v-else-if="w.panel==='settings'" :w="w" />
            <PresetManager v-else-if="w.panel==='presets'" :w="w" />
            <WorldbookManager v-else-if="w.panel==='worldbooks'" :w="w" />
            <SavesView v-else-if="w.panel==='saves'" :w="w" />
          </template>
        </div>
      </main>
      <ResizeHandle v-if="w.active&&!fullPage&&w.panel!=='theaters'" class="column-resizer right-resizer" axis="x" label="调整右侧小剧场栏宽度" @resize="dx=>layout.resize('right',dx)" />
      <aside v-if="w.active&&!fullPage && w.panel!=='theaters'" class="forum-rail" aria-label="右侧小剧场"><TheaterRail :w="w" /></aside>
    </div>

    <footer class="app-footer"><span role="status">{{ w.notice }}</span><small v-if="w.lastSaved">最近保存 {{ new Date(w.lastSaved).toLocaleTimeString() }}</small><small>本机测试 v0.20.5</small></footer>
  </div>
</template>
