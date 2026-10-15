<script setup lang="ts">
import {computed} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import ApiProfileEditor from './ApiProfileEditor.vue';
import EmbeddingGuide from './EmbeddingGuide.vue';
import {textApiTasks} from '../domain/apis';
const props=defineProps<{w:ViewModel}>();
const main=computed(()=>props.w.preferences.profiles.find(p=>p.id===props.w.preferences.mainProfile));
const embedding=computed(()=>props.w.preferences.profiles.find(p=>p.id===props.w.preferences.embeddingProfile));
</script>
<template><section class="subsection api-settings">
  <header class="panel-heading"><div><h2>API 配置与任务分工</h2><p class="muted">一个主 API、多个可选副 API，以及独立的向量 API。</p></div><span class="tag">{{w.apiReady?'可以进入剧情':'请先完成配置'}}</span></header>
  <div class="api-readiness" :class="{ready:w.apiReady}"><p v-if="w.apiReady">必需配置已就绪。</p><template v-else><p>进入剧情前还需要：</p><ul><li v-for="issue in w.apiIssues" :key="issue">{{issue}}</li></ul></template><div class="actions"><button :disabled="w.busy||w.workingMemory||w.configuringApis" @click="w.confirmAllApis()">{{w.configuringApis?'正在确认配置…':'确认配置'}}</button><button :disabled="!w.apiReady||w.busy||w.workingMemory||w.configuringApis" @click="w.enterStory()">配置完成，继续</button></div><small class="muted">确认配置只登记地址，不发起付费生成，也不代表已经完成真实模型测试。</small></div>
  <h3>每个功能使用哪个接口</h3><p class="hint">全部默认使用主 API，只有主 API 也能正常使用。副 API 配好后可按功能选择，不会自动切换。</p>
  <div class="field-grid"><label v-for="task in textApiTasks" :key="task.key">{{task.label}}接口<select v-model="w.preferences[task.field]" :disabled="w.busy||w.workingMemory||w.configuringApis"><option :value="w.preferences.mainProfile">主 API · {{main?.name}}</option><option v-for="p in w.auxiliaryProfiles" :key="p.id" :value="p.id" :disabled="!w.apiSelectable(p)">副 API · {{p.name}}{{w.apiSelectable(p)?'':'（尚未填写完整）'}}</option></select><small class="muted">{{task.hint}}</small></label></div>
  <ApiProfileEditor v-if="main" :w="w" :p="main" title="主 API（必填）" />
  <header class="panel-heading"><div><h3>副 API（完全可选）</h3><p class="muted">不设置也能开始游戏；未被任何功能选用的空白或草稿接口不会拦住游戏。选用副 API 时才需要填写完整并确认。上移／下移只调整显示顺序。</p></div><button :disabled="w.busy||w.workingMemory||w.configuringApis||w.preferences.profiles.length>=30" @click="w.addProfile()">添加副 API</button></header>
  <ApiProfileEditor v-for="(p,i) in w.auxiliaryProfiles" :key="p.id" :w="w" :p="p" :title="`副 API ${i+1}`"><button :disabled="i===0||w.busy||w.workingMemory||w.configuringApis" @click="w.moveAuxiliary(i,-1)">上移</button><button :disabled="i===w.auxiliaryProfiles.length-1||w.busy||w.workingMemory||w.configuringApis" @click="w.moveAuxiliary(i,1)">下移</button><button :disabled="w.busy||w.workingMemory||w.configuringApis" @click="w.removeProfile(p.id)">移除</button></ApiProfileEditor>
  <label class="toggle"><input v-model="w.preferences.vectorEnabled" type="checkbox" :disabled="w.busy||w.workingMemory||w.configuringApis" />开启向量检索</label>
  <p class="hint">关闭时使用关键词检索，向量 API 可留空；开启后，向量 API 也必须填写并确认，才能进入剧情。</p>
  <ApiProfileEditor v-if="embedding" :w="w" :p="embedding" title="向量 API（开启向量检索时必填）" embedding />
  <p class="hint">向量检索使用这份独立的向量 API，需要 embeddings 模型；上方的文字接口下拉列表不改变它。</p>
  <EmbeddingGuide />
  <section class="subsection"><h3>本机保存</h3><label class="toggle"><input :checked="w.rememberApiKeys" type="checkbox" :disabled="w.busy||w.workingMemory||w.configuringApis" @change="w.setRememberApiKeys(($event.target as HTMLInputElement).checked)" />在此浏览器保存 API Key</label><p class="muted">开启后，Key 与接口配置保存在当前浏览器的本地数据库，重新打开会自动恢复已确认接口。关闭后删除本机保存的 Key，当前页面仍可使用。</p><p class="muted">不写入服务器配置、聊天备份或导出的预设。换浏览器、清理网站数据或使用无痕窗口后需要重新填写。</p><button :disabled="w.busy||w.workingMemory||w.configuringApis" @click="w.clearApiKeys()">清除本机全部 Key</button></section>
</section></template>
