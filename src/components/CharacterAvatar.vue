<script setup lang="ts">
import {localCharacterImage} from '../app/localCharacterImages';
import {computed,ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {majorCharacter} from '../domain/characterImages';
import TerminalIcon from './TerminalIcon.vue';
const props=defineProps<{w:ViewModel;id:string;group?:boolean}>();
const emit=defineEmits<{(e:'image-error'):void}>();
const failed=ref(false);
const original=computed(()=>(props.w.localService?.majorCharacters||props.w.localService?.characters)?.find(a=>a.id===props.id));
const card=computed(()=>original.value&&majorCharacter(original.value.name));
const image=computed(()=>card.value?localCharacterImage(props.id)||props.w.preferences.characterImages?.[props.id]:undefined);
const url=computed(()=>image.value?.url||(original.value as {img?:string})?.img||card.value?.url||'');
watch(url,()=>failed.value=false);
const style=computed(()=>({transform:`translate(${image.value?.x||0}%,${image.value?.y||0}%) scale(${image.value?.scale||1})`}));
</script>
<template><img v-if="url&&!failed&&!group" :src="url" referrerpolicy="no-referrer" :style="style" :alt="original?.name||'角色头像'" @error="failed=true;emit('image-error')"><TerminalIcon v-else :name="group?'friends':'user'"/></template>
