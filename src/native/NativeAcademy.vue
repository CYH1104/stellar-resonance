<script setup lang="ts">
import {ref, shallowRef, nextTick, onMounted, onBeforeUnmount} from 'vue';
import type {NativeHost} from './runtime';
const {host} = defineProps<{host: NativeHost}>();
const state = shallowRef(host.snapshot());
const draft = ref(state.value.draft), problem = ref('');
const feed = ref<HTMLElement>();
let follow = true;
function sync() {
  state.value = host.snapshot();
  draft.value = state.value.draft;
  if (follow) void nextTick(() => {if (feed.value) feed.value.scrollTop = feed.value.scrollHeight;});
}
const unsubscribe = host.subscribe(sync);
function trackScroll() {
  const el = feed.value;
  if (el) follow = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}
async function send() {
  problem.value = '';
  try {await host.send(draft.value);} catch (error) {problem.value = error instanceof Error ? error.message : '生成未完成，请查看酒馆提示。';}
  sync();
}
onMounted(() => {sync();});
onBeforeUnmount(unsubscribe);
</script>
<template>
  <div class="app-shell native-academy">
    <header class="top-shell">
      <div class="app-header"><div class="brand"><span class="brand-mark">✦</span><div><strong>星穹学院</strong><small>INTERSTELLAR ACADEMY</small></div></div><span class="current-journey">{{state.name || '请选择角色与会话'}}</span></div>
      <nav class="navigation" aria-label="学院导航">
        <button class="selected" type="button">剧情</button>
        <button type="button" @click="host.open('personas')">人设</button>
        <button type="button" @click="host.open('presets')">预设</button>
        <button type="button" @click="host.open('worldbooks')">世界书</button>
        <button type="button" @click="host.open('api')">API</button>
        <button type="button" @click="host.open('characters')">角色与存档</button>
        <button type="button" @click="host.open('extensions')">扩展</button>
        <button type="button" @click="host.open()">返回酒馆</button>
      </nav>
    </header>
    <main class="native-story">
      <div v-if="!state.ready" class="empty"><p>选择角色与会话后开始。</p><button type="button" @click="host.open('characters')">选择角色与会话</button></div>
      <div v-else ref="feed" class="story-feed" aria-label="剧情记录" @scroll.passive="trackScroll">
        <article v-for="row in state.rows" :key="row.index" class="message" :class="row.user ? 'player-message' : 'assistant-message'">
          <header><strong>{{row.name}}</strong></header>
          <div class="prose mes_text" v-html="row.html"></div>
        </article>
      </div>
      <p v-if="problem" class="warning" role="alert">{{problem}}</p>
      <form class="composer" @submit.prevent="send">
        <label class="native-input"><span class="muted">{{state.busy ? '生成中…' : '你的行动'}}</span><textarea v-model="draft" aria-label="你的行动" :disabled="state.busy" placeholder="输入你的行动…" @input="host.setDraft(draft)"></textarea></label>
        <div class="actions"><button v-if="state.busy" type="button" @click="host.stop()">停止生成</button><button v-else class="primary" type="submit" :disabled="!state.ready || !state.connected || !draft.trim()">发送</button><button v-if="!state.connected" type="button" @click="host.open('api')">连接 API</button></div>
      </form>
    </main>
  </div>
</template>
