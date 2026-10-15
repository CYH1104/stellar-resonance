<script setup lang="ts">
import { ref } from 'vue';import type { ViewModel } from '../app/useWorkspace';import type {Memory} from '../domain/contracts';
const props=defineProps<{w:ViewModel}>();const text=ref(''),editing=ref<string>(),query=ref(''),results=ref<Memory[]>();
function begin(m:Memory){text.value=m.text;editing.value=m.id;}
async function save(){await props.w.saveMemory(text.value,editing.value);text.value='';editing.value=undefined;results.value=undefined;}
async function search(){results.value=await props.w.searchMemory(query.value);}
function source(id:string){props.w.panel='story';setTimeout(()=>document.getElementById(`turn-${id}`)?.scrollIntoView({block:'center'}),100);}
</script>
<template><section class="surface"><header class="panel-heading"><div><p class="eyebrow">MEMORY / 记忆</p><h1>只带上相关的旧事。</h1></div><span class="tag">{{w.memories.length}} 条有效记忆</span></header><p class="muted">记忆属于当前存档。废弃稿件的事件不会参与检索。</p>
  <div class="actions"><label class="toggle"><input v-model="w.preferences.vectorEnabled" type="checkbox" :disabled="w.busy||w.workingMemory||(w.preferences.mode==='server'&&w.localService?.capabilities.embeddings===false)" />向量检索</label><button :disabled="!w.preferences.vectorEnabled||w.busy||w.workingMemory||(w.preferences.mode==='server'&&w.localService?.capabilities.embeddings===false)" @click="w.indexMemories()">{{w.workingMemory?'正在建立索引…':'生成缺失向量'}}</button></div><p v-if="w.localService&&w.preferences.mode==='server'" class="hint">向量开启时使用已配置的向量 API；编码结果和记忆保存在本机。检索失败时退回关键词。</p><p v-else-if="w.preferences.mode==='demo'" class="hint">演示模式使用字频示例向量，不代表真实语义检索效果；真实向量接口已留出。</p>
  <form class="search-row" @submit.prevent="search"><label>检索记忆<input v-model="query" placeholder="输入人物或关键词" /></label><button type="submit" :disabled="w.busy||w.workingMemory">检索</button><button type="button" @click="query='';results=undefined">显示全部</button></form>
  <form @submit.prevent="save"><label>{{editing?'编辑记忆':'添加手记'}}<textarea v-model="text" rows="3" maxlength="6000" required /></label><div class="actions"><button class="primary" type="submit" :disabled="w.busy||w.workingMemory">{{editing?'保存记忆':'添加手记'}}</button><button v-if="editing" type="button" @click="editing=undefined;text=''">取消编辑</button></div></form>
  <div class="memory-list"><article v-for="m in (results??w.memories)" :key="m.id" class="list-entry"><header><span class="tag">{{m.kind==='note'?'手记':m.kind==='chapter'?'章节摘要':'事件记忆'}}</span><small class="muted">{{m.vector?'有向量':'未建向量'}}</small></header><p>{{m.text}}</p><div class="actions"><button :disabled="w.busy||w.workingMemory" @click="begin(m)">编辑</button><button :disabled="w.busy||w.workingMemory" @click="w.removeMemory(m.id);results=undefined">删除</button><button v-if="m.sourceTurn" @click="source(m.sourceTurn)">查看来源</button></div></article><p v-if="!(results??w.memories).length" class="empty">暂无匹配记忆。完整回合会产生事件记忆，也可以先添加手记。</p></div>
</section></template>


