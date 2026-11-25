<script setup lang="ts">
import {ref,computed} from 'vue';
import type {Memory} from '../domain/contracts';
import type {RoundMemory} from '../domain/memories';
import type {ViewModel} from '../app/useWorkspace';
const props=defineProps<{w:ViewModel;memory:Memory}>();
const emit=defineEmits<{close:[]}>();
const record=ref<RoundMemory>(JSON.parse(JSON.stringify(props.memory.record)));
for(const f of record.value.facts||[])f.knownBy||=[];
function addCommitment(){record.value.commitments.push({id:'manual:'+crypto.randomUUID(),participants:[],content:'',deadline:'未明确',status:'open'});}
const expected={sessionId:props.w.active!.id,revision:props.memory.revision||1,record:JSON.stringify(props.memory.record)};
const error=ref(''),saving=ref(false);
const actors=computed(()=>{const s=props.w.state;return s?[s.player,...s.characters].filter((a,i,all)=>all.findIndex(x=>x.id===a.id)===i):[];});
const split=(text:string)=>text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
const lines=(e:Event)=>split((e.target as HTMLTextAreaElement).value);
async function save(){saving.value=true;error.value='';try{if(await props.w.reviseMemoryRecord(props.memory.id,JSON.stringify(record.value),expected))emit('close');else error.value=props.w.problem||'保存未完成，请检查当前存档或后台任务。';}finally{saving.value=false;}}
function addFact(){(record.value.facts||=[]).push({text:'',knownBy:[]});}
</script>
<template>
 <form class="memory-editor" @submit.prevent="save">
  <h3>编辑事件字段</h3><p>修改只影响这条记忆。人物数值仍取真实剧情状态；保存会保留旧修订，旧向量随之失效。知情角色留空表示未知。</p>
  <div class="field-grid"><label>剧情时间<input v-model="record.time" maxlength="200" required /></label><label>地点<input v-model="record.location" maxlength="500" required /></label></div>
  <label>参与人物（每行一位）<textarea :value="record.participants.join('\n')" rows="2" required @input="record.participants=lines($event)" /></label>
  <label>玩家行动（每行一条）<textarea :value="record.userActions.join('\n')" rows="3" required @input="record.userActions=lines($event)" /></label>
  <fieldset><legend>角色行动</legend><div v-for="(c,i) in record.charActions" :key="i" class="entry"><label>角色姓名<input v-model="c.name" maxlength="80" required /></label><label>行动（每行一条）<textarea :value="c.actions.join('\n')" rows="2" @input="c.actions=lines($event)" /></label><button type="button" @click="record.charActions.splice(i,1)">移除此项</button></div><button v-if="record.charActions.length<50" type="button" @click="record.charActions.push({name:'',actions:[]})">添加角色行动</button></fieldset>
  <div class="field-grid"><label>获得（每行一条）<textarea :value="record.gains.join('\n')" rows="2" @input="record.gains=lines($event)" /></label><label>失去（每行一条）<textarea :value="record.losses.join('\n')" rows="2" @input="record.losses=lines($event)" /></label></div>
  <fieldset><legend>事实与知情范围</legend><div v-for="(f,i) in record.facts" :key="i" class="entry"><label>事实内容<textarea v-model="f.text" maxlength="800" rows="2" required /></label><div class="audiences"><label v-for="a in actors" :key="a.id"><input v-model="f.knownBy" type="checkbox" :value="a.id" />{{a.name}}</label></div><p v-if="!f.knownBy?.length">知情范围未知，不发送给角色。</p><button type="button" @click="record.facts!.splice(i,1)">移除事实</button></div><button v-if="(record.facts?.length||0)<16" type="button" @click="addFact">添加事实</button></fieldset>
  <fieldset><legend>约定</legend><div v-for="(c,i) in record.commitments" :key="c.id" class="entry"><label>参与者（每行一位）<textarea :value="c.participants.join('\n')" rows="2" required @input="c.participants=lines($event)" /></label><label>约定内容<textarea v-model="c.content" maxlength="800" required /></label><div class="field-grid"><label>期限<input v-model="c.deadline" maxlength="200" required /></label><label>状态<select v-model="c.status"><option value="open">未履行</option><option value="fulfilled">已履行</option><option value="cancelled">已取消</option></select></label></div><small>此处是来源回合当时的状态；如有后续更新，以后续回合为准。</small><button type="button" @click="record.commitments.splice(i,1)">移除本轮记录</button></div><button type="button" :disabled="record.commitments.length>=200" @click="addCommitment">添加约定</button></fieldset>
  <p v-if="error" role="alert">{{error}}</p><div class="actions"><button class="primary" :disabled="saving||w.busy||w.workingMemory">{{saving?'正在保存…':'保存新修订'}}</button><button type="button" :disabled="saving" @click="emit('close')">取消</button></div>
 </form>
</template>
<style scoped>
.memory-editor{padding:20px;background:var(--surface);border:1px solid var(--line,#8886);border-radius:12px;margin:16px 0}.field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}fieldset{margin:18px 0;padding:14px;border:1px solid #8885;border-radius:8px}.entry{padding:12px 0;border-bottom:1px solid #8884}label{display:block;margin:8px 0}input:not([type=checkbox]),textarea,select{width:100%;box-sizing:border-box}.audiences{display:flex;flex-wrap:wrap;gap:12px}.audiences label{display:flex;align-items:center;gap:5px}.entry small{display:block;margin:8px 0}p[role=alert]{color:var(--color-error,#b33)}@media(max-width:600px){.field-grid{grid-template-columns:1fr}.memory-editor{padding:12px}}
</style>
