<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import {stripReasoning} from '../domain/reasoning';
import {runRegex} from '../domain/regexRunner';
import HtmlMessageFrame from './HtmlMessageFrame.vue';
import {type HtmlRenderContext} from '../domain/htmlRendering';
import {type RegexRule,type RegexContext} from '../domain/regex';
import {storyBlocks} from '../domain/storyMarkup';
import {committedRenderText,renderChunks} from '../domain/renderChunks';
const props=defineProps<{text:string;streaming?:boolean;placeholder?:string;regexRules?:RegexRule[];regexContext?:RegexContext;highlighted?:boolean;htmlContext?:HtmlRenderContext}>();
const formatted=ref<string>(),regexErrors=ref<string[]>([]);let formattedInput='';
const cleanText=computed(()=>stripReasoning(props.text));
const committed=computed(()=>committedRenderText(cleanText.value,props.streaming));
watch(()=>[committed.value,props.streaming,JSON.stringify(props.regexRules),JSON.stringify(props.regexContext)],(next,previous,cleanup)=>{
 if(!committed.value.startsWith(formattedInput)||next[2]!==previous?.[2]||next[3]!==previous?.[3]){formatted.value=undefined;formattedInput='';}regexErrors.value=[];if(!props.regexRules?.some(r=>!r.disabled&&r.placement.includes(props.regexContext?.placement||2)&&(!r.markdownOnly&&!r.promptOnly||r.markdownOnly))){formatted.value=undefined;formattedInput='';return;}
 if(!committed.value)return;
 const input=committed.value,controller=new AbortController(),timer=setTimeout(()=>{void runRegex(input,props.regexRules||[],props.regexContext||{placement:2,scope:'display'},controller.signal).then(result=>{if(controller.signal.aborted)return;formatted.value=result.text;formattedInput=input;regexErrors.value=result.errors;}).catch(()=>{});},0);
 cleanup(()=>{clearTimeout(timer);controller.abort();});
},{immediate:true});
const chunks=computed(()=>renderChunks(formatted.value??committed.value,formatted.value!==undefined));
const pending=computed(()=>cleanText.value.slice(committed.value.length).split(/```|<(?=[\p{L}_!/])/u)[0]);
</script>
<template><div class="story-content">
  <template v-for="(chunk,chunkIndex) in chunks" :key="chunkIndex">
  <HtmlMessageFrame v-if="chunk.kind==='html'" :content="chunk.text" :context="htmlContext" :highlighted="highlighted" />
  <template v-for="(block,index) in chunk.kind==='html'?[]:storyBlocks(chunk.text,false)" :key="index">
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
  </template>
  <p v-if="pending.trim()" class="narrative">{{pending}}</p>
  <p v-if="regexErrors.length" class="rail-note" role="status">{{regexErrors.join('；')}}</p>
  <p v-if="!chunks.length&&!pending.trim()&&placeholder" class="narrative">{{placeholder}}</p>
</div></template>
