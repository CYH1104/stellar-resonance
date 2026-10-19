<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
import {computed} from 'vue';
import {selected} from '../domain/story';
import {stateUpdateDetails} from '../domain/stateUpdate';
const props=defineProps<{w:ViewModel;turnId:string}>();
const variant=computed(()=>{const turn=props.w.active?.turns.find(t=>t.id===props.turnId);return turn&&selected(turn);});
const report=computed(()=>{const result=variant.value?.repairAudit;return result?.variantId===variant.value?.id?result:undefined;});
const issues=computed(()=>(props.w.replayWarnings||[]).filter(e=>e.turnId===props.turnId&&e.variantId===variant.value?.id));
const codes=computed(()=>report.value?stateUpdateDetails({event:'补修对照',stateUpdate:{status:'unchanged',received:true,storyComplete:true,codes:report.value.codes}}):[]);
const presence=(value:boolean|undefined)=>value===undefined?'未提供':value?'在场':'离场';
const display=(value:unknown)=>value===undefined?'未提供':typeof value==='string'?value:JSON.stringify(value);
</script>
<template>
  <details v-if="report||issues.length" class="repair-result">
    <summary>{{report?.problem?'本次补全未完成，查看保留结果':'查看本次补全前后角色状态'}}</summary>
    <p v-if="report?.problem" role="status">{{report.problem}}。已有有效内容保留。</p>
    <p v-for="issue in issues" :key="issue.variantId+issue.stage">第 {{issue.round}} 轮的{{issue.stage}}未通过，沿用上一有效状态：{{issue.message}}<span v-if="issue.actorId">（角色 {{issue.actorId}}）</span><code v-if="issue.fieldPath"> {{issue.fieldPath}}</code></p>
    <template v-if="report">
      <p>以下为本次补修实际提交的前后差异，绑定当前稿件；不是模型的推理过程。</p>
      <table v-if="report.rows.length"><thead><tr><th>角色</th><th>在场变化</th><th>好感度变化</th></tr></thead><tbody><tr v-for="row in report.rows" :key="row.id"><td>{{row.name}}<small>{{row.id}}</small></td><td>{{presence(row.beforePresent)}} → {{presence(row.afterPresent)}}</td><td>{{row.beforeAffinity??'未提供'}} → {{row.afterAffinity??'未提供'}}</td></tr></tbody></table>
      <table v-if="report.changes.length"><thead><tr><th>实际应用字段</th><th>补修前</th><th>补修后</th></tr></thead><tbody><tr v-for="change in report.changes" :key="change.path"><td><code>{{change.path}}</code></td><td><pre>{{display(change.before)}}</pre></td><td><pre>{{display(change.after)}}</pre></td></tr></tbody></table>
      <p v-else>本次没有已应用的变量变化；原值保持不变。</p><p v-if="report.truncated">字段较多，仅显示前 200 项；实际状态仍完整保存。</p>
      <ul v-if="codes.length"><li v-for="reason in codes" :key="reason.code">{{reason.text}} <code>{{reason.code}}</code></li></ul>
      <p v-else>本次没有记录到字段校验拒绝。</p>
    </template>
  </details>
</template>
<style scoped>.repair-result{margin:16px 0;padding:12px 16px;border:1px solid var(--color-border);border-radius:8px;font-size:.85rem;overflow:auto}.repair-result summary{cursor:pointer}.repair-result p{margin:.5rem 0}.repair-result table{border-collapse:collapse;width:100%;text-align:left}.repair-result td,.repair-result th{padding:.4rem;border-bottom:1px solid var(--color-border);vertical-align:top}.repair-result small{display:block;opacity:.65}.repair-result pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;margin:0}</style>
