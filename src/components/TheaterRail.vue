<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
import ForumFeed from './ForumFeed.vue';
defineProps<{w:ViewModel}>();
</script>
<template><section class="theater-rail-content" aria-label="右侧小剧场">
  <header class="rail-heading"><h2>小剧场</h2><button @click="w.panel='forum'">设置</button></header>
  <div class="theater-windows">
    <article v-for="s in w.preferences.theaters?.filter(t=>t.enabled)" :key="s.slot" class="theater-window">
      <ForumFeed v-if="s.kind==='forum'" :w="w" :title="s.title" />
      <template v-else><header class="rail-heading"><h3>{{s.title}}</h3><small v-if="w.theaters.find(t=>t.slot===s.slot)">第{{w.theaters.find(t=>t.slot===s.slot)?.round}}轮</small></header>
        <template v-if="w.theaters.find(t=>t.slot===s.slot&&t.kind===s.kind)">
          <template v-for="scene in w.theaters.filter(t=>t.slot===s.slot&&t.kind===s.kind)" :key="scene.slot">
            <p v-if="scene.pairing" class="hint">{{scene.pairing.category}}{{scene.pairing.category==='BL'?` · user ${scene.pairing.userRole}`:''}} · {{scene.pairing.reason}}</p>
            <div v-if="scene.messages?.length" class="group-chat"><p v-for="(message,i) in scene.messages" :key="i"><strong>{{message.speaker}}</strong><span>{{message.content}}</span></p></div>
            <p v-if="scene.content" class="theater-prose">{{scene.content}}</p>
          </template>
        </template><p v-else class="empty">等待下一轮剧情完成后生成。</p>
      </template>
    </article>
  </div>
  <p v-if="!w.preferences.theaters?.some(t=>t.enabled)" class="empty">小剧场已全部关闭，可以到设置中开启。</p>
  <small class="rail-note">独立番外，不计入主线记忆。未完成的回复不提交小剧场。</small>
</section></template>
