<script setup lang="ts">
import {parseApiSettings,type ApiTransfer} from '../domain/apiTransfer';
import DeveloperDiagnostics from './DeveloperDiagnostics.vue';
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Profile} from '../domain/contracts';
import {textApiTasks,apiFieldIssues} from '../domain/apis';
import {uid} from '../domain/story';
import ApiProfileEditor from './ApiProfileEditor.vue';
import EmbeddingGuide from './EmbeddingGuide.vue';
import DialogShell from './DialogShell.vue';
const props=defineProps<{w:ViewModel}>();
const emit=defineEmits<{saved:[]}>();
const main=computed(()=>props.w.preferences.profiles.find(p=>p.id===props.w.preferences.mainProfile));
const embedding=computed(()=>props.w.preferences.profiles.find(p=>p.id===props.w.preferences.embeddingProfile));
const disabled=computed(()=>props.w.busy||props.w.workingMemory||props.w.configuringApis);
const selectedAux=ref(''),draft=ref<Profile>(),adding=ref(false),removeOpen=ref(false);
const filePicker=ref<HTMLInputElement>(),includeKeys=ref(false),pendingImport=ref<ApiTransfer>(),importing=ref(false);
const transferDisabled=computed(()=>disabled.value||wBusy()||!!draft.value||importing.value||props.w.loading);
function wBusy(){return props.w.workingPersona||props.w.creatingGame||!!props.w.workingForumReply;}
async function readSettings(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;try{if(file.size>1024*1024)throw new Error('API 设置文件最多1MB。');pendingImport.value=parseApiSettings(await file.text());props.w.problem='';}catch(e){props.w.problem=e instanceof Error?e.message:'读取 API 设置失败。';}finally{input.value='';}}
async function applyImport(){if(!pendingImport.value||transferDisabled.value)return;importing.value=true;try{if(await props.w.importApiConfiguration(JSON.stringify(pendingImport.value)))pendingImport.value=undefined;}finally{importing.value=false;}}
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
  <section class="api-extra preset-shortcut"><h3>酒馆预设</h3><p>提示词、条目排序与采样参数在预设管理中设置。</p><button type="button" @click="w.panel='presets'">导入／管理酒馆预设</button></section>
  <section class="api-extra"><h3>API 设置导入／导出</h3><div class="actions"><button type="button" :disabled="transferDisabled" @click="filePicker?.click()">导入 API 设置</button><button type="button" :disabled="transferDisabled" @click="w.exportApiConfiguration(includeKeys)">导出 API 设置</button><input ref="filePicker" type="file" accept=".json,application/json" hidden @change="readSettings" /></div><label class="toggle"><input v-model="includeKeys" type="checkbox" :disabled="transferDisabled" />导出时包含 Key（明文，请勿分享）</label></section>
  <ApiProfileEditor v-if="main" :w="w" :p="main" title="主 API" @saved="emit('saved')" />
  <section class="auxiliary-picker"><div class="api-aux-row"><label>副 API<select v-model="selectedAux" :disabled="disabled||!w.auxiliaryProfiles.length"><option v-if="!w.auxiliaryProfiles.length" value="">暂无副 API</option><option v-for="p in w.auxiliaryProfiles" :key="p.id" :value="p.id">{{p.name||'未命名副 API'}}</option></select></label><button type="button" :disabled="disabled||w.preferences.profiles.length>=30" @click="add">增加副 API</button></div>
    <ApiProfileEditor v-if="auxiliary" @saved="emit('saved')" :key="auxiliary.id" :w="w" :p="auxiliary" title="副 API" help="副 API 可选，可以添加多个；在下方功能接口选择中指定用途。只有主 API 也能使用全部文字功能。"><button type="button" :disabled="disabled" @click="removeOpen=true">删除</button></ApiProfileEditor>
  </section>
  <label class="toggle"><input v-model="w.preferences.vectorEnabled" type="checkbox" :disabled="disabled" />启用可选向量检索</label><p class="rail-note">关闭时使用本地关键词检索，不需要向量模型，不影响记忆整理。</p>
  <ApiProfileEditor v-if="embedding&&w.preferences.vectorEnabled" :w="w" :p="embedding" title="向量模型" embedding @saved="emit('saved')" />
  <EmbeddingGuide v-if="w.preferences.vectorEnabled" />
  <section class="api-extra" aria-labelledby="api-task-heading">
    <h2 id="api-task-heading">功能接口选择（默认主 API）</h2><button type="button" :disabled="disabled" @click="w.useMainForAll()">全部使用主 API · 本地记忆检索</button>
    <p class="rail-note">状态与格式跟随主 API 时，正文、状态与小剧场在一次请求内生成；选择副 API 后，剧情接口仍生成正文、小剧场和快捷回复，副 API 只判断 MVU 状态变化。</p>
    <div class="field-grid">
      <label v-for="task in textApiTasks" :key="task.key">{{task.label}}<select v-model="w.preferences[task.field]" :disabled="disabled"><option :value="w.preferences.mainProfile">{{task.key==='state'?'跟随剧情 API（一次生成）':'主 API · '+main?.name}}</option><option v-for="p in w.auxiliaryProfiles" :key="p.id" :value="p.id" :disabled="!w.apiSelectable(p)">副 API · {{p.name}}</option></select></label>
      <label>随机事件<select v-model="w.preferences.randomEventProfile" :disabled="disabled"><option :value="w.preferences.mainProfile">主 API · {{main?.name}}</option><option v-for="p in w.auxiliaryProfiles" :key="p.id" :value="p.id" :disabled="!w.apiSelectable(p)">副 API · {{p.name}}</option></select></label>
      <label>论坛 AI 回复<select v-model="w.preferences.forumReplyProfile" :disabled="disabled"><option :value="w.preferences.mainProfile">主 API · {{main?.name}}</option><option v-for="p in w.auxiliaryProfiles" :key="p.id" :value="p.id" :disabled="!w.apiSelectable(p)">副 API · {{p.name}}</option></select></label>
    </div>
    <p v-if="w.storyProfile" class="rail-note">剧情：{{w.storyProfile.model||'未选模型'}} · 最大输出 {{w.storyProfile.maxTokens}} Token（在“预设”中修改）。</p>
    <label class="toggle"><input v-model="w.preferences.stateEnabled" type="checkbox" :disabled="disabled" />生成人物状态栏更新</label>
    <p class="rail-note">记忆逐轮整理：每轮正文完成后立即生成一条记忆，不再等待累计轮数。启用向量后，摘要成功保存即建立索引；失败可在记忆页重试，后续回合仍会继续整理。</p>
    <label>随机事件触发概率 %<input v-model.number="w.preferences.randomEventProbability" type="number" min="0" max="100" :disabled="disabled" /></label>
    <label class="toggle"><input v-model="w.preferences.diceEnabled" type="checkbox" :disabled="disabled" />开启随机事件</label>
    <p class="rail-note">开启后按上方概率本地判定；跟随主 API 时，命中后自动随正文一次生成事件，不单独调用候选接口。仅明确选择副 API 时单独生成事件并自动衔接正文，投骰始终在本地完成。</p>
    <label class="toggle"><input v-model="w.preferences.forumReplyEnabled" type="checkbox" :disabled="disabled" />发表论坛评论后，允许角色／NPC 回复我（默认关闭）</label>
    <p class="rail-note">开启后，每条玩家评论额外调用论坛 AI 回复接口一次，随机由一名 char 或 NPC 回复，可随时停止；关闭时只保存你的评论，不调用 AI。论坛回复不改变主线状态。</p>
  </section>
  <section class="api-extra"><h3>本机保存</h3><label class="toggle"><input :checked="w.rememberApiKeys" type="checkbox" :disabled="disabled" @change="w.setRememberApiKeys(($event.target as HTMLInputElement).checked)" />在此浏览器保存 Key，下次自动恢复</label><button type="button" :disabled="disabled" @click="w.clearApiKeys()">清除本机全部 Key</button></section>
  <details class="api-extra"><summary>本机诊断与报错{{w.problem||w.apiIssues?.length?'（有待处理项目）':''}}</summary><p class="rail-note">本机后台：{{w.localService?'已连接':'未连接，请使用“启动预览.bat”启动'}}</p><p v-if="w.problem" class="model-list-error" role="alert">{{w.problem}}</p><ul v-if="w.apiIssues?.length" class="plain-list"><li v-for="(issue,i) in w.apiIssues" :key="i">{{issue}}</li></ul><p v-else-if="!w.problem" class="rail-note">当前没有报错。</p><button v-if="w.problem" type="button" @click="w.problem=''">清除报错提示</button><DeveloperDiagnostics /></details>
  <div class="actions api-ready-actions"><button type="button" class="api-enter-button" :disabled="!w.apiReady||disabled" @click="w.enterStory()">{{w.apiReady?'进入剧情':'请先保存必需的 API'}}</button></div>
  <DialogShell v-if="draft" title="增加副 API" @close="closeDraft"><ApiProfileEditor :w="w" :p="draft" title="副 API" help="填写并保存后，这个接口才会加入副 API 列表。取消不会添加。" :save-profile="saveNew" /><button type="button" :disabled="adding" @click="closeDraft">取消</button></DialogShell>
  <DialogShell v-if="removeOpen&&auxiliary" title="删除副 API" @close="removeOpen=false"><p>删除“{{auxiliary.name}}”？使用它的功能将恢复主 API。</p><div class="actions"><button @click="removeOpen=false">取消</button><button class="danger" :disabled="disabled" @click="remove">删除</button></div></DialogShell>
  <DialogShell v-if="pendingImport" title="导入 API 设置" @close="!importing&&(pendingImport=undefined)"><p>包含主 API、{{pendingImport.configuration.auxiliaryProfiles?.length||0}} 个副 API、向量 API 和功能接口选择。{{pendingImport.keys?'包含 Key。':'不含 Key；仅保留当前同 ID、同地址接口的 Key，其余需重新填写。'}}</p><p>将替换当前 API 设置，预设、人设和存档保持不变。导入不会测试或调用模型，请保存 API 后使用。</p><div class="actions"><button type="button" :disabled="importing" @click="pendingImport=undefined">取消</button><button type="button" :disabled="transferDisabled" @click="applyImport">确认导入</button></div></DialogShell>
</section></template>
