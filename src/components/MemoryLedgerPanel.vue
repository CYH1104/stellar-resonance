<script setup lang="ts">
import {computed,ref} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Memory} from '../domain/contracts';
import {sourceActive} from '../domain/memoryLedger';
import {memoryProgress} from '../domain/memoryProgress';
const props=defineProps<{w:ViewModel}>();
const query=ref(''),preview=ref(false),recordId=ref(''),draft=ref('');
const rows=computed(()=>props.w.memoryEntries.filter(m=>!query.value.trim()||(m.text+' '+m.sourceTurn+' '+m.sourceVariant).toLowerCase().includes(query.value.trim().toLowerCase())));
const promises=computed(()=>{const map=new Map();const s=props.w.active;if(!s)return [];for(const t of s.turns)for(const m of props.w.memories.filter(m=>m.sourceTurn===t.id))for(const c of m.record?.commitments||[])map.set(c.id,{...c,sourceTurn:m.sourceTurn});return [...map.values()];});
function editRecord(m:Memory){recordId.value=m.id;draft.value=JSON.stringify(m.record,null,2);}
async function saveRecord(){if(await props.w.reviseMemoryRecord(recordId.value,draft.value))recordId.value='';}
function jump(id:string){props.w.panel='story';setTimeout(()=>window.dispatchEvent(new CustomEvent('academy:story-turn',{detail:id})),100);}
</script>
<template>
 <section v-if="w.active" class="memory-ledger-panel">
  <h2>来源账本</h2>
  <p>当前：{{w.active.memoryEngine==='candidate'?'来源校验与本地混合检索':'原记忆检索'}}。事实与约定沿当前剧情路径读取；历史记录保留，未确认来源不自动加入新账本检索。</p>
  <div class="actions"><button v-if="w.active.memoryEngine!=='candidate'" :disabled="w.busy||w.workingMemory" @click="preview=!preview">查看迁移预览</button><button v-else :disabled="w.busy||w.workingMemory" @click="w.useLegacyMemory()">回到原检索</button><button :disabled="w.busy||w.workingMemory||!w.pendingMemoryCount" @click="w.retryMemory()">整理／重试待处理记忆</button></div>
  <section v-if="preview" class="memory-migration-preview"><p>共 {{w.migrationPreview().total}} 条，可映射 {{w.migrationPreview().mappable}} 条，来源待确认 {{w.migrationPreview().unconfirmed}} 条。保留原记录快照；不调用模型、不重建向量。切回原检索时仍保留新记录。</p><button :disabled="w.busy||w.workingMemory" @click="w.activateMemoryLedger();preview=false">保留原数据并启用账本</button></section>
  <label>搜索事件／来源<input v-model="query" placeholder="关键词、轮次 ID 或回复 ID" /></label>
  <div class="memory-table-scroll"><table><thead><tr><th>状态／修订</th><th>时间／地点／人物</th><th>事件与事实</th><th>来源</th></tr></thead><tbody><tr v-for="m in rows" :key="m.id"><td>{{memoryProgress(m,w.active,m.kind==='event'&&w.memoryNeedsRepair(m),w.workingMemory)}} · v{{m.revision||1}}<p v-if="m.kind==='event'&&!m.source">来源待确认</p></td><td>{{m.record?.time}}<br />{{m.record?.location}}<br />{{m.record?.participants.join('、')}}</td><td><p>{{m.record?.userActions.join('；')||m.text}}</p><p v-for="c in m.record?.charActions" :key="c.name">{{c.name}}：{{c.actions.join('；')}}</p><button v-if="m.record" :disabled="w.busy||w.workingMemory" @click="editRecord(m)">编辑事实与约定</button><details v-if="m.revisions?.length"><summary>修订历史（{{m.revisions.length}}）</summary><div v-for="r in m.revisions" :key="r.revision"><p>v{{r.revision}} · {{r.at}}</p><pre>{{r.text}}</pre><button :disabled="w.busy||w.workingMemory" @click="w.restoreMemoryRevision(m.id,r.revision)">恢复此修订</button></div></details></td><td><button v-if="m.sourceTurn" @click="jump(m.sourceTurn)">查看来源剧情</button><small>{{m.sourceTurn}}<br />{{m.sourceVariant}}<br />{{m.source?.sourceTextHash}}</small></td></tr></tbody></table></div>
  <form v-if="recordId" @submit.prevent="saveRecord"><label>编辑结构化事实（JSON）<textarea v-model="draft" rows="16" maxlength="20000" /></label><p>数值差异仍按真实 MVU 状态计算；编辑不会写入人物好感度。保存创建新修订并使旧向量失效。</p><div class="actions"><button :disabled="w.busy||w.workingMemory">保存新修订</button><button type="button" @click="recordId=''">取消</button></div></form>
  <details><summary>当前路径约定（{{promises.length}}）</summary><div v-for="c in promises" :key="c.id"><p>{{c.participants.join('、')}}：{{c.content}} · {{c.status==='open'?'未履行':c.status==='fulfilled'?'已履行':'已取消'}}</p><button @click="jump(c.sourceTurn)">查看变更来源</button></div></details>
  <details><summary>后台任务（{{w.active.memoryTasks?.length||0}}）{{w.workingMemory?' · 处理中，仍可继续剧情':''}}</summary><article v-for="task in w.active.memoryTasks?.slice(-100)" :key="task.id"><p>{{!sourceActive(w.active,task.source)?'原剧情已变更（历史任务）':({pending:'等待逐轮整理',running:'正在整理',ready:'已完成',failed:'待重试',stale:'原剧情已变更（历史任务）'}[task.status])}} · 尝试 {{task.attempts}} 次 · {{task.updatedAt}}</p><p v-if="task.error&&sourceActive(w.active,task.source)&&task.status!=='stale'">{{task.error}}</p><p v-if="!sourceActive(w.active,task.source)||task.status==='stale'">此任务对应的正文、回复版本或状态已变更，不再用于当前剧情；不代表 API 连接失败。需要补记时，请操作对应的当前记忆条目。</p><small>{{task.source.sourceTurnId}} / {{task.source.sourceVariantId}}</small></article></details>
  <details><summary>来源待确认（{{w.active.memoryMigration?.unconfirmed.length||0}}）</summary><p>保留展示，不加入来源敏感检索。</p><article v-for="id in w.active.memoryMigration?.unconfirmed" :key="id"><pre>{{w.active.memories.find(m=>m.id===id)?.text||w.active.memoryMigration?.legacy.find(m=>m.id===id)?.text}}</pre></article></details>
  <details><summary>保留的历史记录（{{w.active.memoryArchive?.length||0}}）</summary><p>这些记录不加入当前路径检索；备份会保留完整历史。</p><article v-for="m in w.active.memoryArchive?.slice(-50)" :key="m.id+':'+m.sourceFingerprint"><pre>{{m.text}}</pre></article></details>
 </section>
</template>
<style scoped>
.memory-ledger-panel{margin:20px 0;padding:16px;border:1px solid var(--line,#9995);border-radius:8px}.memory-table-scroll{overflow:auto;margin:16px 0;max-height:520px}table{width:100%;border-collapse:collapse;min-width:640px}th,td{padding:12px;border-bottom:1px solid #9994;text-align:left;vertical-align:top}td p{white-space:pre-wrap}small{display:block;overflow-wrap:anywhere;max-width:180px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto}details{margin-top:16px}article{padding:10px 0;border-bottom:1px solid #9994}
</style>
