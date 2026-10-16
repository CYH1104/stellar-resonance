<script setup lang="ts">
import {computed} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {selected} from '../domain/story';
const props=defineProps<{w:ViewModel;index:number;showAvatar:boolean}>();
const emit=defineEmits<{edit:[index:number,role:'user'|'assistant'];ask:[title:string,detail:string,perform:()=>void];toggleAvatar:[]}>();
const operationIndex=computed(()=>props.index);
const operationTurn=computed(()=>props.w.active?.turns[props.index]);
function ask(title:string,detail:string,perform:()=>void){emit('ask',title,detail,perform);}
</script>
<template><div class="story-action-list" role="group" aria-label="剧情操作"><template v-if="operationTurn"><div class="message-actions"><button type="button" :disabled="w.busy" @click="emit('edit',operationIndex,'user')">编辑输入</button><button type="button" :disabled="w.busy" @click="ask('删除这一轮？','会删除该轮及后续剧情、论坛动态和对应互动，并恢复状态。',()=>w.rewind(operationIndex))">删除问答</button><button type="button" :disabled="w.busy" @click="ask('从这一幕重来？','保留此前剧情，移除该幕及后续状态、记忆和论坛动态。',()=>w.rewind(operationIndex))">从此幕重来</button></div><div class="message-actions"><button type="button" :disabled="w.busy||!selected(operationTurn)" @click="emit('edit',operationIndex,'assistant')">编辑回复</button><button type="button" :disabled="w.busy" @click="ask('重演这一幕？','沿用原行动与骰点，生成新稿；后续剧情和论坛动态将失效。',()=>w.generate(undefined,operationIndex))">重演</button><button type="button" v-if="selected(operationTurn)?.status==='incomplete'" :disabled="w.busy" @click="w.generate(undefined,operationIndex)">重试</button></div>
        <button type="button" v-if="selected(operationTurn)?.status==='incomplete'&&selected(operationTurn)?.text&&w.canContinue" :disabled="w.busy" @click="w.generate(undefined,operationIndex,true)">继续续写</button>
        <button type="button" v-if="selected(operationTurn)?.status==='incomplete'&&selected(operationTurn)?.text&&w.canContinue" :disabled="w.busy" title="正文已完整时，只重新生成隐藏状态，不追加正文" @click="w.repairState(operationIndex)">补修状态</button>
        <button type="button" v-if="selected(operationTurn)?.status==='complete'&&operationIndex===(w.active?.turns.length||0)-1&&w.canContinue" :disabled="w.busy" @click="ask('补全本轮状态和小剧场？','会调用剧情接口补全好感度、精神体 OS 和已开启的小剧场；正文、原骰点及已有论坛内容保留。失败时保留原有有效状态。',()=>w.repairState(operationIndex))">补全状态和小剧场</button>
        <div v-if="operationTurn.variants.length>1" class="drafts" aria-label="稿件选择"><button type="button" v-for="(v,i) in operationTurn.variants" :key="v.id" :class="{selected:i===operationTurn.selected}" :disabled="w.busy" @click="ask('切换稿件？','后续剧情及论坛动态会失效，状态与记忆将跟随此稿。',()=>w.changeVariant(operationIndex,i))">第 {{i+1}} 稿 · {{v.status==='complete'?'完整':'未完成'}}</button></div></template><button type="button" @click="emit('toggleAvatar')">{{showAvatar?'隐藏头像':'显示头像'}}</button></div></template>
