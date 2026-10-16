<script setup lang="ts">
import {computed,onMounted,ref} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {PersonaLibrary,type PersonaFile} from '../storage/personaLibrary';
import {blankPersona} from '../domain/persona';
import SaveList from './SaveList.vue';
const props=defineProps<{w:ViewModel;mode:'new'|'continue';firstSetup?:boolean}>();
defineEmits<{personas:[]}>();
const files=ref<PersonaFile[]>([]),chosen=ref('');
const choices=computed(()=>[...files.value,...props.w.sessions.filter(s=>!files.value.some(f=>JSON.stringify(f.persona)===JSON.stringify(s.persona))).filter((s,i,a)=>a.findIndex(x=>JSON.stringify(x.persona)===JSON.stringify(s.persona))===i).map(s=>({id:'session/'+s.id,name:s.persona.name,persona:s.persona,updatedAt:s.updatedAt}))]);
onMounted(async()=>{try{files.value=await new PersonaLibrary().list();const match=choices.value.find(f=>JSON.stringify(f.persona)===JSON.stringify(props.w.newGameDraft.persona));if(match)chosen.value=match.id;}catch{props.w.problem='读取人设失败，请重试';}});
function choose(){const file=choices.value.find(f=>f.id===chosen.value);Object.assign(props.w.newGameDraft.persona,blankPersona(),file?.persona||{});}
async function create(){if(chosen.value&&!props.w.creatingGame)await props.w.create(props.w.newGameDraft.title,props.w.newGameDraft.persona,props.w.newGameDraft.opening);}
</script>
<template>
<section v-if="mode==='continue'" class="surface journey-setup"><p class="eyebrow">ARCHIVES / 过往存档</p><h1>过往存档</h1><SaveList :w="w" /><p v-if="!w.sessions.length" class="muted">还没有存档，可以新建或导入。</p><button @click="w.panel='saves'">备份与导入</button></section>
<section v-else class="surface journey-setup student-file-card new-journey-card">
<header class="student-file-heading"><h1>NEW JOURNEY <small>新建存档</small></h1></header>
<div class="student-file-scroll"><p class="muted">{{firstSetup?'为第一次会话设置存档名称，保存后进入聊天。':'选择 user 人设，建立独立的新存档。'}}</p>
<form id="new-persona-form" @submit.prevent="create">
<label>存档名称<input v-model="w.newGameDraft.title" maxlength="80" required :disabled="w.creatingGame" /></label>
<label v-if="!firstSetup">选择 user 人设<select v-model="chosen" required :disabled="w.creatingGame" @change="choose"><option value="">请选择人设</option><option v-for="f in choices" :key="f.id" :value="f.id">{{f.name}}</option></select></label>
<div v-if="!firstSetup" class="actions"><button type="button" :disabled="w.creatingGame" @click="$emit('personas')">新增 / 编辑 user 人设 →</button></div>
<div v-if="chosen" class="new-persona-preview"><h2>{{w.newGameDraft.persona.name}}</h2><p>{{[w.newGameDraft.persona.primaryGender,w.newGameDraft.persona.secondaryGender,w.newGameDraft.persona.identity].filter(Boolean).join(' · ')}}</p></div>
<label v-if="!firstSetup">自定义开场白（可留空）<textarea v-model="w.newGameDraft.opening" rows="4" maxlength="6000" :disabled="w.creatingGame" placeholder="留空使用学院迎新开场。" /></label>
</form></div>
<footer class="student-file-actions"><button class="primary" form="new-persona-form" type="submit" :disabled="w.loading||w.creatingGame||!chosen||!w.newGameDraft.title.trim()">{{w.creatingGame?'正在建立新存档…':'建立新存档 →'}}</button></footer>
</section></template>