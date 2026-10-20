<script setup lang="ts">
import {nextTick,onBeforeUnmount,onMounted,onUpdated,ref} from 'vue';
defineOptions({inheritAttrs:false});
const model=defineModel<string>();
const element=ref<HTMLTextAreaElement>();
function resize(){const el=element.value;if(!el)return;el.style.height='auto';el.style.height=el.scrollHeight+'px';}
let observer:ResizeObserver|undefined,lastWidth=-1;
onMounted(()=>{nextTick(resize);observer=new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width;if(width!==lastWidth){lastWidth=width;resize();}});if(element.value)observer.observe(element.value);});
onBeforeUnmount(()=>observer?.disconnect());
onUpdated(()=>nextTick(resize));
</script>
<template><textarea ref="element" v-model="model" v-bind="$attrs" @input="resize" /></template>
<style scoped>textarea{box-sizing:border-box;overflow-y:hidden;resize:none;white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;width:100%}</style>
