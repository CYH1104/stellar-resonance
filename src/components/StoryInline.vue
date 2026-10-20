<script setup lang="ts">
import {storyInline} from '../domain/storyMarkup';
defineProps<{text:string}>();
</script>
<template><component :is="part.strong?'strong':'span'" v-for="(part,i) in storyInline(text)" :key="i" :class="{'story-dialogue':part.dialogue}">{{part.text}}</component></template>
