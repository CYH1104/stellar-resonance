<script setup lang="ts">
import { computed } from 'vue';
import type { ViewModel } from '../app/useWorkspace';
import { selected,encounteredCharacters } from '../domain/story';
import ResizablePanel from './ResizablePanel.vue';
import ActorCard from './ActorCard.vue';
const props = defineProps<{w:ViewModel}>();
const present = computed(() => props.w.state?.characters.filter(actor => actor.present) || []);
const met=computed(()=>props.w.active?encounteredCharacters(props.w.active):[]);
const round = computed(() => props.w.active?.turns.reduce((last,turn,index) => selected(turn)?.status==='complete' && selected(turn)?.outcome ? index+1 : last,0) || 0);
</script>
<template>
  <section v-if="w.state" class="status-panel" aria-label="人物状态">
    <header class="rail-heading"><div><p class="eyebrow">MVU / 人物状态</p><h2>这一幕的状态</h2></div><span class="tag">{{ round ? `第 ${round} 轮` : '开局' }}</span></header>
    <small class="rail-note">拖动卡片右边、下边或右下角调整大小。</small>
    <ResizablePanel :preferences="w.preferences" panel-key="player" label="玩家状态卡"><ActorCard :actor="w.state.player" :characters="met" player /></ResizablePanel>
    <div class="present-heading"><h2>在场角色</h2><span class="tag">{{ present.length }} 位</span></div>
    <ResizablePanel v-for="actor in present" :key="actor.id" :preferences="w.preferences" :panel-key="'char-'+actor.id" :label="actor.name+'状态卡'"><ActorCard :actor="actor" /></ResizablePanel>
    <p v-if="!present.length" class="empty">{{round?'当前没有在场角色。':'等待 AI 生成第一幕并判断在场人物。'}}</p>
    <p class="rail-note">{{w.localService&&w.preferences.mode==='server'?'好感度（−100～100）由 AI 根据人设关系和剧情更新；精神体 OS 每轮生成。好感度只列出已遇到角色。':w.preferences.mode==='demo'?'当前为演示 MVU 数据；性别取值与好感度规则等待正式资料。':'显示本轮 MVU 变量；正式字段映射与规则待接入。'}}</p>
  </section>
</template>
