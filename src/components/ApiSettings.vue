<script setup lang="ts">
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Profile} from '../domain/contracts';
import {textApiTasks,apiFieldIssues} from '../domain/apis';
import {uid} from '../domain/story';
import ApiProfileEditor from './ApiProfileEditor.vue';
import EmbeddingGuide from './EmbeddingGuide.vue';
import DialogShell from './DialogShell.vue';
const props=defineProps<{w:ViewModel}>();
const main=computed(()=>props.w.preferences.profiles.find(p=>p.id===props.w.preferences.mainProfile));
const embedding=computed(()=>props.w.preferences.profiles.find(p=>p.id===props.w.preferences.embeddingProfile));
const disabled=computed(()=>props.w.busy||props.w.workingMemory||props.w.configuringApis);
const selectedAux=ref(''),draft=ref<Profile>(),adding=ref(false),removeOpen=ref(false);
const auxiliary=computed(()=>props.w.auxiliaryProfiles.find(p=>p.id===selectedAux.value));
watch(()=>props.w.auxiliaryProfiles.map(p=>p.id),ids=>{if(!ids.includes(selectedAux.value))selectedAux.value=ids[0]||'';},{immediate:true});
function add(){draft.value={id:uid(),name:'副 API '+(props.w.auxiliaryProfiles.length+1),providerId:'approved-provider',model:'',temperature:0.7,maxTokens:1600};}
function closeDraft(){if(adding.value)return;if(draft.value)delete props.w.credentials[draft.value.id];draft.value=undefined;}
onBeforeUnmount(()=>{if(draft.value)delete props.w.credentials[draft.value.id];});
async function saveNew(p:Profile){
  const issues=apiFieldIssues(p,props.w.credentials[p.id]);if(issues.length){props.w.problem='请填写：'+issues.join('、');return false;}
  adding.value=true;const id=props.w.addProfile();if(!id){adding.value=false;return false;}
  const target=props.w.preferences.profiles.find(api=>api.id===id)!;Object.assign(target,{...p,id});props.w.credentials[id]=props.w.credentials[p.id];
  try{if(await props.w.connectProfile(target)){selectedAux.value=id;adding.value=false;closeDraft();return true;}props.w.removeProfile(id);return false;}finally{adding.value=false;}
}
function remove(){if(auxiliary.value)props.w.removeProfile(auxiliary.value.id);removeOpen.value=false;}
</script>
<template><section class="api-settings simple-api-settings">
  <ApiProfileEditor v-if="main" :w="w" :p="main" title="主 API" />
  <section class="auxiliary-picker"><div class="api-aux-row"><label>副 API<select v-model="selectedAux" :disabled="disabled||!w.auxiliaryProfiles.length"><option v-if="!w.auxiliaryProfiles.length" value="">暂无副 API</option><option v-for="p in w.auxiliaryProfiles" :key="p.id" :value="p.id">{{p.name||'未命名副 API'}}</option></select></label><button type="button" :disabled="disabled||w.preferences.profiles.length>=30" @click="add">增加副 API</button></div>
    <ApiProfileEditor v-if="auxiliary" :key="auxiliary.id" :w="w" :p="auxiliary" title="副 API" help="副 API 可选，可以添加多个；在下方功能接口选择中指定用途。只有主 API 也能使用全部文字功能。"><button type="button" :disabled="disabled" @click="removeOpen=true">删除</button></ApiProfileEditor>
  </section>
  <label class="toggle"><input v-model="w.preferences.vectorEnabled" type="checkbox" :disabled="disabled" />开启向量检索</label>
  <ApiProfileEditor v-if="embedding" :w="w" :p="embedding" title="向量模型" embedding />
  <EmbeddingGuide />
  <section class="api-extra"><h3>随机事件 API</h3><label>候选事件使用的接口<select v-model="w.preferences.randomEventProfile" :disabled="disabled"><option :value="w.preferences.mainProfile">主 API · {{main?.name}}</option><option v-for="p in w.auxiliaryProfiles" :key="p.id" :value="p.id" :disabled="!w.apiSelectable(p)">副 API · {{p.name}}</option></select></label><p class="rail-note">开启剧情输入区的“随机事件”后，每个新回合有50%概率调用此接口生成一个候选。你决定后，正文仍由剧情接口生成。</p></section>
  <details class="api-extra"><summary>功能接口选择（默认主 API）</summary><div class="field-grid"><label v-for="task in textApiTasks" :key="task.key">{{task.label}}<select v-model="w.preferences[task.field]" :disabled="disabled"><option :value="w.preferences.mainProfile">主 API · {{main?.name}}</option><option v-for="p in w.auxiliaryProfiles" :key="p.id" :value="p.id" :disabled="!w.apiSelectable(p)">副 API · {{p.name}}</option></select></label></div><p v-if="w.storyProfile" class="rail-note">剧情：{{w.storyProfile.model||'未选模型'}} · 最大输出 {{w.storyProfile.maxTokens}} Token（在“预设”中修改）。</p></details>
  <details class="api-extra"><summary>本机保存</summary><label class="toggle"><input :checked="w.rememberApiKeys" type="checkbox" :disabled="disabled" @change="w.setRememberApiKeys(($event.target as HTMLInputElement).checked)" />在此浏览器保存 Key，下次自动恢复</label><button type="button" :disabled="disabled" @click="w.clearApiKeys()">清除本机全部 Key</button></details>
  <div class="actions api-ready-actions"><span class="muted">{{w.apiReady?'API 已就绪':'请保存必需的 API 后进入剧情'}}</span><button type="button" :disabled="!w.apiReady||disabled" @click="w.enterStory()">进入剧情</button></div>
  <DialogShell v-if="draft" title="增加副 API" @close="closeDraft"><ApiProfileEditor :w="w" :p="draft" title="副 API" help="填写并保存后，这个接口才会加入副 API 列表。取消不会添加。" :save-profile="saveNew" /><button type="button" :disabled="adding" @click="closeDraft">取消</button></DialogShell>
  <DialogShell v-if="removeOpen&&auxiliary" title="删除副 API" @close="removeOpen=false"><p>删除“{{auxiliary.name}}”？使用它的功能将恢复主 API。</p><div class="actions"><button @click="removeOpen=false">取消</button><button class="danger" :disabled="disabled" @click="remove">删除</button></div></DialogShell>
</section></template>
