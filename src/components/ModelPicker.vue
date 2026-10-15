<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Profile} from '../domain/contracts';
const props=defineProps<{w:ViewModel;p:Profile;disabled?:boolean}>();
const models=ref<string[]>([]),loading=ref(false),error=ref(''),hint=ref(''),manual=ref(false);
let controller:AbortController|undefined,requestId=0;
const disabled=computed(()=>props.disabled||props.w.busy||props.w.workingMemory||props.w.configuringApis);
watch(()=>[props.p.apiBaseUrl,props.w.credentials[props.p.id]],()=>{requestId++;controller?.abort();models.value=[];error.value='';hint.value='';loading.value=false;manual.value=false;});
onBeforeUnmount(()=>controller?.abort());
async function fetchModels(){
  const id=++requestId;controller?.abort();controller=new AbortController();loading.value=true;error.value='';hint.value='';
  try{const result=await props.w.fetchModels(props.p,controller.signal);if(id!==requestId)return;models.value=result;manual.value=!result.length;hint.value=result.length?'已获取 '+result.length+' 个模型。':'模型列表为空，请手动填写。';}
  catch(e){if(id!==requestId)return;manual.value=true;error.value=e instanceof Error?e.message:'获取失败，请手动填写。';}
  finally{if(id===requestId)loading.value=false;}
}
</script>
<template><div class="model-picker">
  <div class="api-model-row"><label>模型<select v-model="p.model" :disabled="disabled||loading"><option value="" disabled>{{models.length?'请选择模型':'请先获取模型'}}</option><option v-if="p.model&&!models.includes(p.model)" :value="p.model">{{p.model}}</option><option v-for="model in models" :key="model" :value="model">{{model}}</option></select></label><div class="actions"><button type="button" :disabled="disabled||loading||!p.apiBaseUrl?.trim()||!w.credentials[p.id]?.trim()" @click="fetchModels">{{loading?'获取中…':'获取模型'}}</button><slot /><button type="button" class="api-manual-toggle" :disabled="disabled||loading" @click="manual=!manual">{{manual?'收起手填':'手动填写'}}</button></div></div>
  <label v-if="manual" class="api-manual-field">手动模型名<input v-model="p.model" maxlength="150" :disabled="disabled||loading" placeholder="服务提供的完整模型名" /></label>
  <p v-if="error" class="model-list-error" role="alert">{{error}}</p><p v-else-if="hint" class="rail-note" role="status">{{hint}}</p>
</div></template>
