<script setup lang="ts">
import {ref,watch,nextTick,onMounted} from 'vue';
const props=defineProps<{revision:string}>();
const feed=ref<HTMLElement>();
async function latest(){await nextTick();if(feed.value){const target=feed.value.querySelector<HTMLElement>('.phone-chat-messages')||feed.value;target.scrollTop=target.scrollHeight;}}
function earliest(){(feed.value?.querySelector<HTMLElement>('.phone-chat-messages')||feed.value)?.scrollTo({top:0,behavior:'instant'});}
onMounted(latest);watch(()=>props.revision,latest);
</script>
<template><div class="theater-scroll"><div class="theater-scroll-tools"><button type="button" @click="earliest">↑ 最早</button><button type="button" @click="latest">最新 ↓</button></div><div ref="feed" class="theater-scroll-body"><slot /></div></div></template>
