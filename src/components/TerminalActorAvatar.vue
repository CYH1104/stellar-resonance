<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import {avatarFrameStyle} from '../app/avatarFraming';
import type {ViewModel} from '../app/useWorkspace';
import CharacterAvatar from './CharacterAvatar.vue';
import TerminalIcon from './TerminalIcon.vue';
import {useImagePreview} from '../app/imagePreview';
const props=defineProps<{w:ViewModel;id:string}>();
const avatarDisplay=useImagePreview(()=>props.w.active?.terminal?.avatar);
const failed=ref(false);watch(()=>props.w.active?.terminal?.avatar,()=>failed.value=false);
const style=computed(()=>avatarFrameStyle(props.w.active?.terminal?.avatarView));
</script>
<template><span class="pt-avatar"><template v-if="id==='player'"><img v-if="w.active?.terminal?.avatar&&!failed" :src="avatarDisplay" :style="style" alt="我的头像" @error="failed=true"><TerminalIcon v-else name="user"/></template><CharacterAvatar v-else :w="w" :id="id"/></span></template>
