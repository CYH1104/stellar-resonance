<script setup lang="ts">
import DismissibleNotice from './DismissibleNotice.vue';
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Profile} from '../domain/contracts';
const props=defineProps<{w:ViewModel;p:Profile;disabled?:boolean}>();
const models=ref<string[]>([]),loading=ref(false),error=ref(''),search=ref('');
let controller:AbortController|undefined,requestId=0,timer:ReturnType<typeof setTimeout>|undefined;
const disabled=computed(()=>props.disabled||props.w.busy||props.w.workingMemory||props.w.configuringApis);
const ready=computed(()=>!!props.p.apiBaseUrl?.trim()&&!!props.w.credentials[props.p.id]?.trim());
const filtered=computed(()=>models.value.filter(model=>model.toLowerCase().includes(search.value.trim().toLowerCase())));
watch(()=>[props.p.id,props.p.apiBaseUrl,props.w.credentials[props.p.id]],()=>{
  requestId++;controller?.abort();clearTimeout(timer);models.value=[];error.value='';search.value='';loading.value=false;
  if(ready.value)timer=setTimeout(()=>void fetchModels(),600);
},{immediate:true});
onBeforeUnmount(()=>{clearTimeout(timer);requestId++;controller?.abort();});
async function fetchModels(){
  if(!ready.value)return;
  clearTimeout(timer);const id=++requestId;controller?.abort();controller=new AbortController();loading.value=true;error.value='';
  try{const result=await props.w.fetchModels(props.p,controller.signal);if(id!==requestId)return;models.value=[...new Set(result)].sort();if(!props.p.model&&models.value.length)props.p.model=models.value[0];if(!result.length)error.value='未检测到可用模型，请检查接口配置后刷新列表。';}
  catch(e){if(id!==requestId)return;error.value=e instanceof Error?e.message:'模型获取失败，请检查接口配置后重试。';}
  finally{if(id===requestId)loading.value=false;}
}
</script>
<template><div class="model-picker">
  <div class="api-model-row"><label>模型<select v-model="p.model" :disabled="disabled||loading||!models.length"><option value="" disabled>{{loading?'正在获取模型…':models.length?'请选择模型':'配置接口后自动获取模型'}}</option><option v-if="p.model&&!filtered.includes(p.model)" :value="p.model">{{p.model}}{{models.includes(p.model)?'（当前选择）':'（已保存，待检测）'}}</option><option v-for="model in filtered" :key="model" :value="model">{{model}}</option></select></label><div class="actions"><button type="button" :disabled="disabled||loading||!ready" @click="fetchModels">{{loading?'获取中…':'刷新模型'}}</button><slot /></div></div>
  <label class="model-search">搜索模型<input v-model="search" type="search" :disabled="disabled||!models.length" placeholder="输入模型名称搜索" /></label>
  <small v-if="models.length">已检测 {{models.length}} 个模型，搜索匹配 {{filtered.length}} 个。</small>
  <DismissibleNotice :message="error" error />
</div></template>

<style scoped>
.model-picker{display:flex;flex-direction:column;gap:12px;}
.model-picker .api-model-row{margin:0;}
.model-picker .model-search{display:flex;flex-direction:column;align-items:stretch;gap:6px;width:min(100%,360px);margin:0;}
.model-search input{box-sizing:border-box;width:100%;min-width:0;}
</style>
