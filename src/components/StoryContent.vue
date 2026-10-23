<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import StoryInline from './StoryInline.vue';
import HtmlMessageFrame from './HtmlMessageFrame.vue';
import {stripReasoning} from '../domain/reasoning';
import {runRegex} from '../domain/regexRunner';
import {builtinOutput} from '../domain/builtinOutput';
import {type HtmlRenderContext} from '../domain/htmlRendering';
import {type RegexRule,type RegexContext} from '../domain/regex';
import {storyBlocks} from '../domain/storyMarkup';
import {committedRenderText,renderChunks} from '../domain/renderChunks';
const props=defineProps<{text:string;streaming?:boolean;placeholder?:string;regexRules?:RegexRule[];regexContext?:RegexContext;highlighted?:boolean;htmlContext?:HtmlRenderContext;preserveLineBreaks?:boolean}>();
const formatted=ref<string>(),regexErrors=ref<string[]>([]);let formattedInput='';
const cleanText=computed(()=>stripReasoning(props.text));
const committed=computed(()=>committedRenderText(cleanText.value,props.streaming));
watch(()=>[committed.value,props.streaming,JSON.stringify(props.regexRules),JSON.stringify(props.regexContext)],(next,previous,cleanup)=>{
 if(!committed.value.startsWith(formattedInput)||next[2]!==previous?.[2]||next[3]!==previous?.[3]){formatted.value=undefined;formattedInput='';}regexErrors.value=[];if(!props.regexRules?.some(r=>!r.disabled&&r.placement.includes(props.regexContext?.placement||2)&&(!r.markdownOnly&&!r.promptOnly||r.markdownOnly))){formatted.value=undefined;formattedInput='';return;}
 if(!committed.value)return;
 const input=committed.value,controller=new AbortController(),timer=setTimeout(()=>{void runRegex(input,props.regexRules||[],props.regexContext||{placement:2,scope:'display'},controller.signal).then(result=>{if(controller.signal.aborted)return;formatted.value=result.text;formattedInput=input;regexErrors.value=result.errors;}).catch(()=>{});},0);
 cleanup(()=>{clearTimeout(timer);controller.abort();});
},{immediate:true});
// A worker result belongs to its input prefix, never to subsequently received text.
const visibleText=computed(()=>formatted.value!==undefined&&cleanText.value.startsWith(formattedInput)?formatted.value+cleanText.value.slice(formattedInput.length):cleanText.value);
const normalized=computed(()=>builtinOutput(visibleText.value,props.streaming,true));
const chunks=computed(()=>renderChunks(normalized.value.prose,true));
</script>
<template><div class="story-content">
  <template v-for="(chunk,chunkIndex) in chunks" :key="chunkIndex">
  <HtmlMessageFrame v-if="chunk.kind==='html'" :content="chunk.text" :context="htmlContext" :highlighted="highlighted" :preserve-line-breaks="preserveLineBreaks" />
  <template v-else v-for="(block,index) in storyBlocks(chunk.text,streaming)" :key="index">
    <p v-if="block.kind==='text'" class="narrative"><StoryInline :text="block.text" /></p>
    <section v-else-if="block.kind==='slate'" class="scene-slate" aria-label="场景信息">
      <div v-if="block.scene.sceneNo" class="scene-number">SCENE <span>{{block.scene.sceneNo}}</span></div>
      <h2 v-if="block.scene.title" class="scene-title">{{block.scene.title}}</h2>
      <p v-if="block.scene.englishTitle" class="scene-english-title">{{block.scene.englishTitle}}</p>
      <blockquote v-if="block.scene.quote" class="scene-quote"><StoryInline :text="block.scene.quote" /></blockquote>
      <dl v-if="block.scene.location||block.scene.time" class="scene-meta"><div v-if="block.scene.location"><dt>地点</dt><dd>{{block.scene.location}}</dd></div><div v-if="block.scene.time"><dt>时间</dt><dd>{{block.scene.time}}</dd></div></dl>
    </section>
    <p v-else class="scene-pending" role="status">正在整理场景信息…</p>
  </template>
  </template>
  <details v-for="(block,index) in normalized.blocks" :key="'builtin-'+index" class="builtin-output-card"><summary>{{block.title}}</summary><p class="narrative">{{block.text}}</p></details>
  <p v-if="regexErrors.length" class="rail-note" role="status">{{regexErrors.join('；')}}</p>
  <p v-if="!chunks.length&&!normalized.blocks.length&&placeholder" class="narrative">{{placeholder}}</p>
</div></template>
<style scoped>.builtin-output-card{border:1px solid var(--line,#b8b1a6);border-radius:8px;padding:12px;margin:12px 0}.builtin-output-card>p{max-height:360px;overflow:auto;white-space:pre-wrap}.builtin-output-card>summary{cursor:pointer}</style>
