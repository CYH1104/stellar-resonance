<script setup lang="ts">
import { computed } from 'vue';
import type { ViewModel } from '../app/useWorkspace';
import { selected,encounteredCharacters } from '../domain/story';
import ActorCard from './ActorCard.vue';
const props = defineProps<{w:ViewModel}>();
const present = computed(() => props.w.state?.characters.filter(actor => actor.present) || []);
const met=computed(()=>props.w.active?encounteredCharacters(props.w.active):[]);
const round = computed(() => props.w.active?.turns.reduce((last,turn,index) => selected(turn)?.status==='complete' && selected(turn)?.outcome ? index+1 : last,0) || 0);
</script>
<template>
  <section v-if="w.state" class="status-panel" aria-label="人物状态">
    <header class="rail-heading"><div><p class="eyebrow">MVU / 人物状态</p><h2>这一幕的状态</h2></div><span class="tag">{{ round ? `第 ${round} 轮` : '开局' }}</span></header>
    <ActorCard :actor="w.state.player" :characters="met" player />
    <div class="present-heading"><h2>在场角色</h2><span class="tag">{{ present.length }} 位</span></div>
    <ActorCard v-for="actor in present" :key="actor.id" :actor="actor" />
    <p v-if="!present.length" class="empty">{{round?'当前没有在场角色。':'等待 AI 生成第一幕并判断在场人物。'}}</p>
    <p class="rail-note">{{w.localService&&w.preferences.mode==='server'?'在场名单、角色想法与精神体 OS 随有效剧情更新；好感度只列出已遇到角色，缺少数值规则时显示未提供。':w.preferences.mode==='demo'?'当前为演示 MVU 数据；性别取值与好感度规则等待正式资料。':'显示本轮 MVU 变量；正式字段映射与规则待接入。'}}</p>
  </section>
</template>
