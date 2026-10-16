<script setup lang="ts">
import {computed,ref} from 'vue';
import TheaterScroll from './TheaterScroll.vue';
import type {ViewModel} from '../app/useWorkspace';
import ResizablePanel from './ResizablePanel.vue';
import GroupChatPhone from './GroupChatPhone.vue';
import SpiritDiaryView from './SpiritDiaryView.vue';
import {isSpiritDiary} from '../domain/spiritDiary';
import ForumFeed from './ForumFeed.vue';
const props=defineProps<{w:ViewModel}>();
const opened=ref<number|null>(props.w.preferences.theaters?.find(t=>t.enabled)?.slot??null);
const revision=computed(()=>JSON.stringify([props.w.active?.id,props.w.forum,props.w.theaters,props.w.active?.forumActivity]));
</script>
<template><section class="theater-rail-content" aria-label="右侧小剧场">

  <div class="theater-windows">
    <details v-for="s in w.preferences.theaters?.filter(t=>t.enabled)" :key="s.slot" class="theater-window" :class="{expanded:opened===s.slot}" :open="opened===s.slot" @toggle="event=>{if((event.target as HTMLDetailsElement).open)opened=s.slot;else if(opened===s.slot)opened=null}"><summary class="theater-collapse-toggle"><span>{{s.title}}</span><span aria-hidden="true">{{opened===s.slot?'−':'+'}}</span></summary><div v-show="opened===s.slot" class="theater-pane"><TheaterScroll :revision="revision+String(opened)"><ResizablePanel :preferences="w.preferences" :panel-key="'theater-'+s.slot" :label="s.title" :default-height="s.kind==='group'?420:isSpiritDiary(s)?380:undefined">
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
    </ResizablePanel></TheaterScroll></div></details>
  </div>
  <p v-if="!w.preferences.theaters?.some(t=>t.enabled)" class="empty">小剧场已全部关闭，可以到设置中开启。</p>

</section></template>
