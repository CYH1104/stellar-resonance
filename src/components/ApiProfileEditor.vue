<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
import type {Profile} from '../domain/contracts';
import ModelPicker from './ModelPicker.vue';
defineProps<{w:ViewModel;p:Profile;title:string;embedding?:boolean}>();
</script>
<template><article class="api-card">
  <header class="panel-heading"><h3>{{title}}</h3><div class="actions"><span class="tag">{{w.connectionReady(p)?'已确认当前配置':'待配置／确认'}}</span><slot /></div></header>
  <div class="field-grid"><label>接口名称<input v-model="p.name" maxlength="80" :disabled="w.busy||w.workingMemory||w.configuringApis" /></label><label>API 基础地址<input v-model="p.apiBaseUrl" maxlength="2000" placeholder="https://你的服务地址/v1" :disabled="w.busy||w.workingMemory||w.configuringApis" /></label><label>API Key<input v-model="w.credentials[p.id]" type="password" autocomplete="off" :placeholder="w.rememberApiKeys?'保存在此浏览器，重新打开自动恢复':'仅此页面使用，刷新后重填'" :disabled="w.busy||w.workingMemory||w.configuringApis" /></label><ModelPicker :w="w" :p="p" /><template v-if="!embedding"><label>Temperature<input v-model.number="p.temperature" type="number" min="0" max="2" step="0.1" :disabled="w.busy||w.workingMemory||w.configuringApis" /></label><label>最大输出 Token<input v-model.number="p.maxTokens" type="number" min="1" max="32000" :disabled="w.busy||w.workingMemory||w.configuringApis" /></label></template></div>
  <p v-if="embedding" class="hint">选择支持 embeddings 的向量模型。它只处理检索文本，不负责生成剧情。</p>
  <div class="actions"><button :disabled="w.busy||w.workingMemory||w.configuringApis" @click="w.connectProfile(p)">确认此 API</button><button :disabled="w.busy||w.workingMemory||w.configuringApis" @click="w.credentials[p.id]=''">清除 Key</button></div>
</article></template>
