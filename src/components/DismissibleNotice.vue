<script setup lang="ts">
import {watch,onMounted} from 'vue';
import {publishNotice} from '../app/notices';
const props=defineProps<{message:string;error?:boolean}>();
let mounted=false;
function publish(){if(mounted&&props.message)publishNotice(props.message,!!props.error);}
watch(()=>[props.message,props.error],publish);
onMounted(()=>{mounted=true;publish();});
</script>
<template></template>
