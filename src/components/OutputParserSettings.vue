<script setup lang="ts">
import {computed,ref,reactive,watch,onScopeDispose} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {configurationEditors} from '../app/configurationEditors';
import {registerBackupFlusher} from '../app/backupFlushers';
import {cleanOutputParsing,presetOutputParsing} from '../domain/outputParsing';
const props=defineProps<{w:ViewModel}>();
const error=ref(''),saving=ref(false),pendingPersistence=ref(false);
type Draft={enabled:boolean;tagsText:string;original:string};
const drafts=reactive<Record<string,Draft>>({});
const saved=computed(()=>presetOutputParsing(props.w.preferences,props.w.currentPreset));
const signature=(d:Pick<Draft,'enabled'|'tagsText'>)=>JSON.stringify({enabled:d.enabled,tagsText:d.tagsText});
function fresh(id:string){const config=presetOutputParsing(props.w.preferences,id),d={enabled:config.enabled,tagsText:config.tags.join('\n'),original:''};d.original=signature(d);return d;}
const draft=computed(()=>drafts[props.w.currentPreset]||=(fresh(props.w.currentPreset)));
const pending=()=>Object.entries(drafts).filter(([id,d])=>props.w.presetSets.some(s=>s.id===id)&&signature(d)!==d.original);
const dirty=computed(()=>pending().length>0);
function reset(){for(const id of Object.keys(drafts))delete drafts[id];error.value='';pendingPersistence.value=false;}
watch(()=>JSON.stringify(saved.value),()=>{const d=drafts[props.w.currentPreset];if(d&&signature(d)===d.original)drafts[props.w.currentPreset]=fresh(props.w.currentPreset);});
function stage(){
 // Validate every edited preset before changing any setting. Switching presets retains unfinished fields.
 const changes=pending().map(([id,d])=>{const tags=d.tagsText.split(/[\r\n,，]+/).map(s=>s.trim()).filter(Boolean).map(s=>s.replace(/^<\/?([^<>\s]+)\s*>$/,'$1'));return {id,d,value:cleanOutputParsing({version:1,enabled:d.enabled,tags})};});
 for(const {id,d,value} of changes){(props.w.preferences.presetOutputParsing||={})[id]=value;d.enabled=value.enabled;d.tagsText=value.tags.join('\n');d.original=signature(d);pendingPersistence.value=true;}
}
async function save(){saving.value=true;error.value='';try{stage();await props.w.save();if(String(props.w.storageStatus)==='failed')throw Error(props.w.storageError||'解析设置保存失败，请重试。');pendingPersistence.value=false;}catch(e){error.value=e instanceof Error?e.message:'解析设置保存失败';props.w.problem=error.value;throw e;}finally{saving.value=false;}}
const unregister=configurationEditors()?.('preset-output-parser',{dirty:()=>dirty.value,save:async()=>{stage();},discard:async()=>{reset();}});if(unregister)onScopeDispose(unregister);
registerBackupFlusher(async()=>{if(dirty.value||pendingPersistence.value)await save();});
</script>
<template>
 <details class="import-report" open>
  <summary>自动解析辅助区块</summary>
  <label class="toggle"><input v-model="draft.enabled" type="checkbox" :disabled="w.busy||saving" />启用自动解析</label>
  <label>辅助标签（每行一个）<textarea v-model="draft.tagsText" rows="3" :disabled="w.busy||saving" placeholder="foundation&#10;ECOT&#10;自定义辅助区块" /></label>
  <p class="rail-note">填写标签名称，例如 foundation，对应 &lt;foundation&gt;…&lt;/foundation&gt;。区块内容会隐藏，正文保留；设置随当前预设保存。</p>
  <button type="button" :disabled="w.busy||saving" @click="save().catch(()=>{})">{{saving?'保存中…':'保存解析设置'}}</button>
  <p v-if="error" role="alert">{{error}}</p>
 </details>
</template>
