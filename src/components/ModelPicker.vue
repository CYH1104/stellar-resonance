<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Profile} from '../domain/contracts';
const props=defineProps<{w:ViewModel;p:Profile}>();
const models=ref<string[]>([]),loading=ref(false),error=ref(''),hint=ref(''),manual=ref(true);
let controller:AbortController|undefined,requestId=0;
const disabled=computed(()=>props.w.busy||props.w.workingMemory||props.w.configuringApis);
watch(()=>[props.p.apiBaseUrl,props.w.credentials[props.p.id]],()=>{requestId++;controller?.abort();models.value=[];error.value='';hint.value='';loading.value=false;manual.value=true;});
onBeforeUnmount(()=>controller?.abort());
async function fetchModels(){
  const id=++requestId;controller?.abort();controller=new AbortController();loading.value=true;error.value='';hint.value='';
  try{const result=await props.w.fetchModels(props.p,controller.signal);if(id!==requestId)return;models.value=result;if(result.length){manual.value=false;hint.value=`已获取 ${result.length} 个模型。选择后点击“确认此 API”。`;}else{manual.value=true;hint.value='服务返回空列表，可以手动填写模型名。';}}
  catch(e){if(id!==requestId)return;error.value=e instanceof Error?e.message:'获取模型失败，可以手动填写。';}
  finally{if(id===requestId)loading.value=false;}
}
</script>
<template><div class="model-picker">
  <label>模型名称
    <input v-if="manual||!models.length" v-model="p.model" maxlength="150" :disabled="disabled||loading" placeholder="手动填写，或点击下方获取模型" />
    <select v-else v-model="p.model" :disabled="disabled||loading">
      <option value="" disabled>请选择模型</option>
      <option v-if="p.model&&!models.includes(p.model)" :value="p.model">{{p.model}}（当前值，列表未返回）</option>
      <option v-for="model in models" :key="model" :value="model">{{model}}</option>
    </select>
  </label>
  <div class="actions"><button type="button" :disabled="disabled||loading||!p.apiBaseUrl?.trim()||!w.credentials[p.id]?.trim()" @click="fetchModels">{{loading?'正在获取…':'获取模型'}}</button><button v-if="models.length" type="button" :disabled="disabled||loading" @click="manual=!manual">{{manual?'使用下拉列表':'手动填写'}}</button></div>
  <p v-if="error" class="model-list-error" role="alert">{{error}}</p>
  <p v-else-if="hint" class="rail-note" role="status">{{hint}}</p>
  <p v-else class="rail-note">先填写 API 基础地址和 Key，再获取该服务可用的模型。</p>
</div></template>
