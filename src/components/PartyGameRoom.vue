<script setup lang="ts">
import {computed,reactive,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {usePartyGames} from '../app/usePartyGames';
import {cardLabel,handRank,elevenWinnerReason,type PartyRound} from '../domain/partyGames';
import LiarDiceTable from './LiarDiceTable.vue';
import GameChat from './GameChat.vue';
import {partyDialogueLines} from '../domain/partyDialogueView';
import CharacterAvatar from './CharacterAvatar.vue';
const props=withDefaults(defineProps<{w:ViewModel;active?:boolean;kind?:'eleven'|'truth'|'liar'}>(),{active:true});
const emit=defineEmits<{back:[]}>();
const u=reactive(usePartyGames(props.w));
const kinds={eleven:'十一点半',truth:'真心话大冒险',liar:'大话骰'} as const;
const invitationLabels={accepted:'已接受',declined:'未参加',pending:'等待回应'} as const;
const activeRooms=computed(()=>u.rooms.filter(r=>r.kind===(props.kind||'eleven')&&!r.endedAt));
const endedRooms=computed(()=>u.rooms.filter(r=>r.kind===(props.kind||'eleven')&&!!r.endedAt));
const acceptedCount=computed(()=>u.room?u.room.members.filter(id=>id==='player'||u.room!.invitations[id]==='accepted').length:0);
const currentDialogueLines=computed(()=>u.round?partyDialogueLines(u.round):[]);
function dialogueLines(round:PartyRound){return partyDialogueLines(round);}
const invitePending=computed(()=>u.pendingInvite?.roomId===u.room?.id?u.pendingInvite:undefined);
const inviteName=computed(()=>u.inviteTarget==='*'?'未接受邀请的好友':u.name(u.inviteTarget||''));
function prepare(kind:'eleven'|'truth'|'liar'){u.currentKind=kind;u.picked=[];u.page='create';}
function handleBack(){if(u.inviteTarget!==null){u.inviteTarget=null;u.inviteNote='';return true;}if(u.page==='list')return false;u.back();return true;}
function enter(kind:'eleven'|'truth'|'liar'){u.enter(kind);}
watch(()=>props.kind,kind=>{if(kind)enter(kind);});
watch(()=>[props.active,u.page,u.room?.id,u.round?.number,u.round?.kind==='liar'?u.round.turn:'',u.round?.kind==='liar'?u.round.moves.at(-1)?.pending:false,u.working,u.error],()=>{
 if(props.active&&u.page==='play'&&!u.working&&!u.error&&!u.room?.endedAt&&u.round?.kind==='liar'&&((u.round.phase==='playing'&&u.round.turn!=='player')||u.round.moves.at(-1)?.pending)&&typeof u.resumeLiar==='function')void u.resumeLiar();
},{immediate:true});
defineExpose({handleBack,enter});
function initial(id:string){return Array.from(u.name(id)||'我')[0];}
function points(cards:Parameters<typeof handRank>[0]){return cards.length?handRank(cards).halfPoints/2:'—';}
function rankLabel(cards:Parameters<typeof handRank>[0]){return cards.length?{bust:'爆牌',ordinary:'普通牌',eleven:'十一点半',five:'五张不过',flowers:'五花牌'}[handRank(cards).kind]:'尚未发牌';}
function stopped(value:unknown,id:string){return Array.isArray(value)?value.includes(id):!!value&&typeof value==='object'&&!!(value as Record<string,unknown>)[id];}
function ending(reason:string|undefined){return reason==='drunk'?'有人达到酒量上限':reason==='manual'?'房主提前结束':reason==='bankers-complete'?'全员已轮完坐庄':reason==='round-limit'?'轮数已完成':'游戏已结束';}

</script>

<template>
 <section class="party-game-room" aria-label="终端聚会游戏"><div v-if="u.inviteTarget!==null" class="party-invite-overlay" @click.self="u.inviteTarget=null"><form class="party-invite-dialog" role="dialog" aria-modal="true" aria-label="重新邀请留言" @submit.prevent="u.sendInvite()" @keydown.esc.prevent="u.inviteTarget=null"><h3>再次邀请{{inviteName}}</h3><p>想对角色说些什么？发送后可返回列表等候回信。</p><label>邀请留言<textarea v-model="u.inviteNote" maxlength="2000" rows="4" :disabled="u.working" placeholder="写给角色的话…" /></label><div class="party-actions"><button type="submit" class="party-primary" :disabled="u.working">发送邀请</button><button type="button" @click="u.inviteTarget=null">取消</button></div></form></div>
  <header class="party-heading"><h2>{{u.room&&['room','play','history'].includes(u.page)?u.room.name:kinds[props.kind||'eleven']}}</h2></header>
  <div v-if="u.error&&!u.inviteTarget" class="party-error" role="alert"><p>{{u.error}}</p><button v-if="u.retryActionLabel&&!(u.room?.kind==='liar'&&u.page==='play')&&!(u.elevenBatchPending&&u.room&&['room','play','history'].includes(u.page))" type="button" :disabled="u.working" @click="u.retryRequest()">{{u.retryActionLabel}}</button></div>
  <p v-if="u.working" class="party-working" role="status"><template v-if="u.pendingInvite">正在等待{{u.pendingInvite.names.join('、')}}回信，可返回列表查看。</template><template v-else>正在处理，请稍候…</template> <button type="button" @click="u.stop()">停止请求</button></p>
  <template v-if="u.page==='list'">
   <p>邀请好友入座，一起玩一局。</p>
   <button type="button" class="party-entry" :disabled="u.working" @click="prepare(props.kind||'eleven')"><strong>创建{{kinds[props.kind||'eleven']}}房间</strong><small>{{props.kind==='truth'?'转酒瓶 · 双选题卡':props.kind==='liar'?'摇骰叫号 · 斋与非':'轮流坐庄 · 输家罚酒'}}</small><span aria-hidden="true">›</span></button>
   <h3 v-if="activeRooms.length">进行中的房间</h3><button v-for="r in activeRooms" :key="r.id" type="button" class="party-entry" :disabled="u.working" @click="u.open(r.id)"><strong>{{r.name}}</strong><small>{{kinds[r.kind]}}</small><span aria-hidden="true">›</span></button>
   <h3 v-if="endedRooms.length">已结束的房间</h3><button v-for="r in endedRooms" :key="r.id" type="button" class="party-entry" :disabled="u.working" @click="u.open(r.id)"><strong>{{r.name}}</strong><small>{{kinds[r.kind]}} · 回看记录</small><span aria-hidden="true">›</span></button>
  </template>
  <template v-else-if="u.page==='create'">
   <h3>创建{{kinds[u.currentKind]}}房间</h3>
   <form @submit.prevent="u.create()">
    <label>房间名称（可选）<input v-model="u.title" maxlength="60" :disabled="u.working" placeholder="留空使用游戏名称"></label><p class="party-muted">仅用于区分已保存的房间，留空使用游戏名称。</p>
    <label>聚会氛围（可选）<textarea v-model="u.style" rows="3" maxlength="40" :disabled="u.working" placeholder="例如：轻松热闹，边玩边聊天。" /></label><p class="party-muted">影响角色邀请和互动的语气，不改变游戏规则。</p>
    <fieldset :disabled="u.working"><legend>选择 2～7 位好友</legend><label v-for="friend in u.friends" :key="friend.id" class="party-friend"><input v-model="u.picked" type="checkbox" :value="friend.id" :disabled="!u.picked.includes(friend.id)&&u.picked.length>=7"><span class="party-avatar"><CharacterAvatar :w="w" :id="friend.id" :nickname="friend.name" /></span><span>{{friend.name}}</span></label></fieldset>
    <p v-if="!u.friends.length" class="party-muted">先添加好友，再邀请他们参加游戏。</p><p>已选择 {{u.picked.length}} 位好友，连同你共 {{u.picked.length+1}} 人。</p>
    <button type="submit" class="party-primary" :disabled="u.working||u.picked.length<2||u.picked.length>7">创建并邀请</button>
   </form>
  </template>
  <template v-else-if="u.room">
   <p class="party-muted">{{kinds[u.room.kind]}}<span v-if="u.room.style"> · {{u.room.style}}</span></p>
   <details class="party-rules"><summary>游戏规则</summary><template v-if="u.room.kind==='eleven'"><p>A 为 1 点，2～10 按牌面，J/Q/K 为半点；最多 5 张，超过 11.5 点爆牌。</p><p>五花牌 ＞ 五张不过 ＞ 普通十一点半 ＞ 普通点数 ＞ 爆牌。同为十一点半时，依次比较黑桃、红桃、梅花、方片的张数；花色数量全相同才判庄家优先。</p><p>全员爆牌时不比较爆牌后的点数，按规则由庄家优先获胜；非爆普通同牌型同点数并列时庄家优先。赢家说明会标出具体原因。</p><p>每局唯一赢家，其余输家各罚酒一杯。庄家赢则连庄，输后换下一位；全员完成一次坐庄，或有人醉酒时结束，房主也可提前结束。</p><p>提交要牌或停牌后，程序按已保存的决定统一发牌并判定是否爆牌，随后生成桌上对话。停牌者仍可参与，角色可以多句接话或偶尔沉默。</p><p>结算前只能看自己的手牌。公开发言可诈唬，不代表真实牌点或选择。重试只补回应，不会重复发牌。</p></template><template v-else-if="u.room.kind==='liar'"><p>每人5骰，只能看自己骰子。起叫数量至少为参与人数；斋只数本点，非可加上1，叫1仍只计1。</p><p>同类型数量增加可换点数；同数量只能升点数。非转斋可同数量，斋转非至少加2。</p><p>只能在自己回合开上家的叫号；实际数量达到叫数则叫家赢，否则开家赢。输家罚一杯。下局全员重新摇5骰，由输家先叫。有人醉酒立即结束并进入小剧场。</p></template><template v-else><p>固定 10 轮。转酒瓶随机选一位参与者，再抽一张同时含真心话和大冒险的题卡，由选中者选择一项。</p><p>拒绝挑战罚酒一杯，仍算完成本轮。有人醉酒立即结束，房主也可提前结束。抽选和题目保存后才播放动画，重试不重新转瓶或换题。</p></template></details>
   <div v-if="u.participants.length&&u.room.rounds.length" class="party-drunk" aria-label="参与者醉酒度与酒量"><div v-for="id in u.participants" :key="id" class="party-drunk-person"><span class="party-avatar"><span v-if="id==='player'">{{initial(id)}}</span><CharacterAvatar v-else :w="w" :id="id" :nickname="u.name(id)" /></span><strong>{{u.name(id)}}</strong><progress v-if="u.tolerance(id)!==undefined" :value="u.room.drunk?.[id]||0" :max="u.tolerance(id)" :aria-label="u.name(id)+'醉酒度'" /><small>{{u.room.drunk?.[id]||0}} / {{u.tolerance(id)??'待确认'}}</small></div></div>
   <section v-if="u.elevenBatchPending&&(u.page!=='play'||u.room.endedAt)" class="party-wave-controls" aria-label="十一点半待补回应">
     <p role="status">本轮已发牌，角色回应尚未完成，重试不会重复发牌。</p>
     <button type="button" class="party-primary" :disabled="u.working" @click="u.npcAction()">重试本轮角色回应</button>
    </section>
    <template v-if="u.room.endedAt">
    <p class="party-ended" role="status">{{ending(u.room.endReason)}}，本房间只可回看。</p><p v-if="u.room.endTriggers?.length">达到酒量上限：{{u.room.endTriggers.map(id=>u.name(id)).join('、')}}</p>
    <section v-if="u.room.afterparty" class="party-afterparty" aria-label="醉后小剧场"><h3>醉后小剧场</h3><article v-for="scene in u.room.afterparty.scenes||[]" :key="scene.actorId" class="party-panel"><h4>{{u.name(scene.actorId)}}</h4><template v-if="scene.status==='ready'"><p>{{scene.text}}</p><small>{{scene.summary}}</small></template><template v-else><p role="status">{{scene.error||(scene.status==='pending'?'本篇待生成':'本篇尚未完成')}}</p><p v-if="scene.draft" class="party-draft">{{scene.draft}}</p><button type="button" :disabled="u.working" @click="u.retryAfterparty(scene.actorId)">只重试本篇</button></template></article></section>
    <button v-if="u.page!=='history'" type="button" :disabled="u.working" @click="u.page='history'">查看完整游戏记录</button>
   </template>
   <template v-if="u.page==='room'&&!u.room.endedAt">
    <h3>房间成员</h3><article v-for="id in u.room.members" :key="id" class="party-member"><span class="party-avatar"><span v-if="id==='player'">{{initial(id)}}</span><CharacterAvatar v-else :w="w" :id="id" :nickname="u.name(id)" /></span><strong>{{u.name(id)}}</strong><small>{{id==='player'?'房主 · 已就绪':invitationLabels[u.room.invitations[id]]||'等待回应'}}</small><p v-if="u.room.inviteReplies?.[id]">{{u.room.inviteReplies[id]}}</p><p v-if="u.room.inviteNotes?.[id]" class="party-invite-note">你写给角色的话：{{u.room.inviteNotes[id]}}</p><button v-if="id!=='player'&&u.room.invitations[id]==='pending'&&!u.room.rounds.length" type="button" :disabled="u.working" @click="u.retryInvites()">重试邀请请求</button><button v-if="id!=='player'&&u.room.invitations[id]==='declined'&&!u.room.rounds.length" type="button" :disabled="u.working" @click="u.beginInvite(id)">写留言，再次邀请</button></article>
    <p>已接受 {{acceptedCount-1}} 位好友，连同你共 {{acceptedCount}} 人。</p><div class="party-actions"><button v-if="u.declinedInvites.length&&!u.room.rounds.length" type="button" :disabled="u.working" @click="u.beginInvite()">重新邀请被拒绝的好友</button><button v-if="u.round" type="button" :disabled="u.working" @click="u.page='play'">{{u.round.phase==='complete'?'回到本轮互动':'继续当前轮'}}</button><button v-if="!u.round||u.round.phase==='complete'" type="button" class="party-primary" :disabled="u.working||acceptedCount<3||u.elevenBatchPending" @click="u.start()">{{u.round?'开始下一轮':'开始游戏'}}</button><button type="button" :disabled="u.working" @click="u.page='history'">游戏记录</button><button type="button" :disabled="u.working" @click="u.end()">结束游戏</button></div>
   </template>
   <template v-else-if="u.page==='play'&&u.round&&!u.room.endedAt">
    <p class="party-round">第 {{u.round.number}} {{u.round.kind==='eleven'?'局':u.round.kind==='liar'?'局':'轮'}}</p>
    <template v-if="u.round.kind==='eleven'">
     <h3>本轮庄家：{{u.name(u.round.banker)}}</h3>
     <div class="party-hands"><article v-for="id in u.participants" :key="id" class="party-hand"><header><strong>{{u.name(id)}}</strong><small>{{id===u.round.banker?'庄家':''}} {{stopped(u.round.stopped,id)?'已停牌':''}}</small></header><template v-if="id==='player'||u.round.phase==='complete'"><div class="party-cards"><span v-for="(card,i) in u.round.hands[id]||[]" :key="i" class="party-card">{{cardLabel(card)}}</span></div><p>{{points(u.round.hands[id]||[])}} 点 · {{rankLabel(u.round.hands[id]||[])}}</p></template><template v-else><div class="party-cards" :aria-label="u.name(id)+'的暗牌，共'+(u.round.hands[id]?.length||0)+'张'"><span v-for="n in u.round.hands[id]?.length||0" :key="n" class="party-card party-card-back" aria-hidden="true">✦</span></div><p class="party-muted">暗牌 {{u.round.hands[id]?.length||0}} 张</p></template></article></div>
      <section v-if="u.elevenBatchPending" class="party-wave-controls" aria-label="十一点半待补回应">
       <p role="status">本轮已发牌，角色回应尚未完成，重试不会重复发牌。</p>
       <button type="button" class="party-primary" :disabled="u.working" @click="u.npcAction()">重试本轮角色回应</button>
      </section>
      <section v-else-if="u.round.phase==='playing'" class="party-wave-controls" aria-label="十一点半本轮操作">
       <template v-if="u.elevenPrepared">
        <label>本轮发言或动作（可选，最多500字）<textarea v-model="u.draft" rows="3" maxlength="500" :disabled="u.working" placeholder="可以聊牌、诈唬或保持沉默。" /></label>
        <div class="party-actions">
         <template v-if="u.playerNeedsChoice">
          <button type="button" class="party-primary" :disabled="u.working" @click="u.hit()">要牌</button>
          <button type="button" :disabled="u.working" @click="u.stand()">停牌</button>
         </template>
         <button v-else type="button" class="party-primary" :disabled="u.working" @click="u.npcAction()">继续本轮（我已停牌）</button>
        </div>
        <p class="party-muted">提交后统一发牌并回应你的留言。</p>
       </template>
       <button v-else type="button" class="party-primary" :disabled="u.working" @click="u.npcAction()">继续牌局并读取角色决定</button>
      </section>
      <p v-if="u.round.phase==='complete'" class="party-result">本局赢家：{{u.round.winner?u.name(u.round.winner):'待结算'}} · 其他参与者各罚酒一杯。{{elevenWinnerReason(u.round)}}</p>
      <GameChat v-if="currentDialogueLines.length" :lines="currentDialogueLines" :name="u.name" label="十一点半本局对话" />
    </template>
    <template v-else-if="u.round.kind==='liar'"><LiarDiceTable :round="u.round" :participants="u.participants" :name="u.name" :working="u.working" :error="u.error" v-model:draft="u.draft" @bid="u.liarBid" @open="u.liarOpen" @npc-action="u.npcAction" /></template>
    <template v-else>
     <div :key="u.room.id+':'+u.round.number+':'+u.round.target" class="party-bottle-stage" role="status" :aria-label="'酒瓶选中'+u.name(u.round.target)"><svg class="party-bottle" aria-hidden="true" viewBox="0 0 48 96" width="48" height="96"><path d="M18 4h12v26l9 14v40c0 5-5 8-15 8S9 89 9 84V44l9-14Z" fill="#316b61" stroke="#bad7bd" stroke-width="2"/><path d="M16 5h16v8H16Z" fill="#dab578"/><rect x="11" y="51" width="26" height="25" rx="2" fill="#e4d6af"/><path d="M24 57v13m-5-5 5 5 5-5" fill="none" stroke="#35554c" stroke-width="2"/></svg><p>瓶口指向：<strong>{{u.name(u.round.target)}}</strong></p></div>
     <article class="party-panel"><h3>本轮题卡</h3><p><strong>真心话</strong>　{{u.round.card.truth}}</p><p><strong>大冒险</strong>　{{u.round.card.dare}}</p></article>
     <div v-if="u.round.phase==='choose'" class="party-actions"><template v-if="u.round.target==='player'"><button type="button" class="party-primary" :disabled="u.working" @click="u.choose('truth')">选择真心话</button><button type="button" :disabled="u.working" @click="u.choose('dare')">选择大冒险</button></template><button v-else type="button" class="party-primary" :disabled="u.working" @click="u.npcAction()">请 {{u.name(u.round.target)}} 选择</button></div>
     <template v-else><p>选择：{{u.round.choice==='truth'?'真心话':u.round.choice==='dare'?'大冒险':'待选择'}}</p><p v-if="u.round.phase==='complete'" class="party-result">{{u.round.refused?'拒绝挑战，罚酒一杯':'本轮已完成'}}</p><template v-else-if="u.round.target==='player'"><label>你的回答或动作<textarea v-model="u.draft" rows="4" maxlength="2000" :disabled="u.working" placeholder="写下你的回答或实际动作…" /></label><div class="party-actions"><button type="button" class="party-primary" :disabled="u.working||!u.draft.trim()" @click="u.answer(false)">完成并回应</button><button type="button" :disabled="u.working" @click="u.answer(true)">拒绝并罚酒</button></div></template><button v-else type="button" class="party-primary" :disabled="u.working" @click="u.npcAction()">请 {{u.name(u.round.target)}} 回应</button></template>
    </template>
    <GameChat v-if="u.round.kind==='truth'&&currentDialogueLines.length" :lines="currentDialogueLines" :name="u.name" label="真心话大冒险对话" />
    <form v-if="u.round.kind!=='liar'&&(u.round.kind!=='eleven'||(u.round.phase==='complete'&&!u.elevenBatchPending))" class="party-chat" @submit.prevent="u.reactions()"><label>游戏互动<textarea v-model="u.draft" rows="3" maxlength="2000" :disabled="u.working" placeholder="说句话或写下动作，不会自动推进轮次。" /></label><button type="submit" :disabled="u.working||!u.draft.trim()">发送互动</button><small>参与角色一起回应；普通互动不推进轮次，也不额外罚酒。</small></form>
    <div class="party-actions"><button v-if="u.round.phase==='complete'" type="button" class="party-primary" :disabled="u.working||u.elevenBatchPending||(u.round.kind==='liar'&&!!u.round.moves.at(-1)?.pending)" @click="u.start()">{{u.room.kind==='liar'?'全部重新摇骰，开始下一局':'开始下一轮'}}</button><button type="button" :disabled="u.working" @click="u.page='history'">游戏记录</button><button type="button" :disabled="u.working" @click="u.end()">结束游戏</button></div>
   </template>
   <template v-else-if="u.page==='history'">
    <h3>游戏记录</h3><button v-if="u.round?.kind==='liar'&&u.round.moves.at(-1)?.pending" type="button" :disabled="u.working" @click="u.npcAction()">补齐本次桌上接话（不重复罚酒）</button><p v-if="!u.history.length" class="party-muted">尚未开始，没有游戏记录。</p><details v-for="r in [...u.history].reverse()" :key="r.number" class="party-panel"><summary>第 {{r.number}} 轮 · {{r.phase==='complete'?'已完成':'未完成'}}</summary><template v-if="r.kind==='eleven'"><p>庄家：{{u.name(r.banker)}}</p><article v-for="(cards,id) in r.hands" :key="id" class="party-history-hand"><strong>{{u.name(String(id))}}</strong><template v-if="id==='player'||r.phase==='complete'"><div class="party-cards"><span v-for="(card,i) in cards" :key="i" class="party-card">{{cardLabel(card)}}</span></div><p>{{points(cards)}} 点 · {{rankLabel(cards)}}</p></template><p v-else>暗牌 {{cards.length}} 张</p></article><p v-if="r.phase==='complete'">赢家：{{r.winner?u.name(r.winner):'待结算'}}；其他参与者各罚酒一杯。{{elevenWinnerReason(r)}}</p></template><template v-else-if="r.kind==='liar'"><LiarDiceTable :round="r" :participants="Object.keys(r.dice)" :name="u.name" :working="u.working" :draft="''" read-only :show-dialogue="false" /></template><template v-else><p>瓶口指向：{{u.name(r.target)}}</p><p>真心话：{{r.card.truth}}</p><p>大冒险：{{r.card.dare}}</p><p>选择：{{r.choice==='truth'?'真心话':r.choice==='dare'?'大冒险':'尚未选择'}}</p><p>{{r.phase==='complete'?(r.refused?'拒绝，已罚酒':'已完成挑战'):'本轮尚未完成'}}</p></template><GameChat :lines="dialogueLines(r)" :name="u.name" :label="kinds[r.kind]+'对话'" /></details><button v-if="!u.room.endedAt" type="button" :disabled="u.working" @click="u.page=u.round?'play':'room'">返回当前游戏</button>
   </template>
  </template>
 </section>
</template>

<style scoped>
.party-invite-overlay{position:absolute;inset:12px;z-index:150;display:grid;place-items:center;padding:12px;background:#020914bb;box-sizing:border-box}.party-invite-dialog{width:min(360px,100%);max-height:72%;overflow:auto;margin:0;padding:16px;background:#102334;border:1px solid #7894aa;border-radius:12px;box-sizing:border-box;box-shadow:0 14px 42px #0009}.party-invite-dialog textarea{width:100%;min-height:92px;box-sizing:border-box;resize:vertical}.party-invite-note{font-size:12px;color:#a9c4d7}.party-friend{flex-direction:row!important;justify-content:flex-start!important;min-height:48px;width:100%;box-sizing:border-box}.party-friend input[type=checkbox]{display:inline-block!important;flex:none;order:0;margin:0}.party-friend .party-avatar{order:1}.party-friend>span:last-child{order:2}.party-error p{margin-top:0}.party-game-room .party-entry+.party-entry{margin-top:10px!important}

.party-game-room{min-width:0}.party-heading{display:flex;align-items:center;gap:12px}.party-heading h2{flex:1;margin:8px 0!important}.party-game-room p{white-space:pre-wrap;overflow-wrap:anywhere}.party-muted,.party-chat small{color:var(--pt-muted,#9baec1);font-size:12px}.party-error{padding:10px;border:1px solid #db8d92;border-radius:8px;color:#ffd3d6}.party-working{color:#b6dff0}.party-entry{display:grid!important;grid-template-columns:1fr auto;gap:3px 12px;width:100%;margin:10px 0;text-align:left}.party-entry small{grid-column:1}.party-entry>span{grid-column:2;grid-row:1/3;align-self:center}.party-game-room fieldset{border:1px solid #57738a;border-radius:10px;margin:15px 0;padding:10px}.party-friend{display:flex!important;align-items:center;gap:10px}.party-friend input{width:auto!important}.party-avatar{display:inline-flex;align-items:center;justify-content:center;flex:none;width:38px;height:38px;overflow:hidden;border-radius:50%;background:#304a65;color:#eaf2f8}.party-avatar :deep(img){width:100%;height:100%;object-fit:cover}.party-avatar :deep(svg){width:22px;height:22px}.party-actions{display:flex;flex-wrap:wrap;gap:9px;margin:15px 0}.party-primary{border-color:#9bd6ef!important;color:#c1ecff!important}.party-panel,.party-rules{padding:13px;margin:12px 0;border:1px solid #57738a80;border-radius:10px;background:#15283b66}.party-panel summary,.party-rules summary{cursor:pointer}.party-panel h3,.party-panel h4{margin-top:0!important}.party-member{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid #57738a55;padding:12px 0}.party-member small{margin-left:auto}.party-member p{flex-basis:100%;margin-left:48px!important}.party-drunk{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}.party-drunk-person{display:grid;grid-template-columns:30px 1fr;gap:3px 7px;min-width:120px;max-width:100%;padding:8px;border:1px solid #57738a66;border-radius:8px;flex:1}.party-drunk-person .party-avatar{width:30px;height:30px;grid-row:1/4}.party-drunk-person strong{font-size:12px;overflow-wrap:anywhere}.party-drunk-person progress{width:100%;height:6px;accent-color:#d6b96c}.party-drunk-person small{font-size:10px!important}.party-hands{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr));gap:10px}.party-hand{min-width:0;padding:12px;border:1px solid #57738a88;border-radius:10px}.party-hand header{display:flex;gap:10px;align-items:baseline;justify-content:space-between}.party-cards{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.party-card{display:inline-flex;align-items:center;justify-content:center;min-width:36px;min-height:52px;padding:5px;box-sizing:border-box;border:1px solid #bbcbd8;border-radius:5px;background:#eff3f6;color:#1a2b40;font:600 16px Georgia,serif}.party-card-back{background:repeating-linear-gradient(45deg,#1e3a58,#1e3a58 4px,#365674 4px,#365674 6px);color:#c1d4e8;border-color:#7e9cb8}.party-result,.party-ended{padding:12px;border:1px solid #bca56c;border-radius:8px;color:#e9d7a6}.party-round{letter-spacing:2px;color:#b6ccdf}.party-bottle-stage{text-align:center;padding:14px}.party-bottle{display:inline-flex;align-items:center;justify-content:center;width:42px;height:84px;clip-path:polygon(36% 0,64% 0,64% 23%,86% 40%,86% 96%,14% 96%,14% 40%,36% 23%);background:linear-gradient(90deg,#568b7c,#b0d7b0 45%,#447b6c);color:#1c4b3b;box-shadow:inset 0 0 12px #fff5;animation:party-bottle-spin 1.2s cubic-bezier(.15,.65,.25,1) both;transform-origin:50% 50%;font-size:25px}.party-history-hand{padding:10px 0;border-bottom:1px solid #57738a44}.party-chat{margin:18px 0;padding-top:10px;border-top:1px solid #57738a66}.party-chat small{display:block;margin-top:8px}.party-draft{border-left:2px solid #b8a16d;padding-left:12px;opacity:.85}.party-afterparty{margin:20px 0}@keyframes party-bottle-spin{from{transform:rotate(-1080deg)}to{transform:rotate(0)}}@media(prefers-reduced-motion:reduce){.party-bottle{animation:none}}@media(max-width:420px){.party-hands{grid-template-columns:1fr}.party-heading{gap:6px}.party-drunk-person{min-width:105px}}
</style>
