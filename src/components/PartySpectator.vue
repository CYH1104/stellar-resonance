<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {PartySpectatorView} from '../domain/partySpectator';
import TerminalActorAvatar from './TerminalActorAvatar.vue';
import PlayingCard from './PlayingCard.vue';
import MahjongTile from './MahjongTile.vue';
import GameChat from './GameChat.vue';
const props=defineProps<{w:ViewModel;view:PartySpectatorView;rounds:{number:number;complete:boolean}[];busy:boolean;running:boolean;name:(id:string)=>string}>();
const emit=defineEmits<{start:[];step:[];resume:[];pause:[];leave:[];end:[];history:[value:boolean];select:[number:number]}>();
const selected=ref(0);
watch(selected,n=>emit('select',n));
const reviewing=computed(()=>selected.value!==0&&selected.value!==props.rounds.at(-1)?.number);
watch(reviewing,v=>emit('history',v));
</script>
<template>
<section class="spectator-table" aria-label="角色对局观战">
 <header><div><small>PUBLIC TABLE · 观战位</small><h3>{{view.name}}</h3></div><button type="button" @click="emit('leave')">离开观战</button></header>
 <p class="spectator-hint">{{reviewing?'正在回看已保存的小局。':'你不占座，也不会替角色出牌。'}} 暗牌只显示牌背；公开行动和结果会保留。</p>
 <label v-if="rounds.length" class="spectator-history">对局记录 <select v-model="selected"><option :value="0">当前小局</option><option v-for="v in rounds" :key="v.number" :value="v.number">第 {{v.number}} 局{{v.complete?' · 已结算':' · 进行中'}}</option></select></label>
 <div class="spectator-seats" :data-kind="view.kind">
  <article v-for="p in view.people" :key="p.id" :class="{acting:view.turn===p.id&&!view.complete}">
   <div class="spectator-person"><TerminalActorAvatar :w="w" :id="p.id"/><div><strong>{{p.name}}</strong><small>{{p.label}}<template v-if="p.score!==undefined"> · {{p.score}} 分</template></small></div><span v-if="view.turn===p.id&&!view.complete">行动中</span></div>
   <div v-if="view.kind==='mahjong'" class="spectator-tiles"><span v-for="(_,n) in Math.min(p.count,14)" :key="n"><MahjongTile tile="back" decorative/></span><small>{{p.count}} 张暗牌</small></div>
   <div v-else-if="view.kind==='landlord'||view.kind==='eleven'" class="spectator-backs"><span v-for="(_,n) in Math.min(p.count,5)" :key="n"><PlayingCard card="back" decorative/></span><small>{{p.count}} 张</small></div>
   <div v-if="p.cards.length" class="spectator-cards" :aria-label="p.name+'的公开牌'"><span v-for="(c,n) in p.cards" :key="n"><MahjongTile v-if="view.kind==='mahjong'" :tile="c"/><PlayingCard v-else :card="c"/></span></div>
   <div v-if="p.melds.length" class="spectator-river" aria-label="公开副露"><span v-for="(c,n) in p.melds" :key="n"><MahjongTile :tile="c"/></span></div>
   <div v-if="p.river.length" class="spectator-river" aria-label="公开牌河"><span v-for="(c,n) in p.river" :key="n"><MahjongTile :tile="c"/></span></div>
  </article>
 </div>
 <p v-if="view.result" class="spectator-result">{{view.result}}</p>
 <div v-if="view.log.length" class="spectator-log" aria-label="公开行动记录"><p v-for="(line,n) in view.log" :key="n">{{line}}</p></div>
 <GameChat v-if="view.dialogue.length" :lines="view.dialogue" :name="name" label="桌上公开发言"/>
 <footer v-if="!reviewing&&!view.ended"><button v-if="!view.number||view.complete" type="button" :disabled="busy" @click="emit('start')">{{view.number?'观看下一小局':'开始观战'}}</button><button v-else-if="!['landlord','mahjong'].includes(view.kind)" type="button" :disabled="busy" @click="emit('step')">{{busy?'角色正在回应…':'继续角色行动'}}</button><template v-else><span role="status">{{running?'角色正在出牌…':'对局已暂停'}}</span><button type="button" @click="running?emit('pause'):emit('resume')">{{running?'暂停观战':'继续观战'}}</button></template><button type="button" :disabled="busy" @click="emit('end')">结束本场</button></footer>
</section>
</template>
<style scoped>
.spectator-table{container-type:inline-size;flex:1;min-height:0;overflow:auto;padding:12px;color:#e2eff4;min-width:0}.spectator-table header,.spectator-table footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.spectator-table h3{margin:4px 0}.spectator-table small,.spectator-hint{color:#9bb9c6;font-size:12px}.spectator-hint{line-height:1.7}.spectator-table button,.spectator-table select{padding:8px 12px;border:1px solid #527381;border-radius:9px;background:#132e3e;color:#e2eff4}.spectator-table button:disabled{opacity:.55}.spectator-history{display:flex;gap:10px;align-items:center;margin:12px 0}.spectator-seats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.spectator-seats article{min-width:0;background:#173d38;border:1px solid #476d62;border-radius:14px;padding:12px}.spectator-seats article.acting{border-color:#eed48a;box-shadow:inset 0 0 0 1px #eed48a}.spectator-person{display:flex;align-items:center;gap:9px;margin-bottom:9px}.spectator-person>:first-child{width:36px;height:36px;flex:none}.spectator-person>div{flex:1;min-width:0}.spectator-person strong{display:block;overflow:hidden;text-overflow:ellipsis}.spectator-person>span{font-size:11px;color:#eed48a}.spectator-person small{display:block}.spectator-backs,.spectator-tiles,.spectator-cards,.spectator-river{display:flex;flex-wrap:wrap;align-items:center;gap:3px;margin:7px 0}.spectator-backs>span{width:22px;height:31px}.spectator-tiles>span{width:14px;height:20px}.spectator-cards>span{width:32px;height:44px}.spectator-river>span{width:24px;height:33px}.spectator-result{padding:14px;background:#39402d;border-radius:12px;color:#f1e2a6;line-height:1.7}.spectator-log{max-height:180px;overflow:auto;font-size:12px;line-height:1.6;padding:5px 12px;background:#071622;border-radius:10px;margin:12px 0}.spectator-table footer{margin-top:12px}@container (max-width:480px){.spectator-seats{grid-template-columns:1fr}}
@container (min-width:600px){.spectator-seats{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.spectator-seats[data-kind="mahjong"]{grid-template-columns:repeat(4,minmax(0,1fr))}.spectator-seats article{padding:9px}.spectator-person{margin-bottom:4px}.spectator-log{max-height:85px;margin:7px 0}.spectator-hint{margin:5px 0}.spectator-history{margin:6px 0}.spectator-table footer{margin-top:6px}}
#academy-workspace .pt .spectator-table{font-size:13px;padding:7px;line-height:1.45}
#academy-workspace .pt .spectator-table h3{margin:3px 0;font-size:15px}
#academy-workspace .pt .spectator-hint{margin:5px 0;font-size:11px}
#academy-workspace .pt .spectator-history{display:flex;align-items:center;gap:10px;margin:7px 0}
#academy-workspace .pt .spectator-history select{display:inline-block;flex:1;width:auto;margin:0!important;padding:5px 8px!important;height:30px}
#academy-workspace .pt .spectator-table header button,#academy-workspace .pt .spectator-table footer button{padding:5px 9px!important;min-height:30px}
#academy-workspace .pt .spectator-table .spectator-log p{margin:4px 0}
</style>
