<script setup lang="ts">
import type {AvatarAppearance} from '../domain/avatarAppearance';
import {avatarAppearanceStyle} from '../domain/avatarAppearance';
defineProps<{name:string;src?:string;appearance?:AvatarAppearance}>();
</script>
<template><span class="chat-user-avatar" :style="avatarAppearanceStyle(appearance)"><img v-if="src" :src="src" alt="" /><span v-else>{{name.slice(0,1)}}</span></span></template>
<style scoped>.chat-user-avatar{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;background:var(--color-surface-soft);color:var(--color-accent)}img{width:100%;height:100%;object-fit:cover}</style>
