<script setup lang="ts">
import {ref} from 'vue';
import {HttpGateway} from '../gateway/http';
import {cleanTheaterShare,type TheaterShare} from '../domain/theaterShare';
import DismissibleNotice from './DismissibleNotice.vue';
import type {ViewModel} from '../app/useWorkspace';
import type {TheaterSetting} from '../domain/contracts';
import {theaterTemplates} from '../domain/theaters';
const props=defineProps<{w:ViewModel;embedded?:boolean}>();
const shareCode=ref(''),preview=ref<TheaterShare>(),publishing=ref<TheaterSetting>(),sharedCode=ref(''),shareBusy=ref(false),shareError=ref('');
const api=new HttpGateway();
async function lookup(){shareBusy.value=true;shareError.value='';preview.value=undefined;try{preview.value=cleanTheaterShare((await api.lookupTheaterShare(shareCode.value.trim())).template);}catch(e){shareError.value=(e as Error).message;}finally{shareBusy.value=false;}}
async function publish(){if(!publishing.value||shareBusy.value)return;shareBusy.value=true;shareError.value='';try{const template=cleanTheaterShare({version:1,...publishing.value});sharedCode.value=(await api.createTheaterShare(template)).code;publishing.value=undefined;}catch(e){shareError.value=(e as Error).message;}finally{shareBusy.value=false;}}
async function importShared(){if(!preview.value||shareBusy.value)return;shareBusy.value=true;const settings=props.w.preferences.theaters||=[],slot=Math.max(2,...settings.map(s=>s.slot))+1;if(!Number.isSafeInteger(slot)){shareBusy.value=false;return;}const {version,...value}=preview.value;settings.push({...value,templateId:value.templateId as TheaterSetting['templateId'],slot,enabled:false});try{props.w.problem='';await props.w.save();if(props.w.problem){settings.splice(settings.findIndex(s=>s.slot===slot),1);shareError.value='导入未保存，请重试。';}else preview.value=undefined;}catch(e){settings.splice(settings.findIndex(s=>s.slot===slot),1);shareError.value=(e as Error).message;}finally{shareBusy.value=false;}}
function template(slot:TheaterSetting,id:string){const value=theaterTemplates.find(t=>t.id===id);if(!value)return;slot.kind=value.kind;slot.title=value.name;slot.instruction=value.instruction;slot.templateId=value.id;}
function add(w:ViewModel){const settings=w.preferences.theaters||=[];const slot=Math.max(2,...settings.map(s=>s.slot))+1;if(!Number.isSafeInteger(slot))return;settings.push({slot,kind:'custom',enabled:false,title:'自定义小剧场',instruction:''});}
</script>
<template><section :class="embedded?'subsection':'surface'">
  <header class="panel-heading"><div><p class="eyebrow">SIDE STORIES / 小剧场设置</p><h1>小剧场设置</h1></div><button class="primary" :disabled="w.busy" @click="w.save()">保存设置</button></header>
  
  
  <p class="hint"><button type="button" @click="w.panel='settings'">前往 API 设置</button></p>
  <p class="rail-note">论坛独立，自定义小剧场可按需新增。各项由你自行开关，新增位置默认关闭。</p>
  <button type="button" :disabled="w.busy" @click="add(w)">新增自定义小剧场</button>
  <p class="rail-note">当前开启 {{w.preferences.theaters?.filter(s=>s.slot>1&&s.enabled).length||0}} 个小剧场；内容较多时，可到预设页按需调整最大输出 Token。</p>
  <section class="subsection"><h2>小剧场分享码</h2><p class="rail-note">分享码仅在同一服务器使用，区分大小写。导入为新位置，默认关闭，不覆盖现有设置。</p><label>分享码<input v-model="shareCode" maxlength="10" :disabled="shareBusy" /></label><button :disabled="shareBusy||!shareCode.trim()||w.busy" @click="lookup">查看导入预览</button><DismissibleNotice :message="shareError" error /><article v-if="preview"><h3>{{preview.title}}</h3><p>{{preview.kind}}</p><pre style="white-space:pre-wrap">{{preview.instruction}}</pre><button :disabled="shareBusy||w.busy" @click="importShared">确认导入并保存</button><button @click="preview=undefined">取消</button></article><article v-if="publishing"><h3>确认分享：{{publishing.title}}</h3><pre style="white-space:pre-wrap">{{publishing.instruction}}</pre><p>会将名称、类型和内容要求保存到服务器，持有码的人可导入。不包含聊天记录、角色绑定和接口信息。</p><button :disabled="shareBusy" @click="publish">生成分享码</button><button :disabled="shareBusy" @click="publishing=undefined">取消</button></article><label v-if="sharedCode">分享码（可选中复制）<input :value="sharedCode" readonly @focus="($event.target as HTMLInputElement).select()" /></label></section>
  <div class="theater-settings-grid"><article v-for="s in w.preferences.theaters" :key="s.slot" class="list-entry">
    <header class="panel-heading"><h2>位置 {{s.slot}} · {{s.slot===1?'论坛':s.slot===2?'群聊':'自定义'}}</h2><label class="toggle"><input v-model="s.enabled" type="checkbox" :disabled="w.busy" />开启</label></header>
    <label v-if="s.slot>=3">使用内置模板<select :disabled="w.busy" :value="s.templateId||''" @change="template(s,($event.target as HTMLSelectElement).value)"><option value="" disabled>选择模板或自行编辑</option><option v-for="t in theaterTemplates" :key="t.id" :value="t.id">{{t.name}}</option></select></label>
    <button v-if="s.slot>=3" :disabled="w.busy||shareBusy" @click="publishing={...s};sharedCode=''">分享此小剧场</button>
    <label>名称<input v-model="s.title" maxlength="80" :disabled="w.busy" /></label>
    <label v-if="s.slot>=3">小剧场类型<select v-model="s.kind" :disabled="w.busy" @change="s.templateId=undefined"><option value="custom">自定义文字</option><option value="fanfic">user × char 同人文</option><option value="group">群聊消息</option></select></label>
    <label>内容要求<textarea v-model="s.instruction" rows="4" maxlength="4000" :disabled="w.busy" /></label>
    <template v-if="s.kind==='fanfic'"><label>同人文搭档<select v-model="s.charId" :disabled="w.busy"><option value="">根据当前场景选择</option><option v-for="c in w.state?.characters" :key="c.id" :value="c.id">{{c.name}}</option></select></label></template>
  </article></div>
</section></template>
