<script setup lang="ts">
import {computed,ref,watch,onMounted,onBeforeUnmount} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {mahjongView,mahjongOwnShanten,mahjongTileLabel,mahjongMeldTiles,mahjongPublicContext,chooseMahjongReply,type MahjongRound,type MahjongReply,type MahjongPhrases,type MahjongStyle} from '../domain/mahjong';
import TerminalActorAvatar from './TerminalActorAvatar.vue';
import SettlementVoices from './SettlementVoices.vue';
import MahjongTile from './MahjongTile.vue';
const props=withDefaults(defineProps<{w:ViewModel;round:MahjongRound;name:(id:string)=>string;busy:boolean;active?:boolean;readOnly?:boolean;phrases?:Record<string,MahjongPhrases>;styles?:Record<string,MahjongStyle>}>(),{active:true,readOnly:false});
const emit=defineEmits<{action:[reply:MahjongReply];start:[];leave:[];end:[];retrySettlement:[]}>();
const view=computed(()=>mahjongView(props.round));
const selected=ref(''),riichi=ref(false);
watch(()=>[props.round.number,props.round.steps.length],()=>{selected.value='';riichi.value=false;});
const own=computed(()=>view.value.seats.find(s=>s.id==='player')!);
const opponents=computed(()=>props.round.participants.slice(1).map((id,i)=>({...view.value.seats.find(s=>s.id===id)!,position:['right','top','left'][i]})));
const canAct=computed(()=>props.active&&!props.readOnly&&!props.busy&&props.round.phase==='playing');
const discards=computed(()=>view.value.options.filter(o=>o.kind==='discard'));
const riichiOptions=computed(()=>view.value.options.filter(o=>o.kind==='riichi'));
const calls=computed(()=>view.value.options.filter(o=>!['discard','riichi'].includes(o.kind)));
const choices=computed(()=>riichi.value?riichiOptions.value:discards.value);
const chosen=computed(()=>choices.value.find(o=>o.reply.dapai?.slice(0,2)===selected.value));
function play(){if(canAct.value&&chosen.value)emit('action',chosen.value.reply);}
function hint(){const ctx=mahjongPublicContext(props.round,'player'),r=chooseMahjongReply(ctx,{skill:5,aggression:3,caption:'提示'});if(r.dapai){riichi.value=r.dapai.includes('*');selected.value=r.dapai.slice(0,2);}}
const bubble=ref<{id:string;text:string;until:number}>();let timer:ReturnType<typeof setInterval>|undefined,waitKey='',waitSince=0,lastAt=0,waitCount=0,lastEvent=-1;
function tick(){const now=Date.now();if(!props.active||props.readOnly||document.hidden||props.round.phase==='complete'){bubble.value=undefined;waitSince=now;return;}if(bubble.value&&now>bubble.value.until)bubble.value=undefined;
 const key=props.round.number+':'+props.round.steps.length;if(waitKey!==key){waitKey=key;waitSince=now;waitCount=0;}
 if(now-lastAt<10000)return;
 let id='',category:keyof MahjongPhrases='waiting';
 if(view.value.options.length&&now-waitSince>=18000&&waitCount<2&&(!waitCount||now-lastAt>=30000)){id=opponents.value[waitCount%3].id;waitCount++;}
 else if(lastEvent!==props.round.steps.length){lastEvent=props.round.steps.length;const last=view.value.events.at(-1);if(last?.id!=='player'&&last?.text.includes('立直')){id=last.id;category='riichi';}else if(props.round.steps.length<12){id=view.value.actor;if(id==='player')return;const ctx=mahjongPublicContext(props.round,id);if(mahjongOwnShanten(ctx.own)<3)return;category='weak';}}
 if(!id)return;const lines=props.phrases?.[id]?.[category];if(!lines?.length)return;bubble.value={id,text:lines[(props.round.number+props.round.steps.length)%lines.length],until:now+5500};lastAt=now;
}
onMounted(()=>{timer=setInterval(tick,700);});onBeforeUnmount(()=>{if(timer)clearInterval(timer);});
function signed(n:number){return n>0?'+'+n:String(n);}
</script>
<template>
 <section class="mahjong-table" aria-label="日麻牌桌">
  <header class="mj-header"><strong>日麻 · {{view.label}}</strong><span>{{round.phase==='complete'?'本局结算':view.options.length?'轮到你':name(view.actor)+' · 思考中…'}}</span><button v-if="!readOnly" type="button" @click="emit('leave')">回房间</button></header>
  <template v-if="round.phase==='playing'">
   <div class="mj-felt">
    <article v-for="seat in opponents" :key="seat.id" class="mj-seat" :class="['mj-'+seat.position,{thinking:seat.id===view.actor}]">
     <div class="mj-identity"><TerminalActorAvatar class="mj-avatar" :w="w" :id="seat.id"/><div><strong>{{name(seat.id)}}</strong><small>{{seat.wind}} · {{seat.score}}点 <b v-if="seat.riichi">立直</b></small><small>{{seat.count}} 张 · {{styles?.[seat.id]?.caption||'正在对局'}}</small></div><p v-if="bubble?.id===seat.id" class="mj-bubble" role="status">{{bubble.text}}</p></div>
     <div class="mj-backs" aria-label="暗牌"><i v-for="n in Math.min(seat.count,14)" :key="n"><MahjongTile tile="back" decorative/></i></div>
     <div class="mj-melds"><span v-for="(meld,i) in seat.melds" :key="i" class="mj-meld"><b v-for="(p,j) in mahjongMeldTiles(meld)" :key="j" class="mj-tile"><MahjongTile :tile="p"/></b></span></div>
     <div class="mj-river" :aria-label="name(seat.id)+'的牌河'"><span v-for="(p,i) in seat.river" :key="i" class="mj-tile mj-discard" :class="{riichi:p.includes('*'),called:/[+=-]/.test(p)}"><MahjongTile :tile="p"/></span></div>
    </article>
    <div class="mj-center"><strong>{{view.remaining}}</strong><small>余牌 · 供托 {{view.sticks}} 根</small><div class="mj-dora"><small>宝牌指示</small><span v-for="(p,i) in view.dora" :key="i" class="mj-tile"><MahjongTile :tile="p"/></span></div><small v-if="view.status==='dapai'&&view.lastDiscard">{{name(view.actor)}} 打出 <span class="mj-action-tile"><MahjongTile :tile="view.lastDiscard"/></span></small></div>
    <div class="mj-own-river mj-river" aria-label="你的牌河"><span v-for="(p,i) in own.river" :key="i" class="mj-tile mj-discard" :class="{riichi:p.includes('*'),called:/[+=-]/.test(p)}"><MahjongTile :tile="p"/></span></div>
   </div>
   <div class="mj-player"><div class="mj-player-info"><strong>{{name('player')}}</strong><small>{{own.wind}} · {{own.score}}点 <b v-if="own.riichi">立直</b></small></div><div class="mj-hand" aria-label="你的日麻手牌"><button v-for="(p,i) in own.hand" :key="i" class="mj-tile mj-hand-tile" :class="{selected:selected===p,red:p[1]==='0',drawn:i===own.hand.length-1&&own.draw}" type="button" :aria-label="mahjongTileLabel(p)" :aria-pressed="selected===p" :disabled="!canAct||!choices.some(o=>o.reply.dapai?.slice(0,2)===p)" @click="selected=p"><MahjongTile :tile="p" decorative/></button><span v-for="(meld,i) in own.melds" :key="'m'+i" class="mj-meld"><b v-for="(p,j) in mahjongMeldTiles(meld)" :key="j" class="mj-tile"><MahjongTile :tile="p"/></b></span></div></div>
   <footer v-if="!readOnly" class="mj-controls"><template v-if="discards.length"><button type="button" :disabled="!canAct" @click="hint">提示</button><button v-if="riichiOptions.length" type="button" :aria-pressed="riichi" :disabled="!canAct" @click="riichi=!riichi;selected=''">{{riichi?'取消立直':'立直'}}</button><button class="mj-primary" type="button" :disabled="!canAct||!chosen" @click="play">{{riichi?'立直并打牌':'出牌'}}<span v-if="chosen" class="mj-action-tile"><MahjongTile :tile="selected"/></span></button></template><button v-for="o in calls" :key="o.key" type="button" :disabled="!canAct" :class="{'mj-primary':o.kind==='win'}" @click="emit('action',o.reply)">{{o.label}} <span v-if="o.reply.fulou||o.reply.gang" class="mj-action-tiles"><span v-for="(p,j) in mahjongMeldTiles(o.reply.fulou||o.reply.gang!)" :key="j" class="mj-action-tile"><MahjongTile :tile="p"/></span></span></button><small v-if="!view.options.length">等待其他人出牌…</small></footer>
  </template>
  <section v-else class="mj-settlement" aria-label="日麻本局结算"><h3>{{round.result?.reason}}</h3><div v-for="win in round.result?.wins" :key="win.id" class="mj-win"><strong>{{name(win.id)}} · {{win.from?name(win.from)+'放铳':'自摸'}}</strong><p>{{win.yaku.map(y=>y.name+' '+(typeof y.han==='string'?'役满':y.han+'番')).join(' · ')}} · {{win.yakuman?win.yakuman+'倍役满':win.han+'番 '+win.fu+'符'}} · {{win.points}}点</p><div v-if="win.ura.length" class="mj-dora"><small>里宝牌指示</small><span v-for="(p,i) in win.ura" :key="i" class="mj-tile"><MahjongTile :tile="p"/></span></div></div>
   <div class="mj-score-grid"><article v-for="id in round.participants" :key="id"><TerminalActorAvatar class="mj-avatar" :w="w" :id="id"/><div><strong>{{name(id)}}</strong><b>{{signed(round.result?.deltas[id]||0)}}</b><small>现有 {{round.result?.scores[id]}}点</small></div></article></div>
   <SettlementVoices :w="w" :talk="round.settlementTalk" :name="name" :busy="busy" :read-only="readOnly" @retry="emit('retrySettlement')"/>
   <details><summary>本局公开牌况</summary><div v-for="seat in view.seats" :key="seat.id"><strong>{{name(seat.id)}}</strong><div v-if="seat.revealed||seat.id==='player'" class="mj-revealed"><span v-for="(p,i) in seat.hand" :key="i" class="mj-tile"><MahjongTile :tile="p"/></span></div><span v-else> 未公开手牌</span><span v-for="(meld,i) in seat.melds" :key="i" class="mj-meld"><b v-for="(p,j) in mahjongMeldTiles(meld)" :key="j" class="mj-tile"><MahjongTile :tile="p"/></b></span></div></details>
   <div v-if="!readOnly" class="mj-controls"><button class="mj-primary" type="button" :disabled="busy" @click="emit('start')">下一局</button><button type="button" :disabled="busy" @click="emit('leave')">回房间</button><button type="button" :disabled="busy" @click="emit('end')">主动结束</button></div>
  </section>
 </section>
</template>
<style scoped>
.mahjong-table{box-sizing:border-box;width:100%;height:100%;min-height:340px;max-height:100%;display:flex;flex-direction:column;gap:6px;padding:10px;color:#edf4eb;background:linear-gradient(145deg,#14252c,#102d28);border:1px solid #4f7366;border-radius:16px;overflow:auto;font:13px/1.3 system-ui}.mj-header{display:flex;align-items:center;gap:12px;flex-shrink:0}.mj-header>span{flex:1;text-align:center;color:#bbd4c8;font-size:12px}.mj-header button{padding:4px 12px!important;min-height:28px!important;font-size:12px!important}.mj-felt{display:grid;grid-template-columns:minmax(130px,1fr) minmax(150px,1.15fr) minmax(130px,1fr);grid-template-rows:minmax(110px,1fr) minmax(65px,.6fr) 42px;gap:5px;flex:1;min-height:220px;padding:8px;border:5px solid #8c7251;border-radius:20px;background:radial-gradient(ellipse,#326e55,#194b3c)}.mj-seat{min-width:0;border-radius:12px;padding:6px;background:#0b26265c;overflow:visible}.mj-top{grid-area:1/2/2/3}.mj-left{grid-area:1/1/3/2}.mj-right{grid-area:1/3/3/4}.thinking{box-shadow:inset 0 0 0 1px #d8c17f}.mj-identity{position:relative;display:flex;gap:7px;align-items:center}.mj-identity>div{min-width:0}.mj-identity strong{display:block;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mj-identity small{display:block;font-size:10px;color:#bdd5c6}.mj-avatar{width:32px!important;height:32px!important;flex:0 0 32px;border-radius:50%;overflow:hidden}.mj-bubble{position:absolute;z-index:4;top:22px;left:10px;right:2px;padding:7px;border-radius:0 10px 10px 10px;background:#f5efd7;color:#223b2c;font:12px/1.4 system-ui;overflow-wrap:anywhere;box-shadow:0 2px 12px #0005}.mj-backs{display:flex;gap:2px;margin:5px 0}.mj-backs i{height:15px;width:10px;flex:0 1 10px;min-width:3px;background:#b9d3bb;border:1px solid #577d62;border-radius:2px}.mj-tile{display:inline-flex;flex-shrink:0;align-items:center;justify-content:center;box-sizing:border-box;border-radius:3px;border:1px solid #c0c4b2;border-bottom:3px solid #b1b99a;background:#f8f4df;color:#173b35;font-weight:650;font-size:11px;line-height:1;width:26px;height:31px;white-space:nowrap;letter-spacing:-.5px}.mj-river{display:flex;align-content:start;flex-wrap:wrap;gap:2px;max-width:100%;margin-top:4px;overflow:auto;max-height:130px}.mj-discard{width:23px;height:27px;font-size:10px}.mj-discard.riichi{background:#e8cf8f}.mj-discard.called{opacity:.45}.mj-melds,.mj-meld,.mj-dora,.mj-revealed{display:flex;align-items:center;flex-wrap:wrap;gap:2px}.mj-meld{margin-right:5px}.mj-meld .mj-tile{width:20px;height:24px;font-size:9px}.mj-center{grid-area:2/2/3/3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center}.mj-center>strong{font-size:23px;color:#ead69a}.mj-center small{font-size:10px}.mj-dora .mj-tile{height:26px;width:23px;font-size:10px}.mj-own-river{grid-area:3/1/4/4;justify-content:center;max-height:42px;margin:0}.mj-own-river .mj-tile{height:20px;width:21px;font-size:9px}.mj-player{display:flex;gap:10px;align-items:center;flex-shrink:0;padding:6px 0}.mj-player-info{flex:0 0 95px;min-width:0;display:flex;flex-direction:column;font-size:12px}.mj-player-info strong{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.mj-player-info small{font-size:10px}.mj-hand{display:flex;flex:1;align-items:end;min-width:0;gap:3px;overflow:auto;padding-top:7px}.mj-hand-tile{height:45px!important;width:clamp(24px,4.1vw,40px);min-width:24px!important;flex:0 1 40px;padding:2px!important;font-size:13px!important;min-height:0!important;background:#f8f4df!important;color:#173b35!important;border-radius:4px!important}.mj-hand-tile:disabled{opacity:1;filter:brightness(.9)}.mj-hand-tile.selected{transform:translateY(-6px);outline:2px solid #e9c66b}.mj-hand-tile.red{color:#bb3430!important}.mj-hand-tile.drawn{margin-left:5px}.mj-controls{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;flex-shrink:0}.mj-controls button{padding:6px 12px!important;min-height:32px!important;font-size:12px!important}.mj-primary{background:#786333!important;border-color:#d6ba70!important;color:#fff6df!important}.mj-controls small{padding:8px}.mj-settlement{display:flex;flex-direction:column;gap:8px;overflow:auto}.mj-settlement h3{margin:4px 0;color:#ead69a;font-size:20px}.mj-win{font-size:12px}.mj-win p{margin:3px 0}.mj-score-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.mj-score-grid article{display:flex;gap:8px;padding:8px;background:#ffffff0a;border:1px solid #6a897766;border-radius:9px}.mj-score-grid article>div{min-width:0;display:flex;flex-direction:column;gap:3px}.mj-score-grid strong{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px}.mj-score-grid b{font-size:18px;color:#edd694}.mj-score-grid small{font-size:10px}.mj-settlement details{font-size:11px}.mj-settlement details>div{margin-top:5px}.mj-settlement .mj-controls{margin-top:auto;position:sticky;bottom:0;z-index:5;background:#153029;padding:5px 0}@media(max-height:500px){.mahjong-table{padding:6px;gap:3px}.mj-felt{grid-template-rows:minmax(92px,1fr) minmax(55px,.6fr) 31px;min-height:185px;padding:5px;border-width:3px}.mj-seat{padding:4px}.mj-river{max-height:84px}.mj-discard{width:20px;height:23px;font-size:9px}.mj-own-river{max-height:31px}.mj-player{padding:3px 0}.mj-hand-tile{height:36px!important}.mj-avatar{width:27px!important;height:27px!important;flex-basis:27px}.mj-settlement{gap:5px}}

.mahjong-table .mj-player .mj-hand button.mj-hand-tile{background:#f8f4df!important;color:#173b35!important;border:1px solid #c0c4b2!important;border-bottom:3px solid #b1b99a!important}
.mj-seat{display:flex;flex-direction:column;min-height:0}.mj-seat .mj-river{min-height:0;flex:1}.mj-identity,.mj-backs,.mj-melds{flex-shrink:0}
@media (max-height:500px),(orientation:portrait) and (max-width:700px){
 .mahjong-table{min-height:0;padding:5px;gap:3px;overflow:hidden}.mj-header{gap:5px;min-height:24px}.mj-header strong{font-size:11px}.mj-header>span{font-size:10px}
 .mj-felt{min-height:0;grid-template-rows:minmax(60px,1fr) 40px 23px;gap:3px;padding:4px;border-width:3px;border-radius:13px;overflow:hidden}.mj-seat{padding:3px}.mj-identity{gap:4px}.mj-identity strong{font-size:11px}.mj-identity small{font-size:9px}.mj-avatar{width:24px!important;height:24px!important;flex-basis:24px}.mj-backs{margin:3px 0}.mj-backs i{height:10px}.mj-discard{width:18px;height:21px;font-size:8px}.mj-melds .mj-tile{width:17px;height:18px;font-size:8px}.mj-center{flex-direction:row;flex-wrap:wrap;gap:2px}.mj-center>strong{font-size:19px}.mj-center small{font-size:9px}.mj-dora .mj-tile{width:18px;height:20px;font-size:9px}.mj-own-river{max-height:23px}.mj-own-river .mj-tile{width:17px;height:20px;font-size:8px}
 .mj-player{padding:1px 0;gap:7px}.mj-player-info{flex-basis:80px}.mj-hand{padding-top:6px;gap:2px}.mj-hand-tile{height:32px!important;flex-basis:34px;font-size:11px!important}.mj-controls{gap:4px}.mj-controls button{padding:3px 9px!important;min-height:26px!important;font-size:11px!important}.mj-bubble{font-size:11px;padding:5px;top:12px}.mj-settlement{min-height:0;gap:5px;overflow:auto}.mj-score-grid article{padding:4px;gap:5px}.mj-score-grid b{font-size:15px}
}
</style>

<style>
#academy-workspace .pt .mahjong-table button{min-height:28px;padding:4px 10px!important;font-size:12px!important;line-height:1.3!important}
#academy-workspace .pt .mahjong-table button.mj-hand-tile{background:#f8f4df!important;color:#173b35!important;border:1px solid #c0c4b2!important;border-bottom:3px solid #b1b99a!important;padding:2px!important;border-radius:4px!important;font-size:13px!important;opacity:1}
#academy-workspace .pt .mahjong-table button.mj-hand-tile.red{color:#bb3430!important}
#academy-workspace .pt .mahjong-table button.mj-hand-tile.selected{outline:2px solid #e9c66b}
#academy-workspace .pt .mahjong-table .mj-primary{background:#786333!important;border-color:#d6ba70!important;color:#fff6df!important}
#academy-workspace .pt .mahjong-table .mj-settlement h3{margin:3px 0;font-size:18px}
#academy-workspace .pt .mahjong-table .mj-win p{margin:3px 0;font-size:11px}
#academy-workspace .pt .mahjong-table small{font-size:10px}
@media(max-height:500px),(orientation:portrait) and (max-width:700px){#academy-workspace .pt .mahjong-table button{min-height:26px;padding:3px 8px!important;font-size:11px!important}#academy-workspace .pt .mahjong-table button.mj-hand-tile{font-size:11px!important}#academy-workspace .pt .mahjong-table small{font-size:9px}}
</style>

<style>
#academy-workspace .pt .mahjong-table .mj-tile{background:transparent!important;border:0!important;border-radius:3px;box-shadow:0 1px 2px #0005;padding:0!important;overflow:visible}
#academy-workspace .pt .mahjong-table button.mj-hand-tile{background:transparent!important;border:0!important;border-bottom:0!important;padding:0!important;flex:0 1 36px;aspect-ratio:3/4;min-width:0;max-width:36px;height:auto!important;min-height:0!important;line-height:0!important;box-shadow:0 2px 3px #0006;border-radius:4px!important;overflow:visible}
#academy-workspace .pt .mahjong-table button.mj-hand-tile:disabled{filter:brightness(.84)}
#academy-workspace .pt .mahjong-table button.mj-hand-tile.selected{transform:translateY(-6px);outline:2px solid #ecd483;box-shadow:0 3px 8px #0008}
#academy-workspace .pt .mahjong-table .mj-discard{width:21px;height:28px;min-width:0;flex:0 0 21px}
#academy-workspace .pt .mahjong-table .mj-melds .mj-tile{width:20px;height:27px}
#academy-workspace .pt .mahjong-table .mj-dora .mj-tile{width:23px;height:31px}
#academy-workspace .pt .mahjong-table .mj-backs{display:flex;gap:1px}
#academy-workspace .pt .mahjong-table .mj-backs i{width:12px;height:16px;background:none;border:0;border-radius:0}
#academy-workspace .pt .mahjong-table .mj-action-tiles{display:inline-flex;gap:2px;margin-left:5px;vertical-align:middle}
#academy-workspace .pt .mahjong-table .mj-action-tile{display:inline-block;width:18px;height:24px;vertical-align:middle;margin-left:2px}
#academy-workspace .pt .mahjong-table .mj-revealed .mj-tile,#academy-workspace .pt .mahjong-table .mj-hand .mj-meld .mj-tile{width:25px;height:34px}
#academy-workspace .pt .mahjong-table .mj-hand-tile .mj-tile-art{display:block}
@media(max-height:500px),(orientation:portrait) and (max-width:700px){
 #academy-workspace .pt .mahjong-table button.mj-hand-tile{max-width:27px;flex-basis:27px}
 #academy-workspace .pt .mahjong-table .mj-discard{width:16px;height:22px;flex-basis:16px}
 #academy-workspace .pt .mahjong-table .mj-melds .mj-tile{width:16px;height:22px}
 #academy-workspace .pt .mahjong-table .mj-dora .mj-tile{width:17px;height:23px}
 #academy-workspace .pt .mahjong-table .mj-backs i{width:9px;height:12px}
 #academy-workspace .pt .mahjong-table .mj-action-tile{width:15px;height:20px}
 #academy-workspace .pt .mahjong-table .mj-revealed .mj-tile,#academy-workspace .pt .mahjong-table .mj-hand .mj-meld .mj-tile{width:21px;height:28px}
}
</style>
