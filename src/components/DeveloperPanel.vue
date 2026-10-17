<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
defineProps<{w:ViewModel}>();
</script>
<template><section v-if="w.localService?.developerMode" class="developer-panel"><details><summary>开发者模式 · 请求诊断</summary><p class="muted">仅显示请求结构和执行阶段，不包含模型隐藏思维链、私有提示词或密钥。不额外调用模型。刷新页面后清空。</p><button @click="w.developerTraces=[]">清空诊断</button><p v-if="!w.developerTraces.length">生成剧情后可查看本轮诊断。</p><details v-for="(trace,i) in w.developerTraces" :key="i"><summary>{{trace.stage==='request'?'开始请求':'生成结束'}} · {{trace.model}} · {{trace.elapsedMs}} ms</summary><p>{{trace.stateAuxiliary?'已配置独立 MVU 副接口':'主接口合并输出'}} · {{trace.messages.length}} 条消息</p><ol><li v-for="message in trace.messages" :key="message.index">{{message.index}} · {{message.role}} · {{message.characters}} 字符</li></ol></details></details></section></template>
<style scoped>.developer-panel{border:1px solid var(--color-border);border-radius:8px;padding:10px;margin:10px 0}.developer-panel summary{cursor:pointer;color:var(--color-accent)}.developer-panel details details{margin-top:8px}.developer-panel ol{max-height:240px;overflow:auto;font:12px/1.8 monospace}.developer-panel button{padding:5px 10px}</style>
