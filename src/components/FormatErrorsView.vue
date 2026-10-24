<script setup lang="ts">
import RunVariableChanges from './RunVariableChanges.vue';
import DismissibleNotice from './DismissibleNotice.vue';
import DeveloperPanel from './DeveloperPanel.vue';
import {computed,ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {runLogGroups,runLogLabel,copyableRunLog} from '../domain/runLogGroups';
import {copyText} from '../app/copyText';
const copyStatus=ref<Record<string,string>>({});
async function copyGroup(group:ReturnType<typeof runLogGroups>[number]){try{await copyText(copyableRunLog(group));copyStatus.value[group.id]='已复制本轮日志';}catch(e){copyStatus.value[group.id]=e instanceof Error?e.message:'复制失败，请手动复制';}}
const props=defineProps<{w:ViewModel}>();
const groups=computed(()=>runLogGroups(props.w.formatErrors.entries,props.w.sessions||[])),chosen=ref<string|null>(null);
watch(()=>groups.value.map(g=>g.id),ids=>{if(!ids.length)chosen.value=null;else if(chosen.value===null||chosen.value!==''&&!ids.includes(chosen.value))chosen.value=ids[0];},{immediate:true});
function toggleGroup(event:Event,id:string){const el=event.target as HTMLDetailsElement;if(el.open)chosen.value=id;else if(chosen.value===id)chosen.value='';}
</script>
<template><section class="surface format-error-page">
<header class="panel-heading"><div><p class="eyebrow">LOGS / 运行记录</p><h1>运行日志</h1></div><button :disabled="!w.formatErrors.entries.length" @click="w.formatErrors.clear();chosen=''">清空记录</button></header>
<DeveloperPanel :w="w" /><p class="muted">仅保存在当前浏览器，最多保留最近 100 条记录。按会话和轮次合并展示；展开一轮可查看该轮的生成结果、运行报错、格式兼容及变量变化。重说和重试也归入原轮次。</p>
<DismissibleNotice :message="w.formatErrors.problem" error /><p v-if="!groups.length">暂无运行日志。</p>
<details v-for="(group,i) in groups" :key="group.id" :open="chosen===group.id" @toggle="toggleGroup($event,group.id)">
<summary>{{group.name}} · {{group.round?'第 '+group.round+' 轮':group.turnId?'历史楼层':'未关联轮次'}} · {{group.entries.length}} 条记录<span v-if="group.errors"> · {{group.errors}} 条异常</span><button type="button" class="copy-round-log" @click.stop.prevent="copyGroup(group)">复制本轮</button><span class="copy-log-status" role="status">{{copyStatus[group.id]}}</span><small>{{new Date(group.at).toLocaleString()}}</small></summary>
<template v-if="chosen===group.id"><p v-if="group.generations>1" class="muted">本轮共 {{group.generations}} 次生成，包含重说或重试。</p><p v-if="group.sessionId" class="muted log-source">会话 {{group.sessionId}}<span v-if="group.turnId"> · 楼层 {{group.turnId}}</span></p>
<article v-for="entry in group.entries" :key="entry.id" class="run-log-event"><h3>{{new Date(entry.at).toLocaleString()}} · {{runLogLabel(entry)}} · {{entry.code}}</h3><p v-if="entry.code==='STATE_COMPAT_RECOVERED'" class="muted">本轮已兼容处理，有效内容已保存；无效或缺失的状态字段沿用旧值。下方保留模型原始返回供核查。</p><p v-if="entry.variantId" class="muted log-source">稿件 {{entry.variantId}}</p><pre>{{entry.raw}}</pre><RunVariableChanges v-if="entry.variables" :value="entry.variables" /></article>
</template></details></section></template>
<style scoped>.copy-round-log{margin-left:10px;padding:4px 8px}.copy-log-status{margin-left:6px;font-size:12px}.format-error-page details{border-bottom:1px solid var(--color-border);padding:14px 0}.format-error-page summary{cursor:pointer;color:var(--color-accent);overflow-wrap:anywhere}.format-error-page summary small{display:block;margin:4px 0 0 18px;color:var(--color-muted)}.run-log-event{padding:12px 0;border-top:1px solid var(--color-border)}.run-log-event h3{font-size:14px;font-weight:normal;overflow-wrap:anywhere}.log-source{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:60dvh;overflow:auto;font:13px/1.8 monospace}</style>

