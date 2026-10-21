<script setup lang="ts">
import {canContinueProse,bindRoundAction} from '../domain/replyActions';
import {needsStateRepair} from '../domain/roundHealth';
import {computed} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {selected} from '../domain/story';
const props=defineProps<{w:ViewModel;index:number;showAvatar:boolean}>();
const emit=defineEmits<{withdraw:[index:number];edit:[index:number,role:'user'|'assistant'];ask:[title:string,detail:string,perform:()=>void];toggleAvatar:[]}>();
const operationIndex=computed(()=>props.index);
const operationTurn=computed(()=>props.w.active?.turns[props.index]);
function rewind(){const run=bindRoundAction(props.w,props.index,index=>props.w.rewind(index));ask('确认回溯到本轮之前？',`第${props.index+1}轮：${operationTurn.value?.input.slice(0,60)||''}。将删除本轮及之后的对话内容，并回退相关人物状态、记忆及小剧场记录。此操作无法撤销。`,run);}
function repeat(){const run=bindRoundAction(props.w,props.index,index=>props.w.generate(undefined,index));ask('重新说这一幕？','沿用原行动与骰点，生成新稿；后续剧情和论坛动态将失效。',run);}
function ask(title:string,detail:string,perform:()=>void){emit('ask',title,detail,perform);}
</script>
<template><div class="story-action-list" role="group" aria-label="剧情操作"><template v-if="operationTurn"><div class="message-actions"><button type="button" :disabled="w.busy" @click="emit('edit',operationIndex,'user')">编辑输入</button><button type="button" :disabled="w.busy||w.workingMemory" @click="rewind">回溯</button><button type="button" :disabled="w.busy" @click="emit('withdraw',operationIndex)">撤回</button></div><div class="message-actions"><button type="button" :disabled="w.busy||!selected(operationTurn)" @click="emit('edit',operationIndex,'assistant')">编辑回复</button><button type="button" :disabled="w.busy" @click="repeat">重说</button><button type="button" v-if="selected(operationTurn)?.status==='incomplete'" :disabled="w.busy" @click="w.generate(undefined,operationIndex)">重试</button></div>
        <button type="button" v-if="canContinueProse(selected(operationTurn),w.canContinue)" :disabled="w.busy" @click="operationIndex<(w.active?.turns.length||0)-1?ask('从这条回复继续续写？','后续剧情会失效，原完整回复保留为旧稿。',()=>w.generate(undefined,operationIndex,true)):w.generate(undefined,operationIndex,true)">继续续写</button>
        <button type="button" v-if="selected(operationTurn)?.status==='incomplete'&&selected(operationTurn)?.text&&w.canContinue" :disabled="w.busy" title="正文已完整时，只重新生成隐藏状态，不追加正文" @click="w.repairState(operationIndex)">补修状态</button>
        <button type="button" v-if="selected(operationTurn)?.status==='complete'&&operationIndex===(w.active?.turns.length||0)-1&&w.canContinue&&w.active&&needsStateRepair(w.active,operationIndex,w.preferences.theaters,w.preferences.stateEnabled!==false)" :disabled="w.busy" @click="ask('只补全本轮缺失内容？','会检查当前稿件，只请求仍缺失的好感判断、精神体想法或小剧场；已经修好的字段保留，多次补全会继续处理剩余缺项。',()=>w.repairState(operationIndex))">补全状态和小剧场</button>
</template><button type="button" @click="emit('toggleAvatar')">{{showAvatar?'隐藏头像':'显示头像'}}</button></div></template>
