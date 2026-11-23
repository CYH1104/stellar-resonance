<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import type { ViewModel } from '../app/useWorkspace';
import { classifyLandlord, beatsLandlord, enumerateLandlordPlays, landlordCardLabel, landlordPatternLabel } from '../domain/landlordCards';
import type { LandlordRound } from '../domain/landlord';
import {LandlordBubbleDirector,type LandlordPhrases,type LandlordBubble} from '../domain/landlordSpeech';
import SettlementVoices from './SettlementVoices.vue';
import TerminalActorAvatar from './TerminalActorAvatar.vue';

type Props = {
  w: ViewModel;
  round: LandlordRound;
  scores: Record<string, number>;
  name: (id: string) => string;
  busy: boolean;
  readOnly?: boolean;
  active?: boolean;
  phrases?: Record<string,LandlordPhrases>;
};
const props = withDefaults(defineProps<Props>(), { readOnly: false, active: true });
const emit = defineEmits<{
  bid: [score: number];
  play: [cards: string[]];
  start: [];
  leave: [];
  end: [];
  retrySettlement: [];
}>();

const bubble=ref<LandlordBubble>();const bubbleDirector=new LandlordBubbleDirector();let bubbleTimer:ReturnType<typeof setInterval>|undefined;
function updateBubble(){bubble.value=bubbleDirector.update(props.round,props.phrases,Date.now(),props.active&&!props.readOnly&&typeof document!=='undefined'&&!document.hidden,props.busy);}
watch(()=>[props.round.number,props.round.moves.length,props.round.phase,props.round.turn,props.active,props.readOnly,props.busy],updateBubble);
onMounted(()=>{updateBubble();bubbleTimer=setInterval(updateBubble,1000);document.addEventListener('visibilitychange',updateBubble);});
onBeforeUnmount(()=>{clearInterval(bubbleTimer);document.removeEventListener('visibilitychange',updateBubble);});
const selected = ref<string[]>([]);
watch(() => [props.round.number, props.round.phase, props.round.turn, props.round.hands.player?.join('|')], () => { selected.value = []; });
const ownTurn = computed(() => props.round.phase !== 'complete' && props.round.turn === 'player');
const canAct = computed(() => !props.readOnly && !props.busy && ownTurn.value);
const ownHand = computed(() => props.round.hands.player || []);
const chosen = computed(() => ownHand.value.filter(card => selected.value.includes(card)));
const legalSelection = computed(() => {
  if (!chosen.value.length) return false;
  return !!classifyLandlord(chosen.value) && beatsLandlord(chosen.value, props.round.lead?.cards);
});
const canPass = computed(() => canAct.value && props.round.phase === 'playing' && !!props.round.lead && props.round.lead.id !== 'player');
const suggestion = computed(() => props.round.phase === 'playing' && canAct.value
  ? enumerateLandlordPlays(ownHand.value, props.round.lead?.cards)[0]
  : undefined);
const lastPlay = computed(() => {
  for (let i = props.round.moves.length - 1; i >= 0; i--) {
    const move = props.round.moves[i];
    if (move?.kind === 'play') return move;
  }
  return undefined;
});
const tableCards = computed(() => props.round.lead?.cards || lastPlay.value?.cards || []);
const seats = computed(() => props.round.participants.filter(id => id !== 'player').map((id, index) => ({
  id,
  side: index === 0 ? 'left' : 'right',
  count: props.round.hands[id]?.length ?? 0,
  role: roleOf(id),
  thinking: props.round.phase !== 'complete' && props.round.turn === id,
})));
function roleOf(id: string) {
  if (props.round.phase === 'complete' && props.round.result?.winner === 'redeal') return '无人叫分';
  if (!props.round.landlord || props.round.phase === 'bidding') return '待定';
  return id === props.round.landlord ? '地主' : '农民';
}
function toggleCard(card: string) {
  if (!canAct.value || props.round.phase !== 'playing') return;
  selected.value = selected.value.includes(card) ? selected.value.filter(item => item !== card) : [...selected.value, card];
}
function clearSelection() { if (canAct.value) selected.value = []; }
function playSelected() {
  if (canAct.value && props.round.phase === 'playing' && legalSelection.value) emit('play', [...chosen.value]);
}
function pass() { if (canPass.value) { selected.value = []; emit('play', []); } }
function useHint() { if (canAct.value && suggestion.value) selected.value = [...suggestion.value]; }
function bidEnabled(score: number) { return canAct.value && props.round.phase === 'bidding' && (score === 0 || score > props.round.highestBid); }
function bid(score: number) { if (bidEnabled(score)) emit('bid', score); }
function signed(value: number) { return value > 0 ? `+${value}` : String(value); }
function lastAction(id:string){const move=[...props.round.moves].reverse().find(m=>m.id===id);if(!move)return '';if(move.kind==='bid')return props.round.phase==='bidding'?(move.score?'叫'+move.score+'分':'不叫'):'';if(move.kind==='pass')return '不出';const pattern=classifyLandlord(move.cards);return (pattern?landlordPatternLabel(pattern):'出牌')+' '+move.cards.length+'张';}
function cardText(card: string) { return landlordCardLabel(card); }
function isRed(card: string) { return card.startsWith('H-') || card.startsWith('D-') || card === 'RJ'; }
</script>

<template>
  <section class="landlord-table" :class="{ 'is-complete': round.phase === 'complete' }" aria-label="斗地主牌桌">
    <header class="table-header">
      <div><strong>斗地主</strong><span>第 {{ round.number }} 局</span></div>
      <span class="turn-status" role="status">
        <template v-if="round.phase === 'complete'">本局已结束</template>
        <template v-else-if="round.turn === 'player'">轮到你</template>
        <template v-else>{{ name(round.turn) }} · 思考中…</template>
      </span>
      <button v-if="!readOnly" class="leave-link" type="button" @click="emit('leave')">离开牌桌</button>
    </header>

    <div v-if="round.phase!=='complete'" class="table-surface">
      <div class="opponents">
        <article v-for="seat in seats" :key="seat.id" class="opponent" :class="[`seat-${seat.side}`, { active: round.turn === seat.id }]">
          <TerminalActorAvatar class="avatar" :w="w" :id="seat.id" /><span v-if="bubble?.id===seat.id" class="speech-bubble" role="status">{{bubble.text}}</span>
          <div class="identity">
            <strong>{{ name(seat.id) }}</strong>
            <span class="role-badge" :class="{ landlord: seat.role === '地主' }">{{ seat.role }}</span>
            <small>积分 {{ scores[seat.id] ?? round.openingScores[seat.id] }}</small><small>{{ seat.thinking ? '思考中…' : `${seat.count} 张` }}</small>
          </div>
          <b v-if="lastAction(seat.id)" class="last-seat-action">{{lastAction(seat.id)}}</b><div class="back-stack" aria-hidden="true">
            <span v-for="n in Math.min(3, seat.count)" :key="n" class="card-back"></span>
          </div>
        </article>
      </div>

      <div class="center-table">
        <div class="table-facts">
          <div class="bottom-cards" aria-label="底牌">
            <template v-if="round.phase === 'bidding'">
              <span class="bottom-backs" aria-hidden="true"><i></i><i></i><i></i></span>
              <small>底牌 · 3 张</small>
            </template>
            <template v-else>
              <span class="bottom-face">
                <span v-for="card in round.bottom" :key="card" class="mini-card" :class="{ red: isRed(card) }">{{ cardText(card) }}</span>
              </span>
              <small>底牌</small>
            </template>
          </div>
          <div class="multiplier"><small>当前倍数</small><strong>×{{ round.multiplier }}</strong><small>叫分 {{ round.highestBid }}</small></div>
        </div>
        <div class="last-play" aria-label="最后出牌">
          <template v-if="tableCards.length">
            <small>{{ name(round.lead?.id || lastPlay?.id || '') }} 出牌</small>
            <small v-if="round.phase==='playing'&&!round.lead">新一轮，可自由领牌</small><div class="played-cards">
              <span v-for="card in tableCards" :key="card" class="mini-card played" :class="{ red: isRed(card) }">{{ cardText(card) }}</span>
            </div>
          </template>
          <p v-else>{{ round.phase === 'bidding' ? '等待叫分' : '新一轮出牌' }}</p>
        </div>
      </div>

      <div class="player-seat" :class="{ active: round.turn === 'player' }">
        <div class="player-identity">
          <TerminalActorAvatar class="avatar" :w="w" id="player" />
          <div><strong>{{ name('player') }}</strong><span class="role-badge" :class="{ landlord: round.landlord === 'player' }">{{ roleOf('player') }}</span><small>余额 {{ scores.player ?? round.openingScores.player }}</small></div>
        </div>
        <div class="hand" :class="{ 'hand-disabled': !canAct || round.phase !== 'playing' }" aria-label="你的手牌">
          <template v-if="!readOnly">
            <button v-for="(card, index) in ownHand" :key="card" class="hand-card" :class="{ selected: selected.includes(card), red: isRed(card) }"
              type="button" :disabled="!canAct || round.phase !== 'playing'" :aria-pressed="selected.includes(card)"
              :aria-label="cardText(card) + (selected.includes(card) ? '，已选中' : '')" :style="{ '--card-index': index, '--card-count': ownHand.length }" @click="toggleCard(card)">
              <span>{{ cardText(card) }}</span>
            </button>
          </template>
          <template v-else>
            <span v-for="(card, index) in ownHand" :key="card" class="hand-card" :class="{ red: isRed(card) }" :style="{ '--card-index': index, '--card-count': ownHand.length }"><span>{{ cardText(card) }}</span></span>
          </template>
          <span v-if="!ownHand.length" class="empty-hand">等待发牌</span>
        </div>
      </div>
    </div>

    <section v-if="round.phase === 'complete'" class="settlement" aria-label="本局结算">
      <div class="settlement-heading">
        <h2>{{ round.result?.winner === 'landlord' ? '地主获胜' : round.result?.winner === 'farmers' ? '农民获胜' : '无人叫分 · 重新发牌' }}</h2>
        <strong v-if="round.result?.spring" class="spring">{{ round.landlord && round.result.winner === 'landlord' ? '春天' : '反春天' }}</strong>
      </div>
      <div class="score-summary">
        <div v-for="id in round.participants" :key="id" class="score-line">
          <span class="settlement-player"><TerminalActorAvatar class="avatar" :w="w" :id="id" /><span>{{ name(id) }} <small>{{ roleOf(id) }}</small><span v-if="bubble?.id===id" class="settlement-bubble" role="status">{{bubble.text}}</span></span></span>
          <strong>本局 {{ signed(round.result?.deltas[id] ?? 0) }}</strong>
          <span>余额 {{ scores[id] ?? ((round.openingScores[id] || 0) + (round.result?.deltas[id] ?? 0)) }}</span>
        </div>
      </div>
      <SettlementVoices :w="w" :talk="round.settlementTalk" :name="name" :busy="busy" :read-only="readOnly" @retry="emit('retrySettlement')"/>
      <details class="settlement-cards"><summary>查看底牌和剩余手牌</summary><div class="remaining-hand"><small>底牌</small><span v-for="card in round.bottom" :key="card" class="mini-card" :class="{red:isRed(card)}">{{cardText(card)}}</span></div><div v-for="id in round.participants" :key="id" class="remaining-hand"><small>{{name(id)}}</small><span v-for="card in round.hands[id]" :key="card" class="mini-card" :class="{red:isRed(card)}">{{cardText(card)}}</span><small v-if="!round.hands[id]?.length">已出完</small></div></details>
      <p v-if="round.result?.winner === 'redeal'" class="redeal-note">三家均未叫地主，本局不计分。</p>
      <div v-if="!readOnly" class="settlement-actions">
        <button type="button" class="primary" :disabled="busy" @click="emit('start')">下一局</button>
        <button type="button" :disabled="busy" @click="emit('leave')">回房间</button>
        <button type="button" class="end-button" :disabled="busy" @click="emit('end')">主动结束</button>
      </div>
    </section>

    <footer v-else-if="!readOnly" class="controls" aria-label="玩家操作">
      <template v-if="round.phase === 'bidding'">
        <span v-if="!ownTurn" class="waiting-action">等待叫分…</span>
        <template v-else>
          <span class="control-label">叫地主</span>
          <button v-for="score in [0, 1, 2, 3]" :key="score" type="button" :disabled="!bidEnabled(score)" @click="bid(score)">{{ score === 0 ? '不叫' : score + ' 分' }}</button>
        </template>
      </template>
      <template v-else>
        <span v-if="!ownTurn" class="waiting-action">等待出牌…</span>
        <template v-else>
          <button type="button" :disabled="!suggestion" @click="useHint">提示</button>
          <button type="button" :disabled="!canAct||!selected.length" @click="clearSelection">清空</button>
          <button type="button" class="primary" :disabled="!canAct||!legalSelection" @click="playSelected">出牌</button>
          <button type="button" :disabled="!canPass" @click="pass">过牌</button>
        </template>
      </template>
    </footer>
    <footer v-else class="readonly-note">只读牌局</footer>
  </section>
</template>

<style scoped>
.landlord-table{box-sizing:border-box;width:100%;height:100%;min-height:340px;max-height:100%;padding:clamp(8px,1.5vw,18px);display:flex;flex-direction:column;gap:10px;overflow:auto;color:#eff8f5;background:linear-gradient(150deg,#101d32,#172b42 55%,#10213a);border:1px solid #436276;border-radius:18px;font:500 14px/1.35 system-ui,sans-serif}
.table-header{display:flex;align-items:center;gap:12px;min-height:30px}.table-header>div{display:flex;align-items:baseline;gap:10px}.table-header strong{font-size:17px;letter-spacing:.08em}.table-header span,.table-header small{color:#b7c8d2}.turn-status{margin:auto;font-size:13px;color:#f1d18a!important}.leave-link{padding:4px 9px!important;font-size:12px!important}
.table-surface{position:relative;isolation:isolate;flex:1;min-height:236px;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;border-radius:48% / 36%;border:5px solid #57402e;background:radial-gradient(ellipse at 50% 46%,#286d59 0%,#155443 58%,#0d4138 100%);box-shadow:inset 0 0 0 2px #8a7049,inset 0 0 28px #061f20aa,0 6px 16px #0005;padding:12px clamp(10px,2vw,28px)}
.opponents{position:absolute;inset:8px 5% auto;display:flex;justify-content:space-between;pointer-events:none}.opponent{position:relative;display:flex;align-items:center;gap:8px;max-width:43%;min-width:0;padding:7px 10px;border-radius:24px;background:#102333bd;border:1px solid #8ca69a77}.opponent.active,.player-seat.active{border-color:#f5d37f;box-shadow:0 0 0 2px #f5d37f55,0 0 18px #ffdf8a44}.seat-right{flex-direction:row-reverse;text-align:right}.avatar{display:inline-flex;align-items:center;justify-content:center;flex:none;width:42px;height:42px;border:2px solid #c8ad73;border-radius:50%;overflow:hidden;background:#203749}.avatar :deep(.pt-avatar){width:100%;height:100%;display:block}.avatar :deep(img),.avatar :deep(svg){width:100%;height:100%;object-fit:cover}.identity,.player-identity>div{display:grid;gap:2px;min-width:0}.identity strong,.player-identity strong{max-width:105px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identity small,.player-identity small{color:#d4e0dc;font-size:11px}.role-badge{display:inline-flex;width:max-content;max-width:100%;padding:1px 6px;border:1px solid #b7c8c455;border-radius:10px;color:#d4e0dc;font-size:10px}.role-badge.landlord{border-color:#f0c768;color:#ffe09a}.back-stack{display:flex;align-items:center;margin-left:2px}.card-back,.bottom-backs i{display:block;width:20px;height:29px;margin-left:-8px;border:1px solid #d3bd83;border-radius:4px;background:repeating-linear-gradient(45deg,#304864,#304864 3px,#47617b 3px,#47617b 5px);box-shadow:0 1px 3px #071b25}.card-back:first-child{margin-left:0}.revealed-hand{display:flex;max-width:min(45vw,240px);flex-wrap:wrap;justify-content:flex-end;gap:2px}.seat-left .revealed-hand{justify-content:flex-start}.mini-card{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:31px;padding:0 3px;border:1px solid #d4d6ce;border-radius:4px;background:#f5f1e6;color:#19252a;font-weight:700;font-size:11px;box-shadow:0 1px 2px #06192255}.mini-card.red,.hand-card.red{color:#bd3340}.revealed-hand small{align-self:center;color:#fff}
.center-table{position:absolute;inset:50% 15% auto;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;gap:clamp(16px,5vw,66px);min-height:105px}.table-facts{display:flex;align-items:center;gap:14px}.bottom-cards{display:grid;justify-items:center;gap:4px;min-width:74px}.bottom-cards small,.multiplier small,.last-play>small{color:#d8e8d9;font-size:11px}.bottom-backs{display:flex;padding-left:7px}.bottom-backs i{width:27px;height:39px;margin-left:-9px}.bottom-backs i:first-child{margin-left:0}.bottom-face{display:flex;gap:2px}.bottom-face .mini-card{height:36px}.multiplier{display:grid;justify-items:center;gap:2px;padding:6px 12px;border-radius:20px;background:#0e3b36a8;border:1px solid #9bbba077}.multiplier strong{color:#f8d786;font-size:22px}.last-play{display:grid;justify-items:center;gap:6px;min-width:90px;max-width:48%;text-align:center}.last-play p{margin:0;color:#d4e0dc;font-size:13px}.played-cards{display:flex;flex-wrap:wrap;justify-content:center;gap:3px;max-height:72px;overflow:auto}.mini-card.played{min-width:29px;height:39px;font-size:13px}
.player-seat{position:absolute;inset:auto 5% 7px;display:flex;flex-direction:column;align-items:center;gap:5px;padding:6px 8px 4px;border:1px solid transparent;border-radius:16px;transition:border-color .15s}.player-identity{display:flex;align-items:center;gap:8px}.player-identity .avatar{width:38px;height:38px}.player-result{display:flex;gap:14px;color:#ffe09a;font-size:11px}.hand{display:flex;align-items:flex-end;justify-content:center;width:100%;max-width:100%;min-height:72px;padding:8px 0 0;overflow:visible}.hand-card{position:relative;flex:0 1 clamp(26px,5vw,49px);width:clamp(26px,5vw,49px);min-width:0;height:clamp(48px,10vh,69px);margin-left:calc(-1 * clamp(13px,2.1vw,24px));padding:2px 1px!important;border:1px solid #e2dfd4!important;border-radius:6px!important;background:#fffaf0!important;color:#18252c!important;box-shadow:0 2px 5px #06192299!important;font-size:clamp(10px,1.5vw,14px)!important;font-weight:750!important;transform:none;z-index:calc(1 + var(--card-index));overflow:hidden}.hand-card:first-child{margin-left:0}.hand-card span{white-space:nowrap}.hand-card.selected{transform:translateY(-10px);border-color:#ffe28a!important;box-shadow:0 0 0 2px #f3c965,0 4px 9px #06192299!important}.hand-card:disabled{opacity:1;cursor:default}.empty-hand{padding:15px;color:#e5ede8}.controls,.settlement-actions{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:8px;min-height:38px}.controls button,.settlement-actions button,.leave-link{padding:7px 13px;border:1px solid #73918d;border-radius:8px;background:#213a50;color:#f2f6f4;font:inherit;cursor:pointer}.controls button:disabled,.settlement-actions button:disabled{opacity:.46;cursor:not-allowed}.controls button.primary,.settlement-actions .primary{background:#dfb75c;border-color:#f8dc91;color:#202a30;font-weight:750}.control-label{color:#f8d786;font-weight:700}.waiting-action,.readonly-note{color:#c3d1d1;text-align:center;font-size:12px}.readonly-note{padding:2px}
.settlement{flex:none;max-height:39%;overflow:auto;padding:10px 14px;border:1px solid #758c92;border-radius:14px;background:#101f31}.settlement-heading{display:flex;align-items:center;justify-content:center;gap:12px}.settlement h2{margin:0 0 7px;text-align:center;font-size:18px;color:#ffdf92}.spring{padding:3px 9px;border-radius:12px;background:#b74a45;color:white;font-size:12px}.score-summary{display:grid;gap:3px;max-width:620px;margin:0 auto}.score-line{display:grid;grid-template-columns:minmax(90px,1fr) 62px minmax(110px,1fr);align-items:center;gap:9px;padding:3px 8px;border-bottom:1px solid #ffffff18}.score-line small{margin-left:4px;color:#d9c17d}.score-line strong{text-align:center;color:#ffdc8a}.score-line>span:last-child{text-align:right;color:#d3e0e2}.redeal-note{text-align:center;color:#d8e4e2;margin:4px}.settlement-actions{margin-top:8px}.settlement-actions .end-button{border-color:#956b70;color:#f0c4c1}
@media(max-width:650px){.landlord-table{gap:6px;padding:7px;border-radius:12px}.table-header strong{font-size:14px}.table-header{gap:6px}.table-header span{font-size:11px}.table-surface{min-height:220px;padding:8px 5px;border-width:4px}.opponents{inset:5px 3% auto}.opponent{gap:5px;padding:5px 6px;max-width:46%}.avatar{width:32px;height:32px}.identity strong{max-width:72px;font-size:11px}.identity small{font-size:10px}.card-back{width:16px;height:23px;margin-left:-7px}.center-table{inset:49% 8% auto;gap:10px}.table-facts{gap:6px}.bottom-cards{min-width:54px}.bottom-backs i{width:20px;height:31px}.bottom-face .mini-card{min-width:20px;height:30px;font-size:9px}.multiplier{padding:4px 7px}.multiplier strong{font-size:18px}.last-play{max-width:45%;min-width:60px}.mini-card.played{min-width:23px;height:32px;font-size:11px}.player-seat{inset:auto 1% 5px;gap:3px}.player-identity .avatar{width:30px;height:30px}.player-identity strong{font-size:11px}.hand{min-height:59px;padding-top:5px}.hand-card{flex-basis:clamp(24px,6vw,41px);width:clamp(24px,6vw,41px);height:clamp(42px,11vh,57px);margin-left:calc(-1 * clamp(14px,2.5vw,20px));font-size:11px!important}.settlement{padding:7px 8px}.settlement h2{font-size:15px}.score-line{grid-template-columns:minmax(70px,1fr) 46px minmax(88px,1fr);gap:4px;font-size:11px}}
@media(orientation:portrait) and (max-width:650px){.landlord-table{min-height:380px}.table-surface{min-height:260px}.hand-card{flex-basis:clamp(25px,7vw,40px);width:clamp(25px,7vw,40px);margin-left:-15px}}
#academy-workspace .pt .landlord-table .table-surface{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(58px,1fr) auto;justify-content:stretch;gap:3px;border-radius:26px}#academy-workspace .pt .landlord-table .opponents{position:static;inset:auto;min-height:52px}#academy-workspace .pt .landlord-table .center-table{position:static;inset:auto;transform:none;min-height:58px;margin:0 12%}#academy-workspace .pt .landlord-table .player-seat{position:static;inset:auto;display:grid;grid-template-columns:108px minmax(0,1fr);align-items:center;gap:6px;padding:3px 2px}#academy-workspace .pt .landlord-table .player-identity{gap:4px}#academy-workspace .pt .landlord-table .player-identity .avatar{width:30px;height:30px}#academy-workspace .pt .landlord-table .player-identity>div{font-size:11px}#academy-workspace .pt .landlord-table .hand{min-height:62px;padding:8px 0 0}#academy-workspace .pt .landlord-table .hand-card{flex:0 1 44px;width:44px;min-width:0;min-height:0!important;height:60px;margin-left:-16px;padding:3px 1px!important;border:1px solid #d2c7af!important;border-radius:6px!important;background:#fffaf0!important;color:#18252c!important;box-shadow:0 2px 5px #06192299!important;font-size:12px!important;font-weight:750!important;line-height:1!important;text-align:left!important;opacity:1!important;display:flex;align-items:flex-start;justify-content:flex-start}#academy-workspace .pt .landlord-table .hand-card:first-child{margin-left:0}#academy-workspace .pt .landlord-table .hand-card.red{color:#ae3033!important}#academy-workspace .pt .landlord-table .hand-card.selected{border-color:#ffe28a!important;box-shadow:0 0 0 2px #f3c965,0 4px 9px #06192299!important}#academy-workspace .pt .landlord-table .hand-card span{padding-left:1px}#academy-workspace .pt .landlord-table.is-complete{height:auto;max-height:none}#academy-workspace .pt .landlord-table.is-complete .table-surface{min-height:330px}
#academy-workspace .pt .landlord-table .last-seat-action{position:absolute;right:8px;bottom:-14px;padding:1px 6px;border-radius:7px;background:#133e33;color:#ffe49c;font-size:10px;line-height:14px;white-space:nowrap;z-index:1}
#academy-workspace .terminal-device-landscape .pt .landlord-table .table-surface{padding:8px 10px}#academy-workspace .terminal-device-landscape .pt .landlord-table .opponent{padding:4px 8px;gap:5px}#academy-workspace .terminal-device-landscape .pt .landlord-table .opponent .avatar{width:30px;height:30px}#academy-workspace .terminal-device-landscape .pt .landlord-table .identity{grid-template-columns:auto auto;align-items:center;gap:2px 6px}#academy-workspace .terminal-device-landscape .pt .landlord-table .identity strong{font-size:12px}#academy-workspace .terminal-device-landscape .pt .landlord-table .identity small{font-size:10px}#academy-workspace .terminal-device-landscape .pt .landlord-table .center-table{min-height:46px;margin:0 10%}#academy-workspace .terminal-device-landscape .pt .landlord-table .multiplier{display:flex;flex-direction:row;align-items:center;gap:5px;padding:4px 7px}#academy-workspace .terminal-device-landscape .pt .landlord-table .multiplier strong{font-size:20px;line-height:1.1}#academy-workspace .terminal-device-landscape .pt .landlord-table .last-play{max-height:52px;overflow:auto}#academy-workspace .terminal-device-landscape .pt .landlord-table .played-cards{max-height:38px}#academy-workspace .terminal-device-landscape .pt .landlord-table .player-seat{grid-template-columns:100px minmax(0,1fr)}#academy-workspace .terminal-device-landscape .pt .landlord-table .hand{min-height:58px}#academy-workspace .terminal-device-landscape .pt .landlord-table .hand-card{height:50px}#academy-workspace .terminal-device-landscape .pt .landlord-table .controls button{padding:5px 10px!important;min-height:32px!important;font-size:12px!important;line-height:1.2!important}#academy-workspace .terminal-device-landscape .pt .landlord-table .leave-link{padding:4px 8px!important;min-height:28px!important;font-size:11px!important;line-height:1.2!important}
.is-complete .settlement{flex:1;max-height:none;min-height:0}.settlement-player{display:flex;align-items:center;gap:8px;min-width:0}.settlement-player>span{overflow-wrap:anywhere}.settlement-player .avatar{width:32px;height:32px;flex:none}.settlement-cards{margin-top:8px}.settlement-cards summary{cursor:pointer;color:#c4d9d5;font-size:12px}.remaining-hand{display:flex;flex-wrap:wrap;align-items:center;gap:3px;margin:8px 0}.remaining-hand>small{flex-basis:100%}.is-complete .settlement-actions{position:sticky;bottom:0;background:#153a32;padding:8px 0}.is-complete .score-line{padding:8px 0}
.speech-bubble{position:absolute;top:calc(100% + 5px);left:0;z-index:3;max-width:180px;min-width:80px;padding:7px 9px;border-radius:10px;background:#fff8e7;color:#263a3a;box-shadow:0 3px 8px #0004;font-size:12px;line-height:1.4;overflow-wrap:anywhere;text-align:left;pointer-events:none}.speech-bubble:before{content:'';position:absolute;top:-5px;left:19px;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:5px solid #fff8e7}.seat-right .speech-bubble{left:auto;right:0}.seat-right .speech-bubble:before{left:auto;right:19px}.settlement-bubble{display:block;color:#ffdf9d;font-size:11px;font-weight:400;margin-top:3px}
#academy-workspace .pt .landlord-table.is-complete .settlement{padding:8px 12px}#academy-workspace .pt .landlord-table.is-complete .settlement h2{margin:0!important;padding:0!important;font-size:18px!important;line-height:1.3}#academy-workspace .pt .landlord-table.is-complete .settlement-heading{margin:0 0 6px;min-height:27px}#academy-workspace .pt .landlord-table.is-complete .score-summary{width:100%}#academy-workspace .pt .landlord-table.is-complete .score-line{grid-template-columns:minmax(0,1fr) max-content minmax(90px,1fr);padding:4px 0;min-height:30px;font-size:12px;gap:10px}#academy-workspace .pt .landlord-table.is-complete .settlement-player .avatar{width:28px!important;height:28px!important;min-width:28px!important;min-height:28px!important;margin:0!important}#academy-workspace .pt .landlord-table.is-complete .settlement-actions{padding:4px 0;margin-top:5px;min-height:30px}#academy-workspace .pt .landlord-table.is-complete .settlement-actions button{padding:5px 10px!important;min-height:30px!important;line-height:1.2!important;font-size:12px!important}
@media (max-height:500px),(orientation:portrait) and (max-width:700px){#academy-workspace .pt .landlord-table.is-complete .settlement{padding:4px 8px}#academy-workspace .pt .landlord-table.is-complete .settlement-heading{min-height:23px;margin-bottom:2px}#academy-workspace .pt .landlord-table.is-complete .settlement h2{font-size:16px!important}#academy-workspace .pt .landlord-table.is-complete .score-line{min-height:26px;padding:2px 0}#academy-workspace .pt .landlord-table.is-complete .settlement-player .avatar{width:24px!important;height:24px!important;min-width:24px!important;min-height:24px!important}#academy-workspace .pt .landlord-table.is-complete .settlement-actions{position:static;padding:2px 0;margin-top:2px}#academy-workspace .pt .landlord-table.is-complete .settlement-cards{margin-top:3px}#academy-workspace .pt .landlord-table .settlement-bubble{display:inline;margin-left:6px}#academy-workspace .terminal-device-landscape .pt .landlord-table .opponents{min-height:44px}#academy-workspace .terminal-device-landscape .pt .landlord-table .center-table{min-height:32px}#academy-workspace .terminal-device-landscape .pt .landlord-table .table-surface{grid-template-rows:auto minmax(32px,1fr) auto;padding:5px 8px}#academy-workspace .terminal-device-landscape .pt .landlord-table .hand{min-height:44px;padding-top:4px}#academy-workspace .terminal-device-landscape .pt .landlord-table .hand-card{height:40px}#academy-workspace .terminal-device-landscape .pt .landlord-table .player-seat{padding:0 2px}#academy-workspace .terminal-device-landscape .pt .landlord-table .bottom-backs i{height:25px}}
</style>
