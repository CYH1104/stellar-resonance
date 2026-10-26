<script setup lang="ts">
import {computed} from 'vue';
const props=defineProps<{status?:string;error?:string;savedAt?:string}>();
const text=computed(()=>{
 if(props.error)return '保存失败：'+props.error;
 const status=props.status||'尚未修改';
 if((status==='saved'||status==='已自动保存')&&props.savedAt){const date=new Date(props.savedAt);return '已保存 · '+(Number.isNaN(date.getTime())?'':date.toLocaleTimeString('zh-CN',{hour12:false}));}
 return ({idle:'尚未修改',pending:'待保存',saving:'保存中…',saved:'已保存',failed:'保存失败，请重试'} as Record<string,string>)[status]||status;
});
</script>
<template><small class="save-status" :class="{'save-status-error':error||status==='failed'}" role="status" aria-live="polite" aria-atomic="true">{{text}}</small></template>
<style scoped>.save-status{display:inline-block;font-size:12px;line-height:1.5;color:var(--muted,#8091a5);white-space:normal}.save-status-error{color:var(--danger,#bb6374)}</style>
