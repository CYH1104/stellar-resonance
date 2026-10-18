<script setup lang="ts">
import {onBeforeUnmount,ref} from 'vue';
import DialogShell from './DialogShell.vue';
import type {Preferences} from '../domain/contracts';
const props=defineProps<{preferences:Preferences;disabled?:boolean}>();
const open=ref(false),draft=ref('');let timer:ReturnType<typeof setTimeout>|undefined,held=false;
function clear(){if(timer)clearTimeout(timer);timer=undefined;}
function edit(){clear();held=true;draft.value=props.preferences.randomEventInstruction||'';open.value=true;}
function press(event:PointerEvent){if(props.disabled||event.button!==0)return;held=false;clear();timer=setTimeout(edit,550);}
function click(){if(held){held=false;return;}if(!props.disabled)props.preferences.diceEnabled=!props.preferences.diceEnabled;}
function save(){props.preferences.randomEventInstruction=draft.value.trim();open.value=false;}
onBeforeUnmount(clear);
</script>
<template>
 <button class="random-event-toggle" title="单击开关；长按编辑随机事件提示词" :aria-pressed="preferences.diceEnabled" :disabled="disabled" @pointerdown="press" @pointerup="clear" @pointercancel="clear" @pointerleave="clear" @contextmenu.prevent="edit" @keydown.shift.f10.prevent="edit" @click="click"><span>12</span>随机事件<i :class="{enabled:preferences.diceEnabled}" aria-hidden="true"></i><span class="sr-only">{{preferences.diceEnabled?'已开启':'已关闭'}}</span></button>
 <DialogShell v-if="open" title="随机事件提示词" close-on-outside @close="open=false">
  <p>脚本按设置的概率抽取事件。以下要求仅在触发时发送；留空使用内置规则。</p>
  <label>事件创作要求<textarea v-model="draft" rows="7" maxlength="4000" placeholder="例如：事件应贴近当前校园生活，写清具体发生了什么，保留玩家选择。" /></label>
  <button :disabled="disabled" @click="save">保存提示词</button>
 </DialogShell>
</template>
