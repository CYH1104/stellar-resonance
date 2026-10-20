<script setup lang="ts">
import {ref,watch,onMounted,onBeforeUnmount} from 'vue';
const props=defineProps<{message:string;error?:boolean}>();
const visible=ref(!!props.message);let mounted=false,timer:ReturnType<typeof setTimeout>|undefined;
function schedule(){clearTimeout(timer);visible.value=!!props.message;if(mounted&&props.message)timer=setTimeout(()=>visible.value=false,props.error?10000:6000);}
watch(()=>props.message,schedule);
onMounted(()=>{mounted=true;schedule();});onBeforeUnmount(()=>clearTimeout(timer));
</script>
<template><div v-if="message&&visible" :class="error?'error-banner':'hint'" :role="error?'alert':'status'"><span>{{message}}</span><button type="button" @click="visible=false">收起提示</button></div></template>
