<script setup lang="ts">
import NativeWorldScope from './NativeWorldScope.vue';
defineProps<{entry:Record<string,any>;id:string;actors:{id:string;name:string}[];disabled?:boolean}>();
const switches=[['selective','启用次要关键词'],['useProbability','启用概率'],['excludeRecursion','排除后续递归扫描'],['preventRecursion','阻止触发进一步递归'],['ignoreBudget','忽略预算限制'],['groupOverride','优先选中此分组条目'],['matchPersonaDescription','扫描玩家人设'],['matchCharacterDescription','扫描世界卡描述'],['matchCharacterPersonality','扫描世界卡性格'],['matchCharacterDepthPrompt','扫描世界卡深度提示'],['matchScenario','扫描场景'],['matchCreatorNotes','扫描创作者备注']] as const;
const nullable=[['caseSensitive','区分大小写'],['matchWholeWords','完整词匹配'],['useGroupScoring','分组评分']] as const;
const numbers=[['scanDepth','扫描深度'],['delayUntilRecursion','递归延迟层数'],['groupWeight','分组权重'],['sticky','持续消息数'],['cooldown','冷却消息数'],['delay','首次启用前消息数']] as const;
const triggers=['normal','regenerate','continue','swipe','impersonate','quiet'];
function inherit(event:Event,entry:Record<string,any>,key:string){const v=(event.target as HTMLSelectElement).value;entry[key]=v===''?null:v==='true';}
function number(event:Event,entry:Record<string,any>,key:string){const v=(event.target as HTMLInputElement).value;entry[key]=v===''?null:Number(v);}
function trigger(entry:Record<string,any>,value:string,on:boolean){entry.triggers=on?[...new Set([...(entry.triggers||[]),value])]:(entry.triggers||[]).filter((v:string)=>v!==value);}
</script>
<template>
 <details class="advanced-world-entry"><summary>高级设置</summary><fieldset :disabled="disabled">
  <label>消息角色<select :aria-label="'世界书角色 '+id" :value="entry.role??0" @change="entry.role=Number(($event.target as HTMLSelectElement).value)"><option :value="0">系统</option><option :value="1">用户</option><option :value="2">助手</option></select></label>
  <label>次要关键词逻辑<select :aria-label="'次要关键词逻辑 '+id" :value="entry.selectiveLogic??0" @change="entry.selectiveLogic=Number(($event.target as HTMLSelectElement).value)"><option :value="0">至少匹配一个</option><option :value="1">并非全部匹配</option><option :value="2">全部不匹配</option><option :value="3">全部匹配</option></select></label>
  <div class="field-grid"><label v-for="[key,label] in numbers" :key="key">{{label}}<input :aria-label="label+' '+id" type="number" :min="key==='groupWeight'?1:0" :max="key==='groupWeight'?10000:100000" :step="key==='groupWeight'?'any':1" :value="entry[key]??''" placeholder="沿用默认" @change="number($event,entry,key)"/></label></div>
  <div class="field-grid"><label v-for="[key,label] in nullable" :key="key">{{label}}<select :aria-label="label+' '+id" :value="entry[key]==null?'':String(entry[key])" @change="inherit($event,entry,key)"><option value="">沿用默认</option><option value="true">开启</option><option value="false">关闭</option></select></label></div>
  <label>分组名称<input v-model="entry.group" :aria-label="'世界书分组 '+id" placeholder="多个分组用逗号分隔"/></label><label>Outlet 名称<input v-model="entry.outletName" :aria-label="'世界书 Outlet '+id"/></label>
  <label v-for="[key,label] in switches" :key="key" class="toggle"><input type="checkbox" :checked="entry[key]===true" :aria-label="label+' '+id" @change="entry[key]=($event.target as HTMLInputElement).checked"/>{{label}}</label>
  <fieldset><legend>生成类型（不选则不限制）</legend><label v-for="t in triggers" :key="t" class="toggle"><input type="checkbox" :aria-label="'触发类型 '+id+' '+t" :checked="entry.triggers?.includes(t)" @change="trigger(entry,t,($event.target as HTMLInputElement).checked)"/>{{t}}</label></fieldset>
  <details><summary>跨轮计数说明</summary><p>持续、冷却和首次延迟按消息计数，一轮通常包含两条消息。当前支持正文任务；请给记忆、终端等任务绑定不含这些效果的世界书。只有成功保存的正文会提交状态；重说、切换稿件、回溯和刷新分别沿用对应分支。编辑历史或人设后，旧效果会重新开始，原稿仍保留。</p></details>
  <NativeWorldScope :source="entry" :actors="actors" :disabled="disabled" inherit :label="'条目作用范围 '+id"/>
 </fieldset></details>
</template>
<style scoped>fieldset{border:0;padding:.5rem 0;min-width:0}.field-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:.75rem}label{margin:.5rem 0}select{max-width:100%}</style>
