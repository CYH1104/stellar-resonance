<script setup lang="ts">
import {onBeforeUnmount,watch} from 'vue';
import {suggestionGesture} from '../app/suggestionGesture';
const props=defineProps<{text:string;disabled?:boolean}>();
const emit=defineEmits<{send:[text:string];edit:[text:string]}>();
const press=suggestionGesture({enabled:()=>!props.disabled,send:()=>emit('send',props.text),edit:()=>emit('edit',props.text)});
watch(()=>[props.disabled,props.text],()=>press.cancel());
onBeforeUnmount(press.dispose);
</script>
<template><button type="button" class="suggestion-button" :disabled="disabled" title="单击发送，长按编辑；Shift+Enter 编辑" @pointerdown="e=>press.down({pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY,button:e.button,isPrimary:e.isPrimary})" @pointermove="press.move" @pointerup="press.up" @pointercancel="press.cancel" @pointerleave="press.cancel" @click="press.click" @contextmenu.prevent @keydown.shift.enter.prevent="press.edit">{{text}}</button></template>
<style scoped>.suggestion-button{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:manipulation}</style>
