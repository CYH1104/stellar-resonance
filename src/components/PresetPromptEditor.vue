<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
import type {Preset,PresetPromptGroup} from '../domain/contracts';
import {promptTriggers} from '../domain/presets';
const props=defineProps<{w:ViewModel;draft:Preset;pinned:boolean;groups?:PresetPromptGroup[]}>();
function changeGroup(id:string){props.draft.group=props.groups?.find(g=>g.id===id)?{...props.groups.find(g=>g.id===id)!}:null;}
const emit=defineEmits<{save:[];cancel:[];copy:[];remove:[]}>();
function trigger(value:string,checked:boolean){const current=props.draft.triggers||[];props.draft.triggers=checked?[...new Set([...current,value])]:current.filter(x=>x!==value);}
</script>
<template><section class="prompt-editor" :aria-label="'编辑提示词 · '+draft.name">
  
  <label>名称<input v-model="draft.name" maxlength="200" :disabled="w.busy||draft.marker" /></label>
  <label>所属分组<select :value="draft.group?.id||''" :disabled="w.busy" @change="changeGroup(($event.target as HTMLSelectElement).value)"><option value="">未分组</option><option v-for="g in groups||[]" :key="g.id" :value="g.id">{{g.name}}</option></select></label>
  <template v-if="!draft.marker">
    <label>内容<textarea v-model="draft.content" rows="10" :disabled="w.busy" /></label>
    <details class="prompt-advanced"><summary>高级设置 · 角色、位置、触发时机</summary>
      <div class="field-grid"><label>角色<select v-model="draft.role" :disabled="w.busy"><option value="system">System</option><option value="assistant">AI Assistant</option><option value="user">User</option></select></label><label>位置<select v-model="draft.position" :disabled="w.busy"><option value="before">相对 · 聊天历史前</option><option value="after">相对 · 聊天历史后</option><option value="in-chat">聊天历史内 · 深度注入</option></select></label><template v-if="draft.position==='in-chat'"><label>Depth<input v-model.number="draft.depth" type="number" min="0" max="10000" :disabled="w.busy" /></label><label>Order<input v-model.number="draft.order" type="number" min="0" max="10000" :disabled="w.busy" /></label></template></div>
      
      <fieldset :disabled="w.busy"><legend>触发时机（不选＝全部）</legend><div class="actions"><label v-for="t in promptTriggers" :key="t.value" class="toggle"><input type="checkbox" :checked="draft.triggers?.includes(t.value)" @change="trigger(t.value,($event.target as HTMLInputElement).checked)" />{{t.label}}</label></div></fieldset>
      
    </details>
  </template>
  <p v-else class="muted">位置：{{draft.position==='in-chat'?'聊天历史内 · 深度 '+(draft.depth??4):draft.position==='after'?'聊天历史后':'聊天历史前'}}</p>
  <div class="actions"><button type="button" :disabled="w.busy" @click="emit('save')">保存条目</button><button type="button" :disabled="w.busy" @click="emit('cancel')">取消编辑</button><button v-if="!draft.marker" type="button" :disabled="w.busy" @click="emit('copy')">复制为新条目</button><button v-if="!pinned" type="button" class="danger" :disabled="w.busy" @click="emit('remove')">删除条目</button></div>
</section></template>
