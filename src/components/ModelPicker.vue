<script setup lang="ts">
import DismissibleNotice from './DismissibleNotice.vue';
import {computed,onBeforeUnmount,ref,watch,useId} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Profile} from '../domain/contracts';
const props=defineProps<{w:ViewModel;p:Profile;disabled?:boolean;embedding?:boolean}>();
const listId='api-models-'+useId();
const models=ref<string[]>([]),loading=ref(false),error=ref(''),search=ref('');
let controller:AbortController|undefined,requestId=0,timer:ReturnType<typeof setTimeout>|undefined;
const disabled=computed(()=>props.disabled||props.w.busy||props.w.workingMemory||props.w.configuringApis);
const ready=computed(()=>!!props.p.apiBaseUrl?.trim()&&!!props.w.credentials[props.p.id]?.trim());
const filtered=computed(()=>models.value.filter(model=>model.toLowerCase().includes(search.value.trim().toLowerCase())));
watch(()=>[props.p.id,props.p.apiBaseUrl,props.w.credentials[props.p.id],props.embedding],()=>{
  requestId++;controller?.abort();clearTimeout(timer);models.value=[];error.value='';search.value='';loading.value=false;
  if(ready.value)timer=setTimeout(()=>void fetchModels(),600);
},{immediate:true});
onBeforeUnmount(()=>{clearTimeout(timer);requestId++;controller?.abort();});
async function fetchModels(){
  if(!ready.value)return;
  clearTimeout(timer);const id=++requestId;controller?.abort();controller=new AbortController();loading.value=true;error.value='';
  try{const result=await props.w.fetchModels(props.p,controller.signal,props.embedding?'embedding':undefined);if(id!==requestId)return;models.value=[...new Set(result)].sort();if(!props.p.model&&models.value.length)props.p.model=models.value[0];if(!result.length)error.value=props.embedding?'未找到可确认的向量模型，已隐藏其他及无法识别的模型。可手动填写已确认支持 embeddings 的型号。':'未检测到可用模型，可直接填入模型名称，或检查接口后重新获取。';}
  catch(e){if(id!==requestId)return;error.value=e instanceof Error?e.message:'模型获取失败，可直接填入模型名称，或检查接口后重试。';}
  finally{if(id===requestId)loading.value=false;}
}
</script>
<template><div class="model-picker">
  <div class="api-model-row api-model-controls">
    <label class="api-model-input">模型<input v-model="p.model" :list="listId" :disabled="disabled" autocomplete="off" placeholder="选择或直接输入模型名称" /><datalist :id="listId"><option v-for="model in filtered" :key="model" :value="model" /></datalist></label>
    <button type="button" :disabled="disabled||loading||!ready" @click="fetchModels">{{loading?'获取中…':'获取模型'}}</button>
    <slot />
    <label class="model-search">搜索模型<input v-model="search" type="search" :disabled="disabled||!models.length" placeholder="筛选可选模型" /></label>
    <slot name="save" />
  </div>
  <small v-if="models.length">已检测 {{models.length}} 个{{embedding?'向量':''}}模型，搜索匹配 {{filtered.length}} 个。点击模型输入框可选择，也可直接输入。</small>
  <DismissibleNotice :message="error" error />
</div></template>

<style scoped>
.model-picker{display:flex;flex-direction:column;gap:8px;min-width:0;}
.model-picker .api-model-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0;}
.model-picker .api-model-input{display:flex;flex:1 1 260px;min-width:200px;align-items:center;flex-direction:row;gap:8px;margin:0;}
.api-model-input input{flex:1;min-width:0;width:100%;}
.model-picker .model-search{display:flex;flex:0 1 240px;min-width:160px;align-items:center;flex-direction:row;gap:8px;margin:0;white-space:nowrap;}
.model-search input{box-sizing:border-box;flex:1;width:100%;min-width:0;}
.api-model-controls>button{flex:0 0 auto;white-space:nowrap;}
@media(max-width:759px){.model-picker .api-model-input{flex-basis:100%;}.model-picker .model-search{flex:1 1 180px;}}
</style>
