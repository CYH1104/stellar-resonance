<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
import ResizablePanel from './ResizablePanel.vue';
import ForumFeed from './ForumFeed.vue';
import GroupChatPhone from './GroupChatPhone.vue';
import SpiritDiaryView from './SpiritDiaryView.vue';
import {isSpiritDiary} from '../domain/spiritDiary';
defineProps<{w:ViewModel}>();
</script>
<template><section class="theater-rail-content" aria-label="右侧小剧场">
  <header class="rail-heading"><h2>小剧场</h2><button @click="w.settingsTab='theaters';w.panel='game-settings'">设置</button></header>
  
  <div class="theater-windows" :style="{'--theater-count':Math.max(1,w.preferences.theaters?.filter(t=>t.enabled).length||1)}">
    <ResizablePanel v-for="s in w.preferences.theaters?.filter(t=>t.enabled)" :key="s.slot" :preferences="w.preferences" :panel-key="'theater-'+s.slot" :label="s.title" :default-height="s.kind==='group'?420:isSpiritDiary(s)?380:undefined" class="theater-window" :class="{'group-window':s.kind==='group','diary-window':isSpiritDiary(s)}">
      <ForumFeed v-if="s.kind==='forum'" :w="w" :title="s.title" />
      <GroupChatPhone v-else-if="s.kind==='group'" :scene="w.theaters.find(t=>t.slot===s.slot&&t.kind==='group')" :title="s.title" :player-name="w.state?.player.name||w.active?.persona.name||''" />
      <SpiritDiaryView v-else-if="isSpiritDiary(s)" :scene="w.theaters.find(t=>t.slot===s.slot&&t.kind===s.kind)" :title="s.title" />
      <template v-else><header class="rail-heading"><h3>{{s.title}}</h3></header>
        <template v-if="w.theaters.find(t=>t.slot===s.slot&&t.kind===s.kind)">
          <template v-for="scene in w.theaters.filter(t=>t.slot===s.slot&&t.kind===s.kind)" :key="scene.slot">
            <div v-if="scene.messages?.length" class="group-chat"><p v-for="(message,i) in scene.messages" :key="i"><strong>{{message.speaker}}</strong><span>{{message.content}}</span></p></div>
            <p v-if="scene.content" class="theater-prose">{{scene.content}}</p>
          </template>
        </template><p v-else class="empty">等待下一轮剧情完成后生成。</p>
      </template>
    </ResizablePanel>
  </div>
  <p v-if="!w.preferences.theaters?.some(t=>t.enabled)" class="empty">小剧场已全部关闭，可以到设置中开启。</p>
  
</section></template>
