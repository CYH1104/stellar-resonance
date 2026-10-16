<script setup lang="ts">
defineProps<{modelValue:string|undefined;options:string[];label:string}>();
const emit=defineEmits<{ 'update:modelValue':[value:string] }>();
</script>
<template><div class="file-choice-chips" role="group" :aria-label="label"><button v-for="option in options" :key="option" type="button" :class="{'is-picked':modelValue===option}" :aria-pressed="modelValue===option" @click="emit('update:modelValue',option)">{{option}}</button></div></template>

