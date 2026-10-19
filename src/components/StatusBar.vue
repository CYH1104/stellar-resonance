<script setup lang="ts">
import { computed,ref } from 'vue';
import type { ViewModel } from '../app/useWorkspace';
import { encounteredCharacters } from '../domain/story';
import ResizablePanel from './ResizablePanel.vue';
import ActorCard from './ActorCard.vue';
import {actorCardVisible,setActorCardHidden} from '../domain/actorCardVisibility';
const props = defineProps<{w:ViewModel}>();
const opened=ref<string|null>(null);
const present = computed(() => props.w.state?.characters.filter(actor => actor.present && actorCardVisible(props.w.active,actor.id)) || []);
function hide(id:string){if(!props.w.active)return;setActorCardHidden(props.w.active,id,true);void props.w.save();}
const met=computed(()=>props.w.active?encounteredCharacters(props.w.active):[]);
</script>
<template>
  <section v-if="w.state" class="status-panel" aria-label="人物状态">
    <header class="rail-heading"><p class="eyebrow">MVU / 人物状态</p></header>
    <details class="actor-collapse player-collapse" open><summary class="theater-collapse-toggle"><span>玩家 · {{w.state.player.name}}</span><span class="collapse-sign" aria-hidden="true"></span></summary><ResizablePanel :preferences="w.preferences" panel-key="player" label="玩家状态卡" :default-height="380"><ActorCard :actor="w.state.player" :characters="met" player /></ResizablePanel></details>
    <div class="present-heading"><p class="eyebrow">在场角色</p></div>
    <details v-for="actor in present" :key="actor.id" class="actor-collapse" :open="opened===actor.id" @toggle="event=>{if((event.target as HTMLDetailsElement).open)opened=actor.id;else if(opened===actor.id)opened=null}"><summary class="theater-collapse-toggle"><span>{{actor.name}}</span><span aria-hidden="true">{{opened===actor.id?'−':'+'}}</span></summary><button type="button" @click="hide(actor.id)">隐藏此角色卡片</button><ResizablePanel :preferences="w.preferences" :panel-key="'char-'+actor.id" :label="actor.name+'状态卡'" :default-height="350"><ActorCard :actor="actor" /></ResizablePanel></details>
    <p v-if="!present.length" class="empty">暂无可见的在场角色，可通过顶栏17恢复隐藏卡片。</p>
  </section>
</template>
