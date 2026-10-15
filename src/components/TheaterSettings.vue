<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
import type {TheaterSetting} from '../domain/contracts';
import {theaterTemplates} from '../domain/theaters';
defineProps<{w:ViewModel;embedded?:boolean}>();
function template(slot:TheaterSetting,id:string){const value=theaterTemplates.find(t=>t.id===id);if(!value)return;slot.kind=value.kind;slot.title=value.name;slot.instruction=value.instruction;}
</script>
<template><section :class="embedded?'subsection':'surface'">
  <header class="panel-heading"><div><p class="eyebrow">SIDE STORIES / 小剧场设置</p><h1>右侧的四个故事窗口</h1></div><button :disabled="w.busy" @click="w.save()">保存设置</button></header>
  <p class="muted">最多同时展示4个：论坛、群聊、两个可自定义的小剧场。可分别开关；开启后从下一轮完整回复开始生成。小剧场是独立番外，不重复主线正文，也不推进主线状态。</p>
  <p class="hint">与主线在同一次模型回复中生成，会增加输出长度。若开启多个窗口后经常提示回复未完成，请在顶部“预设”中调高最大输出 Token。</p>
  <section class="subsection"><h2>论坛 AI 回复</h2><label class="toggle"><input v-model="w.preferences.forumReplyEnabled" type="checkbox" :disabled="w.busy" />发表论坛评论后，允许角色／NPC 回复我（默认关闭）</label><label v-if="w.preferences.forumReplyEnabled">回复使用的接口<select v-model="w.preferences.forumReplyProfile" :disabled="w.busy"><option :value="w.preferences.mainProfile">主 API</option><option v-for="p in w.auxiliaryProfiles" :key="p.id" :value="p.id" :disabled="!w.apiSelectable(p)">副 API · {{p.name}}</option></select></label><p class="muted">开启后，每条玩家评论额外调用所选接口一次，随机由一名 char 或校园 NPC 回复；可随时停止。关闭时只保存你的评论，不调用 AI。论坛回复不改变主线状态。</p></section>
  <div class="theater-settings-grid"><article v-for="s in w.preferences.theaters" :key="s.slot" class="list-entry">
    <header class="panel-heading"><h2>位置 {{s.slot}} · {{s.slot===1?'论坛':s.slot===2?'群聊':'自定义'}}</h2><label class="toggle"><input v-model="s.enabled" type="checkbox" :disabled="w.busy" />开启</label></header>
    <label v-if="s.slot>=3">使用内置模板<select :disabled="w.busy" :value="''" @change="template(s,($event.target as HTMLSelectElement).value)"><option value="" disabled>选择模板或自行编辑</option><option v-for="t in theaterTemplates" :key="t.id" :value="t.id">{{t.name}}</option></select></label>
    <label>名称<input v-model="s.title" maxlength="80" :disabled="w.busy" /></label>
    <label v-if="s.slot>=3">小剧场类型<select v-model="s.kind" :disabled="w.busy"><option value="custom">自定义文字</option><option value="fanfic">user × char 同人文</option></select></label>
    <label>内容要求<textarea v-model="s.instruction" rows="4" maxlength="4000" :disabled="w.busy" /></label>
    <template v-if="s.kind==='fanfic'"><label>同人文搭档<select v-model="s.charId" :disabled="w.busy"><option value="">根据当前场景选择</option><option v-for="c in w.state?.characters" :key="c.id" :value="c.id">{{c.name}}</option></select></label><p class="hint">主角固定为 user 与一名 char，不改变主线在场名单。BL 攻受、BG／GB 依据明确的第一性别和玩家人设中的配对偏好；缺资料时标记待补充并生成非亲密日常，不按 ABO 猜测。可在“设置 → 人物设置”中修改玩家偏好。</p></template>
  </article></div>
</section></template>
