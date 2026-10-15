<script setup lang="ts">
import { reactive } from 'vue';import { useWorkspace } from './app/useWorkspace';import type {Panel} from './domain/contracts';
import HomeView from './components/HomeView.vue';import StoryView from './components/StoryView.vue';import StatusBar from './components/StatusBar.vue';import MemoryView from './components/MemoryView.vue';import WorldView from './components/WorldView.vue';import SettingsView from './components/SettingsView.vue';import SavesView from './components/SavesView.vue';
const w=reactive(useWorkspace());
const tabs:{id:Panel;label:string;no:string}[]=[{id:'story',label:'剧情',no:'01'},{id:'memory',label:'记忆',no:'02'},{id:'relations',label:'人物关系',no:'03'},{id:'chronicle',label:'编年史',no:'04'},{id:'map',label:'地图',no:'05'},{id:'settings',label:'模型与预设',no:'06'},{id:'saves',label:'存档与导出',no:'07'}];
</script>
<template><div class="app-shell"><header class="app-header"><div class="brand"><span class="brand-mark">✦</span><div><strong>群星共振</strong><small>STELLAR RESONANCE</small></div></div><div class="header-actions"><span class="tag">{{w.preferences.mode==='demo'?'模拟 AI · 功能预览':'真实服务端模式'}}</span><button :disabled="w.busy||w.workingMemory" @click="w.home()">首页</button></div></header>
  <div class="workspace"><nav v-if="w.active" class="navigation" aria-label="游戏模块"><button v-for="tab in tabs" :key="tab.id" :class="{selected:w.panel===tab.id}" @click="w.panel=tab.id"><span>{{tab.no}}</span>{{tab.label}}</button><p class="muted nav-note">本机存档<br/>{{w.active.persona.name}}</p></nav>
    <main><div v-if="w.problem" class="error-banner" role="alert"><span>{{w.problem}}</span><button @click="w.problem=''">收起提示</button></div><div v-if="w.loading" class="empty">正在打开本地数据库…</div><template v-else>
      <StatusBar v-if="w.active" :w="w" />
      <HomeView v-if="!w.active&&w.panel==='story'" :w="w" />
      <StoryView v-else-if="w.panel==='story'" :w="w" />
      <MemoryView v-else-if="w.panel==='memory'" :w="w" />
      <WorldView v-else-if="w.panel==='relations'||w.panel==='chronicle'||w.panel==='map'" :w="w" :kind="w.panel" />
      <SettingsView v-else-if="w.panel==='settings'" :w="w" />
      <SavesView v-else-if="w.panel==='saves'" :w="w" />
    </template></main>
  </div><footer class="app-footer"><span role="status">{{w.notice}}</span><small v-if="w.lastSaved">最近保存 {{new Date(w.lastSaved).toLocaleTimeString()}}</small><small>功能骨架 v0.2 · 星穹终端学院风</small></footer>
</div></template>
