<script setup lang="ts">
import {computed,ref,onBeforeUnmount} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import GroupChatPhone from './GroupChatPhone.vue';
const props=defineProps<{w:ViewModel}>();
const group=computed(()=>props.w.preferences.theaters?.find(t=>t.enabled&&t.kind==='group'));
const scene=computed(()=>props.w.theaters.find(t=>t.slot===group.value?.slot&&t.kind==='group'));
const open=ref(false),x=ref(typeof window==='undefined'?20:innerWidth-76),y=ref(typeof window==='undefined'?20:innerHeight-100);
let drag:{id:number;x:number;y:number;left:number;top:number}|undefined,moved=false;
const size=()=>({width:open.value?Math.min(360,innerWidth-24):48,height:open.value?Math.min(650,innerHeight-32):48});
function clamp(){if(typeof window==='undefined')return;const s=size();x.value=Math.max(12,Math.min(x.value,innerWidth-s.width-12));y.value=Math.max(12,Math.min(y.value,innerHeight-s.height-12));}
function down(e:PointerEvent){if(e.button!==0)return;moved=false;drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:x.value,top:y.value};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}
function move(e:PointerEvent){if(drag?.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)moved=true;if(moved){x.value=drag.left+dx;y.value=drag.top+dy;clamp();}}
function end(){drag=undefined;}
function expand(){if(moved){moved=false;return;}open.value=true;clamp();}
if(typeof window!=='undefined')window.addEventListener('resize',clamp);
onBeforeUnmount(()=>{if(typeof window!=='undefined')window.removeEventListener('resize',clamp);});
</script>
<template><div v-if="group" class="floating-group-phone" :class="{expanded:open}" :style="{left:x+'px',top:y+'px'}">
<button v-if="!open" class="phone-launcher" type="button" aria-label="打开群聊手机" @pointerdown="down" @pointermove="move" @pointerup="end" @pointercancel="end" @click="expand"><svg width="32" height="38" viewBox="0 0 28 36" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="5" y="2" width="18" height="32" rx="4"/><path d="M11 6h6M11 29h6M9 13h10M9 17h7M9 21h9"/></svg></button>
<section v-else class="floating-phone-window" aria-label="悬浮群聊手机"><header class="floating-phone-drag" @pointerdown="down" @pointermove="move" @pointerup="end" @pointercancel="end"><span>{{group.title}}</span><button type="button" aria-label="收起群聊手机" @pointerdown.stop @click="open=false">−</button></header><GroupChatPhone :scene="scene" :title="group.title" :player-name="w.state?.player.name||w.active?.persona.name||''" /></section>
</div></template>
<style scoped>
.floating-group-phone{position:fixed;z-index:160;width:48px;height:48px;color:var(--color-accent);touch-action:none}.floating-group-phone.expanded{width:min(360px,calc(100vw - 24px));height:min(650px,calc(100dvh - 32px))}.phone-launcher{display:grid;place-items:center;width:48px;height:48px;border:0!important;background:transparent!important;padding:0!important;cursor:grab;touch-action:none}.floating-phone-window{height:100%;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--color-border);border-radius:24px;background:var(--color-surface);box-shadow:0 12px 38px #0002;animation:phone-open .18s ease-out}.floating-phone-drag{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:7px 18px;cursor:grab;touch-action:none;font-size:12px;border-bottom:1px solid var(--color-border)}.floating-phone-drag button{font-size:20px;padding:0 5px;line-height:1}.floating-phone-window :deep(.chat-phone){flex:1;min-height:0;height:auto;width:100%;border:0;border-radius:0}.floating-phone-window :deep(.phone-chat-messages){min-height:0;overflow:auto;touch-action:pan-y}@keyframes phone-open{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}@media(prefers-reduced-motion:reduce){.floating-phone-window{animation:none}}
</style>
