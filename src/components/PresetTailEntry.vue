<script setup lang="ts">
import {computed} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Preset} from '../domain/contracts';
import {isPresetTail,updatePresetTail} from '../domain/presets';
const props=defineProps<{w:ViewModel}>();
const tail=computed(()=>props.w.presetEntries.find(isPresetTail));
const disabled=computed(()=>props.w.busy||props.w.backupWorking);
function patch(value:Partial<Pick<Preset,'enabled'|'role'|'content'>>){if(disabled.value)return;updatePresetTail(props.w.preferences.presets,props.w.currentPreset,props.w.presetSets.find(s=>s.id===props.w.currentPreset)?.name||'原有预设',value);}
</script>
<template><section class="subsection preset-tail-entry" aria-label="预设尾部">
  <header class="prompt-row"><label class="toggle"><input type="checkbox" :checked="tail?.enabled===true" :disabled="disabled" @change="patch({enabled:($event.target as HTMLInputElement).checked})" />开启预设尾部</label><span class="tag">固定末尾</span></header>
  <p class="rail-note">默认关闭。开启并填写内容后，作为剧情请求的最后一条消息发送；留空时不发送。</p>
  <label>最后一条消息的发送身份<select :value="tail?.role||'user'" :disabled="disabled" @change="patch({role:($event.target as HTMLSelectElement).value as Preset['role']})"><option value="system">System</option><option value="user">User</option><option value="assistant">AI Assistant</option></select></label>
  <label>内容<textarea :value="tail?.content||''" rows="4" :disabled="disabled" @input="patch({content:($event.target as HTMLTextAreaElement).value})" /></label>
</section></template>
