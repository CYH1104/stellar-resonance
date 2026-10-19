<script setup lang="ts">
import {computed} from 'vue';
import type {Session} from '../domain/contracts';
import {selected,stateAt} from '../domain/story';
import {dataFromState,type Json,type MvuOperation} from '../domain/mvu';
import {stateUpdateDetails} from '../domain/stateUpdate';
const props=defineProps<{session:Session;index:number}>();
const variant=computed(()=>selected(props.session.turns[props.index]));
const reviewRows=computed(()=>{
 const update=variant.value?.outcome?.stateUpdate,before=stateAt(props.session,props.index),after=stateAt(props.session,props.index+1);
 if(update?.review){
  return Object.entries(update.review).map(([id,verdict])=>{const old=before.characters.find(c=>c.id===id),next=after.characters.find(c=>c.id===id);return {id,name:next?.name||old?.name||id,verdict,before:old?.affinity,after:next?.affinity};});
 }
 return (update?.affinityReviewedIds||[]).map(id=>{const old=before.characters.find(c=>c.id===id),next=after.characters.find(c=>c.id===id);const changed=(next?.affinity??old?.affinity)!==old?.affinity;return {id,name:next?.name||old?.name||id,verdict:changed?'changed':'unchanged',before:old?.affinity,after:next?.affinity};});
});
const reviewLabel=(verdict:string)=>verdict==='missing'?'缺少判断':verdict==='rejected'?'更新被拒绝':verdict==='changed'?'已更新':'判断不变';
const reviewNeedsRepair=computed(()=>reviewRows.value.some(row=>row.verdict==='missing'||row.verdict==='rejected'));
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
  <ul v-if="reviewRows.length" class="review-list"><li v-for="row in reviewRows" :key="row.id" :class="'review-'+row.verdict">{{row.name}} · {{reviewLabel(row.verdict)}}<span v-if="row.verdict==='changed'||row.verdict==='unchanged'">（好感度 {{row.before??'未提供'}} → {{row.after??row.before??'未提供'}}）</span></li></ul>
  <p v-if="reviewNeedsRepair">缺少判断或被拒绝的角色不会按“未变化”处理；可在本条回复操作中补全本轮状态，不会重写正文。</p>
  <p v-if="variant?.status==='complete'&&!changes.length">本轮没有已应用的变量变化；下方校验说明会区分未收到补丁与更新被拒绝。有效空补丁表示本轮无变化。</p>
  <ul v-if="stateUpdateDetails(variant?.outcome).length"><li v-for="item in stateUpdateDetails(variant?.outcome)" :key="item.code">{{item.text}}</li></ul>
  <p v-if="variant?.outcome?.stateUpdate?.codes?.length">校验记录：{{variant.outcome.stateUpdate.codes.join('、')}}</p>
  <pre>{{output}}</pre>
 </details>
</template>
<style scoped>
.variable-change-card{margin:16px 0;padding:12px 16px;border:1px solid var(--line,#a6a6a633);border-radius:8px}.variable-change-card summary{cursor:pointer}.variable-change-card p{font-size:12px;opacity:.8}.variable-change-card pre{max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.variable-change-card .review-missing,.variable-change-card .review-rejected{color:#b45454}
</style>
