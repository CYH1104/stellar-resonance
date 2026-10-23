<script setup lang="ts">
import {ref,onMounted,onBeforeUnmount,nextTick} from 'vue';
import {provideTheaterRegex} from '../app/theaterRegex';
import type {ViewModel} from '../app/useWorkspace';
import PersonalTerminal from './PersonalTerminal.vue';
import TerminalIcon from './TerminalIcon.vue';
import {useFloatingDrag} from '../app/useFloatingDrag';
const props=withDefaults(defineProps<{w:ViewModel;visible?:boolean}>(),{visible:true});
provideTheaterRegex(()=>props.w);
const open=ref(false),launcher=ref<HTMLButtonElement>(),dialog=ref<HTMLElement>();
const windowDrag=useFloatingDrag(dialog),launcherDrag=useFloatingDrag(launcher);
let prior:Element|null=null;
async function expand(){prior=document.activeElement;open.value=true;await nextTick();dialog.value?.querySelector<HTMLButtonElement>('button')?.focus();}
function minimize(){open.value=false;if(prior instanceof HTMLElement)prior.focus();else launcher.value?.focus();}
function key(e:KeyboardEvent){if(!open.value||props.visible===false)return;if(e.key==='Escape'){e.preventDefault();minimize();}if(e.key==='Tab'){const nodes=Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex="0"]')||[]).filter(el=>el.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}
onMounted(()=>document.addEventListener('keydown',key));onBeforeUnmount(()=>document.removeEventListener('keydown',key));
</script>
<template><div v-show="visible!==false" class="personal-terminal-host">
<button ref="launcher" v-show="!open" type="button" class="terminal-launcher" :style="launcherDrag.style.value" aria-label="打开个人终端" title="点击打开；拖动调整位置" @pointerdown="launcherDrag.down" @pointermove="launcherDrag.move" @pointerup="launcherDrag.end" @pointercancel="launcherDrag.end" @lostpointercapture="launcherDrag.end" @click.capture="launcherDrag.click" @click="expand"><TerminalIcon name="star"/><span>终端</span></button>
<div v-show="open" class="terminal-overlay"><div ref="dialog" role="dialog" aria-label="个人终端" class="terminal-device" :style="windowDrag.style.value"><PersonalTerminal :w="w" @close="minimize" @drag-start="windowDrag.down" @drag-move="windowDrag.move" @drag-end="windowDrag.end"/></div></div>
</div></template>
<style scoped>
.terminal-launcher{touch-action:none;user-select:none}
.personal-terminal-host{position:relative;z-index:160}.terminal-launcher{position:fixed;right:24px;bottom:50px;display:flex;align-items:center;gap:8px;background:#0e1d2be8!important;color:#bce3f5!important;border:1px solid #799caf!important;border-radius:15px!important;box-shadow:0 4px 24px #0005!important;padding:10px 14px!important;cursor:pointer;font-size:12px}.terminal-launcher svg{width:26px;height:26px}.terminal-overlay{position:fixed;inset:0;z-index:160;background:transparent;pointer-events:none;display:flex;align-items:center;justify-content:center;padding:16px}.terminal-device{pointer-events:auto;width:min(448px,100%);height:min(820px,calc(100dvh - 32px));min-height:0;filter:drop-shadow(0 20px 35px #0006)}@media(max-width:480px){.terminal-overlay{padding:8px}.terminal-device{height:calc(100dvh - 16px);width:100%}.terminal-launcher{right:12px;bottom:55px}}
</style>
