<script setup lang="ts">
import {randomEventsAvailable} from '../domain/featureAvailability';

import UserAvatar from './UserAvatar.vue';
import {cleanAvatarAppearance} from '../domain/avatarAppearance';
import {normalizeDefaultOpening,defaultOpening} from '../domain/opening';
import StoryInline from './StoryInline.vue';
import {hasRenderableHtml} from '../domain/htmlRendering';


import {dataFromState} from '../domain/mvu';
import {storyScene,sceneSnapshotLabel} from '../domain/storyScene';
import {stateAt} from '../domain/story';
import {eventCardDescription} from '../domain/randomEvents';
import {stateUpdateLabel,stateUpdateDetails} from '../domain/stateUpdate';
import {needsStateRepair} from '../domain/roundHealth';
import {cleanSuggestions} from '../domain/suggestions';
import type {Turn} from '../domain/contracts';
import {accountStorage} from '../storage/accountScope';

import { computed, nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue';import StoryActions from './StoryActions.vue';import {PersonaLibrary,personaMediaFile} from '../storage/personaLibrary';import type { ViewModel } from '../app/useWorkspace';import { selected } from '../domain/story';import DialogShell from './DialogShell.vue';import StoryContent from './StoryContent.vue';
const props=defineProps<{w:ViewModel}>();
const regexRules=computed(()=>(props.w.preferences.regexRules||[]).filter(r=>!r.setId||r.setId===props.w.currentPreset));
const highlightedTurn=ref('');let highlightTimer:ReturnType<typeof setTimeout>|undefined;

const menuOpen=ref(false),chosenTurn=ref(-1),menuRole=ref<'user'|'assistant'>('assistant');
const menuPosition=ref<Record<string,string>>({});
const menuTarget=typeof document!=='undefined'&&document.getElementById('academy-workspace')?'#academy-workspace':'#app';
watch(()=>props.w.active?.id,()=>{menuOpen.value=false;chosenTurn.value=-1;edit.value=undefined;confirm.value=undefined;});
const showAvatar=ref((()=>{try{return accountStorage.getItem('academy:chat-avatar-hidden')!=='true';}catch{return true;}})());
const avatarUrl=ref(''),avatarAppearance=ref(cleanAvatarAppearance()),avatarLegacyCrop=ref(false);let avatarRequest=0;
function toggleAvatar(){showAvatar.value=!showAvatar.value;try{accountStorage.setItem('academy:chat-avatar-hidden',String(!showAvatar.value));}catch{}}
function toggleMenu(index:number,event?:MouseEvent,role:'user'|'assistant'='assistant'){
 menuOpen.value=chosenTurn.value===index&&menuRole.value===role?!menuOpen.value:true;menuRole.value=role;chosenTurn.value=index;
 if(index<0||!event||!menuOpen.value)return;
 const anchor=event.currentTarget as HTMLElement,rect=anchor.getBoundingClientRect(),height=Math.min(390,innerHeight-32),width=Math.min(220,innerWidth-32);
 menuPosition.value={position:'fixed',left:Math.max(16,Math.min(rect.right-width,innerWidth-width-16))+'px',top:Math.max(16,Math.min(rect.bottom+6,innerHeight-48))+'px',maxHeight:height+'px',width:width+'px'};
 void nextTick(()=>{if(!menuOpen.value||chosenTurn.value!==index||menuRole.value!==role)return;const menu=document.querySelector<HTMLElement>(role==='user'?'.user-action-menu':'.reply-action-menu');if(!menu)return;const actual=Math.min(menu.scrollHeight,height),below=rect.bottom+6,top=below+actual<=innerHeight-16?below:rect.top-actual-6;menuPosition.value={...menuPosition.value,top:Math.max(16,Math.min(top,innerHeight-actual-16))+'px'};});
}

async function loadAvatar(){const persona=props.w.active?.persona;const request=++avatarRequest;if(avatarUrl.value)URL.revokeObjectURL(avatarUrl.value);avatarUrl.value='';avatarAppearance.value=cleanAvatarAppearance();avatarLegacyCrop.value=false;if(!persona)return;try{const files=await new PersonaLibrary().list();if(request!==avatarRequest)return;const file=props.w.active?personaMediaFile(files,props.w.active):undefined;avatarAppearance.value=cleanAvatarAppearance(file?.avatarAppearance);avatarLegacyCrop.value=!file?.portrait;const blob=file?.portrait||file?.avatar;if(blob)avatarUrl.value=URL.createObjectURL(blob);}catch{}}
watch(()=>[props.w.active?.id,props.w.active?.persona],loadAvatar,{immediate:true,deep:true});
onMounted(()=>window.addEventListener('academy:persona-avatar-updated',loadAvatar));
onBeforeUnmount(()=>{window.removeEventListener('academy:persona-avatar-updated',loadAvatar);avatarRequest++;if(avatarUrl.value)URL.revokeObjectURL(avatarUrl.value);});
const edit=ref<{index:number;role:'user'|'assistant'|'opening';text:string;sessionId:string;turnId?:string;variantId?:string;original:string}>();
watch(()=>edit.value?.text,()=>{void nextTick(()=>{document.querySelectorAll<HTMLTextAreaElement>('.inline-message-editor textarea').forEach(el=>{el.style.height='0px';el.style.height=(el.scrollHeight+2)+'px';});});});
const confirm=ref<{title:string;detail:string;perform:()=>void}>();const feed=ref<HTMLElement>();let follow=true;
function ask(title:string,detail:string,perform:()=>void){menuOpen.value=false;confirm.value={title,detail,perform};}
function requestWithdraw(index:number,role:'user'|'assistant'){
 const session=props.w.active,turn=session?.turns[index];if(!session||!turn||props.w.busy)return;
 const sessionId=session.id,turnId=turn.id,existing=props.w.input;
 const detail=(role==='assistant'?'会连同上一条用户发言一起撤回，并移除该轮及后续剧情。':'会撤回该条用户发言、对应回复及后续剧情。')+'状态、记忆和论坛内容同步回退，用户发言放回输入框，不自动发送。'+(existing.trim()&&existing!==turn.input?'当前输入框已有草稿，确认后将替换为撤回的用户发言。':'');
 ask('确认撤回？',detail,()=>{if(props.w.active?.id!==sessionId){props.w.problem='当前会话已切换，请重新选择撤回。';return;}void props.w.withdraw(index,existing,turnId).then(ok=>{if(ok)void nextTick(()=>document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus());});});
}
function approve(){const job=confirm.value?.perform;confirm.value=undefined;job?.();}
function draft(index:number,role:'user'|'assistant'){menuOpen.value=false;const t=props.w.active?.turns[index];if(t){const text=role==='user'?t.input:(selected(t)?.text||'');edit.value={index,role,text,original:text,sessionId:props.w.active!.id,turnId:t.id,variantId:role==='assistant'?selected(t)?.id:undefined};void nextTick(()=>{const editor=document.querySelector<HTMLTextAreaElement>('.inline-message-editor textarea');editor?.focus();editor?.setSelectionRange(editor.value.length,editor.value.length);});}}
async function saveInlineEdit(){
 const draft=edit.value,session=props.w.active;if(!draft||!session||props.w.busy)return;
 props.w.problem='';if(draft.sessionId!==session.id){edit.value=undefined;return;}
 if(draft.role==='opening'){if(!draft.text.trim())return;if(session.opening!==draft.original){props.w.problem='开场白已发生变化，请重新打开编辑。';return;}session.opening=draft.text;await props.w.save();}
 else{const index=session.turns.findIndex(t=>t.id===draft.turnId),turn=session.turns[index];if(!turn||(draft.role==='assistant'&&selected(turn)?.id!==draft.variantId)||(draft.role==='user'?turn.input:selected(turn)?.text)!==draft.original){props.w.problem='这条消息或稿件已变化，请重新打开编辑。';return;}await props.w.edit(index,draft.role,draft.text);}
 if(!props.w.problem&&edit.value===draft)edit.value=undefined;
}
function openingSceneLabel(turn:Turn,index:number){return sceneSnapshotLabel(selected(turn)?.outcome?.openingScene||storyScene(stateAt(props.w.active!,index)));}
function replySuggestions(turn:Turn,index:number){if(props.w.preferences.suggestionsEnabled===false)return []; const v=selected(turn);const primary=cleanSuggestions(v?.outcome?.suggestions);if(primary.length)return primary;const saved=cleanSuggestions(v?.suggestions);return saved.length?saved:index===(props.w.active?.turns.length||0)-1?cleanSuggestions(props.w.active?.suggestions):[];}
function fillReply(text:string){const clean=text.replace(/\*\*/g,'').replace(/^\s*[-*]\s+/,'').trim();if(!clean||props.w.busy)return;props.w.input=[props.w.input.trim(),clean].filter(Boolean).join('\n').slice(0,16000);void nextTick(()=>document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus());}
function outsideMenu(event:Event){if(event.target instanceof Element&&event.target.closest('.reply-action-menu,.user-action-menu,.composer-action-menu,.composer-more'))return;menuOpen.value=false;}
function menuKey(event:KeyboardEvent){if(event.key==='Escape')menuOpen.value=false;}
function switchVariant(index:number,direction:number){const turn=props.w.active?.turns[index];if(!turn||props.w.busy)return;const next=turn.selected+direction;if(next<0||next>=turn.variants.length)return;menuOpen.value=false;if(index<(props.w.active?.turns.length||0)-1)ask('切换回复？','后续剧情及论坛动态会失效，状态与记忆将跟随此回复。',()=>void props.w.changeVariant(index,next));else void props.w.changeVariant(index,next);}
function closeFloatingMenu(event:Event){if(event.target instanceof Element&&event.target.closest('.reply-action-menu,.user-action-menu'))return;if(chosenTurn.value>=0)menuOpen.value=false;}
if(typeof window!=='undefined'){document.addEventListener('pointerdown',outsideMenu,true);document.addEventListener('keydown',menuKey);window.addEventListener('resize',closeFloatingMenu);window.addEventListener('scroll',closeFloatingMenu,true);}
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',outsideMenu,true);document.removeEventListener('keydown',menuKey);window.removeEventListener('resize',closeFloatingMenu);window.removeEventListener('scroll',closeFloatingMenu,true);});

const pageStart=ref(Math.max(0,(props.w.active?.turns.length||0)-10));let pageBusy=false;
const visibleTurns=computed(()=>{const turns=props.w.active?.turns||[];const start=props.w.hideFloors?pageStart.value:0;return turns.slice(start,props.w.hideFloors?start+10:undefined).map((turn,i)=>({turn,index:start+i}));});
const pageEnd=computed(()=>Math.min(props.w.active?.turns.length||0,pageStart.value+10));
async function pageHistory(direction:-1|1){const total=props.w.active?.turns.length||0;if(!props.w.hideFloors||pageBusy||direction<0&&pageStart.value===0||direction>0&&pageEnd.value>=total)return;pageBusy=true;follow=false;pageStart.value=Math.max(0,Math.min(Math.max(0,total-10),pageStart.value+direction*10));await nextTick();if(feed.value)feed.value.scrollTop=direction<0?Math.max(1,feed.value.scrollHeight-feed.value.clientHeight-2):2;setTimeout(()=>pageBusy=false,160);}
function pageWheel(e:WheelEvent){const el=feed.value;if(!el)return;if(e.deltaY<0&&el.scrollTop<35)void pageHistory(-1);else if(e.deltaY>0&&el.scrollHeight-el.scrollTop-el.clientHeight<35)void pageHistory(1);}
let touchY=0;function pageTouch(e:TouchEvent){touchY=e.touches[0]?.clientY||0;}function pageTouchEnd(e:TouchEvent){const delta=touchY-(e.changedTouches[0]?.clientY||touchY);pageWheel({deltaY:delta} as WheelEvent);}
async function showTurn(event:Event){const id=(event as CustomEvent).detail;const index=props.w.active?.turns.findIndex(t=>t.id===id)??-1;if(index<0)return;pageStart.value=Math.floor(index/10)*10;follow=false;highlightedTurn.value='';await nextTick();highlightedTurn.value=id;clearTimeout(highlightTimer);highlightTimer=setTimeout(()=>highlightedTurn.value='',3500);await nextTick();document.getElementById('turn-'+id)?.scrollIntoView({block:'center',behavior:'smooth'});}
function latestStory(){pageStart.value=Math.max(0,(props.w.active?.turns.length||0)-10);follow=true;void scrollLatest();}
function earliest(){pageStart.value=0;follow=false;void nextTick(()=>feed.value?.scrollTo({top:0}));}
watch(()=>props.w.active?.id,()=>{pageStart.value=Math.max(0,(props.w.active?.turns.length||0)-10);follow=true;void scrollLatest();});watch(()=>props.w.hideFloors,()=>{pageStart.value=Math.max(0,(props.w.active?.turns.length||0)-10);follow=true;void scrollLatest();});
const composer=ref<HTMLTextAreaElement>();
function resizeComposer(){const el=composer.value;if(!el)return;el.style.height='0px';const max=Math.max(100,innerHeight*.3);el.style.height=Math.max(40,Math.min(max,el.scrollHeight+2))+'px';el.style.maxHeight=max+'px';el.style.overflowY=el.scrollHeight>max?'auto':'hidden';}
watch(()=>props.w.input,()=>void nextTick(resizeComposer));
onMounted(()=>{void scrollLatest();resizeComposer();window.addEventListener('resize',resizeComposer);window.addEventListener('academy:story-turn',showTurn);});onBeforeUnmount(()=>{clearTimeout(highlightTimer);window.removeEventListener('resize',resizeComposer);window.removeEventListener('academy:story-turn',showTurn);});
const openingText=computed(()=>normalizeDefaultOpening(props.w.active?.opening||''));
const openingLines=computed(()=>openingText.value.split('\n'));
function editOpening(){menuOpen.value=false;edit.value={index:-1,role:'opening',text:props.w.active?.opening||'',original:props.w.active?.opening||'',sessionId:props.w.active!.id};void nextTick(()=>document.querySelector<HTMLTextAreaElement>('.inline-message-editor textarea')?.focus());}
function trackScroll(){const el=feed.value;if(el)follow=el.scrollHeight-el.scrollTop-el.clientHeight<100;}
async function scrollLatest(){await nextTick();if(feed.value&&follow&&(!props.w.hideFloors||pageEnd.value===(props.w.active?.turns.length||0)))feed.value.scrollTop=feed.value.scrollHeight;}
watch(()=>props.w.active?.turns.length,()=>{follow=true;pageStart.value=Math.max(0,(props.w.active?.turns.length||0)-10);void scrollLatest();});
watch(()=>{const turns=props.w.active?.turns;return turns?.length?selected(turns[turns.length-1])?.text:'';},()=>void scrollLatest());
watch(()=>{const turn=props.w.active?.turns.at(-1);return JSON.stringify(turn?.randomEvent);},()=>void scrollLatest());
watch(()=>JSON.stringify(props.w.active?.suggestions),()=>void scrollLatest());
</script>
<template><section v-if="w.active" class="story-view">
  <header class="panel-heading"><div><p class="eyebrow">STORY / 叙事</p><h1>{{w.active.name}}</h1></div><div class="story-history-tools"><button type="button" @click="earliest">↑ 最早</button><span class="tag">{{w.active.turns.length}} 轮</span><button type="button" @click="latestStory">最新 ↓</button></div></header>
  <p v-if="w.hideFloors&&w.active.turns.length>10" class="history-window-label" role="status">当前显示第 {{pageStart+1}}–{{pageEnd}} 轮；更早楼层已折叠，可上翻查看。</p>
  <div ref="feed" class="story-feed" aria-label="剧情记录" @scroll="trackScroll" @wheel.passive="pageWheel" @touchstart.passive="pageTouch" @touchend.passive="pageTouchEnd"><button v-if="w.hideFloors&&pageStart>0" class="history-page-link" type="button" @click="pageHistory(-1)">向上滚动，查看更早 10 楼</button><article v-if="!w.hideFloors||pageStart===0" class="opening"><span class="eyebrow">开局</span><form v-if="edit?.role==='opening'" class="inline-message-editor" @submit.prevent="saveInlineEdit"><textarea v-model="edit.text" rows="7" aria-label="编辑开场白" @keydown.esc="edit=undefined" /><div class="actions"><button type="button" @click="edit=undefined">取消</button><button type="submit">保存修改</button></div></form><div v-else-if="openingText===defaultOpening" class="story-content opening-verification"><p v-for="(line,i) in openingLines" :key="i"><StoryInline :text="line" /></p></div><StoryContent v-else :text="openingText" /><footer class="message-operation-footer"><button type="button" class="composer-more opening-more" aria-label="编辑开场白" :disabled="w.busy" @click="editOpening">&#8226;&#8226;&#8226;</button></footer></article>
    <section v-for="{turn,index} in visibleTurns" :id="`turn-${turn.id}`" :key="turn.id" class="turn">
      <article class="message player-message"><header><strong>{{w.active.persona.name}}</strong><UserAvatar v-if="showAvatar" :name="w.active.persona.name" :src="avatarUrl" :appearance="avatarAppearance" :legacy-crop="avatarLegacyCrop" /><span v-if="randomEventsAvailable&&turn.dice" class="tag">骰 {{turn.dice.value}} · {{turn.dice.grade}}</span></header><template v-if="edit?.index===index&&edit.role==='user'"><form class="inline-message-editor" @submit.prevent="saveInlineEdit"><textarea v-if="edit" v-model="edit.text" rows="8" aria-label="修改后的文字" @keydown.esc="edit=undefined" /><div class="actions"><button type="button" @click="edit=undefined">取消</button><button type="submit" :disabled="w.busy">保存修改</button></div></form></template><StoryContent v-else-if="hasRenderableHtml(turn.input,true)||regexRules.some(r=>!r.disabled&&r.placement.includes(1)&&(!r.promptOnly||r.markdownOnly))" :text="turn.input" :regex-rules="regexRules" :regex-context="{placement:1,scope:'display',edited:turn.inputEdited,depth:(w.active.turns.length-index-1)*2+1,user:w.active.persona.name,char:'星穹学院'}" /><p v-else>{{turn.input}}</p><footer class="message-operation-footer"><div class="user-actions-anchor"><button type="button" class="composer-more" aria-label="用户消息操作" :aria-expanded="menuOpen&&chosenTurn===index&&menuRole==='user'" @click="toggleMenu(index,$event,'user')">&#8226;&#8226;&#8226;</button><Teleport :to="menuTarget"><div v-if="menuOpen&&chosenTurn===index&&menuRole==='user'" class="user-action-menu" :style="menuPosition"><button type="button" @click="draft(index,'user')">编辑输入</button><button type="button" :disabled="w.busy" @click="requestWithdraw(index,'user')">撤回</button></div></Teleport></div></footer></article>
      <template v-if="randomEventsAvailable"><aside v-if="turn.randomEvent?.status==='accepted'&&(eventCardDescription(selected(turn)))" class="random-event-card" aria-label="随机事件">
        <header class="event-card-heading"><span class="eyebrow">EVENT / {{turn.randomEvent.proposal.kind}}</span></header><h3>{{turn.randomEvent.proposal.title}}</h3><p>{{eventCardDescription(selected(turn))}}</p><p class="rail-note">骰点 {{turn.dice?.value}} · {{turn.dice?.grade}}</p>
      </aside>
      <aside v-else-if="!w.busy&&(turn.randomEvent?.status==='failed'||turn.randomEvent?.status==='preparing')" class="random-event-card"><p>事件生成未完成，当前行动已保留。</p><button :disabled="w.busy" @click="w.generate(undefined,index)">重试</button><button :disabled="w.busy" @click="w.decideRandomEvent(index,false)">跳过事件</button></aside>
      <button v-else-if="turn.randomEvent?.status==='pending'&&!w.busy" @click="w.generate(undefined,index)">继续生成</button>
      </template><article v-if="turn.variants.length" class="message assistant-message" :class="{'source-story-highlight':highlightedTurn===turn.id}"><header class="academy-reply-heading"><span class="academy-reply-signature"><strong class="academy-reply-label">INTERSTELLAR ACADEMY</strong><span v-if="w.busy&&index===w.active.turns.length-1&&selected(turn)?.status==='incomplete'" class="academy-generating" role="status" aria-label="正在生成">ing<span class="generation-dots" aria-hidden="true">...</span></span></span><span class="academy-round-number" :aria-label="`第${index+1}轮`">NO.{{index+1}}</span></header><p class="story-opening-scene" aria-label="本轮开场时间地点">{{openingSceneLabel(turn,index)}}</p><template v-if="edit?.index===index&&edit.role==='assistant'"><form class="inline-message-editor" @submit.prevent="saveInlineEdit"><textarea v-if="edit" v-model="edit.text" rows="8" aria-label="修改后的文字" @keydown.esc="edit=undefined" /><div class="actions"><button type="button" @click="edit=undefined">取消</button><button type="submit" :disabled="w.busy">保存修改</button></div></form></template><StoryContent v-else :html-context="{variables:dataFromState(stateAt(w.active,index+1)),messageId:(index+1)*2,user:w.active.persona.name,char:'星穹学院'}" :regex-rules="regexRules" :regex-context="{placement:2,scope:'display',edited:selected(turn)?.edited,depth:(w.active.turns.length-index-1)*2,user:w.active.persona.name,char:'星穹学院'}" :highlighted="highlightedTurn===turn.id" :text="selected(turn)?.text||''" :streaming="w.busy&&index===w.active.turns.length-1&&selected(turn)?.status==='incomplete'" :placeholder="w.busy?'正在准备回复…':'尚无回复，可以重说这一幕。'" />
      <section v-if="replySuggestions(turn,index).length" class="inline-suggestions"><button v-for="s in replySuggestions(turn,index)" :key="s" :disabled="w.busy" @click="fillReply(s)">{{s}}</button></section><span v-if="!w.busy||selected(turn)?.status==='complete'" class="reply-completion" role="status">{{w.storageStatus==='failed'?'当前内容未保存，请导出备份':selected(turn)?.status==='complete'?stateUpdateLabel(selected(turn)?.outcome,needsStateRepair(w.active,index,w.preferences.theaters,w.preferences.stateEnabled!==false)):'本轮尚未完整输出，可继续续写'}}</span><details v-if="stateUpdateDetails(selected(turn)?.outcome).length" class="state-validation-details"><summary>查看本轮校验详情</summary><ul><li v-for="detail in stateUpdateDetails(selected(turn)?.outcome)" :key="detail.code">{{detail.text}} <code>{{detail.code}}</code></li></ul><p>可在本条回复操作中补全状态和小剧场；不会重写正文。</p></details><footer class="message-operation-footer"><div class="reply-actions-anchor"><button type="button" class="composer-more reply-more" aria-label="本条回复操作" :aria-expanded="menuOpen&&chosenTurn===index&&menuRole==='assistant'" @click="toggleMenu(index,$event)">&#8226;&#8226;&#8226;</button><nav v-if="turn.variants.length>1" class="variant-arrows" aria-label="切换回复"><button type="button" aria-label="上一条回复" :disabled="w.busy||turn.selected===0" @click="switchVariant(index,-1)">&lt;</button><button type="button" aria-label="下一条回复" :disabled="w.busy||turn.selected===turn.variants.length-1" @click="switchVariant(index,1)">&gt;</button></nav><Teleport :to="menuTarget"><div v-if="menuOpen&&chosenTurn===index&&menuRole==='assistant'" class="reply-action-menu" :style="menuPosition"><StoryActions :w="w" :index="index" :show-avatar="showAvatar" @withdraw="index=>requestWithdraw(index,'assistant')" @edit="draft" @ask="ask" @toggle-avatar="toggleAvatar" /></div></Teleport></div></footer></article>
    </section>
    <button v-if="w.hideFloors&&pageEnd<w.active.turns.length" class="history-page-link" type="button" @click="pageHistory(1)">向下滚动，查看更新 10 楼</button>
  </div>



  <form class="composer" @keydown.esc="menuOpen=false" @submit.prevent="w.generate()"><div class="composer-tools"><div class="shortcuts"><button v-for="s in w.preferences.shortcuts" :key="s" type="button" :disabled="w.busy" @click="fillReply(s)">{{s}}</button></div><button type="button" class="composer-more" aria-label="剧情操作菜单" :aria-expanded="menuOpen&&chosenTurn===-1" aria-controls="story-operation-menu" @click="toggleMenu(-1)">&#8226;&#8226;&#8226;</button></div><div v-if="menuOpen&&chosenTurn===-1" id="story-operation-menu" class="composer-action-menu"><StoryActions :w="w" :index="w.active.turns.length-1" :show-avatar="showAvatar" @withdraw="index=>requestWithdraw(index,'assistant')" @edit="draft" @ask="ask" @toggle-avatar="toggleAvatar" /></div><div class="composer-input-row"><textarea ref="composer" v-model="w.input" aria-label="本轮行动" rows="1" maxlength="16000" placeholder="写下你想说的话或想做的事…" :disabled="w.busy" @keydown.ctrl.enter.prevent="w.generate()" /><div class="composer-bottom"><button v-if="w.busy" class="composer-stop" type="button" aria-label="停止生成" title="停止生成" @click="w.stop()"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg></button><button v-else class="primary composer-send" aria-label="发送" title="发送" type="submit" :disabled="!w.input.trim()||w.pendingRandomEvent"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 3-7 18-4-7-7-4L21 3Z"/><path d="m10 14 11-11"/></svg></button></div></div></form>
  <DialogShell v-if="confirm" :title="confirm.title" @close="confirm=undefined"><p>{{confirm.detail}}</p><div class="actions"><button @click="confirm=undefined">取消</button><button class="primary" :disabled="w.busy" @click="approve">{{confirm.title==='确认回溯到本轮之前？'?'确认回溯':'确认'}}</button></div></DialogShell>

</section></template>

<style>
.terminal-round-memory{margin:14px 0;border:1px solid var(--color-border,#4a5664);border-radius:10px;padding:10px 14px;font-size:13px}.terminal-round-memory summary{cursor:pointer}.terminal-round-memory p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8}
.story-opening-scene{font-size:.82em;color:var(--muted,#8091a5);line-height:1.5;margin:6px 0 12px;overflow-wrap:anywhere}</style>
