<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import TerminalIcon from './TerminalIcon.vue';
const props=defineProps<{conversation:{avatar?:string};large?:boolean}>();
const failed=ref(false);
watch(()=>[props.conversation.avatar,(props.conversation as {id?:string}).id],()=>{failed.value=false;});
const url=computed(()=>props.conversation.avatar||'');
</script>
<template><img v-if="url&&!failed" :src="url" alt="群头像" referrerpolicy="no-referrer" @error="failed=true"><TerminalIcon v-else name="friends"/></template>
