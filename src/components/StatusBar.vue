<script setup lang="ts">
import { computed } from 'vue';
import type { ViewModel } from '../app/useWorkspace';
import { encounteredCharacters } from '../domain/story';
import ResizablePanel from './ResizablePanel.vue';
import ActorCard from './ActorCard.vue';
const props = defineProps<{w:ViewModel}>();
const present = computed(() => props.w.state?.characters.filter(actor => actor.present) || []);
const met=computed(()=>props.w.active?encounteredCharacters(props.w.active):[]);
</script>
<template>
  <section v-if="w.state" class="status-panel" aria-label="人物状态">
    <header class="rail-heading"><p class="eyebrow">MVU / 人物状态</p></header>
    <ResizablePanel :preferences="w.preferences" panel-key="player" label="玩家状态卡"><ActorCard :actor="w.state.player" :characters="met" player /></ResizablePanel>
    <div class="present-heading"><p class="eyebrow">在场角色</p><span class="status-count">{{ present.length }} 位</span></div>
    <ResizablePanel v-for="actor in present" :key="actor.id" :preferences="w.preferences" :panel-key="'char-'+actor.id" :label="actor.name+'状态卡'"><ActorCard :actor="actor" /></ResizablePanel>
    <p v-if="!present.length" class="empty">暂无在场角色。</p>
  </section>
</template>
