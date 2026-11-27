<script setup lang="ts">
import {computed,reactive,ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {useGameLobby} from '../app/useGameLobby';
import {storyGameNames,type StoryGameKind} from '../domain/storyGameInvites';
import {gameSeatCount} from '../domain/gameRecruitment';
import {lobbyReady,lobbyCapacity} from '../domain/gameLobby';
import TerminalActorAvatar from './TerminalActorAvatar.vue';
const props=defineProps<{w:ViewModel;kind:StoryGameKind;lobbyId?:string;existingRoomId?:string;initialTitle?:string;initialStyle?:string}>();
const emit=defineEmits<{ready:[id:string];created:[id:string];back:[]}>();
const u=reactive(useGameLobby(props.w)),title=ref(props.initialTitle||''),style=ref(props.initialStyle||''),picked=ref<string[]>([]),helper=ref(''),wanted=ref(''),message=ref('房间还缺人，可以帮忙邀请你认识的朋友吗？');
const roomBusy=computed(()=>u.blocked||!!u.pending),space=computed(()=>u.lobby?lobbyCapacity(u.lobby.kind)-u.members.length:0);
watch(()=>props.lobbyId,id=>{u.lobbyId=id||'';},{immediate:true});
watch(()=>props.existingRoomId,async id=>{if(id&&!props.lobbyId){const created=await u.create(props.kind,'','',id);if(created)emit('created',created);}},{immediate:true});
async function create(){const id=await u.create(props.kind,title.value,style.value);if(id)emit('created',id);}
async function direct(){await u.direct(picked.value);picked.value=[];}
async function start(){const id=await u.start();if(id)emit('ready',id);}
</script>
<template>
<section class="game-lobby" aria-label="游戏等候房间">
 <template v-if="!u.lobby">
  <h3>创建{{storyGameNames[kind]}}房间</h3>
  <p>先建房，再邀请朋友。好友不够时，可以在房间里拜托好友帮忙联系他认识的人。</p>
  <form @submit.prevent="create"><label>房间名称（可选）<input v-model="title" maxlength="60" :disabled="u.blocked"></label><p>仅用于区分已保存的房间，留空使用游戏名称。</p><label>聚会氛围（可选）<textarea v-model="style" maxlength="40" rows="3" :disabled="u.blocked"/></label><div class="presets" role="group" aria-label="聚会氛围预设"><button v-for="preset in ['搞笑','休闲','欢乐','暧昧']" :key="preset" type="button" :disabled="u.blocked" @click="style=preset">{{preset}}</button></div><p>影响角色邀请和互动的语气，不改变游戏规则。</p><button type="submit" :disabled="u.blocked">创建等候房间</button></form>
 </template>
 <template v-else>
  <header><h3>{{u.lobby.name}}</h3><span>等候入座 · {{u.members.length}} / {{gameSeatCount(kind)}} 人{{lobbyCapacity(kind)>gameSeatCount(kind)?'起':''}}</span></header>
  <div class="seats"><div v-for="id in u.members" :key="id"><TerminalActorAvatar :w="w" :id="id"/><strong>{{u.name(id)}}</strong><small>已入座</small></div><div v-for="n in Math.max(0,gameSeatCount(kind)-u.members.length)" :key="'empty'+n" class="empty-seat"><span>＋</span><small>等候朋友</small></div></div>
  <template v-if="!u.lobby.targetId">
   <details v-if="space>0" open><summary>邀请我的好友</summary><p v-if="!u.available.length">暂时没有可直接邀请的好友，可以在下面拜托好友代邀。</p><form v-else @submit.prevent="direct"><label v-for="f in u.available" :key="f.id" class="friend"><input v-model="picked" type="checkbox" :value="f.id" :disabled="roomBusy||!picked.includes(f.id)&&picked.length>=space">{{f.name}}</label><button type="submit" :disabled="roomBusy||!picked.length">发送入房邀请</button></form></details>
   <details v-if="space>0" class="ask-friend"><summary>拜托好友邀请</summary><p>缺人，或想请一位不在你好友列表中的人时，问问好友是否愿意帮忙联系。</p><form @submit.prevent="u.help(helper,message,wanted||undefined)">
    <label>拜托谁<select v-model="helper" aria-label="拜托谁" :disabled="roomBusy" required><option value="" disabled>选择你的好友</option><option v-for="f in u.friends" :key="f.id" :value="f.id">{{f.name}}</option></select></label>
    <label>想邀请的人<select v-model="wanted" aria-label="想邀请的人" :disabled="roomBusy"><option value="">请他推荐认识的朋友</option><option v-for="a in u.outsiders.filter(a=>a.id!==helper)" :key="a.id" :value="a.id">{{a.name}}</option></select></label>
    <label>对好友说<textarea v-model="message" aria-label="代邀留言" maxlength="500" rows="3" :disabled="roomBusy" required/></label>
    <small>好友可以拒绝帮忙；他推荐的人也会独立决定是否参加。不会把所有角色都当作他的好友。</small><button type="submit" :disabled="roomBusy||!helper||!message.trim()">拜托好友代邀</button>
   </form></details>
   <p v-if="u.pending&&!u.working">邀请尚未完成，已答复的人不会重复询问。<button type="button" :disabled="u.blocked" @click="u.resume">继续等待回应</button></p>
   <button type="button" class="start" :disabled="u.blocked||!lobbyReady(u.lobby)" @click="start">{{kind==='werewolf'?'人数到齐 · 随机发身份':'人数到齐 · 进入游戏'}}</button>
  </template>
  <button v-else type="button" @click="emit('ready',u.lobby.targetId)">返回游戏</button>
  <section v-if="u.lobby.requests.length" class="replies" aria-label="房间邀请记录"><h4>邀请记录</h4><article v-for="r in u.lobby.requests" :key="r.id"><strong>{{r.helperId==='player'?'我的邀请':'拜托'+u.name(r.helperId)+'代邀'}}</strong><p v-if="r.helperId!=='player'">你：{{r.input}}<template v-if="r.wantedId">（希望邀请{{u.name(r.wantedId)}}）</template></p><p>{{r.host?r.host.reply:'等待好友回应…'}}</p><small v-if="r.host&&!r.host.accepted">好友这次婉拒了，没有向其他人发出邀请。</small><small v-else-if="r.host&&!r.host.selectedIds.length">暂时没有合适的人选。</small><div v-for="id in r.host?.selectedIds||[]" :key="id" class="reply"><b>{{u.name(id)}}</b><span>{{r.guests.find(g=>g.id===id)?(r.guests.find(g=>g.id===id)!.accepted?'接受 · 已入座':'婉拒'):'等待回应'}}</span><p>{{r.guests.find(g=>g.id===id)?.reply}}</p></div></article></section>
 </template>
 <p v-if="u.error" role="alert">{{u.error}}</p><p v-if="u.working" role="status">{{u.progress||'正在保存房间…'}} <button type="button" @click="u.cancel">停止请求</button></p>
 <button type="button" @click="emit('back')">返回房间列表</button>
</section>
</template>
<style scoped>
.game-lobby{color:#dfedf5;min-width:0;display:grid;gap:14px}.game-lobby h3,.game-lobby h4,.game-lobby p{margin:0;line-height:1.7}.game-lobby p,.game-lobby small{font-size:12px;color:#b3c8d7}.game-lobby header span{font-size:12px;color:#a2bed1}.game-lobby form{display:grid;gap:12px;margin-top:12px}.game-lobby label{display:grid;gap:6px;font-size:13px}.game-lobby input,.game-lobby select,.game-lobby textarea{font:inherit;color:inherit;background:#0c2231;border:1px solid #547489;border-radius:8px;padding:10px;min-width:0;width:100%;box-sizing:border-box}.game-lobby .friend{display:flex;align-items:center;gap:8px}.game-lobby .friend input[type=checkbox]{width:auto;flex:0 0 auto!important;margin:0!important}.game-lobby .presets{display:flex;gap:8px;flex-wrap:wrap}.game-lobby button{border:1px solid #587d91;border-radius:9px;background:#16384d;color:inherit;padding:11px;font:inherit;white-space:normal;cursor:pointer}.game-lobby button:disabled{opacity:.45;cursor:default}.game-lobby .start{background:#305b6d}.game-lobby details,.replies article{border:1px solid #456274;border-radius:12px;padding:12px;background:#102c3bc4}.game-lobby summary{cursor:pointer;font-size:14px}.game-lobby details p{margin-top:8px}.seats{display:flex;gap:9px;flex-wrap:wrap}.seats>div{width:70px;display:grid;justify-items:center;gap:5px;font-size:12px}.seats>div>:first-child{width:38px;height:38px}.empty-seat span{border:1px dashed #557587;border-radius:50%;display:grid;place-items:center}.empty-seat{opacity:.65}.replies{display:grid;gap:10px}.reply{padding:9px 0;border-top:1px solid #45627466;font-size:12px}.reply span{float:right}.reply p{clear:both}.game-lobby [role=alert]{color:#ffb1ba}
</style>
