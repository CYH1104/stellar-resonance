<script setup lang="ts">
import {ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import CharacterAvatar from './CharacterAvatar.vue';
import TerminalIcon from './TerminalIcon.vue';
const props=defineProps<{w:ViewModel;id:string}>();
const failed=ref(false);watch(()=>props.w.active?.terminal?.avatar,()=>failed.value=false);
</script>
<template><span class="pt-avatar"><template v-if="id==='player'"><img v-if="w.active?.terminal?.avatar&&!failed" :src="w.active.terminal.avatar" :style="{transform:`translate(${w.active.terminal.avatarView?.x||0}%,${w.active.terminal.avatarView?.y||0}%) scale(${w.active.terminal.avatarView?.scale||1})`}" alt="我的头像" @error="failed=true"><TerminalIcon v-else name="user"/></template><CharacterAvatar v-else :w="w" :id="id"/></span></template>
