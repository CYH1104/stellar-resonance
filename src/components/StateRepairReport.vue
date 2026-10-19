<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
import {computed} from 'vue';
const props=defineProps<{w:ViewModel;turnId:string}>();
const report=computed(()=>{const result=props.w.repairReport;return result&&result.sessionId===props.w.active?.id&&result.turnId===props.turnId?result:undefined;});
const issues=computed(()=>(props.w.replayWarnings||[]).filter(e=>e.turnId===props.turnId));
const presence=(value:boolean|undefined)=>value===undefined?'未提供':value?'在场':'离场';
</script>
<template>
  <div v-if="report||issues.length" class="repair-result" role="status">
    <p v-for="issue in issues" :key="issue.variantId+issue.stage">第 {{issue.round}} 轮的{{issue.stage}}未通过，沿用上一有效状态：{{issue.message}}<span v-if="issue.actorId">（角色 {{issue.actorId}}）</span><code v-if="issue.fieldPath"> {{issue.fieldPath}}</code></p>
    <details v-if="report"><summary>{{report.problem?'本次补全未完成，查看保留结果':'查看本次补全前后角色状态'}}</summary>
      <p v-if="report.problem">{{report.problem}}</p>
      <table v-if="report.rows.length"><thead><tr><th>角色</th><th>在场变化</th><th>好感度变化</th></tr></thead><tbody><tr v-for="row in report.rows" :key="row.id"><td>{{row.name}}<small>{{row.id}}</small></td><td>{{presence(row.beforePresent)}} → {{presence(row.afterPresent)}}</td><td>{{row.beforeAffinity??'未提供'}} → {{row.afterAffinity??'未提供'}}</td></tr></tbody></table>
      <p v-else>本次没有在场角色或好感度变化。</p>
    </details>
  </div>
</template>
<style scoped>.repair-result{flex-basis:100%;font-size:.85rem;overflow:auto}.repair-result p{margin:.4rem 0}.repair-result table{border-collapse:collapse;width:100%;text-align:left}.repair-result td,.repair-result th{padding:.4rem;border-bottom:1px solid var(--color-border)}.repair-result small{display:block;opacity:.65}</style>
