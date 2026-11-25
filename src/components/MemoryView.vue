<script setup lang="ts">
import {computed} from 'vue';
import MemoryDatabasePanel from './MemoryDatabasePanel.vue';
import {terminalMemoryForTurn} from '../domain/terminalLedger';
import MemoryLedgerPanel from './MemoryLedgerPanel.vue';
import {memoryProgress} from '../domain/memoryProgress';
import { ref } from 'vue';import type { ViewModel } from '../app/useWorkspace';import type {Memory} from '../domain/contracts';
const legacyOpen=ref(false),ledgerOpen=ref(false),terminalOpen=ref(false);
function isOpen(e:Event){return (e.target as HTMLDetailsElement).open;}
const props=defineProps<{w:ViewModel}>();const text=ref(''),editing=ref<string>();
const terminalMemories=computed(()=>{const session=props.w.active;if(!session)return [];return session.turns.map((turn,index)=>({id:turn.id,number:index+1,text:terminalMemoryForTurn(session,turn.id,turn.variants[turn.selected]?.id||'')})).filter(m=>m.text);});
function begin(m:Memory){text.value=m.record?m.annotation||'':m.text;editing.value=m.id;}
async function save(){await props.w.saveMemory(text.value,editing.value);text.value='';editing.value=undefined;}
function source(id:string){props.w.panel='story';setTimeout(()=>window.dispatchEvent(new CustomEvent('academy:story-turn',{detail:id})),100);}
</script>
<template><section class="surface"><header class="panel-heading"><div><p class="eyebrow">MEMORY / 记忆</p><h1>记忆</h1></div><span class="tag">聊天{{w.chatRoundCount}}轮/有效记忆{{w.effectiveMemoryCount}}条</span></header>
  <p class="muted">记忆逐轮整理：每轮完成即在后台生成记忆；待处理 {{w.pendingMemoryCount}} 轮。启用向量时，记忆保存后立即建索引；失败不会阻塞后续回合，可在来源账本重试。最近 12 轮完整对话会直接发送给模型，不依赖向量命中；更早记忆按相关性召回，关闭向量时使用本地关键词检索。</p>
  <div class="actions"><button v-if="w.workingMemory" @click="w.stopMemory()">停止</button><button :disabled="!w.missingVectorCount||w.busy||w.workingMemory||(w.preferences.mode==='server'&&w.localService?.capabilities.embeddings===false)" @click="w.indexMemories()">{{w.workingMemory?'正在建立索引…':'补建记忆索引'}}</button></div>
  <form v-if="editing" @submit.prevent="save"><label>{{w.memories.find(m=>m.id===editing)?.record?'补充记忆':'编辑记忆'}}<textarea v-model="text" rows="3" :maxlength="editing&&w.memories.find(m=>m.id===editing)?.record?3000:6000" :required="!editing||!w.memories.find(m=>m.id===editing)?.record" /></label><div class="actions"><button class="primary" type="submit" :disabled="w.busy||w.workingMemory">保存记忆</button><button v-if="editing" type="button" @click="editing=undefined;text=''">取消编辑</button></div></form>
  <details v-if="terminalMemories.length" class="terminal-memory-list" @toggle="terminalOpen=isOpen($event)"><summary>小手机记忆 · {{terminalMemories.length}}轮</summary><article v-for="m in terminalOpen?terminalMemories:[]" :key="m.id" class="list-entry"><header>第{{m.number}}轮</header><p style="white-space:pre-wrap;overflow-wrap:anywhere">{{m.text}}</p><button type="button" @click="source(m.id)">查看来源</button></article></details>
  <MemoryDatabasePanel :w="w" /><details @toggle="ledgerOpen=isOpen($event)"><summary>来源账本、后台任务与历史记录</summary><MemoryLedgerPanel v-if="ledgerOpen" :w="w" /></details><details @toggle="legacyOpen=isOpen($event)"><summary>原始记忆与补记</summary><div v-if="legacyOpen" class="memory-list"><article v-for="m in w.memoryEntries" :key="m.id" class="list-entry"><header><span class="tag">{{m.kind==='note'?'手记':m.kind==='chapter'?'章节摘要':'事件记忆'}}</span><small class="muted">{{w.vectorStatus(m)}}</small></header><p>{{m.record||m.kind!=='event'?m.text:memoryProgress(m,w.active,w.memoryNeedsRepair(m),w.workingMemory)}}</p><p v-if="m.record&&m.kind==='event'&&w.memoryNeedsRepair(m)" class="muted">{{memoryProgress(m,w.active,true,w.workingMemory)}}</p><p v-if="m.error" class="memory-record-error">{{m.error}}</p><p v-if="m.indexError" class="memory-record-error">{{m.indexError}}</p><div class="actions"><button v-if="m.kind==='event'" :disabled="!w.memoryNeedsRepair(m)||w.busy||w.workingMemory" @click="w.retryMemory(m.id)">补记</button><button v-if="m.kind!=='event'||m.record" :disabled="w.busy||w.workingMemory" @click="begin(m)">{{m.record?'补充':'编辑'}}</button><button v-if="!m.id.startsWith('missing:')" :disabled="w.busy||w.workingMemory" @click="w.removeMemory(m.id)">删除</button><button v-if="m.sourceTurn" @click="source(m.sourceTurn)">查看来源</button></div></article><p v-if="!w.memoryEntries.length" class="empty">暂无记忆。</p></div></details>
</section></template>



<style scoped>
.memory-record-error{position:static;margin:10px 0;padding:10px 12px;border:1px solid var(--color-error);border-radius:8px;color:var(--color-error);overflow-wrap:anywhere;white-space:pre-wrap}
</style>
