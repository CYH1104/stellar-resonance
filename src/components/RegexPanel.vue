<script setup lang="ts">
import SaveStatus from './SaveStatus.vue';
import {useAutoSave} from '../app/useAutoSave';
import DismissibleNotice from './DismissibleNotice.vue';
import {computed,ref,onMounted,onBeforeUnmount} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {cleanRegexRules,importRegexRules,regexPattern,type RegexRule} from '../domain/regex';
import {runRegex} from '../domain/regexRunner';
import HtmlMessageFrame from './HtmlMessageFrame.vue';
import {hasRenderableHtml} from '../domain/htmlRendering';
import FileImportButton from './FileImportButton.vue';
const matchLabel='{{match}}';
const props=defineProps<{w:ViewModel}>();
const open=ref(false),root=ref<HTMLElement>(),draft=ref<RegexRule>(),error=ref(''),sample=ref(''),preview=ref(''),testing=ref(false);
const rules=computed(()=>(props.w.preferences.regexRules||[]).filter(r=>!r.setId||r.setId===props.w.currentPreset));
function closeOutside(e:PointerEvent){if(root.value&&!e.composedPath().includes(root.value))open.value=false;}
function escape(e:KeyboardEvent){if(e.key==='Escape')open.value=false;}
onMounted(()=>{document.addEventListener('pointerdown',closeOutside);document.addEventListener('keydown',escape);});
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',closeOutside);document.removeEventListener('keydown',escape);});
async function edit(rule:RegexRule){await autoSave.flush();if(autoSave.error.value)return;draft.value=JSON.parse(JSON.stringify(rule));error.value='';preview.value='';autoSave.cancel();}
function add(){edit(cleanRegexRules([{id:crypto.randomUUID(),setId:props.w.currentPreset,scriptName:'新正则',findRegex:'',replaceString:'',placement:[2],markdownOnly:true}])[0]);}
async function save(){if(!draft.value||props.w.busy)return;try{regexPattern(draft.value.findRegex);const rule=cleanRegexRules([draft.value])[0],all=props.w.preferences.regexRules||=[],index=all.findIndex(r=>r.id===rule.id&&r.setId===rule.setId);if(index<0)all.push(rule);else all[index]=rule;props.w.problem='';await props.w.save();if(!props.w.problem)draft.value=undefined;else error.value=props.w.problem;}catch(e){error.value=e instanceof Error?e.message:'保存失败';}}
async function toggle(rule:RegexRule){rule.disabled=!rule.disabled;await props.w.save();}
async function remove(){if(!draft.value)return;const r=draft.value;props.w.preferences.regexRules=(props.w.preferences.regexRules||[]).filter(x=>x.id!==r.id||x.setId!==r.setId);draft.value=undefined;await props.w.save();}
async function importFile(event:Event){const input=event.target as HTMLInputElement;try{const file=input.files?.[0];if(!file)return;if(file.size>5*1024*1024)throw Error('文件最多5MB');const imported=importRegexRules(JSON.parse((await file.text()).replace(/^\uFEFF/,'')),props.w.currentPreset);if(!imported.length)throw Error('文件中没有正则规则');const all=props.w.preferences.regexRules||=[];if(all.length+imported.length>500)throw Error('正则规则最多500条');all.push(...imported.map(r=>({...r,id:crypto.randomUUID()})));await props.w.save();error.value='';}catch(e){error.value=e instanceof Error?e.message:'导入失败';}finally{input.value='';}}
function exportFile(){const url=URL.createObjectURL(new Blob([JSON.stringify(rules.value.map(({setId,...r})=>r),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='酒馆正则.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function test(){if(!draft.value)return;testing.value=true;error.value='';try{const result=await runRegex(sample.value,[{...draft.value,disabled:false}],{placement:draft.value.placement[0]||2,scope:draft.value.promptOnly&&!draft.value.markdownOnly?'prompt':'display',depth:0,user:props.w.active?.persona.name,char:'星穹学院'});preview.value=result.text;error.value=result.errors.join('；');}finally{testing.value=false;}}
function position(value:number,checked:boolean){if(!draft.value)return;draft.value.placement=checked?[...new Set([...draft.value.placement,value])]:draft.value.placement.filter(n=>n!==value);}
const autoSave=useAutoSave(()=>draft.value,async()=>{if(!draft.value?.findRegex||props.w.busy)return false;regexPattern(draft.value.findRegex);const rule=cleanRegexRules([draft.value])[0],all=props.w.preferences.regexRules||=[],index=all.findIndex(r=>r.id===rule.id&&r.setId===rule.setId);if(index<0)all.push(rule);else all[index]=rule;props.w.problem='';await props.w.save();if(props.w.problem)throw Error(props.w.problem);return true;},500,()=>props.w.busy);
async function closeEditor(){await autoSave.flush();if(autoSave.error.value)return;draft.value=undefined;autoSave.cancel();}
</script>
<template><div ref="root" class="regex-toolbar">
  <button type="button" :aria-expanded="open" aria-controls="regex-dropdown" @click="open=!open">正则</button>
  <section v-if="open" id="regex-dropdown" class="regex-dropdown surface" role="dialog" aria-label="正则管理">
    <header><strong>正则 · {{w.presetSets.find(s=>s.id===w.currentPreset)?.name||'当前预设'}}</strong><button type="button" aria-label="关闭正则面板" @click="open=false">×</button></header>
    <div class="actions"><button type="button" :disabled="w.busy" @click="add">新建正则</button><FileImportButton label="导入正则" accept=".json,application/json" :disabled="w.busy" @change="importFile" /><button type="button" @click="exportFile">导出正则</button></div>
    <p class="rail-note">开关立即保存；修改仅影响显示或下一次发送，原始正文和状态变量保留。HTML 代码块支持样式、交互脚本和自动高度；脚本在隔离页面运行。</p>
    <div class="regex-rule-list"><article v-for="r in rules" :key="r.id"><label class="toggle"><input type="checkbox" :checked="!r.disabled" :disabled="w.busy" @change="toggle(r)" />{{r.scriptName}}</label><small>{{r.markdownOnly&&r.promptOnly?'显示＋提示词':r.markdownOnly?'仅显示':r.promptOnly?'仅提示词':'显示＋提示词'}}</small><button type="button" @click="edit(r)">编辑</button></article><p v-if="!rules.length">当前预设没有正则，可新建或导入。</p></div>
    <form v-if="draft" class="regex-editor" @submit.prevent="save">
      <label>名称<input v-model="draft.scriptName" maxlength="200" /></label><label>查找正则<textarea v-model="draft.findRegex" rows="3" placeholder="/表达式/g" /></label><label>替换内容（支持 HTML、$1、$&lt;name&gt;、{{matchLabel}}）<textarea v-model="draft.replaceString" rows="6" /></label>
      <label>裁剪匹配文本（每行一个）<textarea :value="draft.trimStrings.join('\n')" rows="2" @input="draft.trimStrings=($event.target as HTMLTextAreaElement).value.split('\n').filter(Boolean)" /></label>
      <div class="actions"><label v-for="p in [{id:1,name:'用户消息'},{id:2,name:'AI 回复'},{id:3,name:'命令输出'},{id:5,name:'世界书'},{id:6,name:'推理字段'},{id:7,name:'小剧场（仅显示）'}]" :key="p.id" class="toggle"><input type="checkbox" :checked="draft.placement.includes(p.id)" @change="position(p.id,($event.target as HTMLInputElement).checked)" />{{p.name}}</label></div>
      <div class="actions"><label class="toggle"><input v-model="draft.markdownOnly" type="checkbox" />仅显示</label><label class="toggle"><input v-model="draft.promptOnly" type="checkbox" />仅提示词</label><label class="toggle"><input v-model="draft.runOnEdit" type="checkbox" />编辑时执行</label></div>
      <div class="field-grid"><label>最小深度<input v-model.number="draft.minDepth" type="number" min="-1" placeholder="不限" /></label><label>最大深度<input v-model.number="draft.maxDepth" type="number" min="-1" placeholder="不限" /></label><label>查找中的宏<select v-model.number="draft.substituteRegex"><option :value="0">不替换</option><option :value="1">直接替换</option><option :value="2">转义后替换</option></select></label></div>
      <p class="rail-note">小剧场勾选“小剧场（仅显示）”和“仅显示”，替换结果支持 HTML/CSS，只改变展示，不发送给模型。当前运行用户消息、AI 回复与提示词世界书位置；命令输出、推理字段仅保留配置。</p>
      <div class="actions"><SaveStatus :status="autoSave.status.value" :error="autoSave.error.value" :saved-at="autoSave.lastSaved.value" /><button type="button" @click="closeEditor">关闭</button><button type="button" class="danger" :disabled="w.busy" @click="remove">删除正则</button></div>
      <details><summary>测试替换</summary><textarea v-model="sample" rows="3" aria-label="正则测试文本" /><button type="button" :disabled="testing" @click="test">{{testing?'处理中…':'测试'}}</button><HtmlMessageFrame v-if="preview&&hasRenderableHtml(preview)" :content="preview" /><pre v-else>{{preview}}</pre></details>
    </form><DismissibleNotice :message="error" error />
  </section>
</div></template>
