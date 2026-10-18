<script setup lang="ts">
import {computed} from 'vue';
import type {LoreScope} from '../domain/worldbooks';
const props=defineProps<{modelValue?:LoreScope;inherit?:boolean;actors:{id:string;name:string}[]}>();
const emit=defineEmits<{ 'update:modelValue':[LoreScope|undefined] }>();
const mode=computed(()=>props.modelValue?.mode||(props.inherit?'inherit':'global'));
function select(value:string){emit('update:modelValue',value==='inherit'?undefined:{mode:value as LoreScope['mode'],characterIds:value==='characters'?props.modelValue?.characterIds||[]:[]});}
function toggle(id:string,checked:boolean){const ids=props.modelValue?.characterIds||[];emit('update:modelValue',{mode:'characters',characterIds:checked?[...new Set([...ids,id])]:ids.filter(x=>x!==id)});}
const missing=computed(()=>(props.modelValue?.characterIds||[]).filter(id=>!props.actors.some(a=>a.id===id)));
</script>
<template>
  <fieldset class="lore-scope"><legend>作用范围</legend><label>适用对象<select :value="mode" @change="select(($event.target as HTMLSelectElement).value)"><option v-if="inherit" value="inherit">沿用本书设置</option><option value="global">整张卡（全局）</option><option value="characters">手动指定角色（可多选）</option></select></label>
    <div v-if="mode==='characters'" class="scope-actors"><p>仅对所选 NPC 应用内容；不会改写原文或现有宏，也不会自动选择互动对象。</p><label v-for="a in actors" :key="a.id" class="toggle"><input type="checkbox" :checked="modelValue?.characterIds.includes(a.id)" @change="toggle(a.id,($event.target as HTMLInputElement).checked)" />{{a.name}} <small>{{a.id}}</small></label><label v-for="id in missing" :key="id" class="toggle"><input type="checkbox" checked @change="toggle(id,false)" />未登记角色：{{id}}</label><p v-if="!modelValue?.characterIds.length||missing.length" role="status">请选择当前存档已登记的角色。没有选择或包含未登记 ID 时，相关条目不会发送。</p></div>
  </fieldset>
</template>
<style scoped>.lore-scope{border:1px solid var(--color-border);border-radius:8px;padding:12px;margin:12px 0}.scope-actors{max-height:260px;overflow:auto;display:grid;gap:8px}.scope-actors small{opacity:.65}.scope-actors p{font-size:.85rem;line-height:1.6}</style>
