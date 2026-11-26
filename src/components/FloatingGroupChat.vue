<script setup lang="ts">
import {ref,onMounted,onBeforeUnmount,nextTick,defineAsyncComponent} from 'vue';
import {provideTheaterRegex} from '../app/theaterRegex';
import type {ViewModel} from '../app/useWorkspace';
const PersonalTerminal=defineAsyncComponent(()=>import('./PersonalTerminal.vue'));
import TerminalIcon from './TerminalIcon.vue';
import {useFloatingDrag} from '../app/useFloatingDrag';
const props=withDefaults(defineProps<{w:ViewModel;visible?:boolean}>(),{visible:true});
provideTheaterRegex(()=>props.w);
const landscape=ref(false);
const mounted=ref(false),open=ref(false),launcher=ref<HTMLButtonElement>(),dialog=ref<HTMLElement>();
const windowDrag=useFloatingDrag(dialog),launcherDrag=useFloatingDrag(launcher);
let prior:Element|null=null;
async function expand(){mounted.value=true;prior=document.activeElement;open.value=true;await nextTick();dialog.value?.querySelector<HTMLButtonElement>('button')?.focus();}
function minimize(){landscape.value=false;open.value=false;if(prior instanceof HTMLElement)prior.focus();else launcher.value?.focus();}
function key(e:KeyboardEvent){if(!open.value||props.visible===false)return;if(e.key==='Escape'){e.preventDefault();minimize();}if(e.key==='Tab'){const nodes=Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex="0"]')||[]).filter(el=>el.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}
onMounted(()=>document.addEventListener('keydown',key));onBeforeUnmount(()=>document.removeEventListener('keydown',key));
</script>
<template><div v-show="visible!==false" class="personal-terminal-host">
<button ref="launcher" v-show="!open" type="button" class="terminal-launcher" :style="launcherDrag.style.value" aria-label="打开个人终端" title="点击打开；拖动调整位置" @pointerdown="launcherDrag.down" @pointermove="launcherDrag.move" @pointerup="launcherDrag.end" @pointercancel="launcherDrag.end" @lostpointercapture="launcherDrag.end" @click.capture="launcherDrag.click" @click="expand"><TerminalIcon name="star"/><span>终端</span></button>
<div v-show="open" class="terminal-overlay"><div ref="dialog" role="dialog" aria-label="个人终端" class="terminal-device" :class="{'terminal-device-landscape':landscape&&open&&visible!==false}" :style="windowDrag.style.value"><PersonalTerminal v-if="mounted" :w="w" :active="open&&visible!==false" @close="minimize" @landscape="landscape=$event" @drag-start="!landscape&&windowDrag.down($event)" @drag-move="!landscape&&windowDrag.move($event)" @drag-end="windowDrag.end"/></div></div>
</div></template>
<style scoped>
.terminal-launcher{touch-action:none;user-select:none}
.personal-terminal-host{position:relative;z-index:160}.terminal-launcher{position:fixed;right:24px;bottom:50px;display:flex;align-items:center;gap:8px;background:#0e1d2be8!important;color:#bce3f5!important;border:1px solid #799caf!important;border-radius:15px!important;box-shadow:0 4px 24px #0005!important;padding:10px 14px!important;cursor:pointer;font-size:12px}.terminal-launcher svg{width:26px;height:26px}.terminal-overlay{position:fixed;inset:0;z-index:160;background:transparent;pointer-events:none;display:flex;align-items:center;justify-content:center;padding:16px}.terminal-device{pointer-events:auto;width:min(448px,100%);height:min(820px,calc(100dvh - 32px));min-height:0;filter:none}@media(max-width:480px){.terminal-overlay{padding:8px}.terminal-device{height:calc(100dvh - 16px);width:100%}.terminal-launcher{right:12px;bottom:55px}}
.terminal-device-landscape{position:fixed;left:50%;top:50%;width:min(1040px,calc(100dvw - 20px))!important;height:min(650px,calc(100dvh - 20px))!important;transform:translate(-50%,-50%)!important}.terminal-device-landscape :deep(.pt){border-radius:18px}.terminal-device-landscape :deep(.pt-screen){padding:5px!important}.terminal-device-landscape :deep(.pt-dock),.terminal-device-landscape :deep(.pt-home-indicator){display:none!important}.terminal-device-landscape :deep(.party-game-room){height:100%;min-height:0;display:flex;flex-direction:column}.terminal-device-landscape :deep(.landlord-table){min-height:0;flex:1;padding:6px;gap:5px}.terminal-device-landscape :deep(.mahjong-table){min-height:0;flex:1}.terminal-device-landscape :deep(.table-surface){min-height:0!important}.terminal-device-landscape :deep(.landlord-chat){flex:none}.terminal-device-landscape :deep(.landlord-chat){margin:4px 6px;font-size:12px}@media(orientation:portrait) and (max-width:700px){.terminal-device-landscape{width:calc(100dvh - 20px)!important;height:calc(100dvw - 20px)!important;transform:translate(-50%,-50%) rotate(90deg)!important;transform-origin:center}}
/* Keep the full card table and controls in short landscape viewports, including rotated phones. */
@media (max-height:360px),(orientation:portrait) and (max-width:360px){
#academy-workspace .terminal-device-landscape :deep(.pt){padding:3px}
#academy-workspace .terminal-device-landscape :deep(.pt-header){padding:2px 8px;min-height:30px}
#academy-workspace .terminal-device-landscape :deep(.pt-header button){min-height:26px!important;height:26px;font-size:20px!important}
#academy-workspace .terminal-device-landscape :deep(.pt-header small){display:none}
#academy-workspace .terminal-device-landscape :deep(.party-game-room>.party-muted){flex:none;margin:2px 0;font-size:10px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#academy-workspace .terminal-device-landscape :deep(.landlord-table){padding:4px;gap:3px}
#academy-workspace .terminal-device-landscape :deep(.landlord-chat){margin:1px 6px;font-size:10px;line-height:14px}
}
</style>
