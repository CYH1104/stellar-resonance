<script setup lang="ts">
import {computed,inject,ref,watch} from 'vue';
import StoryContent from './StoryContent.vue';
import {hasRenderableHtml} from '../domain/htmlRendering';
import {displayText} from '../domain/storyMarkup';
import {runRegex} from '../domain/regexRunner';
import {theaterRegexKey} from '../app/theaterRegex';
const props=defineProps<{text:string}>();
const settings=inject(theaterRegexKey,undefined),formatted=ref<string>(),errors=ref<string[]>([]);
const source=computed(()=>displayText(props.text)),visible=computed(()=>formatted.value??source.value);
watch(()=>[source.value,settings?.value] as const,([text,config],_,cleanup)=>{
 formatted.value=undefined;errors.value=[];if(!config?.rules.some(r=>!r.disabled&&r.placement.includes(7)&&(!r.promptOnly||r.markdownOnly)))return;
 const controller=new AbortController();cleanup(()=>controller.abort());
 void runRegex(text,config.rules,config.context,controller.signal).then(result=>{if(!controller.signal.aborted){formatted.value=result.text;errors.value=result.errors;}}).catch(()=>{});
},{immediate:true,deep:true});
</script>
<template><div class="theater-rendered-content"><StoryContent v-if="hasRenderableHtml(visible,true)" :text="visible" /><p v-else>{{visible}}</p><p v-if="errors.length" class="rail-note" role="status">{{errors.join('；')}}</p></div></template>
