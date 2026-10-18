<script setup lang="ts">
import MemoryLedgerPanel from './MemoryLedgerPanel.vue';
import { ref } from 'vue';import type { ViewModel } from '../app/useWorkspace';import type {Memory} from '../domain/contracts';
const props=defineProps<{w:ViewModel}>();const text=ref(''),editing=ref<string>();
function begin(m:Memory){text.value=m.record?m.annotation||'':m.text;editing.value=m.id;}
async function save(){await props.w.saveMemory(text.value,editing.value);text.value='';editing.value=undefined;}
function source(id:string){props.w.panel='story';setTimeout(()=>window.dispatchEvent(new CustomEvent('academy:story-turn',{detail:id})),100);}
</script>
<template><section class="surface"><header class="panel-heading"><div><p class="eyebrow">MEMORY / 记忆</p><h1>记忆</h1></div><span class="tag">聊天{{w.chatRoundCount}}轮/有效记忆{{w.effectiveMemoryCount}}条</span></header>
  <p class="muted">记忆整理间隔：{{w.preferences.memorySummaryInterval||10}} 轮；待整理 {{w.pendingMemoryCount}} 轮。未达到轮数时不会调用文字模型，原文与事件已保存在本浏览器。</p>
  <div class="actions"><button v-if="w.workingMemory" @click="w.stopMemory()">停止</button><button :disabled="!w.missingVectorCount||w.busy||w.workingMemory||(w.preferences.mode==='server'&&w.localService?.capabilities.embeddings===false)" @click="w.indexMemories()">{{w.workingMemory?'正在建立索引…':'补建记忆索引'}}</button></div>
  <form v-if="editing" @submit.prevent="save"><label>{{w.memories.find(m=>m.id===editing)?.record?'补充记忆':'编辑记忆'}}<textarea v-model="text" rows="3" :maxlength="editing&&w.memories.find(m=>m.id===editing)?.record?3000:6000" :required="!editing||!w.memories.find(m=>m.id===editing)?.record" /></label><div class="actions"><button class="primary" type="submit" :disabled="w.busy||w.workingMemory">保存记忆</button><button v-if="editing" type="button" @click="editing=undefined;text=''">取消编辑</button></div></form>
  <MemoryLedgerPanel :w="w" /><div class="memory-list"><article v-for="m in w.memoryEntries" :key="m.id" class="list-entry"><header><span class="tag">{{m.kind==='note'?'手记':m.kind==='chapter'?'章节摘要':'事件记忆'}}</span><small class="muted">{{w.vectorStatus(m)}}</small></header><p>{{m.kind==='event'&&!m.record?'已保存，等待累计轮数后整理。':m.text}}</p><p v-if="m.error" class="model-list-error">{{m.error}}</p><p v-if="m.indexError" class="model-list-error">{{m.indexError}}</p><div class="actions"><button v-if="m.kind==='event'" :disabled="!w.memoryNeedsRepair(m)||w.busy||w.workingMemory" @click="w.retryMemory(m.id)">补记</button><button v-if="m.kind!=='event'||m.record" :disabled="w.busy||w.workingMemory" @click="begin(m)">{{m.record?'补充':'编辑'}}</button><button v-if="!m.id.startsWith('missing:')" :disabled="w.busy||w.workingMemory" @click="w.removeMemory(m.id)">删除</button><button v-if="m.sourceTurn" @click="source(m.sourceTurn)">查看来源</button></div></article><p v-if="!w.memoryEntries.length" class="empty">暂无记忆。</p></div>
</section></template>


