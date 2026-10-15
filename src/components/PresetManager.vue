<script setup lang="ts">
import {computed,ref} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Preset} from '../domain/contracts';
const props=defineProps<{w:ViewModel}>(),expanded=ref<Record<string,boolean>>({});
function expand(p:Preset){p.role||='system';p.position||='before';p.depth??=4;p.order??=100;expanded.value[p.id]=!expanded.value[p.id];}
const main=computed(()=>props.w.preferences.profiles.find(p=>p.id===(props.w.preferences.storyProfile||props.w.preferences.mainProfile))!);
async function importFile(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;try{if(file.size>5*1024*1024)throw new Error('预设文件最多5MB');props.w.importPreset(await file.text(),file.name);}catch(e){props.w.problem=e instanceof Error?e.message:'无法读取预设文件';}finally{input.value='';}}
function rename(name:string){for(const p of props.w.presetEntries){p.setId=props.w.currentPreset;p.setName=name;}}
function trigger(p:Preset,value:string){p.triggers=value==='all'?[]:value==='normal'?['normal']:['regenerate'];}
const triggerValue=(p:Preset)=>!p.triggers?.length?'all':p.triggers.length===1&&p.triggers[0]==='normal'?'normal':p.triggers.length===1&&p.triggers[0]==='regenerate'?'regenerate':'imported';
</script>
<template>
  <section class="subsection preset-manager">
    <header class="panel-heading"><div><h2>预设管理</h2><p class="muted">导入酒馆预设文件后，直接管理提示词条目。</p></div><button :disabled="w.busy" @click="w.addPresetSet()">新建预设</button></header>
    <div class="field-grid"><label>当前使用的预设<select v-model="w.preferences.activePreset" :disabled="w.busy"><option v-for="s in w.presetSets" :key="s.id" :value="s.id">{{s.name}}</option></select></label><label>修改预设名称<input :value="w.presetSets.find(s=>s.id===w.currentPreset)?.name" maxlength="180" :disabled="w.busy" @input="rename(($event.target as HTMLInputElement).value)" /></label></div>
    <p class="muted">共 {{w.presetEntries.length}} 条，已开启 {{w.presetEntries.filter(p=>p.enabled).length}} 条。未开启的条目仍会保存，生成时不发送。</p>
    <div class="actions"><label class="file-button">导入酒馆预设文件<input type="file" accept=".json,application/json" :disabled="w.busy" @change="importFile" /></label><button :disabled="w.busy" @click="w.exportPreset()">导出当前预设</button><button :disabled="w.busy" @click="w.addPresetEntry()">新增条目</button><button :disabled="w.busy" @click="w.removePresetSet()">移除当前预设</button></div>
    <p class="hint">支持 Chat Completion 预设的提示词、启停、顺序、System／User／Assistant、历史前后及深度注入。服务器必需的人设、世界观和输出协议始终保留；脚本、正则和复杂宏不执行。</p>
    <details v-if="w.presetWarnings.length" class="import-report" open><summary>最近导入说明</summary><ul><li v-for="(note,i) in w.presetWarnings" :key="i">{{note}}</li></ul></details>
    <details class="import-report"><summary>当前剧情接口的采样参数</summary><div class="field-grid"><label>Temperature<input v-model.number="main.temperature" type="number" min="0" max="2" step="0.05" :disabled="w.busy" /></label><label>最大输出 Token<input v-model.number="main.maxTokens" type="number" min="1" max="32000" :disabled="w.busy" /></label><label>Top P<input v-model.number="main.topP" type="number" min="0" max="1" step="0.05" placeholder="默认1" :disabled="w.busy" /></label><label>Frequency penalty<input v-model.number="main.frequencyPenalty" type="number" min="-2" max="2" step="0.1" placeholder="默认0" :disabled="w.busy" /></label><label>Presence penalty<input v-model.number="main.presencePenalty" type="number" min="-2" max="2" step="0.1" placeholder="默认0" :disabled="w.busy" /></label></div></details>
    <div class="prompt-list">
      <article v-for="(p,i) in w.presetEntries" :key="p.id" class="prompt-item">
        <header class="prompt-row"><label class="toggle"><input v-model="p.enabled" type="checkbox" :disabled="w.busy" />{{i+1}}</label><button class="prompt-title" :aria-expanded="!!expanded[p.id]" @click="expand(p)">{{p.name||'未命名条目'}}</button><span class="tag">{{p.marker?'服务器占位':(p.role||'system')}}</span><button :disabled="w.busy||i===0" @click="w.movePreset(i,-1)">↑</button><button :disabled="w.busy||i===w.presetEntries.length-1" @click="w.movePreset(i,1)">↓</button></header>
        <div v-if="expanded[p.id]" class="prompt-editor">
          <p v-if="p.marker" class="hint">{{p.identifier}}：对应资料由服务器统一组织。这类占位项不保存作者原文；关闭占位条目不会撤掉服务器必需的设定。</p>
          <div class="field-grid"><label>条目名称<input v-model="p.name" :disabled="w.busy||p.marker" maxlength="200" /></label><label>角色<select v-model="p.role" :disabled="w.busy||p.marker"><option value="system">System</option><option value="user">User</option><option value="assistant">Assistant</option></select></label></div>
          <template v-if="!p.marker"><label>提示词内容<textarea v-model="p.content" rows="5" maxlength="50000" :disabled="w.busy" /></label><div class="field-grid"><label>注入位置<select v-model="p.position" :disabled="w.busy"><option value="before">聊天历史之前</option><option value="after">当前输入之后</option><option value="in-chat">聊天历史内（按深度）</option></select></label><label>触发时机<select :value="triggerValue(p)" :disabled="w.busy" @change="trigger(p,($event.target as HTMLSelectElement).value)"><option value="all">正常回复与重演</option><option value="normal">仅正常回复</option><option value="regenerate">仅重演／重试</option><option v-if="triggerValue(p)==='imported'" value="imported" disabled>导入的其他触发类型（当前不执行）</option></select></label><template v-if="p.position==='in-chat'"><label>深度<input v-model.number="p.depth" type="number" min="0" max="10000" :disabled="w.busy" /></label><label>相同深度的顺序<input v-model.number="p.order" type="number" min="0" max="10000" :disabled="w.busy" /></label></template></div><small class="muted">深度0在当前输入之后，1在当前输入之前。支持替换玩家和当前场景角色名称占位。</small><div class="actions"><button :disabled="w.busy" @click="w.preferences.presets=w.preferences.presets.filter(x=>x.id!==p.id)">删除条目</button></div></template>
        </div>
      </article>
    </div>
    <p v-if="!w.presetEntries.length" class="empty">当前预设没有条目，可以新增或导入。</p>
  </section>
</template>
