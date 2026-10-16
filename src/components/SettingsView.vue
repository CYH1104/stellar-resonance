<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
import ApiSettings from './ApiSettings.vue';
defineProps<{w:ViewModel}>();
const emit=defineEmits<{saved:[]}>();
</script>
<template><section class="surface settings-view"><header class="panel-heading"><div><p class="eyebrow">API / API 设置</p><h1>API 设置</h1></div></header><ApiSettings :w="w" @saved="emit('saved')" /></section></template>
