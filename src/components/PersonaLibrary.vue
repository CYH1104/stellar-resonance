<script setup lang="ts">
import {ref,onMounted,onUnmounted,computed} from 'vue';
import type {Persona} from '../domain/contracts';
import {blankPersona,normalizePersona} from '../domain/persona';
import {readPersonaExtra,writePersonaExtra} from '../domain/personaExtras';
import {masterPersonaSummary} from '../domain/masterPersona';
import {PersonaLibrary,validatePersonaTextFile,type PersonaFile} from '../storage/personaLibrary';
import PersonaImageEditor from './PersonaImageEditor.vue';
const portrait=ref<Blob>(),avatar=ref<Blob>(),useAsHomeImage=ref(false);
const avatarUrls=new Map<Blob,string>();
function avatarUrl(file:PersonaFile){const blob=file.avatar||file.portrait;if(!blob)return '';if(!avatarUrls.has(blob))avatarUrls.set(blob,URL.createObjectURL(blob));return avatarUrls.get(blob);}
function clearImages(){portrait.value=undefined;avatar.value=undefined;useAsHomeImage.value=false;}
onUnmounted(()=>avatarUrls.forEach(url=>URL.revokeObjectURL(url)));
const emit=defineEmits<{use:[persona:Persona]}>();
const department=ref(''),spiritLevel=ref('');
const props=defineProps<{sessions:{id:string;name?:string;persona:Persona;updatedAt:string}[]}>();
const repository=new PersonaLibrary(),files=ref<PersonaFile[]>([]),name=ref(''),text=ref(''),selected=ref(''),problem=ref(''),notice=ref(''),busy=ref(false),dirty=ref(false),loaded=ref(false),importInput=ref<HTMLInputElement>();
let base:Persona=blankPersona();
const historic=computed(()=>{const seen=new Set<string>();return props.sessions.filter(s=>{const signature=JSON.stringify(normalizePersona(s.persona));if(seen.has(signature))return false;seen.add(signature);return true;});});
const draft=()=>normalizePersona({...base,name:name.value,identity:department.value,mentalPowerLevel:spiritLevel.value,other:writePersonaExtra(base.other,'精神力等级',''),rawText:text.value});
function maySwitch(){return !dirty.value||confirm('当前人设尚未保存，确定切换吗？');}
function reset(){if(!maySwitch())return;base=blankPersona();clearImages();selected.value='';name.value='';text.value='';department.value='';spiritLevel.value='';dirty.value=false;notice.value='';problem.value='';}
function select(file:PersonaFile){if(!maySwitch())return;base={...file.persona};portrait.value=file.portrait;avatar.value=file.avatar;useAsHomeImage.value=!!file.useAsHomeImage;selected.value=file.id;name.value=file.persona.name;text.value=file.persona.rawText||describe(file.persona);const summary=masterPersonaSummary(file.persona);department.value=summary.department;spiritLevel.value=summary.spiritLevel;dirty.value=false;notice.value='';problem.value='';}
function describe(p:Persona){return [['姓名',p.name],['身份',p.identity],['外貌',p.appearance],['第一性别',p.primaryGender],['精神力等级',p.mentalPowerLevel],['第二性别',p.secondaryGender],['性格',p.personality],['背景',p.background],['精神体',p.spiritAnimal],['其他',p.other]].filter(([,v])=>v).map(([label,value])=>label+'：'+value).join('\n');}
async function save(){busy.value=true;problem.value='';try{const persona=draft(),id=selected.value||crypto.randomUUID();await repository.save({id,name:persona.name,persona,updatedAt:new Date().toISOString(),portrait:portrait.value,avatar:avatar.value,useAsHomeImage:useAsHomeImage.value});selected.value=id;files.value=await repository.list();dirty.value=false;notice.value='人设档案已保存在本机';}catch(e){problem.value=(e as Error).message;}finally{busy.value=false;}}
async function use(){if(dirty.value||!selected.value){await save();if(problem.value)return;}emit('use',draft());}
async function remove(file:PersonaFile){if(!confirm(`删除“${file.name}”人设档案？已有游戏存档不会改变。`))return;try{await repository.remove(file.id);files.value=await repository.list();if(selected.value===file.id){dirty.value=false;reset();}}catch(e){problem.value=(e as Error).message;}}
async function importFile(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;try{validatePersonaTextFile(file.name,file.size);const content=(await file.text()).replace(/^\uFEFF/,'');if(!content.trim())throw Error('文件内容为空。');if(content.length>60000)throw Error('人设文本最多 60000 字。');if(!maySwitch())return;base=blankPersona();clearImages();selected.value='';name.value=file.name.replace(/\.(txt|md)$/i,'').slice(0,80);text.value=content;const imported=masterPersonaSummary({...base,name:name.value,identity:undefined,mentalPowerLevel:undefined,other:undefined,rawText:content});department.value=imported.department;spiritLevel.value=imported.spiritLevel;dirty.value=true;notice.value='已读取文件，请检查姓名和正文后保存。';problem.value='';}catch(e){problem.value=(e as Error).message;}finally{input.value='';}}
onMounted(async()=>{try{files.value=await repository.list();}catch(e){problem.value=(e as Error).message;}finally{loaded.value=true;}});
</script>
<template><section class="persona-library"><header class="panel-heading"><div><p class="eyebrow">USER PERSONAS / 我的 user 人设库</p><h1>我创建的不同 user 人设</h1></div><button :disabled="busy" @click="reset">＋ 新建档案</button></header>

<p v-if="problem" class="error-banner" role="alert">{{problem}}</p><p v-if="notice" class="hint" role="status">{{notice}}</p>
<div class="persona-library-columns"><aside class="persona-library-list"><p class="eyebrow">SAVED / 过往档案</p>
<div v-for="file in files" :key="file.id" class="persona-library-row"><button :class="{selected:selected===file.id}" :disabled="busy" @click="select(file)"><img v-if="file.avatar||file.portrait" :src="avatarUrl(file)" alt="" /><strong>{{file.name}}</strong><small>{{new Date(file.updatedAt).toLocaleString()}}</small></button><button :disabled="busy" :aria-label="'删除 '+file.name" @click="remove(file)">×</button></div>
<template v-if="historic.length"><p class="eyebrow">FROM STORIES / 过往会话中的 user 人设</p><button v-for="s in historic" :key="s.id" class="persona-history" :disabled="busy" @click="select({id:'',name:s.persona.name,persona:s.persona,updatedAt:s.updatedAt})">{{s.persona.name}} <small>{{s.name?`来自《${s.name}》 · `:''}}载入为新档案 →</small></button></template></aside>
<form class="persona-library-editor" @submit.prevent="save"><label>user 姓名 / 档案名称<input v-model="name" maxlength="80" required :disabled="busy" placeholder="填写自己扮演的人物姓名" @input="dirty=true" /></label><div class="field-grid"><label>身份（院系/职业，可留空）<input v-model="department" maxlength="200" :disabled="busy" @input="dirty=true" /></label><label>精神力等级（可留空）<input v-model="spiritLevel" maxlength="100" :disabled="busy" @input="dirty=true" /></label></div><div class="actions"><button type="button" :disabled="busy" @click="importInput?.click()">导入 TXT / MD</button><input ref="importInput" type="file" accept=".txt,.md,text/plain,text/markdown" hidden @change="importFile" /></div><PersonaImageEditor v-model:portrait="portrait" v-model:avatar="avatar" :disabled="busy" @dirty="dirty=true" /><label>user 人设正文<textarea v-model="text" rows="16" maxlength="60000" :disabled="busy" placeholder="写下你自己想扮演的 user 人设，或粘贴完整人设，也可以导入 TXT / Markdown 文件。" @input="dirty=true" /></label><small class="muted">{{text.length}} / 60000</small><div class="actions"><button type="submit" :disabled="busy||!name.trim()">{{busy?'保存中…':'保存档案'}}</button><button type="button" class="primary" :disabled="busy||!name.trim()" @click="use">使用此 user 人设新建游戏 →</button></div></form></div></section></template>

