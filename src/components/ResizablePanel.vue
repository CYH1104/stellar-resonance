<script setup lang="ts">
import {computed,ref} from 'vue';
import type {Preferences} from '../domain/contracts';
import {defaultLayout,resizePanel} from '../domain/layout';
import ResizeHandle from './ResizeHandle.vue';
const props=defineProps<{preferences:Preferences;panelKey:string;label:string;defaultHeight?:number}>();
const box=ref<HTMLElement>();
const size=computed(()=>props.preferences.layout?.panels[props.panelKey]||{});
const style=computed(()=>({width:'100%',height:(size.value.height||props.defaultHeight)?`${size.value.height||props.defaultHeight}px`:undefined}));
function resize(_dx:number,dy:number){const el=box.value;if(!el)return;const rect=el.getBoundingClientRect(),parent=el.parentElement?.clientWidth||rect.width,layout=props.preferences.layout||=(defaultLayout());layout.panels[props.panelKey]=resizePanel({height:size.value.height},0,dy,rect,parent);}
</script>
<template><section ref="box" class="resizable-panel" :style="style" :aria-label="label"><div class="resizable-panel-body"><slot /></div><ResizeHandle axis="y" :label="'调整'+label+'高度'" @resize="resize" /></section></template>
