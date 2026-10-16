<script setup lang="ts">
import { computed,ref } from 'vue';
import type { ViewModel } from '../app/useWorkspace';
import { encounteredCharacters } from '../domain/story';
import ResizablePanel from './ResizablePanel.vue';
import ActorCard from './ActorCard.vue';
const props = defineProps<{w:ViewModel}>();
const opened=ref<string|null>(null);
const present = computed(() => props.w.state?.characters.filter(actor => actor.present) || []);
const met=computed(()=>props.w.active?encounteredCharacters(props.w.active):[]);
</script>
<template>
  <section v-if="w.state" class="status-panel" aria-label="人物状态">
    <header class="rail-heading"><p class="eyebrow">MVU / 人物状态</p></header>
    <ResizablePanel :preferences="w.preferences" panel-key="player" label="玩家状态卡"><ActorCard :actor="w.state.player" :characters="met" player /></ResizablePanel>
    <div class="present-heading"><p class="eyebrow">在场角色</p><span class="status-count">{{ present.length }} 位</span></div>
    <details v-for="actor in present" :key="actor.id" class="actor-collapse" :open="opened===actor.id" @toggle="event=>{if((event.target as HTMLDetailsElement).open)opened=actor.id;else if(opened===actor.id)opened=null}"><summary class="theater-collapse-toggle"><span>{{actor.name}}</span><span aria-hidden="true">{{opened===actor.id?'−':'+'}}</span></summary><ResizablePanel :preferences="w.preferences" :panel-key="'char-'+actor.id" :label="actor.name+'状态卡'"><ActorCard :actor="actor" /></ResizablePanel></details>
    <p v-if="!present.length" class="empty">暂无在场角色。</p>
  </section>
</template>
