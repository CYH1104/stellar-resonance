<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
import ApiSettings from './ApiSettings.vue';
defineProps<{w:ViewModel}>();
</script>
<template><section class="surface settings-view"><header class="panel-heading"><div><p class="eyebrow">API / 模型设置</p><h1>模型设置</h1></div></header><ApiSettings :w="w" /></section></template>
