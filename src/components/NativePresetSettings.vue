<script setup lang="ts">
import {computed,ref,watch,onScopeDispose} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {cleanNativePresetConfig,editNativePreset,type NativePresetConfig} from '../domain/nativePreset';
import {configurationEditors} from '../app/configurationEditors';
import {registerBackupFlusher} from '../app/backupFlushers';
import {useAutoSave} from '../app/useAutoSave';
import FileImportButton from './FileImportButton.vue';
const props=defineProps<{w:ViewModel}>();
const saved=computed(()=>props.w.nativePreset||props.w.nativeDefaultPreset);
const draft=ref<NativePresetConfig>(),baseline=ref(''),problem=ref(''),rawText=ref(''),ready=ref(false),committing=ref(false);
const draftKey='preset:native-runtime';
const rawChanged=computed(()=>!!draft.value&&rawText.value!==JSON.stringify(draft.value.preset,null,2));
const dirty=computed(()=>!!draft.value&&(JSON.stringify(draft.value)!==baseline.value||rawChanged.value));
const blocked=computed(()=>props.w.busy||props.w.workingMemory||props.w.terminalBusy||props.w.backupWorking||props.w.savingNativePreset);
const draftText=()=>rawChanged.value?rawText.value:JSON.stringify(draft.value?.preset);
const autoSave=useAutoSave(()=>ready.value&&dirty.value?draftText():'',async()=>{await props.w.saveEditorDraft(draftKey,dirty.value?draftText():null);return true;},400,()=>!ready.value||props.w.loading||props.w.backupWorking);
watch(()=>JSON.stringify(draft.value?.preset),(text,old)=>{if(text&&old&&rawText.value===JSON.stringify(JSON.parse(old),null,2))rawText.value=JSON.stringify(JSON.parse(text),null,2);},{flush:'sync'});
function reset(){if(!saved.value)return;draft.value=cleanNativePresetConfig(saved.value);baseline.value=JSON.stringify(saved.value);rawText.value=JSON.stringify(draft.value.preset,null,2);problem.value='';}
let load=0;
watch(saved,async()=>{
 if(dirty.value||committing.value)return;ready.value=false;reset();const revision=++load,stamp=baseline.value;
 try{const text=await props.w.readEditorDraft(draftKey);if(revision===load&&baseline.value===stamp&&text){rawText.value=text;draft.value=cleanNativePresetConfig({version:1,preset:JSON.parse(text)});rawText.value=JSON.stringify(draft.value.preset,null,2);}}
 catch(e){problem.value=e instanceof Error?e.message:'草稿读取失败';}
 finally{if(revision===load)ready.value=true;}
},{immediate:true});
function enabled(entry:any){for(const group of draft.value?.preset.prompt_order||[]){const order=group.order.find((v:any)=>v.identifier===entry.identifier);if(order)return order.enabled;}return entry.enabled!==false;}
function toggle(identifier:string,value:boolean){if(draft.value)draft.value=editNativePreset(draft.value,{prompts:[{identifier,enabled:value}]});}
async function save(){if(!draft.value||blocked.value)return;problem.value='';committing.value=true;try{
 if(JSON.stringify(saved.value)!==baseline.value)throw Error('预设已被其他操作修改，请取消后重新编辑。');
 const value=rawChanged.value?cleanNativePresetConfig({version:1,preset:JSON.parse(rawText.value)}):cleanNativePresetConfig(draft.value);await props.w.saveNativePreset(value);baseline.value=JSON.stringify(value);draft.value=value;rawText.value=JSON.stringify(value.preset,null,2);await props.w.saveEditorDraft(draftKey,null);
}catch(e){problem.value=e instanceof Error?e.message:'预设未保存';}finally{committing.value=false;}}
async function cancel(){autoSave.cancel();load++;reset();await props.w.saveEditorDraft(draftKey,null);}
async function importFile(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];try{if(file){draft.value=cleanNativePresetConfig({version:1,preset:JSON.parse(await file.text())});rawText.value=JSON.stringify(draft.value.preset,null,2);problem.value='';}}catch(e){problem.value=e instanceof Error?e.message:'文件无法读取';}finally{input.value='';}}
function applyRaw(){try{draft.value=cleanNativePresetConfig({version:1,preset:JSON.parse(rawText.value)});rawText.value=JSON.stringify(draft.value.preset,null,2);problem.value='';}catch(e){problem.value=e instanceof Error?e.message:'预设格式不正确';}}
function exportFile(){if(!saved.value)return;const url=URL.createObjectURL(new Blob([JSON.stringify(saved.value.preset,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='原生预设.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const unregister=configurationEditors()?.('native-preset',{dirty:()=>dirty.value,save:async()=>{await save();if(problem.value)throw Error(problem.value);},discard:cancel});if(unregister)onScopeDispose(unregister);
registerBackupFlusher(async()=>{await autoSave.flush();if(autoSave.error.value)throw Error(autoSave.error.value);});
</script>
<template>
 <section class="surface preset-manager native-preset-settings">
  <header class="panel-heading"><div><p class="eyebrow">PRESETS / 提示词管理</p><h1>预设</h1></div><div class="actions"><FileImportButton label="导入酒馆预设" accept=".json,application/json" :disabled="blocked" @change="importFile"/><button type="button" :disabled="blocked||!draft" @click="save">保存预设</button><button type="button" :disabled="blocked||!dirty" @click="cancel">取消修改</button><button type="button" :disabled="!saved" @click="exportFile">导出预设</button></div></header>
  <p role="status">{{dirty?'有未保存的修改':saved?'预设已保存在本机，完整备份包含此预设。':'正在载入预设…'}}</p>
  <p v-if="problem||autoSave.error.value" class="error" role="alert">{{problem||autoSave.error.value}}</p>
  <template v-if="draft">
   <div class="field-grid"><label>Temperature<input v-model.number="draft.preset.temperature" aria-label="原生预设温度" type="number" min="0" max="2" step="0.05" :disabled="blocked"/></label><label>最大输出 Token<input v-model.number="draft.preset.openai_max_tokens" aria-label="原生预设输出上限" type="number" min="1" max="32000" :disabled="blocked"/></label></div>
   <details v-for="entry in draft.preset.prompts" :key="entry.identifier" class="subsection"><summary>{{entry.name||entry.identifier}}</summary><label class="toggle"><input type="checkbox" :checked="enabled(entry)" :aria-label="'启用 '+(entry.name||entry.identifier)" :disabled="blocked" @change="toggle(entry.identifier,($event.target as HTMLInputElement).checked)"/>启用条目</label><label v-if="typeof entry.content==='string'">内容<textarea v-model="entry.content" :aria-label="'内容 '+(entry.name||entry.identifier)" rows="5" :disabled="blocked"/></label></details>
   <details class="subsection"><summary>完整文件编辑</summary><label>预设 JSON<textarea v-model="rawText" aria-label="完整原生预设 JSON" rows="12" :disabled="blocked"/></label><button type="button" :disabled="blocked" @click="applyRaw">应用到草稿</button><p class="rail-note">导入和编辑保留原文件的扩展字段；点击保存后生效。</p></details>
  </template>
 </section>
</template>
