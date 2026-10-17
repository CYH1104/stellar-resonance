<script setup lang="ts">
import {ref,watch,nextTick,onMounted} from 'vue';
const props=defineProps<{revision:string}>();
const feed=ref<HTMLElement>();
function scrollTargets(){if(!feed.value)return [];return [feed.value,...feed.value.querySelectorAll<HTMLElement>('.resizable-panel-body,.phone-chat-messages,.forum-feed')].filter(el=>el===feed.value||/auto|scroll/.test(getComputedStyle(el).overflowY));}
async function latest(){await nextTick();for(const target of scrollTargets())target.scrollTop=target.scrollHeight;}
function earliest(){for(const target of scrollTargets())target.scrollTop=0;}
onMounted(latest);watch(()=>props.revision,latest);
</script>
<template><div class="theater-scroll"><div class="theater-scroll-tools"><button type="button" @click="earliest">↑ 最早</button><button type="button" @click="latest">最新 ↓</button></div><div ref="feed" class="theater-scroll-body"><slot /></div></div></template>
