<script setup lang="ts">
import { computed,ref } from 'vue';import type {ViewModel} from '../app/useWorkspace';
const props=defineProps<{w:ViewModel}>();const id=ref('player');
const actors=computed(()=>props.w.state?[props.w.state.player,...props.w.state.characters.filter(a=>a.present)]:[]);
const actor=computed(()=>actors.value.find(a=>a.id===id.value)||actors.value[0]);
</script>
<template><section v-if="actor" class="status-bar" aria-label="人物状态"><label>查看状态<select v-model="id"><option v-for="a in actors" :key="a.id" :value="a.id">{{a.id==='player'?'自己 · ':''}}{{a.name}}</option></select></label><div class="status-value"><span>体力</span><strong>{{actor.energy}}</strong><progress :value="actor.energy" max="100" /></div><div class="status-value"><span>专注</span><strong>{{actor.focus}}</strong><progress :value="actor.focus" max="100" /></div><div v-if="actor.id!=='player'" class="status-value"><span>已知关系值</span><strong>{{actor.affinity}}</strong><progress :value="actor.affinity" max="100" /></div><p class="muted">样例公开字段；正式字段接入时再定义。</p></section></template>
