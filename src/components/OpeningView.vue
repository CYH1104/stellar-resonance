<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
defineProps<{w:ViewModel}>();
defineEmits<{start:[];continue:[];settings:[]}>();
</script>
<template>
  <main class="opening-screen" aria-label="游戏开场">
    <div class="opening-content">
      <p class="opening-kicker">STELLAR RESONANCE</p>
      <h1>群星共振</h1>
      <p v-if="w.loading" role="status" class="opening-loading">正在载入本机存档与世界资料…</p>
      <p v-else class="opening-loading">故事，从这里开始。</p>
      <nav class="opening-menu" aria-label="开始菜单">
        <button :disabled="w.loading" @click="$emit('start')">新的开始</button>
        <button :disabled="w.loading||!w.sessions.length" @click="$emit('continue')">继续游戏</button>
        <button :disabled="w.loading" @click="$emit('settings')">设置</button>
      </nav>
      <p v-if="!w.loading&&!w.sessions.length" class="opening-note">暂无本机存档，先开启一段新的旅程。</p>
      <p v-if="w.problem" class="opening-problem" role="alert">{{w.problem}}</p>
    </div>
  </main>
</template>
