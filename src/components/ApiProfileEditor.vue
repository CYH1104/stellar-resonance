<script setup lang="ts">
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Profile} from '../domain/contracts';
import ModelPicker from './ModelPicker.vue';
import DialogShell from './DialogShell.vue';
const props=defineProps<{w:ViewModel;p:Profile;title:string;embedding?:boolean;help?:string;saveProfile?:(p:Profile)=>Promise<boolean>}>();
const emit=defineEmits<{saved:[]}>();
const testing=ref(false),saving=ref(false),helpOpen=ref(false),result=ref(''),failed=ref(false),saveResult=ref(''),elapsed=ref(0);
const disabled=computed(()=>props.w.busy||props.w.workingMemory||props.w.configuringApis||saving.value);
let controller:AbortController|undefined,serial=0,timer:ReturnType<typeof setInterval>|undefined;
function cancel(){serial++;controller?.abort();testing.value=false;clearInterval(timer);}
watch(()=>[props.p.apiBaseUrl,props.p.model,props.w.credentials[props.p.id]],()=>{cancel();result.value='';saveResult.value='';});
onBeforeUnmount(cancel);
async function test(){
  cancel();const id=serial;controller=new AbortController();testing.value=true;failed.value=false;result.value='';elapsed.value=0;const start=Date.now();timer=setInterval(()=>elapsed.value=Math.floor((Date.now()-start)/1000),1000);
  try{const value=await props.w.testProfile(props.p,!!props.embedding,controller.signal);if(id!==serial)return;result.value='连接成功 · '+(value.durationMs/1000).toFixed(2)+' 秒'+(value.kind==='embedding'?' · '+value.dimensions+' 维向量':'');}
  catch(e){if(id!==serial)return;failed.value=true;result.value='连接失败 · '+(e instanceof Error?e.message:'请求失败');}
  finally{if(id===serial){testing.value=false;clearInterval(timer);}}
}
function stopTest(){cancel();result.value='已取消测试。';failed.value=false;}
async function save(){
  if(disabled.value||testing.value)return;saving.value=true;saveResult.value='';
  try{const ok=await(props.saveProfile?props.saveProfile(props.p):props.w.connectProfile(props.p));if(ok){saveResult.value='API 已保存';emit('saved');}else saveResult.value=props.w.problem||'保存失败，请重试。';}
  catch{saveResult.value='保存失败，请重试。';}finally{saving.value=false;}
}
</script>
<template><article class="api-card compact-api-card">
  <header class="panel-heading"><div class="api-title"><h3>{{title}}</h3><button type="button" class="api-help" :aria-label="title+'说明'" @click="helpOpen=true">?</button></div><div class="actions"><span class="tag">{{w.connectionReady(p)?'已保存':'未保存更改'}}</span><slot /></div></header>
  <form @submit.prevent="save">
    <div class="api-identity-fields"><label>名称<input v-model="p.name" maxlength="80" :disabled="disabled" /></label><label>URL<input v-model="p.apiBaseUrl" maxlength="2000" placeholder="https://你的服务地址/v1" :disabled="disabled" /></label><label>Key<input v-model="w.credentials[p.id]" type="password" autocomplete="off" :disabled="disabled" /></label></div>
    <ModelPicker :w="w" :p="p" :disabled="disabled"><button type="button" :disabled="disabled||testing" @click="test">{{testing?'测试中…':'测试连接'}}</button><button v-if="testing" type="button" @click="stopTest">取消测试</button></ModelPicker>
    <p v-if="testing" class="api-feedback" role="status">正在测试 · {{elapsed}} 秒／最多60秒…</p><p v-else-if="result" class="api-feedback" :class="{'model-list-error':failed}" :role="failed?'alert':'status'">{{result}}</p>
    <div class="actions"><button type="submit" class="primary" :disabled="disabled||testing">{{saving?'保存中…':'保存 API'}}</button><span v-if="saveResult" class="api-feedback" role="status">{{saveResult}}</span></div>
  </form>
  <DialogShell v-if="helpOpen" :title="title+'说明'" @close="helpOpen=false"><p>{{help||(embedding?'向量模型用于长程记忆检索，开启向量检索时才必填。':'主 API 必须填写，默认负责剧情、摘要、建议和人设生成。')}}</p><p>填写名称、服务的基础 URL 和 Key，获取并选择模型后保存；获取失败也可手动填写模型名。</p><p>测试连接会实际调用所选模型一次，可能计费，超时60秒；不加载预设、人设或存档，成功只表示这次小请求可用。</p><p>保存 API 不发起生成请求。Key 按“本机保存”的选项保存在当前浏览器。</p></DialogShell>
</article></template>
