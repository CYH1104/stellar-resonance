<script setup lang="ts">
import {watch,onMounted} from 'vue';
import {showNotice} from '../app/notices';
const props=defineProps<{message:string;error?:boolean}>();
let mounted=false;
function publish(){if(mounted&&props.message)showNotice(props.message,!!props.error);}
watch(()=>[props.message,props.error],publish);
onMounted(()=>{mounted=true;publish();});
</script>
<template></template>
