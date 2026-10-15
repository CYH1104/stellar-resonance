<script setup lang="ts">
import {ref} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Session} from '../domain/contracts';
import DialogShell from './DialogShell.vue';
const props=defineProps<{w:ViewModel;openLabel?:string}>();
const target=ref<{id:string;name:string;player:string;rounds:number}>();
function ask(session:Session){props.w.problem='';target.value={id:session.id,name:session.name,player:session.persona.name,rounds:session.turns.length};}
function close(){if(!props.w.deletingSessionId)target.value=undefined;}
async function remove(){if(target.value&&await props.w.deleteSession(target.value.id))target.value=undefined;}
</script>
<template>
  <ul class="save-list"><li v-for="s in w.sessions" :key="s.id"><div class="save-description"><strong>{{s.name}}</strong><p class="muted">{{s.persona.name}} · {{s.turns.length}} 轮 · {{new Date(s.updatedAt).toLocaleString()}}</p></div><div class="actions"><button :disabled="w.busy||w.workingMemory||w.workingPersona||w.creatingGame" @click="w.open(s.id)">{{openLabel||'继续游戏'}}</button><button class="danger" :aria-label="`删除存档：${s.name}（${s.persona.name}）`" :disabled="w.loading||w.busy||w.workingMemory||w.workingPersona||w.creatingGame" @click="ask(s)">删除存档</button></div></li></ul>
  <DialogShell v-if="target" :title="`删除存档《${target.name}》？`" @close="close">
    <p>{{target.player}} · {{target.rounds}} 轮。将删除这份存档的全部聊天、人物状态、记忆及向量、骰点和小剧场记录。</p>
    <p>此操作无法撤销。需要保留时，请先取消并导出备份。其他存档、模型设置和 API Key 会保留。</p>
    <p v-if="w.problem" role="alert">{{w.problem}}</p>
    <div class="actions"><button :disabled="!!w.deletingSessionId" @click="close">取消</button><button class="danger" :disabled="w.busy||w.workingMemory||w.workingPersona||w.creatingGame" @click="remove">{{w.deletingSessionId?'正在删除…':'确认删除'}}</button></div>
  </DialogShell>
</template>
