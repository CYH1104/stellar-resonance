<script setup lang="ts">
import { reactive, ref } from 'vue';
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
import OpeningView from './components/OpeningView.vue';
import PresetManager from './components/PresetManager.vue';

const w = reactive(useWorkspace());
const entry=ref<'opening'|'new'|'continue'>('opening');
function start(){w.home();w.resetNewGameDraft();entry.value='new';w.ensureApiConfiguration();}
function resume(){w.home();entry.value='continue';}
function settings(){w.home();entry.value='new';w.panel='game-settings';}
function opening(){if(w.busy||w.workingMemory||w.workingPersona||w.creatingGame)return;w.home();entry.value='opening';}
function navigate(panel:Panel){if(panel==='story')w.enterStory();else w.panel=panel;}
const tabs: { id: Panel; label: string; no: string; needsGame?: boolean }[] = [
  { id: 'story', label: '剧情', no: '01' },
  { id: 'memory', label: '记忆', no: '02', needsGame: true },
  { id: 'relations', label: '人物关系', no: '03', needsGame: true },
  { id: 'map', label: '地图', no: '04', needsGame: true },
  { id: 'game-settings', label: '设置', no: '05' },
  { id: 'settings', label: '模型设置', no: '06' },
  { id: 'presets', label: '预设', no: '07' },
  { id: 'saves', label: '存档与导出', no: '08' }
];
</script>

<template>
  <OpeningView v-if="entry==='opening'" :w="w" @start="start" @continue="resume" @settings="settings" />
  <div v-else class="app-shell">
    <header class="top-shell">
      <div class="app-header">
        <div class="brand"><span class="brand-mark">✦</span><div><strong>群星共振</strong><small>STELLAR RESONANCE</small></div></div>
        <div class="header-actions">
          <span class="tag">{{ w.localService&&w.preferences.mode==='server'?'服务器世界卡 · AI 叙事':w.preferences.mode === 'demo' ? '模拟 AI · 功能预览' : '真实服务端模式' }}</span>
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

    <div class="workspace" :class="{'game-layout':!!w.active,'forum-focus':w.panel==='theaters','status-focus':w.panel==='status'}">
      <aside v-if="w.active" class="status-rail" aria-label="左侧人物状态"><StatusBar :w="w" /></aside>
      <main class="center-pane">
        <div v-if="w.problem" class="error-banner" role="alert"><span>{{ w.problem }}</span><button @click="w.problem=''">收起提示</button></div>
        <div class="center-content">
          <div v-if="w.loading" class="empty">正在打开本地数据库…</div>
          <template v-else>
            <HomeView v-if="!w.active && w.panel==='story'" :w="w" :mode="entry==='continue'?'continue':'new'" />
            <StoryView v-else-if="w.panel==='story'&&w.apiReady" :w="w" />
            <SettingsView v-else-if="w.panel==='story'" :w="w" />
            <MemoryView v-else-if="w.panel==='memory'" :w="w" />
            <WorldView v-else-if="w.panel==='relations' || w.panel==='map'" :w="w" :kind="w.panel" />
            <GameSettingsView v-else-if="w.panel==='game-settings'" :w="w" />
            <TheaterRail v-else-if="w.panel==='theaters'" :w="w" />
            <StatusBar v-else-if="w.panel==='status'" :w="w" />
            <SettingsView v-else-if="w.panel==='settings'" :w="w" />
            <PresetManager v-else-if="w.panel==='presets'" :w="w" />
            <SavesView v-else-if="w.panel==='saves'" :w="w" />
          </template>
        </div>
      </main>
      <aside v-if="w.active && w.panel!=='theaters'" class="forum-rail" aria-label="右侧小剧场"><TheaterRail :w="w" /></aside>
    </div>

    <footer class="app-footer"><span role="status">{{ w.notice }}</span><small v-if="w.lastSaved">最近保存 {{ new Date(w.lastSaved).toLocaleTimeString() }}</small><small>本机测试 v0.15.0 · 外观待 PPT</small></footer>
  </div>
</template>
