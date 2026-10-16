<script setup lang="ts">
import { onMounted, ref } from 'vue';
const props=defineProps<{ title: string; closeOnOutside?:boolean }>();
const emit=defineEmits<{close:[]}>();const dialog=ref<HTMLDialogElement>();
onMounted(()=>dialog.value?.showModal());
function outside(event:MouseEvent){if(!props.closeOnOutside||event.target!==dialog.value)return;const rect=dialog.value.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)emit('close');}
</script>
<template><dialog ref="dialog" class="dialog-shell" @click="outside" @cancel.prevent="emit('close')"><header class="dialog-heading"><h2>{{title}}</h2><button aria-label="关闭对话框" @click="emit('close')">关闭</button></header><slot /></dialog></template>
