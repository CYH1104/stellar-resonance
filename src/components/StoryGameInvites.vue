<script setup lang="ts">
import {computed,reactive} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {useStoryGameInvites} from '../app/useStoryGameInvites';
import {storyGameNames,type StoryGameInvite} from '../domain/storyGameInvites';
import TerminalActorAvatar from './TerminalActorAvatar.vue';
const props=defineProps<{w:ViewModel}>();
const emit=defineEmits<{open:[invite:StoryGameInvite]}>();
const u=reactive(useStoryGameInvites(props.w));
const pending=computed(()=>u.invitations.filter(i=>i.status==='pending'));
const past=computed(()=>u.invitations.filter(i=>i.status==='joined'||i.status==='spectating').slice().reverse());
async function respond(id:string,mode:'joined'|'spectating'|'declined'){const i=await u.respond(id,mode);if(i?.targetId)emit('open',i);}
</script>
<template>
<section v-if="u.invitations.length" class="story-game-invites" aria-label="角色游戏邀约">
 <h3>朋友的游戏邀约 <span v-if="pending.length">{{pending.length}}</span></h3>
 <p v-if="u.error" role="alert">{{u.error}}</p>
 <article v-for="i in pending" :key="i.id">
  <header><TerminalActorAvatar :w="w" :id="i.hostId"/><div><strong>{{u.name(i.hostId)}} · {{storyGameNames[i.kind]}}</strong><small>邀请你参加，也欢迎观战</small></div></header>
  <p>{{i.message}}</p><small>牌桌：{{i.members.map(u.name).join('、')}}。你加入时，{{u.name(i.members.at(-1)!)}}让座。</small>
  <div class="story-game-actions"><button type="button" :disabled="u.blocked" @click="respond(i.id,'joined')">参加游戏</button><button type="button" :disabled="u.blocked" @click="respond(i.id,'spectating')">进入观战位</button><button type="button" :disabled="u.blocked" @click="respond(i.id,'declined')">婉拒</button></div>
 </article>
 <details v-if="past.length"><summary>角色对局记录（{{past.length}}）</summary><button v-for="i in past" :key="i.id" type="button" class="story-game-record" :disabled="u.blocked" @click="emit('open',i)">{{u.name(i.hostId)}}的{{storyGameNames[i.kind]}} · {{i.status==='spectating'?'继续观战 / 回看':'继续 / 回看'}} ›</button></details>
</section>
</template>
<style scoped>
.story-game-invites{margin:16px 0;color:#e3eef5}.story-game-invites h3{font-size:15px;margin:10px 0}.story-game-invites h3 span{display:inline-grid;place-items:center;background:#d1495e;min-width:19px;height:19px;border-radius:12px;font-size:11px}.story-game-invites article{margin:10px 0;padding:14px;border:1px solid #476778;border-radius:13px;background:#112b3dd9}.story-game-invites header{display:flex;gap:10px;align-items:center}.story-game-invites header>:first-child{width:36px;height:36px;flex:none}.story-game-invites small{display:block;font-size:12px;color:#9bb9c6;line-height:1.7}.story-game-invites p{font-size:13px;line-height:1.75}.story-game-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}.story-game-invites button{border:1px solid #527889;border-radius:8px;background:#173649;color:#e3eef5;padding:9px 11px}.story-game-invites button:disabled{opacity:.5}.story-game-record{display:block;width:100%;text-align:left;margin-top:8px}.story-game-invites summary{cursor:pointer;font-size:13px;padding:10px 0}
</style>
