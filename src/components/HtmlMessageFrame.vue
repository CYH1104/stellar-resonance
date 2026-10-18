<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {htmlRenderDocument,type HtmlRenderContext} from '../domain/htmlRendering';
const props=defineProps<{content:string;context?:HtmlRenderContext;highlighted?:boolean}>();
const frame=ref<HTMLIFrameElement>(),height=ref(180),errors=ref<string[]>([]),raw=ref(false);
const channel='academy-html-'+crypto.randomUUID();
const document=computed(()=>htmlRenderDocument(props.content,channel,props.context,props.highlighted,typeof location==='undefined'?'':location.origin));
function message(event:MessageEvent){
 if(event.source!==frame.value?.contentWindow||event.data?.channel!==channel)return;
 if(event.data.kind==='height'&&typeof event.data.height==='number'&&Number.isFinite(event.data.height))height.value=Math.max(40,Math.min(20000,Math.ceil(event.data.height)));
 if(event.data.kind==='error'&&typeof event.data.message==='string'&&errors.value.length<8&&!errors.value.includes(event.data.message))errors.value.push(event.data.message.slice(0,300));
}
watch(()=>props.content,()=>{errors.value=[];raw.value=false;});
watch(()=>props.context,context=>frame.value?.contentWindow?.postMessage({channel,kind:'context',context:JSON.parse(JSON.stringify(context||{}))},'*'),{deep:true});
onMounted(()=>window.addEventListener('message',message));onBeforeUnmount(()=>window.removeEventListener('message',message));
</script>
<template><div class="html-message-renderer"><iframe ref="frame" class="regex-html-frame interactive-html-frame" sandbox="allow-scripts" :srcdoc="document" :style="{height:height+'px'}" title="HTML 美化内容" referrerpolicy="no-referrer" /><details v-if="errors.length" class="rail-note"><summary>美化脚本提示（{{errors.length}}）</summary><p v-for="error in errors" :key="error">{{error}}</p></details><button class="html-source-toggle" type="button" @click="raw=!raw">{{raw?'收起原文':'查看原文'}}</button><pre v-if="raw" class="html-source-text">{{content}}</pre></div></template>
