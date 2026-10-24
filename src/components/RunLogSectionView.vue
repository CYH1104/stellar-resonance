<script setup lang="ts">
import RunVariableChanges from './RunVariableChanges.vue';
import type {RunLogSection} from '../domain/runLogSections';
defineProps<{section:RunLogSection}>();
</script>
<template><details class="run-log-section" :open="section.kind==='errors'"><summary>{{section.title}}</summary><pre v-if="section.text">{{section.text}}</pre><ul v-if="section.details?.length"><li v-for="(detail,i) in section.details" :key="i">{{detail}}</li></ul><RunVariableChanges v-if="section.variables" :value="section.variables"/></details></template>
<style scoped>.run-log-section{padding:8px 0;border-bottom:0}summary{cursor:pointer;font-size:13px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:60dvh;overflow:auto;font:13px/1.8 monospace}</style>
