<script setup lang="ts">
const props=withDefaults(defineProps<{lines:{id:string;text:string}[];name:(id:string)=>string;label?:string}>(),{label:'游戏对话'});
</script>
<template><div v-if="props.lines.length" class="game-chat" role="log" :aria-label="props.label" aria-live="off"><p v-for="(line,index) in props.lines" :key="index"><strong>{{props.name(line.id)}}：</strong>{{line.text}}</p></div></template>
<style scoped>.game-chat{min-width:0;max-width:100%;overflow-wrap:anywhere}.game-chat p{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}.game-chat strong{font-weight:650}</style>
