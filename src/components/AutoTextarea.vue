<script setup lang="ts">
import {onBeforeUnmount,onMounted,watch,ref} from 'vue';
import {resizeTextarea} from '../app/resizeTextarea';
defineOptions({inheritAttrs:false});
const model=defineModel<string>();
const element=ref<HTMLTextAreaElement>();
let resizeFrame=0;const composing=ref(false);
function resize(){if(resizeFrame)return;resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;if(element.value&&!composing.value)resizeTextarea(element.value);});}
let observer:ResizeObserver|undefined,lastWidth=-1;
onMounted(()=>{resize();observer=new ResizeObserver(entries=>{const width=entries[0]?.contentRect.width;if(width!==lastWidth){lastWidth=width;resize();}});if(element.value)observer.observe(element.value);});
onBeforeUnmount(()=>{observer?.disconnect();cancelAnimationFrame(resizeFrame);});
watch(()=>model.value,resize,{flush:'post'});
</script>
<template><textarea ref="element" v-model="model" v-bind="$attrs" @input="resize" @compositionstart="composing=true" @compositionend="composing=false;resize()" /></template>
<style scoped>textarea{box-sizing:border-box;overflow-y:hidden;resize:none;white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;width:100%}</style>
