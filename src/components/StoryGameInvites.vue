<script setup lang="ts">
import {computed,reactive,ref} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {useStoryGameInvites} from '../app/useStoryGameInvites';
import {storyGameNames,type StoryGameInvite,type StoryGameKind} from '../domain/storyGameInvites';
import {requiredGameNpcs} from '../domain/gameRecruitment';
import TerminalActorAvatar from './TerminalActorAvatar.vue';
const props=defineProps<{w:ViewModel}>();
const emit=defineEmits<{open:[invite:StoryGameInvite]}>();
const u=reactive(useStoryGameInvites(props.w));
const host=ref(''),kind=ref<StoryGameKind>('landlord'),request=ref('可以邀请你熟悉的朋友一起玩一局吗？'),mode=ref<'joined'|'spectating'>('joined');
const pending=computed(()=>u.invitations.filter(i=>!['joined','spectating','declined'].includes(i.status)).slice().reverse());
const past=computed(()=>u.invitations.filter(i=>i.status==='joined'||i.status==='spectating').slice().reverse());
const needed=(i:StoryGameInvite)=>requiredGameNpcs(i.kind,i.recruitment?.mode||'either');
const can=(i:StoryGameInvite,m:'joined'|'spectating')=>!i.recruitment||i.recruitment.mode==='either'||i.recruitment.mode===m;
async function respond(id:string,m:'joined'|'spectating'|'declined'){const i=await u.respond(id,m);if(i?.targetId)emit('open',i);}
</script>
<template>
<section v-if="u.invitations.length||u.friends.length" class="story-game-invites" aria-label="角色游戏邀约">
 <h3>朋友的游戏邀约 <span v-if="pending.length">{{pending.length}}</span></h3>
 <details class="friend-request-form">
  <summary>请角色邀请自己的朋友</summary>
  <form @submit.prevent="u.requestFriends(host,kind,request,mode)">
   <label>请谁组局<select v-model="host" aria-label="请谁组局" :disabled="u.blocked" required><option value="" disabled>选择你的好友</option><option v-for="a in u.friends" :key="a.id" :value="a.id">{{a.name}}</option></select></label>
   <label>游戏<select v-model="kind" aria-label="邀约游戏" :disabled="u.blocked"><option v-for="(title,key) in storyGameNames" :key="key" :value="key">{{title}}</option></select></label>
   <label>我的席位<select v-model="mode" aria-label="我的席位" :disabled="u.blocked"><option value="joined">我也参加</option><option value="spectating">我只观战</option></select></label>
   <label>对角色说<textarea v-model="request" aria-label="组局请求" maxlength="500" rows="3" :disabled="u.blocked" required/></label>
   <small>由他判断是否愿意组局、可能认识哪些朋友。朋友会独立答复，可能拒绝；人数不足不会开局。</small>
   <button type="submit" :disabled="u.blocked||!host||!request.trim()">发送组局请求</button>
  </form>
 </details>
 <p v-if="u.error" role="alert">{{u.error}}</p>
 <p v-if="u.working" role="status">{{u.progress||'正在保存邀请…'}} <button type="button" @click="u.cancel()">停止请求</button></p>
 <article v-for="i in pending" :key="i.id">
  <header><TerminalActorAvatar :w="w" :id="i.hostId"/><div><strong>{{u.name(i.hostId)}} · {{storyGameNames[i.kind]}}</strong><small>{{i.recruitment?.source==='player'?'你请他邀请自己的好友':'角色发起的游戏邀约'}}</small></div></header>
  <p v-if="i.recruitment?.source==='player'" class="request-line">你：{{i.recruitment.input}}</p>
  <p>{{i.recruitment?.host?i.recruitment.host.reply:i.recruitment?'等待发起者决定是否组局、联系谁。':i.message}}</p>
  <template v-if="i.recruitment?.host">
   <small>可能可联系的好友约 {{i.recruitment.host.friendEstimate}} 位（基于现有资料的估计，不等于已确认好友）。</small>
   <ul v-if="i.recruitment.host.selectedIds.length" class="guest-replies"><li v-for="id in i.recruitment.host.selectedIds" :key="id"><b>{{u.name(id)}}</b><span :class="{'guest-no':i.recruitment.guests.find(g=>g.id===id)?.accepted===false}">{{i.recruitment.guests.find(g=>g.id===id)?(i.recruitment.guests.find(g=>g.id===id)!.accepted?'接受':'拒绝'):'等待回应'}}</span><p>{{i.recruitment.guests.find(g=>g.id===id)?.reply}}</p></li></ul>
   <p v-if="i.status==='refused'">这次组局请求被拒绝，未向他的朋友发送邀请。</p>
   <p v-else-if="i.status==='unfilled'">人数不足：{{i.members.length}} / {{needed(i)}} 位角色同意参加。这次没有开局。</p>
  </template>
  <template v-if="i.status==='pending'"><small>已确认牌桌：{{i.members.map(u.name).join('、')}}。<template v-if="!i.recruitment||i.recruitment.mode==='either'">你加入时，{{u.name(i.members.at(-1)!)}}让座。</template><template v-else>{{i.recruitment.mode==='joined'?'为你保留一席。':'你在观战位，不占座。'}}</template></small></template>
  <div class="story-game-actions">
   <button v-if="i.status==='negotiating'" type="button" :disabled="u.blocked" @click="u.continueRecruitment(i.id)">{{i.recruitment?.host?'继续等待朋友回应':'请他联系好友'}}</button>
   <template v-if="i.status==='pending'"><button v-if="can(i,'joined')" type="button" :disabled="u.blocked" @click="respond(i.id,'joined')">参加游戏</button><button v-if="can(i,'spectating')" type="button" :disabled="u.blocked" @click="respond(i.id,'spectating')">进入观战位</button></template>
   <button type="button" :disabled="u.blocked" @click="respond(i.id,'declined')">{{['refused','unfilled'].includes(i.status)?'收起记录':'取消 / 婉拒'}}</button>
  </div>
 </article>
 <details v-if="past.length"><summary>角色对局记录（{{past.length}}）</summary><button v-for="i in past" :key="i.id" type="button" class="story-game-record" :disabled="u.blocked" @click="emit('open',i)">{{u.name(i.hostId)}}的{{storyGameNames[i.kind]}} · {{i.status==='spectating'?'继续观战 / 回看':'继续 / 回看'}} ›</button></details>
</section>
</template>
<style scoped>
.story-game-invites{margin:16px 0;color:#e3eef5}.story-game-invites h3{font-size:15px;margin:10px 0}.story-game-invites h3 span{display:inline-grid;place-items:center;background:#d1495e;min-width:19px;height:19px;border-radius:12px;font-size:11px}.story-game-invites article{margin:10px 0;padding:14px;border:1px solid #476778;border-radius:13px;background:#112b3dd9}.story-game-invites header{display:flex;gap:10px;align-items:center}.story-game-invites header>:first-child{width:36px;height:36px;flex:none}.story-game-invites small{display:block;font-size:12px;color:#9bb9c6;line-height:1.7}.story-game-invites p{font-size:13px;line-height:1.75;margin:9px 0}.story-game-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}.story-game-invites button{border:1px solid #527889;border-radius:8px;background:#173649;color:#e3eef5;padding:9px 11px;font-size:12px;white-space:normal}.story-game-invites button:disabled{opacity:.5}.story-game-record{display:block;width:100%;text-align:left;margin-top:8px}.story-game-invites summary{cursor:pointer;font-size:13px;padding:10px 0}.friend-request-form{padding:0 12px;border:1px solid #476778;border-radius:10px;background:#102735b3}.friend-request-form form{display:grid;gap:9px;padding-bottom:12px}.friend-request-form label{display:grid;gap:5px;font-size:12px;margin:0;color:#bbd5e2}.friend-request-form select,.friend-request-form textarea{width:100%;min-width:0;box-sizing:border-box;background:#0e2231;color:#e3eef5;border:1px solid #527889;border-radius:7px;padding:8px;margin:0;font:inherit}.guest-replies{list-style:none;padding:0;margin:10px 0;font-size:13px}.guest-replies li{border-top:1px solid #47677855;padding:9px 0}.guest-replies span{float:right;color:#8dd5bc}.guest-replies .guest-no{color:#ffa4ac}.request-line{color:#a5becb}
</style>
