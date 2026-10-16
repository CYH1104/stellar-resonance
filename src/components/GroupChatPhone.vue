<script setup lang="ts">
import {computed,ref,watch,nextTick,onMounted} from 'vue';
import type {TheaterScene} from '../domain/contracts';
const props=defineProps<{scene?:TheaterScene&{round?:number};title:string;playerName:string}>();
const speakers=computed(()=>[...new Set(props.scene?.messages?.map(m=>m.speaker)||[])]);
const mine=(name:string)=>name===props.playerName||name==='user';
const feed=ref<HTMLElement>();let follow=true;
function track(){const el=feed.value;if(el)follow=el.scrollHeight-el.scrollTop-el.clientHeight<60;}
async function latest(){await nextTick();if(feed.value&&follow)feed.value.scrollTop=feed.value.scrollHeight;}
onMounted(()=>void latest());watch(()=>props.scene,()=>void latest());
</script>
<template><section class="chat-phone" aria-label="手机群聊">
  <div class="phone-status"><span>校内通讯</span><span class="phone-camera" aria-hidden="true"></span><span aria-hidden="true">▮▮▮ ▰</span></div>
  <header class="phone-chat-header"><span class="phone-back" aria-hidden="true">‹</span><div><h3>{{title}}</h3><small>{{scene?.round?`第 ${scene.round} 轮 · `:''}}{{speakers.length?`${speakers.length} 位发言`:'群聊小剧场'}}</small></div><span class="phone-more" aria-hidden="true">•••</span></header>
  <div ref="feed" class="phone-chat-messages" role="log" aria-label="群聊消息" @scroll="track">
    <p class="phone-chat-notice">独立群聊番外 · 不改变主线</p>
    <article v-for="(message,index) in scene?.messages" :key="index" class="phone-message" :class="{'phone-message-mine':mine(message.speaker)}">
      <span class="phone-avatar" :class="'avatar-tone-'+(speakers.indexOf(message.speaker)%4)" aria-hidden="true">{{message.speaker.slice(0,1)}}</span>
      <div class="phone-message-text"><span class="phone-speaker">{{message.speaker}}</span><p class="phone-bubble">{{message.content}}</p></div>
    </article>
    <p v-if="!scene?.messages?.length" class="phone-chat-empty">{{scene?.content||'还没有群聊消息。完成下一轮剧情后，这里会收到新的聊天。'}}</p>
  </div>
  <footer class="phone-chat-footer"><span>群聊随剧情更新</span><small>只读小剧场</small></footer><div class="phone-home-indicator" aria-hidden="true"></div>
</section></template>
