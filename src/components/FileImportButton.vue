<script setup lang="ts">
import {ref} from 'vue';
withDefaults(defineProps<{accept?:string;multiple?:boolean;disabled?:boolean;label?:string}>(),{label:'导入文件'});const emit=defineEmits<{change:[event:Event]}>();const input=ref<HTMLInputElement>();
</script>
<template><span class="file-import-control"><button type="button" :disabled="disabled" @click="input?.click()">{{label}}</button><input ref="input" hidden type="file" :accept="accept" :aria-label="label" :multiple="multiple" :disabled="disabled" @change="emit('change',$event)" /></span></template>
