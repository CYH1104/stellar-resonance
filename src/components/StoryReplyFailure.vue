<script setup lang="ts">
import {computed} from 'vue';
import type {FormatErrorRecord} from '../storage/formatErrors';
const props=withDefaults(defineProps<{sessionId:string;turnId:string;variantId:string;records?:FormatErrorRecord[];disabled?:boolean}>(),{records:()=>[]});
defineEmits<{logs:[];retry:[]}>();
const failure=computed(()=>{const rows=props.records.filter(r=>r.sessionId===props.sessionId&&r.turnId===props.turnId&&r.variantId===props.variantId);return rows.find(r=>r.code==='HTTP_ERROR')||rows.find(r=>r.code==='GENERATION_INCOMPLETE');});
</script>
<template><section class="reply-request-error" role="alert"><p>本轮未收到正文，输入和已有记录已保留。</p><p v-if="failure" class="reply-request-detail">{{failure.raw}}</p><p v-else>请查看本轮运行日志，确认请求是否被接口拒绝。</p><div class="actions"><button type="button" @click="$emit('logs')">查看本轮日志</button><button type="button" :disabled="disabled" @click="$emit('retry')">重新生成</button></div></section></template>
<style scoped>.reply-request-error{margin:12px 0;padding:10px 0;border-top:1px solid var(--color-border);color:var(--color-text)}.reply-request-detail{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-height:240px;overflow:auto}.actions{display:flex;flex-wrap:wrap;gap:10px}</style>
