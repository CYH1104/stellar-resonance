<script setup lang="ts">
defineProps<{enabled:boolean}>();
defineEmits<{toggle:[]}>();
</script>
<template>
 <button class="table-sound-toggle" type="button" :aria-label="enabled?'关闭音效':'打开音效'" :title="enabled?'音效已开，点击关闭':'音效已关，点击打开'" :aria-pressed="enabled" @click="$emit('toggle')">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
   <path d="M11 5 6 9H3v6h3l5 4Z"/>
   <template v-if="enabled"><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></template>
   <path v-else d="m16 9 5 6m0-6-5 6"/>
  </svg>
 </button>
</template>
<style>
#academy-workspace .pt button.table-sound-toggle{display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;min-height:32px!important;padding:5px!important;margin:0;border:1px solid #9fbeaf80!important;border-radius:50%!important;background:#14332ddd!important;color:#f3e8c8!important;line-height:1!important;cursor:pointer}
#academy-workspace .pt button.table-sound-toggle[aria-pressed="false"]{color:#aab4b2!important;background:#152827dd!important}
#academy-workspace .pt button.table-sound-toggle:focus-visible{outline:2px solid #f4ce78;outline-offset:2px}
.table-sound-toggle svg{width:20px;height:20px;flex-shrink:0}
</style>
