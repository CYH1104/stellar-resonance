<script setup lang="ts">
import {computed,ref} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import DialogShell from './DialogShell.vue';
import {setActorCardHidden} from '../domain/actorCardVisibility';
const props=defineProps<{w:ViewModel}>();
const open=ref(false);
const hidden=computed(()=>props.w.state?.characters.filter(c=>props.w.active?.hiddenActorCardIds?.includes(c.id))||[]);
function restore(id:string){if(!props.w.active)return;setActorCardHidden(props.w.active,id,false);void props.w.save();}
function restoreAll(){for(const c of hidden.value)restore(c.id);}
</script>
<template>
 <button :disabled="!w.active" @click="open=true"><span>17</span>隐藏角色卡片<span v-if="hidden.length">（{{hidden.length}}）</span></button>
 <DialogShell v-if="open" title="显示被隐藏的角色卡片" @close="open=false">
  <p>选择要重新显示的卡片。隐藏只影响侧边栏显示，角色状态和好感度仍照常更新。</p>
  <p v-if="!hidden.length">没有被隐藏的角色卡片。</p>
  <div class="hidden-card-list"><label v-for="actor in hidden" :key="actor.id"><input type="checkbox" :checked="false" @change="restore(actor.id)" />显示 {{actor.name}}<span v-if="!actor.present">（当前不在场，下次在场时显示）</span></label></div>
  <button v-if="hidden.length" @click="restoreAll">显示全部隐藏卡片</button>
 </DialogShell>
</template>
<style scoped>.hidden-card-list{display:grid;gap:12px;margin:16px 0}.hidden-card-list label{display:flex;gap:8px;align-items:center}.hidden-card-list span{font-size:12px;opacity:.7}</style>
