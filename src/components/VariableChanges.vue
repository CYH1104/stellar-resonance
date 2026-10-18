<script setup lang="ts">
import {computed} from 'vue';
import type {Session} from '../domain/contracts';
import {selected,stateAt} from '../domain/story';
import {dataFromState,type Json,type MvuOperation} from '../domain/mvu';
const props=defineProps<{session:Session;index:number}>();
const variant=computed(()=>selected(props.session.turns[props.index]));
const changes=computed(()=>{
 const result:MvuOperation[]=[];
 const before=dataFromState(stateAt(props.session,props.index)).stat_data;
 const after=dataFromState(stateAt(props.session,props.index+1)).stat_data;
 function diff(a:Json|undefined,b:Json|undefined,path:string){
  if(JSON.stringify(a)===JSON.stringify(b))return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
   for(const key of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[key],b[key],path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'));
  }else result.push(b===undefined?{op:'remove',path}:{op:a===undefined?'insert':'replace',path,value:b});
 }
 diff(before,after,'');return result;
});
const output=computed(()=>'<UpdateVariable>\n<JSONPatch>\n'+JSON.stringify(changes.value,null,2)+'\n</JSONPatch>\n</UpdateVariable>');
</script>
<template>
 <details class="variable-change-card">
  <summary>变量变化 · {{variant?.status==='complete'?changes.length+' 项已应用':'等待本轮完成'}}</summary>
  <p>以下为本轮应用后的实际状态差异，包含状态字段和 MVU 更新；不是模型原始命令。</p>
  <p v-if="variant?.status==='complete'&&!changes.length">本轮没有已应用的变量变化。模型可能未提交更新，或更新未通过校验；不会自动增加好感度。</p>
  <p v-if="variant?.outcome?.stateUpdate?.codes?.length">校验记录：{{variant.outcome.stateUpdate.codes.join('、')}}</p>
  <pre>{{output}}</pre>
 </details>
</template>
<style scoped>
.variable-change-card{margin:16px 0;padding:12px 16px;border:1px solid var(--line,#a6a6a633);border-radius:8px}.variable-change-card summary{cursor:pointer}.variable-change-card p{font-size:12px;opacity:.8}.variable-change-card pre{max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}
</style>
