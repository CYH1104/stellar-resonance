<script setup lang="ts">
import {computed} from 'vue';
import {narrativeLines} from '../domain/narrativeMarkdown';
const props=defineProps<{text:string}>();
const lines=computed(()=>narrativeLines(props.text));
</script>
<template><div class="narrative formatted-narrative"><template v-for="(line,index) in lines" :key="index"><hr v-if="line.kind==='rule'" /><div v-else class="narrative-line" :class="{'narrative-heading':line.kind==='heading'}"><template v-for="(span,i) in line.spans" :key="i"><strong v-if="span.kind==='strong'">{{span.text}}</strong><em v-else-if="span.kind==='em'">{{span.text}}</em><code v-else-if="span.kind==='code'">{{span.text}}</code><template v-else>{{span.text}}</template></template><br v-if="!line.spans.length" /></div></template></div></template>
<style scoped>.formatted-narrative{white-space:normal}.narrative-line{white-space:pre-wrap;overflow-wrap:anywhere;min-height:1em}.narrative-heading{font-weight:600;margin:.8em 0 .35em}.formatted-narrative hr{border:0;border-top:1px solid var(--color-border,#c8c0b5);margin:1em 0}.formatted-narrative strong{font-weight:600}.formatted-narrative code{font-family:monospace;white-space:pre-wrap}</style>
