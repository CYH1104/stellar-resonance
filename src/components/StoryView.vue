<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';import type { ViewModel } from '../app/useWorkspace';import { selected } from '../domain/story';import DialogShell from './DialogShell.vue';
const props=defineProps<{w:ViewModel}>();
const edit=ref<{index:number;role:'user'|'assistant';text:string}>();
const confirm=ref<{title:string;detail:string;perform:()=>void}>();const bottom=ref<HTMLElement>();
function ask(title:string,detail:string,perform:()=>void){confirm.value={title,detail,perform};}
function approve(){const job=confirm.value?.perform;confirm.value=undefined;job?.();}
function draft(index:number,role:'user'|'assistant'){const t=props.w.active?.turns[index];if(t)edit.value={index,role,text:role==='user'?t.input:(selected(t)?.text||'')};}
watch(()=>props.w.active?.turns.length,async()=>{await nextTick();bottom.value?.scrollIntoView({block:'nearest'});});
</script>
<template><section v-if="w.active" class="story-view">
  <header class="panel-heading"><div><p class="eyebrow">STORY / 叙事</p><h1>{{w.active.name}}</h1></div><span class="tag">{{w.active.turns.length}} 轮</span></header>
  <div class="story-feed"><article class="opening"><span class="eyebrow">开局</span><p>{{w.active.opening}}</p></article>
    <section v-for="(turn,index) in w.active.turns" :id="`turn-${turn.id}`" :key="turn.id" class="turn">
      <article class="message player-message"><header><strong>{{w.active.persona.name}}</strong><span v-if="turn.dice" class="tag">骰 {{turn.dice.value}} · {{turn.dice.grade}}</span></header><p>{{turn.input}}</p><div class="message-actions"><button :disabled="w.busy" @click="draft(index,'user')">编辑输入</button><button :disabled="w.busy" @click="ask('删除这一轮？','会删除该轮及后续剧情，并恢复对应状态。',()=>w.rewind(index))">删除问答</button><button :disabled="w.busy" @click="ask('从这一幕重来？','保留此前剧情，移除该幕及后续状态和记忆。',()=>w.rewind(index))">从此幕重来</button></div></article>
      <article class="message assistant-message"><header><strong>剧情</strong><span v-if="selected(turn)?.status==='incomplete'" class="tag warning">{{w.busy&&index===w.active.turns.length-1?'生成中':'未完成'}}</span></header><p class="narrative">{{selected(turn)?.text || (w.busy?'正在准备回复…':'尚无回复，可以重演这一幕。')}}</p><div class="message-actions"><button :disabled="w.busy||!selected(turn)" @click="draft(index,'assistant')">编辑回复</button><button :disabled="w.busy" @click="ask('重演这一幕？','沿用原行动与骰点，生成新稿；后续剧情将失效。',()=>w.generate(undefined,index))">重演</button><button v-if="selected(turn)?.status==='incomplete'" :disabled="w.busy" @click="w.generate(undefined,index)">重试</button></div>
        <button v-if="selected(turn)?.status==='incomplete'&&selected(turn)?.text&&w.canContinue" :disabled="w.busy" @click="w.generate(undefined,index,true)">继续生成</button>
        <div v-if="turn.variants.length>1" class="drafts" aria-label="稿件选择"><button v-for="(v,i) in turn.variants" :key="v.id" :class="{selected:i===turn.selected}" :disabled="w.busy" @click="ask('切换稿件？','后续剧情会失效，状态与记忆将跟随此稿。',()=>w.changeVariant(index,i))">第 {{i+1}} 稿 · {{v.status==='complete'?'完整':'未完成'}}</button></div>
      </article>
    </section><div ref="bottom" />
  </div>
  <div v-if="w.active.suggestions.length" class="suggestions" aria-label="下一步建议"><span class="eyebrow">下一步建议</span><button v-for="s in w.active.suggestions" :key="s" :disabled="w.busy" @click="w.generate(s)">{{s}}</button></div>
  <form class="composer" @submit.prevent="w.generate()"><div class="composer-tools"><label class="toggle"><input v-model="w.preferences.diceEnabled" type="checkbox" :disabled="w.busy" />骰子 {{w.preferences.diceEnabled?'开':'关'}}</label><span class="muted">开启后，新行动投一次 D100。</span></div><textarea v-model="w.input" aria-label="本轮行动" rows="3" maxlength="16000" placeholder="写下你想说的话或想做的事…" :disabled="w.busy" @keydown.ctrl.enter.prevent="w.generate()" /><div class="composer-bottom"><div class="shortcuts"><button v-for="s in w.preferences.shortcuts" :key="s" type="button" :disabled="w.busy" @click="w.input=s">{{s}}</button></div><button v-if="w.busy" type="button" @click="w.stop()">停止生成</button><button v-else class="primary" type="submit" :disabled="!w.input.trim()||w.workingMemory">发送</button></div><small class="muted">Ctrl + Enter 发送。普通文字输入，不设置言语／举动模式。</small></form>
  <DialogShell v-if="confirm" :title="confirm.title" @close="confirm=undefined"><p>{{confirm.detail}}</p><div class="actions"><button @click="confirm=undefined">取消</button><button class="primary" @click="approve">确认</button></div></DialogShell>
  <DialogShell v-if="edit" title="编辑消息" @close="edit=undefined"><p class="muted">修改会使后续剧情失效；当前幕需要重演来重新计算状态。</p><textarea v-model="edit.text" aria-label="修改后的文字" rows="8" /><div class="actions"><button @click="edit=undefined">取消</button><button class="primary" @click="w.edit(edit.index,edit.role,edit.text);edit=undefined">保存修改</button></div></DialogShell>
</section></template>
