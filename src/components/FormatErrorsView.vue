<script setup lang="ts">
import RunLogSectionView from './RunLogSectionView.vue';
import DismissibleNotice from './DismissibleNotice.vue';
import DeveloperPanel from './DeveloperPanel.vue';
import {computed,ref,watch,nextTick,onBeforeUnmount} from 'vue';
import {logTarget} from '../app/logNavigation';
import type {ViewModel} from '../app/useWorkspace';
import {runLogGroups,runLogLabel,copyableRunLog,runLogCalls,type RunLogGroup} from '../domain/runLogGroups';
import {orderedSections,type RunLogSection} from '../domain/runLogSections';
import {copyText} from '../app/copyText';
const copyStatus=ref<Record<string,string>>({});
async function copyGroup(group:RunLogGroup){try{await copyText(copyableRunLog(group));copyStatus.value[group.id]='已复制本轮日志';}catch(e){copyStatus.value[group.id]=e instanceof Error?e.message:'复制失败，请手动复制';}}
const props=defineProps<{w:ViewModel}>();
const groups=computed(()=>runLogGroups(props.w.formatErrors.entries,props.w.sessions||[])),chosen=ref<string|null>(null);
const target=ref(logTarget.value);
const targetGroup=computed(()=>target.value&&groups.value.find(g=>g.sessionId===target.value!.sessionId&&g.turnId===target.value!.turnId));
const targetFound=computed(()=>targetGroup.value?.entries.some(e=>e.variantId===target.value?.variantId));
watch(()=>targetGroup.value?.id,id=>{if(id)chosen.value=id;},{immediate:true});
onBeforeUnmount(()=>{logTarget.value=undefined;});
nextTick(()=>{if(target.value)document.querySelector('.run-log-call[data-target="true"]')?.scrollIntoView({block:'nearest'});});
watch(()=>groups.value.map(g=>g.id),ids=>{if(!ids.length)chosen.value=null;else if(chosen.value===null&&targetGroup.value)chosen.value=targetGroup.value.id;else if(chosen.value===null||chosen.value!==''&&!ids.includes(chosen.value))chosen.value=ids[0];},{immediate:true});
function toggleGroup(event:Event,id:string){const el=event.target as HTMLDetailsElement;if(el.open)chosen.value=id;else if(chosen.value===id)chosen.value='';}
function calls(group:RunLogGroup){return runLogCalls(group);}
function callView(call:ReturnType<typeof runLogCalls>[number]){
 const sections=call.entries.flatMap(entry=>entry.sections||[]),legacy=call.entries.filter(entry=>!entry.sections?.length);
 const errors:RunLogSection[]=[];const errorTexts=sections.filter(section=>section.kind==='errors').map(section=>section.text||'').filter(Boolean).concat(legacy.filter(entry=>entry.kind==='runtime'||entry.kind==='format').map(entry=>`${runLogLabel(entry)} · ${entry.code}\n${entry.raw}`));
 if(errorTexts.length)errors.push({id:'errors-'+call.id,kind:'errors',title:'错误与校验',text:errorTexts.join('\n\n')});
 const legacySections=legacy.filter(entry=>entry.kind==='generation'||entry.kind==='terminal').map(entry=>({id:'legacy-'+entry.id,kind:entry.kind==='generation'?'prose' as const:'terminalActivity' as const,title:runLogLabel(entry)+' · 历史记录未记录分区明细',text:entry.raw,...(entry.variables?{variables:entry.variables}:{})}));
 const ordered=orderedSections([...errors,...sections.filter(section=>section.kind!=='errors'),...legacySections]);return {sections:ordered,errors:ordered.filter(s=>s.kind==='errors'),generated:ordered.filter(s=>['prose','characters','theaters','terminal'].includes(s.kind)),remaining:ordered.filter(s=>!['errors','prose','characters','theaters','terminal'].includes(s.kind)),legacy,labels:call.entries.map(entry=>runLogLabel(entry)+' · '+entry.code)};
}
</script>
<template><section class="surface format-error-page">
<header class="panel-heading"><div><p class="eyebrow">LOGS / 运行记录</p><h1>运行日志</h1></div><button :disabled="!w.formatErrors.entries.length" @click="w.formatErrors.clear();chosen=''">清空记录</button></header>
<DeveloperPanel :w="w" /><p class="muted">仅保存在当前浏览器，最多保留最近 100 条记录。按会话和轮次合并，再按实际调用 callId 分栏；一次主调用的正文、人物状态、小剧场、终端私聊与报错在同一栏，MVU 变量、终端活动和向量召回单独折叠。历史记录未保存分区时会明确标注。</p>
<DismissibleNotice :message="w.formatErrors.problem" error /><p v-if="!groups.length">暂无运行日志。</p>
<p v-if="target" role="status">已定位会话 {{target.sessionId}} · 楼层 {{target.turnId}} · 稿件 {{target.variantId}}。<span v-if="!targetFound">对应稿件日志未保留，可能已超过最近 100 条上限或当时未记录；无法据此还原历史原因。</span></p>
<details v-for="group in groups" :key="group.id" :open="chosen===group.id" @toggle="toggleGroup($event,group.id)">
<summary>{{group.name}} · {{group.round?'第 '+group.round+' 轮':group.turnId?'历史楼层':'未关联轮次'}} · {{group.entries.length}} 条记录<span v-if="group.errors"> · {{group.errors}} 条异常</span><button type="button" class="copy-round-log" @click.stop.prevent="copyGroup(group)">复制本轮</button><span class="copy-log-status" role="status">{{copyStatus[group.id]}}</span><small>{{new Date(group.at).toLocaleString()}}</small></summary>
<template v-if="chosen===group.id"><p v-if="group.generations>1" class="muted">本轮共 {{group.generations}} 次生成，包含重说或重试，按调用分栏保留。</p><p v-if="group.sessionId" class="muted log-source">会话 {{group.sessionId}}<span v-if="group.turnId"> · 楼层 {{group.turnId}}</span></p>
<details v-for="(call,index) in calls(group)" :key="call.id" class="run-log-call" :data-target="!!target&&call.entries.some(entry=>entry.sessionId===target?.sessionId&&entry.turnId===target?.turnId&&entry.variantId===target?.variantId)" :open="index===0||(!!target&&call.entries.some(entry=>entry.sessionId===target?.sessionId&&entry.turnId===target?.turnId&&entry.variantId===target?.variantId))">
<summary><span>{{new Date(call.at).toLocaleString()}} · {{callView(call).labels.join(' / ')}}</span><small v-if="call.callId">调用 {{call.callId.slice(0,8)}} · {{call.entries.length}} 条</small></summary>
<RunLogSectionView v-for="section in callView(call).errors" :key="section.id" :section="section"/>
<details v-if="callView(call).generated.length" class="run-log-generated"><summary>本次生成内容 · 正文 / 人物状态 / 小剧场 / 终端私聊</summary><RunLogSectionView v-for="section in callView(call).generated" :key="section.id" :section="section"/></details>
<RunLogSectionView v-for="section in callView(call).remaining" :key="section.id" :section="section"/>
<p v-if="!callView(call).sections.length" class="muted">此历史记录未记录分区明细。</p>
</details>
</template></details></section></template>
<style scoped>.copy-round-log{margin-left:10px;padding:4px 8px}.copy-log-status{margin-left:6px;font-size:12px}.format-error-page details{border-bottom:1px solid var(--color-border);padding:14px 0}.format-error-page summary{cursor:pointer;color:var(--color-accent);overflow-wrap:anywhere}.format-error-page summary small{display:block;margin:4px 0 0 18px;color:var(--color-muted)}.run-log-call{padding:10px 0 10px 12px!important;border-left:1px solid var(--color-border)!important}.run-log-section{padding:8px 0!important;border-bottom:0!important}.run-log-section>summary{font-size:13px;color:var(--color-text)}.log-source{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:60dvh;overflow:auto;font:13px/1.8 monospace}</style>
