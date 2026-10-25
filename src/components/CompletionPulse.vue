<script setup lang="ts">
import {onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {generationCompletion} from '../app/generationCompletion';
const visible=ref(false);let hideTimer:ReturnType<typeof setTimeout>|undefined,originalTitle='',titleChanged=false;
watch(()=>generationCompletion.id,()=>{
 if(!generationCompletion.id)return;
 visible.value=true;
 clearTimeout(hideTimer);
 hideTimer=setTimeout(()=>{visible.value=false;},2600);
 if(document.visibilityState==='hidden'){
  if(!titleChanged){originalTitle=document.title;titleChanged=true;}
  document.title='生成完成 · '+originalTitle;
 }
});
function restoreTitle(){if(!titleChanged)return;document.title=originalTitle;titleChanged=false;}
function onVisibility(){if(document.visibilityState==='visible')restoreTitle();}
onMounted(()=>{document.addEventListener('visibilitychange',onVisibility);window.addEventListener('focus',restoreTitle);});
onBeforeUnmount(()=>{clearTimeout(hideTimer);restoreTitle();document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('focus',restoreTitle);});
</script>
<template>
 <div v-if="visible" :key="generationCompletion.id" class="completion-pulse" role="status" aria-live="polite">
  <span class="completion-pulse-label">本轮生成已完成</span>
 </div>
</template>
<style scoped>
.completion-pulse{position:fixed;inset:0;z-index:90;pointer-events:none;border:3px solid rgba(120,175,255,.78);box-shadow:inset 0 0 0 1px rgba(142,190,255,.28),inset 0 0 32px rgba(120,170,255,.3);animation:completion-pulse 0.76s ease-in-out 3}
.completion-pulse-label{position:absolute;top:16px;left:50%;transform:translateX(-50%);padding:5px 14px;border:1px solid rgba(120,175,255,.5);border-radius:999px;background:rgba(255,250,243,.94);color:#526a86;font-size:12px;letter-spacing:.06em;box-shadow:0 4px 16px rgba(60,100,160,.12);white-space:nowrap}
@keyframes completion-pulse{0%,100%{opacity:0}38%{opacity:1}}
@media(max-width:480px){.completion-pulse{border-width:1.5px;box-shadow:inset 0 0 0 1px rgba(142,190,255,.16),inset 0 0 18px rgba(120,170,255,.18)}}
@media(prefers-reduced-motion:reduce){.completion-pulse{animation:none;opacity:1;border-color:rgba(142,190,255,.4);box-shadow:inset 0 0 0 1px rgba(142,190,255,.14)}}
</style>
