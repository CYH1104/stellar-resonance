<script setup lang="ts">
defineProps<{name:string}>();
const paths:Record<string,string>={home:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',chat:'M4 4h16v12H9l-5 5V4M8 8h8M8 12h5',friends:'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-2a7 7 0 0 1 14 0v2M18 6a3 3 0 0 1 0 6M19 16h4M21 14v4',calendar:'M4 5h16v16H4V5M8 2v6M16 2v6M4 10h16M8 14h2M14 14h2M8 18h2',crown:'m3 7 4 4 5-7 5 7 4-4-2 13H5L3 7ZM5 17h14',apps:'M3 3h7v7H3V3M14 3h7v7h-7V3M3 14h7v7H3v-7M14 14h7v7h-7v-7',user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 22v-2a8 8 0 0 1 16 0v2',star:'m12 2 2 8 8 2-8 2-2 8-2-8-8-2 8-2 2-8',send:'m3 3 19 9-19 9 4-9-4-9ZM7 12h15'};
</script>
<template><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name]||paths.star"/></svg></template>
