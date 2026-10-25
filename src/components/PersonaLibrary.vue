<script setup lang="ts">
import {registerBackupFlusher} from '../app/backupFlushers';
import {cleanAvatarAppearance} from '../domain/avatarAppearance';
import SaveStatus from './SaveStatus.vue';
import {useAutoSave} from '../app/useAutoSave';
import DismissibleNotice from './DismissibleNotice.vue';
import {accountStorage} from '../storage/accountScope';

import {computed,onMounted,ref} from 'vue';
import type {Persona} from '../domain/contracts';
import type {ViewModel} from '../app/useWorkspace';
import {blankPersona,normalizePersona} from '../domain/persona';
import {masterPersonaSummary,setMasterPersona,clearMasterPersona,refreshMasterPersona} from '../domain/masterPersona';
import {writePersonaExtra} from '../domain/personaExtras';
import {PersonaLibrary as Repository,validatePersonaTextFile,type PersonaFile,personaArchiveEntries,samePersona,resolvePersonaArchiveFile,personaSourceSessionIds,hiddenPersonaSessionIds,hidePersonaSessions} from '../storage/personaLibrary';
import {applyPersonaMedia} from '../storage/personaMedia';
import AutoTextarea from './AutoTextarea.vue';
import PersonaFields from './PersonaFields.vue';
import PersonaImageEditor from './PersonaImageEditor.vue';
const props=defineProps<{sessions:{id:string;name?:string;persona:Persona;updatedAt:string}[];w:ViewModel}>();
const emit=defineEmits<{use:[persona:Persona];master:[persona:Persona];settings:[];saved:[persona:Persona]}>();
const files=ref<PersonaFile[]>([]),persona=ref<Persona>(blankPersona()),selected=ref(''),source=ref<PersonaFile>(),portrait=ref<Blob>(),avatar=ref<Blob>(),useAsHomeImage=ref(false),busy=ref(false),notice=ref(''),problem=ref(''),importInput=ref<HTMLInputElement>(),sessionId=ref(''),wish=ref('');
const remark=ref('');
const memo=ref(''),avatarAppearance=ref(cleanAvatarAppearance()),sourceSessionIds=ref<string[]>([]);
const repository=new Repository();
const removing=ref(false);
const hiddenIds=ref(hiddenPersonaSessionIds());
const entries=computed(()=>personaArchiveEntries(files.value,props.sessions,hiddenIds.value));
function editorDraft():PersonaFile{return {id:selected.value,name:persona.value.name,persona:{...persona.value},updatedAt:new Date().toISOString(),remark:remark.value,memo:memo.value,sourceSessionIds:[...sourceSessionIds.value],portrait:portrait.value,avatar:avatar.value,avatarAppearance:cleanAvatarAppearance(avatarAppearance.value),useAsHomeImage:useAsHomeImage.value};}
async function reset(){await autoSave.flush();if(autoSave.error.value)return;remark.value='';memo.value='';sourceSessionIds.value=[];selected.value='';source.value=undefined;persona.value=blankPersona();portrait.value=undefined;avatar.value=undefined;avatarAppearance.value=cleanAvatarAppearance();useAsHomeImage.value=false;problem.value='';notice.value='正在新增 user 人设';autoSave.cancel();}
async function select(file:PersonaFile,copy=false){await autoSave.flush();if(autoSave.error.value)return;file=resolvePersonaArchiveFile(file,files.value);sourceSessionIds.value=copy?[]:[...new Set([...(file.sourceSessionIds||[]),...(file.id.startsWith('session/')?[file.id.slice(8)]:[]),...props.sessions.filter(s=>samePersona(s.persona,file.persona)).map(s=>s.id)])];remark.value=file.remark||'';memo.value=file.memo||'';source.value=file;selected.value=copy||file.id.startsWith('session/')?crypto.randomUUID():file.id;persona.value={...blankPersona(),...file.persona};portrait.value=file.portrait;avatar.value=file.avatar;avatarAppearance.value=cleanAvatarAppearance(file.avatarAppearance);useAsHomeImage.value=!!file.useAsHomeImage;problem.value='';notice.value=copy?'已载入副本，保存为新人设':'正在编辑「'+file.name+'」';autoSave.cancel();}
async function save(){if(busy.value)return;busy.value=true;problem.value='';try{const value=normalizePersona({...persona.value}),id=selected.value||crypto.randomUUID();selected.value=id;sourceSessionIds.value=personaSourceSessionIds(source.value,props.sessions,sourceSessionIds.value);await repository.save({remark:remark.value,sourceSessionIds:[...sourceSessionIds.value],memo:memo.value,id,name:value.name,persona:value,updatedAt:new Date().toISOString(),portrait:portrait.value,avatar:avatar.value,avatarAppearance:avatarAppearance.value,useAsHomeImage:useAsHomeImage.value});files.value=await repository.list();selected.value=id;source.value=files.value.find(f=>f.id===id);if((useAsHomeImage.value&&portrait.value)||accountStorage.getItem('academy:master-image-file')===id)applyPersonaMedia(source.value!);refreshMasterPersona(value,id,sourceSessionIds.value);notice.value='user 人设已保存';emit('saved',value);return source.value;}catch(e){problem.value=(e as Error).message;}finally{busy.value=false;}}
async function master(){await autoSave.flush();if(autoSave.error.value)return;const file=files.value.find(f=>f.id===selected.value)||(source.value?.id.startsWith('session/')?source.value:undefined)||await save();if(file){setMasterPersona(file.persona,file.id);applyPersonaMedia(file);emit('master',file.persona);notice.value='已设为主人设';}}
async function bind(){const target=props.w.sessions.find(s=>s.id===sessionId.value);if(!target)return;await autoSave.flush();if(autoSave.error.value)return;sourceSessionIds.value=[...new Set([...sourceSessionIds.value,target.id])];const file=await save();if(!file)return;target.persona={...file.persona};Object.assign(target.initial.player,{name:file.persona.name,mentalPowerLevel:file.persona.mentalPowerLevel,ability:file.persona.ability,primaryGender:file.persona.primaryGender,secondaryGender:file.persona.secondaryGender,identity:file.persona.identity,spiritAnimal:file.persona.spiritAnimal});await props.w.save();notice.value='已绑定「'+target.name+'」，已有对话保留';}
async function remove(file:PersonaFile){
 if(!confirm((file.id.startsWith('session/')?'从人设库移除':'删除人设')+'「'+file.name+'」？原会话和剧情保持不变。'))return;
 try{
  await autoSave.flush();if(autoSave.error.value)return;autoSave.cancel();busy.value=true;removing.value=true;
  const resolved=resolvePersonaArchiveFile(file,files.value),isCurrent=source.value?.id===file.id||source.value?.id===resolved.id||selected.value===resolved.id;
  const ids=personaSourceSessionIds(resolved,props.sessions,file.id.startsWith('session/')?[file.id.slice(8)]:[]);
  hidePersonaSessions(ids);hiddenIds.value=hiddenPersonaSessionIds();
  if(!resolved.id.startsWith('session/'))await repository.remove(resolved.id);
  clearMasterPersona(file.id);if(resolved.id!==file.id)clearMasterPersona(resolved.id);for(const id of ids)clearMasterPersona('session/'+id);
  applyPersonaMedia({...resolved,useAsHomeImage:false});files.value=await repository.list();
  if(isCurrent){await reset();await repository.clearDraft();}
  notice.value='已从人设库移除，原会话和剧情保留';
 }catch(e){problem.value=(e as Error).message;}finally{busy.value=false;removing.value=false;}
}
async function importFile(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;try{validatePersonaTextFile(file.name,file.size);const text=(await file.text()).replace(/^\uFEFF/,'');if(!text.trim())throw Error('人设正文不能为空');await reset();const summary=masterPersonaSummary({...blankPersona(),name:'',rawText:text}),nameLine=text.match(/(?:^|\n)\s*(?:姓名|名字)\s*[:：]\s*(.+)/);persona.value={...blankPersona(),name:nameLine?.[1]?.trim()||file.name.replace(/\.(txt|md)$/i,''),rawText:text,identity:summary.department,other:writePersonaExtra('','精神力等级',summary.spiritLevel)};notice.value='已导入，请检查后保存';}catch(e){problem.value=(e as Error).message;}finally{input.value='';}}
async function assist(){Object.assign(props.w.newGameDraft.persona,blankPersona(),persona.value);props.w.newGameDraft.wish=wish.value;await props.w.assistPersona();persona.value={...props.w.newGameDraft.persona};if(props.w.panel==='settings')emit('settings');}
const autoSave=useAutoSave(()=>[persona.value,remark.value,memo.value,portrait.value,avatar.value,avatarAppearance.value,useAsHomeImage.value],async()=>{await repository.saveDraft(editorDraft());if(!persona.value.name.trim())return true;const file=await save();if(!file)throw Error(problem.value||'人设保存失败');await repository.saveDraft(editorDraft());return true;});
onMounted(async()=>{const initialDraft=editorDraft();const untouched=()=>JSON.stringify({...editorDraft(),updatedAt:''})===JSON.stringify({...initialDraft,updatedAt:''})&&portrait.value===initialDraft.portrait&&avatar.value===initialDraft.avatar;try{files.value=await repository.list();const draft=await repository.readDraft();if(draft&&untouched()){selected.value=draft.id;source.value=files.value.find(f=>f.id===draft.id);persona.value={...blankPersona(),...draft.persona};remark.value=draft.remark||'';memo.value=draft.memo||'';sourceSessionIds.value=draft.sourceSessionIds||[];portrait.value=draft.portrait;avatar.value=draft.avatar;avatarAppearance.value=cleanAvatarAppearance(draft.avatarAppearance);useAsHomeImage.value=!!draft.useAsHomeImage;notice.value='已恢复上次编辑的人设草稿';autoSave.cancel();}sessionId.value=props.w.active?.id||accountStorage.getItem('academy:main-session:v1')||'';}catch(e){problem.value=(e as Error).message;}});
registerBackupFlusher(async()=>{await autoSave.flush();if(autoSave.error.value)throw Error(autoSave.error.value);});
</script>
<template><div class="persona-entry-layout user-persona-archive">
<aside class="persona-quick-list"><p class="eyebrow">USER PERSONA ARCHIVE</p><h2>user 人设档案</h2><button :disabled="busy||w.backupWorking" @click="reset">＋ 新增人设</button><p v-if="!entries.length" class="muted">还没有人设，填写右侧资料后保存。</p><div v-for="file in entries" :key="file.id" class="persona-archive-item"><button class="persona-quick-entry" :class="{selected:source?.id===file.id}" :disabled="busy||w.backupWorking" @click="select(file)"><span class="persona-archive-name"><strong>{{file.name}}</strong><span v-if="file.remark" class="persona-remark">{{file.remark}}</span></span><small>{{file.persona.identity||'院系未填写'}}</small></button><div v-if="source?.id===file.id" class="persona-archive-expanded"><button :disabled="busy||w.backupWorking" @click="select(file)">编辑当前人设</button><button :disabled="busy||w.backupWorking" @click="select(file,true)">载入为新人设</button><button class="danger" :disabled="busy||w.backupWorking" @click="remove(file)">{{file.id.startsWith('session/')?'从人设库移除':'删除人设'}}</button></div></div></aside>
<section class="surface student-file-card"><header class="student-file-heading"><h1>USER PERSONA <small>{{selected?'编辑人设':'新增人设'}}</small></h1></header><div class="student-file-scroll"><DismissibleNotice :message="problem" error /><DismissibleNotice :message="notice" />
<form id="user-persona-editor" @submit.prevent="save"><label class="persona-remark-editor">备注<AutoTextarea v-model="remark" rows="1" :disabled="removing||w.workingPersona||w.backupWorking" placeholder="例如：学生版、校外人员版" /><small class="muted">仅用于区分档案，不发送给模型。</small></label><PersonaFields v-model="persona" :disabled="removing||w.workingPersona||w.backupWorking" /><div class="actions persona-import-actions"><button type="button" :disabled="busy||w.backupWorking" @click="importInput?.click()">导入文件</button><input ref="importInput" hidden type="file" accept=".txt,.md,text/plain,text/markdown" @change="importFile" /></div><label>人设备忘录<AutoTextarea v-model="memo" rows="6" :disabled="removing||w.workingPersona||w.backupWorking" placeholder="记录人物细节、创作想法或待办" /><small class="muted">随人设保存到本机档案，不会自动发送给模型。</small></label><PersonaImageEditor v-model:appearance="avatarAppearance" v-model:portrait="portrait" v-model:avatar="avatar" :disabled="busy||w.backupWorking"><template #image-options><label class="toggle persona-home-image"><input v-model="useAsHomeImage" type="checkbox" :disabled="busy||w.backupWorking" />作为主页图片展示（完整原图）</label></template></PersonaImageEditor></form>
<details class="persona-assistant"><summary>AI 帮我写人设</summary><label>描述你想扮演的人物<AutoTextarea v-model="wish" rows="3" /></label><button :disabled="!wish.trim()||w.workingPersona||busy" @click="assist">{{w.workingPersona?'正在填写…':'AI 帮我写'}}</button><p class="muted">使用已配置的人设接口，生成后请检查再保存。</p></details>
<section class="persona-session-binding"><label>绑定会话<select v-model="sessionId" :disabled="busy||w.backupWorking"><option value="">请选择会话</option><option v-for="s in w.sessions" :key="s.id" :value="s.id">{{s.name}}</option></select></label><div class="actions"><button :disabled="busy||!sessionId||!persona.name.trim()" @click="bind">保存并绑定会话</button><button :disabled="busy||!persona.name.trim()" @click="master">设为主人设</button></div></section>
</div><footer class="student-file-actions"><SaveStatus :status="autoSave.status.value" :error="autoSave.error.value" :saved-at="autoSave.lastSaved.value" /><button type="button" @click="autoSave.retry()">立即保存</button><button v-if="autoSave.error.value" class="primary" type="button" @click="autoSave.retry()" :disabled="busy||!persona.name.trim()">{{busy?'正在保存…':selected?'保存选定人设':'保存新人设'}}</button></footer></section>
</div></template>

<style scoped>.persona-archive-name{display:flex;align-items:baseline;flex-wrap:wrap}.persona-remark{margin-left:8px;font-size:12px;font-weight:normal;white-space:pre-wrap;overflow-wrap:anywhere}.persona-remark-editor{display:block;margin:8px 0}.persona-remark-editor small{display:block}</style>



