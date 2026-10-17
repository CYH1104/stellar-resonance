<script setup lang="ts">
import {ref} from 'vue';
defineProps<{accept?:string;multiple?:boolean;disabled?:boolean}>();const emit=defineEmits<{change:[event:Event]}>();const input=ref<HTMLInputElement>();
</script>
<template><span class="file-import-control"><button type="button" :disabled="disabled" @click="input?.click()">导入文件</button><input ref="input" hidden type="file" :accept="accept" :multiple="multiple" :disabled="disabled" @change="emit('change',$event)" /></span></template>
