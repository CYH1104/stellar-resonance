<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import {stripReasoning} from '../domain/reasoning';
import {runRegex} from '../domain/regexRunner';
import HtmlMessageFrame from './HtmlMessageFrame.vue';
import {hasRenderableHtml,type HtmlRenderContext} from '../domain/htmlRendering';
import {type RegexRule,type RegexContext} from '../domain/regex';
import {storyBlocks} from '../domain/storyMarkup';
const props=defineProps<{text:string;streaming?:boolean;placeholder?:string;regexRules?:RegexRule[];regexContext?:RegexContext;highlighted?:boolean;htmlContext?:HtmlRenderContext}>();
const formatted=ref<string>(),regexErrors=ref<string[]>([]);
watch(()=>[props.text,JSON.stringify(props.regexRules),JSON.stringify(props.regexContext)],(_,__,cleanup)=>{
 formatted.value=undefined;regexErrors.value=[];if(!props.regexRules?.some(r=>!r.disabled&&r.placement.includes(props.regexContext?.placement||2)&&(!r.markdownOnly&&!r.promptOnly||r.markdownOnly)))return;
 const controller=new AbortController(),timer=setTimeout(()=>{void runRegex(stripReasoning(props.text),props.regexRules||[],props.regexContext||{placement:2,scope:'display'},controller.signal).then(result=>{formatted.value=result.text;regexErrors.value=result.errors;}).catch(()=>{});},props.streaming?100:0);
 cleanup(()=>{clearTimeout(timer);controller.abort();});
},{immediate:true});
const blocks=computed(()=>storyBlocks(formatted.value??props.text,props.streaming));
const html=computed(()=>{const source=stripReasoning(formatted.value??props.text);return hasRenderableHtml(source,formatted.value!==undefined)?source:'';});
</script>
<template><div class="story-content">
  <HtmlMessageFrame v-if="html" :content="html" :context="htmlContext" :highlighted="highlighted" />
  <template v-for="(block,index) in html?[]:blocks" :key="index">
    <p v-if="block.kind==='text'" class="narrative">{{block.text}}</p>
    <section v-else-if="block.kind==='slate'" class="scene-slate" aria-label="场景信息">
      <div v-if="block.scene.sceneNo" class="scene-number">SCENE <span>{{block.scene.sceneNo}}</span></div>
      <h2 v-if="block.scene.title" class="scene-title">{{block.scene.title}}</h2>
      <p v-if="block.scene.englishTitle" class="scene-english-title">{{block.scene.englishTitle}}</p>
      <blockquote v-if="block.scene.quote" class="scene-quote">{{block.scene.quote}}</blockquote>
      <dl v-if="block.scene.location||block.scene.time" class="scene-meta"><div v-if="block.scene.location"><dt>地点</dt><dd>{{block.scene.location}}</dd></div><div v-if="block.scene.time"><dt>时间</dt><dd>{{block.scene.time}}</dd></div></dl>
    </section>
    <p v-else class="scene-pending" role="status">正在整理场景信息…</p>
  </template>
  <p v-if="regexErrors.length" class="rail-note" role="status">{{regexErrors.join('；')}}</p>
  <p v-if="!blocks.length&&placeholder" class="narrative">{{placeholder}}</p>
</div></template>
