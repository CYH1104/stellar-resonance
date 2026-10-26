<script setup lang="ts">
import DismissibleNotice from './DismissibleNotice.vue';
import {computed,onBeforeUnmount,ref,watch,useId} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Profile} from '../domain/contracts';
const props=defineProps<{w:ViewModel;p:Profile;disabled?:boolean;embedding?:boolean}>();
const fetched=ref(false);
const models=ref<string[]>([]),loading=ref(false),error=ref(''),search=ref(props.p.model||''),open=ref(false),active=ref(0);
const listId=useId();
let controller:AbortController|undefined,requestId=0,timer:ReturnType<typeof setTimeout>|undefined;
const disabled=computed(()=>props.disabled||props.w.busy||props.w.workingMemory||props.w.configuringApis);
const ready=computed(()=>!!props.p.apiBaseUrl?.trim()&&!!props.w.credentials[props.p.id]?.trim());
const filtered=computed(()=>models.value.filter(model=>model.toLowerCase().includes(search.value.trim().toLowerCase())));
watch(()=>[props.p.id,props.p.apiBaseUrl,props.w.credentials[props.p.id],props.embedding],()=>{
  requestId++;controller?.abort();clearTimeout(timer);models.value=[];fetched.value=false;error.value='';search.value=props.p.model||'';loading.value=false;open.value=false;
  if(ready.value)timer=setTimeout(()=>void fetchModels(),600);
},{immediate:true});
onBeforeUnmount(()=>{clearTimeout(timer);requestId++;controller?.abort();});
watch(()=>props.p.model,value=>{search.value=value||'';});
watch(filtered,()=>{active.value=0;});
function choose(model:string){props.p.model=model;search.value=model;open.value=false;}
function leave(event:FocusEvent){if(!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node|null)){open.value=false;search.value=props.p.model||'';}}
function navigate(event:KeyboardEvent){
 if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!open.value){open.value=true;active.value=0;}else active.value=(active.value+(event.key==='ArrowDown'?1:-1)+filtered.value.length)%Math.max(1,filtered.value.length);}
 else if(event.key==='Enter'&&open.value){event.preventDefault();const model=filtered.value[active.value];if(model)choose(model);}
 else if(event.key==='Escape'){event.preventDefault();open.value=false;search.value=props.p.model||'';}
}
async function fetchModels(){
  if(!ready.value)return;
  clearTimeout(timer);const id=++requestId;controller?.abort();controller=new AbortController();loading.value=true;error.value='';
  try{const result=await props.w.fetchModels(props.p,controller.signal,props.embedding?'embedding':undefined);if(id!==requestId)return;if(!Array.isArray(result)||result.some(m=>typeof m!=='string'||!m.trim()))throw Error('模型列表格式不正确，请重新获取。');models.value=[...new Set(result)].sort();if(!models.value.includes(props.p.model)){props.p.model='';search.value='';}if(!result.length)error.value=props.embedding?'未找到可确认的向量模型，已隐藏其他及无法识别的模型。请确认服务商提供向量模型。':'未检测到可用模型，请检查接口后重新获取。';}
  catch(e){if(id!==requestId)return;error.value=e instanceof Error?e.message:'模型获取失败，请检查接口后重试。';}
  finally{if(id===requestId){loading.value=false;fetched.value=true;}}
}
</script>
<template><div class="model-picker">
  <div class="api-model-row api-model-controls">
    <div class="api-model-input" @focusout="leave"><label :for="listId+'-input'">模型</label><div class="model-combobox">
      <input :id="listId+'-input'" v-model="search" role="combobox" aria-label="模型列表" aria-autocomplete="list" :aria-expanded="open" :aria-controls="listId" :aria-activedescendant="open&&filtered[active]?listId+'-'+active:undefined" :disabled="disabled||loading" :placeholder="loading?'正在获取模型…':'输入关键词搜索并选择模型'" autocomplete="off" @focus="open=true" @input="open=true" @keydown="navigate" />
      <ul v-if="open" :id="listId" class="model-options" role="listbox"><li v-for="(model,index) in filtered" :id="listId+'-'+index" :key="model" role="option" :aria-selected="p.model===model" :class="{'model-option-active':index===active}" @mousedown.prevent @click="choose(model)">{{model}}</li><li v-if="!filtered.length" class="model-empty" role="presentation">{{models.length?'没有匹配的模型，请更换关键词':loading?'正在获取模型…':'请先获取模型'}}</li></ul>
    </div></div>
    <button type="button" :disabled="disabled||loading||!ready" @click="fetchModels">{{loading?'获取中…':'获取模型'}}</button>
    <slot />
    <slot name="save" />
  </div>
  <p v-if="error" class="rail-note" role="status">{{error}}</p>
  <small v-else-if="embedding&&!loading&&!fetched&&!ready">请先填写 URL 和 Key，再获取向量模型。</small>
  <small v-if="models.length">已检测 {{models.length}} 个{{embedding?'向量':''}}模型，匹配 {{filtered.length}} 个。选择模型后点击保存生效。</small>
  <DismissibleNotice :message="error" error />
</div></template>

<style scoped>
.model-picker{display:flex;flex-direction:column;gap:8px;min-width:0;}
.model-picker .api-model-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0;}
.model-picker .api-model-input{display:flex;flex:1 1 260px;min-width:200px;align-items:center;flex-direction:row;gap:8px;margin:0;}
.api-model-input>label{margin:0;flex:0 0 auto;}
.model-combobox{position:relative;flex:1;min-width:0;}
.model-combobox input{box-sizing:border-box;width:100%;min-width:0;}
.model-options{position:absolute;top:100%;left:0;right:0;z-index:30;max-height:260px;overflow:auto;margin:4px 0 0;padding:4px;list-style:none;background:var(--color-surface,#fffaf3);color:var(--color-text,#26364a);border:1px solid var(--color-border,#8191a5);border-radius:8px;box-shadow:0 6px 18px #0002;}
.model-options li{padding:10px 12px;overflow-wrap:anywhere;cursor:pointer;}
.model-options li:hover,.model-option-active{background:var(--color-surface-soft,#809bc326);}
.model-empty{opacity:.7;cursor:default;}
.api-model-controls>button{flex:0 0 auto;white-space:nowrap;}
@media(max-width:759px){.model-picker .api-model-input{flex-basis:100%;min-width:0;}}
</style>
