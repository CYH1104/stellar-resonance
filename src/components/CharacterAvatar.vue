<script setup lang="ts">
import {nicknameImage} from '../app/localNicknameImages';
import {localCharacterImage} from '../app/localCharacterImages';
import {computed,ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {majorCharacter} from '../domain/characterImages';
import {avatarFrameStyle} from '../app/avatarFraming';
import {normalizeActorName} from '../domain/dynamicActors';
import TerminalIcon from './TerminalIcon.vue';
const props=defineProps<{w:ViewModel;id:string;group?:boolean;nickname?:string}>();
const emit=defineEmits<{(e:'image-error'):void}>();
const failed=ref(false);
const original=computed(()=>(props.w.localService?.majorCharacters||props.w.localService?.characters)?.find(a=>a.id===props.id));
const card=computed(()=>original.value&&majorCharacter(original.value.name));
const image=computed(()=>card.value?localCharacterImage(props.id)||props.w.preferences.characterImages?.[props.id]:undefined);
const nickname=computed(()=>props.nickname||props.w.state?.characters.find(a=>a.id===props.id)?.name||props.w.active?.terminal?.contacts?.find(a=>a.id===props.id)?.name||original.value?.name||'');
const customUrl=computed(()=>nicknameImage(nickname.value));
const contactMajor=computed(()=>{if(!props.id.startsWith('contact-')||customUrl.value)return undefined;const key=normalizeActorName(nickname.value);if(!key)return undefined;const rows=(props.w.localService?.majorCharacters||[]).filter(a=>normalizeActorName(a.name)===key);if(rows.length!==1)return undefined;const actor=rows[0],image=localCharacterImage(actor.id)||props.w.preferences.characterImages?.[actor.id];return {url:image?.url||actor.img||majorCharacter(actor.name)?.url||'',image};});
const url=computed(()=>customUrl.value||image.value?.url||(original.value as {img?:string})?.img||(props.id.startsWith('contact-')?contactMajor.value?.url:card.value?.url)||'');
watch(url,()=>failed.value=false);
const style=computed(()=>{const view=props.id.startsWith('contact-')&&!customUrl.value?contactMajor.value?.image:image.value;return avatarFrameStyle(customUrl.value?undefined:view);});
</script>
<template><img v-if="url&&!failed&&!group" :src="url" referrerpolicy="no-referrer" :style="style" :alt="original?.name||'角色头像'" @error="failed=true;emit('image-error')"><TerminalIcon v-else :name="group?'friends':'user'"/></template>
