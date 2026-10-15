<script setup lang="ts">
import { onMounted, ref } from 'vue';
defineProps<{ title: string }>();
const emit=defineEmits<{close:[]}>();const dialog=ref<HTMLDialogElement>();
onMounted(()=>dialog.value?.showModal());
</script>
<template><dialog ref="dialog" class="dialog-shell" @cancel.prevent="emit('close')"><header class="dialog-heading"><h2>{{title}}</h2><button aria-label="关闭对话框" @click="emit('close')">关闭</button></header><slot /></dialog></template>
