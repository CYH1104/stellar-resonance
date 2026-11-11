<script setup lang="ts">
import {ref} from 'vue';
defineProps<{error?:unknown;retry?:()=>Promise<void>}>();
const working=ref(false),problem=ref('');
async function reload(retry?:()=>Promise<void>){if(!retry||working.value)return;working.value=true;problem.value='';try{await retry();}catch{problem.value='重新载入前保存未完成，请保留当前页面后重试。';}finally{working.value=false;}}
</script>
<template><section class="surface async-page-status" :role="error?'alert':'status'"><p>{{error?'人设页面资源未能加载，已保存的档案不会因此删除。':'正在加载人设档案…'}}</p><button v-if="error&&retry" type="button" :disabled="working" @click="reload(retry)">{{working?'正在保存并重新载入…':'重新载入页面'}}</button><p v-if="problem">{{problem}}</p></section></template>
