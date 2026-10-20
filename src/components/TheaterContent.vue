<script setup lang="ts">
import StoryContent from './StoryContent.vue';
import {hasRenderableHtml} from '../domain/htmlRendering';
import {displayText} from '../domain/storyMarkup';
defineProps<{text:string}>();
</script>
<template><StoryContent v-if="hasRenderableHtml(displayText(text),true)" :text="displayText(text)" /><p v-else>{{displayText(text)}}</p></template>
