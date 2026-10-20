<script setup lang="ts">
import {notices,dismissNotice} from '../app/notices';
</script>
<template><Teleport to="body"><aside class="academy-notice-stack" aria-label="操作提示"><div v-for="notice in notices" :key="notice.id" class="academy-notice" :class="{'is-error':notice.error}" :role="notice.error?'alert':'status'"><span>{{notice.message}}</span><button type="button" aria-label="收起提示" @click="dismissNotice(notice.id)">收起</button></div></aside></Teleport></template>
<style>
.academy-notice-stack{position:fixed;top:76px;right:16px;z-index:2147483000;display:flex;flex-direction:column;gap:10px;width:min(400px,calc(100vw - 32px));max-height:calc(100dvh - 100px);overflow:auto;pointer-events:none;font-size:14px}
.academy-notice{display:flex;align-items:flex-start;gap:14px;padding:14px 16px;border:1px solid #bdcad5;border-radius:12px;background:#fffaf3;color:#294a68;box-shadow:0 8px 24px #0002;pointer-events:auto;line-height:1.6}
.academy-notice>span{flex:1;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}.academy-notice>button{flex:none;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:2px 4px}
.academy-notice.is-error{background:#fff7f3;color:#9f4047;border-color:#b86a70}body[data-academy-theme=dark] .academy-notice{background:#252b33;color:#c2d7eb;border-color:#61758b}body[data-academy-theme=dark] .academy-notice.is-error{background:#2d2026;color:#f0b8bd;border-color:#bd777e}
</style>
