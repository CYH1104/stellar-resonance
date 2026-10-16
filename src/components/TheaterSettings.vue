<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
import type {TheaterSetting} from '../domain/contracts';
import {theaterTemplates} from '../domain/theaters';
defineProps<{w:ViewModel;embedded?:boolean}>();
function template(slot:TheaterSetting,id:string){const value=theaterTemplates.find(t=>t.id===id);if(!value)return;slot.kind=value.kind;slot.title=value.name;slot.instruction=value.instruction;slot.templateId=value.id;}
</script>
<template><section :class="embedded?'subsection':'surface'">
  <header class="panel-heading"><div><p class="eyebrow">SIDE STORIES / 小剧场设置</p><h1>小剧场设置</h1></div><button :disabled="w.busy" @click="w.save()">保存设置</button></header>
  
  
  <p class="hint"><button type="button" @click="w.panel='settings'">前往 API 设置</button></p>
  <div class="theater-settings-grid"><article v-for="s in w.preferences.theaters" :key="s.slot" class="list-entry">
    <header class="panel-heading"><h2>位置 {{s.slot}} · {{s.slot===1?'论坛':s.slot===2?'群聊':'自定义'}}</h2><label class="toggle"><input v-model="s.enabled" type="checkbox" :disabled="w.busy" />开启</label></header>
    <label v-if="s.slot>=3">使用内置模板<select :disabled="w.busy" :value="s.templateId||''" @change="template(s,($event.target as HTMLSelectElement).value)"><option value="" disabled>选择模板或自行编辑</option><option v-for="t in theaterTemplates" :key="t.id" :value="t.id">{{t.name}}</option></select></label>
    <label>名称<input v-model="s.title" maxlength="80" :disabled="w.busy" /></label>
    <label v-if="s.slot>=3">小剧场类型<select v-model="s.kind" :disabled="w.busy" @change="s.templateId=undefined"><option value="custom">自定义文字</option><option value="fanfic">user × char 同人文</option></select></label>
    <label>内容要求<textarea v-model="s.instruction" rows="4" maxlength="4000" :disabled="w.busy" /></label>
    <template v-if="s.kind==='fanfic'"><label>同人文搭档<select v-model="s.charId" :disabled="w.busy"><option value="">根据当前场景选择</option><option v-for="c in w.state?.characters" :key="c.id" :value="c.id">{{c.name}}</option></select></label></template>
  </article></div>
</section></template>
