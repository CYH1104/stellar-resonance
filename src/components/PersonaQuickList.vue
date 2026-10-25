<script setup lang="ts">
import {registerBackupFlusher} from '../app/backupFlushers';
import SaveStatus from './SaveStatus.vue';
import {useAutoSave} from '../app/useAutoSave';
import DismissibleNotice from './DismissibleNotice.vue';
import {accountStorage} from '../storage/accountScope';

import {computed,onMounted,ref} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {PersonaLibrary,personaArchiveEntries,type PersonaFile} from '../storage/personaLibrary';
import {blankPersona,normalizePersona} from '../domain/persona';
import {setMasterPersona} from '../domain/masterPersona';
import {applyPersonaMedia} from '../storage/personaMedia';
const props=defineProps<{w:ViewModel}>();
defineEmits<{manage:[]}>();
const files=ref<PersonaFile[]>([]),chosen=ref(''),sessionId=ref(''),notice=ref(''),saving=ref(false);
const source=ref<PersonaFile>(),editingId=ref(''),draftLoaded=ref(false);
const entries=computed(()=>personaArchiveEntries(files.value,props.w.sessions));
const selected=computed(()=>entries.value.find(f=>f.id===chosen.value));
onMounted(async()=>{try{files.value=await new PersonaLibrary().list();sessionId.value=props.w.active?.id||accountStorage.getItem('academy:main-session:v1')||'';}catch{notice.value='档案读取失败，请重试。';}});
async function load(){await autoSave.flush();if(autoSave.error.value)return;if(!selected.value)return;source.value=selected.value;editingId.value='';draftLoaded.value=true;Object.assign(props.w.newGameDraft.persona,blankPersona(),selected.value.persona);notice.value='已载入右侧表格；修改后自动保存为新人设，原档案保留';autoSave.cancel();}
async function editSelected(){await load();if(!source.value)return;editingId.value=files.value.some(f=>f.id===source.value!.id)?source.value.id:'';notice.value=editingId.value?'正在编辑「'+source.value.name+'」，保存将更新该档案':'该人设来自会话，保存后建立独立档案';}
async function saveDraft(){if(saving.value||props.w.busy)return;saving.value=true;try{const persona=normalizePersona({...props.w.newGameDraft.persona}),id=editingId.value||crypto.randomUUID();await new PersonaLibrary().save({...source.value,id,name:persona.name,persona,updatedAt:new Date().toISOString(),useAsHomeImage:editingId.value?source.value?.useAsHomeImage:false});files.value=await new PersonaLibrary().list();editingId.value=id;chosen.value=id;source.value=files.value.find(f=>f.id===id);notice.value='人设已自动保存';return true;}catch(e){notice.value=(e as Error).message;}finally{saving.value=false;}}
function master(){if(!selected.value)return;try{setMasterPersona(selected.value.persona,selected.value.id);applyPersonaMedia(selected.value);notice.value='已设为主人设';}catch(e){notice.value=(e as Error).message;}}
async function bind(){const file=selected.value,target=props.w.sessions.find(s=>s.id===sessionId.value);if(!file||!target)return;saving.value=true;try{const persona=normalizePersona({...file.persona});target.persona=persona;Object.assign(target.initial.player,{name:persona.name,primaryGender:persona.primaryGender,secondaryGender:persona.secondaryGender,identity:persona.identity,spiritAnimal:persona.spiritAnimal});await props.w.save();notice.value='已绑定到「'+target.name+'」，对话记录保留';}catch(e){notice.value=(e as Error).message;}finally{saving.value=false;}}
const autoSave=useAutoSave(()=>props.w.newGameDraft.persona,async()=>{if(!draftLoaded.value)return true;if(!props.w.newGameDraft.persona.name.trim())return false;if(!await saveDraft())throw Error(notice.value||'人设保存失败');return true;},500,()=>saving.value||props.w.busy);
registerBackupFlusher(async()=>{await autoSave.flush();if(autoSave.error.value)throw Error(autoSave.error.value);});
</script>
<template><aside class="persona-quick-list"><p class="eyebrow">PERSONA ARCHIVE</p><h2>过往人设</h2><SaveStatus :status="autoSave.status.value" :error="autoSave.error.value" :saved-at="autoSave.lastSaved.value" /><button class="persona-manage" @click="$emit('manage')">新建 / 管理档案 →</button><p v-if="!entries.length" class="muted">还没有人设档案。</p><div v-for="file in entries" :key="file.id" class="persona-archive-item"><button class="persona-quick-entry" :class="{selected:chosen===file.id}" @click="chosen=chosen===file.id?'':file.id" :aria-expanded="chosen===file.id" :disabled="saving"><strong>{{file.name}}</strong><small>{{file.persona.identity||'院系未填写'}}</small></button><div v-if="chosen===file.id" class="persona-archive-expanded"><div class="persona-quick-actions"><button :disabled="w.busy||saving" @click="load">载入填写</button><button :disabled="w.busy||saving" @click="editSelected">编辑当前选定人设</button><button :disabled="w.busy||saving" @click="master">设为主人设</button></div><label>绑定会话<select v-model="sessionId" :disabled="saving||w.busy"><option value="">选择会话</option><option v-for="s in w.sessions" :key="s.id" :value="s.id">{{s.name}}</option></select></label><button :disabled="!sessionId||saving||w.busy" @click="bind">绑定会话人设</button></div><div v-if="draftLoaded&&source?.id===file.id" class="persona-draft-save"><p class="muted">{{editingId?'编辑模式：更新选定档案':'载入模式：保存为新档案'}}</p><SaveStatus :status="autoSave.status.value" :error="autoSave.error.value" :saved-at="autoSave.lastSaved.value" /><button v-if="autoSave.error.value" :disabled="saving||w.busy||!w.newGameDraft.persona.name.trim()" @click="saveDraft">{{saving?'保存中…':editingId?'保存选定人设':'保存为新人设'}}</button></div></div><DismissibleNotice :message="notice" /></aside></template>
