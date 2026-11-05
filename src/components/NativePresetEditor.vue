<script setup lang="ts">
import {ref,watch,onMounted,onBeforeUnmount} from 'vue';
import {workspaceNativePresetEditor} from '../app/workspacePorts';
import type {NativePresetEditorSession} from '../native/presetEditor';
const props=defineProps<{preset:Record<string,any>;disabled:boolean;flushDraft:()=>Promise<void>}>();
const emit=defineEmits<{change:[preset:Record<string,any>]}>();
const host=ref<HTMLElement>(),problem=ref('');let session:NativePresetEditorSession|undefined,disposed=false;
onMounted(async()=>{try{session=await workspaceNativePresetEditor()!.mount(host.value!,props.preset,value=>emit('change',value),props.flushDraft);if(disposed){session.dispose();return;}session.disabled(props.disabled);}catch(e){problem.value=e instanceof Error?e.message:'原生编辑器打开失败，请刷新重试。';}});
watch(()=>JSON.stringify(props.preset),()=>{void session?.update(props.preset).catch(e=>{problem.value=e instanceof Error?e.message:'原生预设加载失败';});});
watch(()=>props.disabled,value=>session?.disabled(value));
onBeforeUnmount(()=>{disposed=true;session?.dispose();});
defineExpose({flush:()=>session?.flush()});
</script>
<template><p v-if="problem" class="error" role="alert">{{problem}}</p><div ref="host" class="native-preset-editor-host" /></template>
