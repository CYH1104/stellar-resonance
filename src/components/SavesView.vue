<script setup lang="ts">
import { ref } from 'vue';import type { ViewModel } from '../app/useWorkspace';import { parseWorkspaceBackup } from '../domain/cloudBackup';
import SaveList from './SaveList.vue';
const props=defineProps<{w:ViewModel}>();const fileInput=ref<HTMLInputElement>();
async function readFile(event:Event){const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;try{const text=await file.text();parseWorkspaceBackup(text);props.w.problem='';await props.w.importBackup(text,false);}catch(e){props.w.problem=e instanceof Error?e.message:'文件读取失败';}(event.target as HTMLInputElement).value='';}
</script>
<template><section class="surface"><p class="eyebrow">SAVES / 存档</p><h1>存档</h1><div class="actions"><button class="primary" :disabled="w.backupWorking" @click="w.exportBackup()">导出全部备份</button><button :disabled="!w.active" @click="w.exportBook()">导出当前故事</button></div>
  <div class="backup-import"><button type="button" :disabled="w.backupWorking||w.busy||w.workingMemory" @click="fileInput?.click()">导入文件</button><input ref="fileInput" type="file" accept=".json,application/json" hidden @change="readFile" /></div>
  <section class="subsection"><h2>本机存档列表</h2><SaveList :w="w" open-label="进入存档" /><p v-if="!w.sessions.length" class="empty">还没有存档。</p></section>
</section></template>
