<script setup lang="ts">
import {provideTheaterRegex} from '../app/theaterRegex';
import TheaterContent from './TheaterContent.vue';
import {displayText} from '../domain/storyMarkup';
import {computed,ref} from 'vue';
import TheaterScroll from './TheaterScroll.vue';
import type {ViewModel} from '../app/useWorkspace';
import ResizablePanel from './ResizablePanel.vue';
import GroupChatPhone from './GroupChatPhone.vue';
import SpiritDiaryView from './SpiritDiaryView.vue';
import {isSpiritDiary} from '../domain/spiritDiary';
import {fanficBody,fanficEnding,theaterRequirementError} from '../domain/theaterRequirements';
import ForumFeed from './ForumFeed.vue';
const props=defineProps<{w:ViewModel}>();
provideTheaterRegex(()=>props.w);
const opened=ref<number|null>(props.w.preferences.theaters?.find(t=>t.enabled&&t.slot!==2)?.slot??null);
const revision=computed(()=>JSON.stringify([props.w.active?.id,props.w.forum,props.w.theaters,props.w.active?.forumActivity]));
</script>
<template><section class="theater-rail-content" aria-label="右侧小剧场">

  <div class="theater-windows">
    <details v-for="s in w.preferences.theaters?.filter(t=>t.enabled&&t.slot!==2)" :key="s.slot" class="theater-window" :class="{expanded:opened===s.slot}" :open="opened===s.slot" @toggle="event=>{if((event.target as HTMLDetailsElement).open)opened=s.slot;else if(opened===s.slot)opened=null}"><summary class="theater-collapse-toggle"><span>{{s.title}}</span><span aria-hidden="true">{{opened===s.slot?'−':'+'}}</span></summary><div v-if="opened===s.slot" class="theater-pane"><TheaterScroll :revision="revision+String(opened)"><ResizablePanel :preferences="w.preferences" :panel-key="'theater-'+s.slot" :label="s.title" :default-height="380">
      <ForumFeed v-if="s.kind==='forum'" :w="w" :title="s.title" />
      <GroupChatPhone v-else-if="s.kind==='group'" :scene="w.theaters.find(t=>t.slot===s.slot&&t.kind==='group')" :title="s.title" :player-name="w.state?.player.name||w.active?.persona.name||''" />
      <SpiritDiaryView v-else-if="isSpiritDiary(s)" :scene="w.theaters.find(t=>t.slot===s.slot&&t.kind===s.kind)" :title="s.title" />
      <template v-else><header class="rail-heading"><h3>{{s.title}}</h3></header>
        <template v-if="w.theaters.find(t=>t.slot===s.slot&&t.kind===s.kind)">
          <template v-for="scene in w.theaters.filter(t=>t.slot===s.slot&&t.kind===s.kind)" :key="scene.slot">
            <div v-if="scene.messages?.length" class="group-chat"><div v-for="(message,i) in scene.messages" :key="i"><strong>{{message.speaker}}</strong><TheaterContent :slot="scene.slot" :text="message.content" /></div></div>
            <TheaterContent :slot="scene.slot" v-if="scene.content" class="theater-prose" :text="scene.kind==='fanfic'?fanficBody(scene.content):scene.content" />
            <p v-if="scene.kind==='fanfic'&&fanficEnding(scene.content)" class="fanfic-end">END</p>
            <p v-if="scene.kind==='fanfic'&&theaterRequirementError(scene)" class="companion-incomplete" role="status">{{fanficEnding(scene.content)?'篇幅或完成标记不满足要求，尚未确认完篇。':'未收到结尾 END，尚未确认完篇，可能截断。'}}</p>
          </template>
        </template><p v-else class="empty">等待下一轮剧情完成后生成。</p>
      </template>
    </ResizablePanel></TheaterScroll></div></details>
  </div>
  <p v-if="!w.preferences.theaters?.some(t=>t.enabled)" class="empty">小剧场已全部关闭，可以到设置中开启。</p>

</section></template>
