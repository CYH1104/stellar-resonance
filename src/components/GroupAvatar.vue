<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import TerminalIcon from './TerminalIcon.vue';
const props=defineProps<{conversation:{avatar?:string;avatarPosition?:{x:number;y:number}};large?:boolean;position?:{x:number;y:number}}>();
const failed=ref(false);
watch(()=>[props.conversation.avatar,(props.conversation as {id?:string}).id],()=>{failed.value=false;});
const url=computed(()=>props.conversation.avatar||'');
const style=computed(()=>{const p=props.position||props.conversation.avatarPosition;return {objectFit:'cover' as const,objectPosition:`${p?.x??50}% ${p?.y??50}%`};});
</script>
<template><img v-if="url&&!failed" :src="url" :style="style" alt="群头像" referrerpolicy="no-referrer" @error="failed=true"><TerminalIcon v-else name="friends"/></template>
