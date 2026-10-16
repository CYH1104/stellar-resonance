<script setup lang="ts">
import {ref} from 'vue';
const props=defineProps<{axis:'x'|'y'|'both';label:string}>();
const emit=defineEmits<{resize:[dx:number,dy:number]}>();
const dragging=ref(false);let pointer:number|undefined,x=0,y=0;
function down(e:PointerEvent){if(e.button!==0)return;e.preventDefault();pointer=e.pointerId;x=e.clientX;y=e.clientY;dragging.value=true;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}
function move(e:PointerEvent){if(e.pointerId!==pointer)return;const dx=e.clientX-x,dy=e.clientY-y;x=e.clientX;y=e.clientY;emit('resize',props.axis==='y'?0:dx,props.axis==='x'?0:dy);}
function end(e:PointerEvent){if(e.pointerId!==pointer)return;pointer=undefined;dragging.value=false;}
function key(e:KeyboardEvent){const step=e.shiftKey?50:20,dx=e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0,dy=e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0;if((dx&&props.axis!=='y')||(dy&&props.axis!=='x')){e.preventDefault();emit('resize',props.axis==='y'?0:dx,props.axis==='x'?0:dy);}}
</script>
<template><button type="button" class="resize-handle" :class="['resize-'+axis,{dragging}]" :aria-label="label" :title="label+'；拖动或使用方向键，Shift 加速'" @pointerdown="down" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end" @keydown="key"><span aria-hidden="true">{{axis==='both'?'◢':''}}</span></button></template>
