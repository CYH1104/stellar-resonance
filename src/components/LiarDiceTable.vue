<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import {minimumLiarCount,isLegalLiarBid,lastLiarBid,liarBidLabel,canRerollLiar,isScatterDice,liarChallengeOptions,type LiarRound,type LiarBid} from '../domain/liarDice';
import {liarDialogueLines} from '../domain/partyDialogueView';
import GameChat from './GameChat.vue';
const props=withDefaults(defineProps<{round:LiarRound;participants:string[];name:(id:string)=>string;working:boolean;draft:string;readOnly?:boolean;error?:string;showDialogue?:boolean}>(),{error:'',showDialogue:true});
const emit=defineEmits<{'update:draft':[value:string];bid:[bid:LiarBid];open:[targets?:string[]];split:[targets:string[]];reroll:[];confirmRoll:[];npcAction:[]} >();
const countText=ref(''),pure=ref(false),face=ref(1),selectedTargets=ref<string[]>([]);
const modern=computed(()=>((props.round as any).rulesVersion==='liar-v2'));
const phase=computed(()=>String((props.round as any).phase));
const rolling=computed(()=>phase.value==='rolling');
const pending=computed(()=>props.round.moves.at(-1)?.pending===true),previous=computed(()=>lastLiarBid(props.round));
const maximum=computed(()=>props.participants.length*5);
const minimum=computed(()=>minimumLiarCount(previous.value?.bid,pure.value,face.value,props.participants.length));
const combinations=computed(()=>[false,true].flatMap(mode=>[1,2,3,4,5,6].map(point=>({pure:mode,face:point,count:minimumLiarCount(previous.value?.bid,mode,point,props.participants.length)}))).filter(b=>b.count<=maximum.value).sort((a,b)=>a.count-b.count||a.face-b.face||Number(a.pure)-Number(b.pure)));
const hasLegalBid=computed(()=>combinations.value.length>0);
const chosen=computed<LiarBid|undefined>(()=>{const raw=countText.value.trim();if(!/^\d+$/.test(raw))return;const bid={count:Number(raw),face:face.value,pure:pure.value};if(Number.isSafeInteger(bid.count)&&isLegalLiarBid(previous.value?.bid,bid,props.participants.length))return bid;});
const targetOptions=computed(()=>modern.value?liarChallengeOptions(props.round,'player'):[]);
const challenge= computed(()=>((props.round as any).challenge||undefined));
const challengeResultText=computed(()=>challenge.value?'本次开骰/劈骰已结算。':`实际共有 ${props.round.actual} 个符合叫号的骰子。赢家：${props.name(props.round.winner!)}；${props.name(props.round.loser!)}罚酒一杯，下局由输家先叫。`);
const cups=computed(()=>challenge.value?.penalties||{});
const scatter=computed(()=>isScatterDice(props.round.dice.player||[]));
const mayReroll=computed(()=>modern.value&&rolling.value&&canRerollLiar(props.round,'player'));
function resetForm(){const first=combinations.value[0];pure.value=first?.pure??previous.value?.bid?.pure??false;face.value=first?.face??previous.value?.bid?.face??1;countText.value=String(first?.count??maximum.value);}
function resetTargets(){
 const possible=targetOptions.value.map((x:any)=>x.id),last=lastLiarBid(props.round),preferred=last?.id&&last.id!=='player'?last.id:undefined;
 selectedTargets.value=preferred&&possible.includes(preferred)?[preferred]:possible.slice(0,1);
}
watch(()=>JSON.stringify([props.round.number,props.round.moves.length,props.round.turn,phase.value,props.participants]),()=>{resetForm();resetTargets();},{immediate:true});
function normaliseCount(){if(minimum.value>maximum.value)return;const parsed=Number(countText.value.trim());const n=countText.value.trim()&&Number.isFinite(parsed)?Math.trunc(parsed):minimum.value;countText.value=String(Math.min(maximum.value,Math.max(minimum.value,n)));}
function onCountInput(event:Event){countText.value=(event.target as HTMLInputElement).value;}
function modeAllowed(mode:boolean){return combinations.value.some(b=>b.pure===mode);}
function faceAllowed(point:number){return minimumLiarCount(previous.value?.bid,pure.value,point,props.participants.length)<=maximum.value;}
function changeMode(event:Event){const mode=(event.target as HTMLSelectElement).value==='pure';if(!modeAllowed(mode))return;pure.value=mode;if(!faceAllowed(face.value))face.value=combinations.value.find(b=>b.pure===mode)!.face;normaliseCount();}
function changeFace(event:Event){const point=Number((event.target as HTMLSelectElement).value);if(!Number.isInteger(point)||point<1||point>6||!faceAllowed(point))return;face.value=point;normaliseCount();}
function submitBid(){if(!props.working&&!pending.value&&props.round.phase==='playing'&&props.round.turn==='player'&&chosen.value)emit('bid',chosen.value);}
function toggleTarget(id:string){selectedTargets.value=selectedTargets.value.includes(id)?selectedTargets.value.filter(x=>x!==id):[...selectedTargets.value,id];}
function challengeLabel(row:any){return `${props.name(row.id)} · ${liarBidLabel(row.bid)}`;}
function challengeReady(){return !props.readOnly&&!props.working&&!pending.value&&phase.value==='playing'&&props.round.turn==='player';}
function openChallenge(){if(!challengeReady())return;if(!modern.value){if(previous.value)emit('open');return;}const allowed=new Set(targetOptions.value.map(option=>option.id)),targets=[...new Set(selectedTargets.value)].filter(id=>allowed.has(id));if(targets.length)emit('open',targets);}
function splitChallenge(){if(!challengeReady()||!modern.value)return;const allowed=new Set(targetOptions.value.map(option=>option.id)),targets=[...new Set(selectedTargets.value)].filter(id=>allowed.has(id));if(targets.length)emit('split',targets);}
const pendingText=computed(()=>props.round.moves.at(-1)?.action==='open'?'开骰已保存，正在等待全桌回应。':props.round.moves.at(-1)?.action==='split'?'劈已保存，正在等待全桌回应。':'叫号已保存，正在等待下家行动和全桌回应。');
const diceGlyph=['','⚀','⚁','⚂','⚃','⚄','⚅'],dialogue=computed(()=>liarDialogueLines(props.round));
</script>
<template>
 <section class="liar-table" aria-label="大话骰牌桌">
  <p>本局先叫：{{name(round.starter)}} · 每人5颗骰子</p>
  <div class="liar-dice-row"><article v-for="id in participants" :key="id" class="liar-cup"><strong>{{name(id)}}</strong><div v-if="id==='player'||phase==='complete'" class="liar-dice" :aria-label="name(id)+'的骰子：'+round.dice[id].join('、')"><span v-for="(point,i) in round.dice[id]" :key="i" :title="point+'点'">{{diceGlyph[point]}}</span></div><div v-else class="liar-dice" :aria-label="name(id)+'的五颗暗骰'"><span v-for="i in 5" :key="i" aria-hidden="true">?</span></div></article></div>
  <section v-if="phase==='rolling'" class="liar-controls" aria-label="散点重摇">
   <p v-if="scatter" role="status">你的骰子是散点，可以重摇整杯或保留这组骰子开始叫号。</p><p v-else role="status">你的骰子不是散点，保留骰子开始叫号。</p>
   <div v-if="!readOnly&&modern" class="liar-actions"><button v-if="mayReroll&&scatter" type="button" :disabled="working" @click="emit('reroll')">散点重摇</button><button type="button" class="liar-primary" :disabled="working" @click="emit('confirmRoll')">保留并开始叫号</button></div>
  </section>
  <template v-else>
   <p v-if="pending" role="status">{{pendingText}}</p><p v-else-if="phase==='playing'" role="status">{{round.turn==='player'?'轮到你叫号或开骰':'正在等待'+name(round.turn)+'自动叫号或开骰…'}}</p>
   <p v-if="previous?.bid" class="liar-current">当前叫号：{{name(previous.id)}} · <b>{{liarBidLabel(previous.bid)}}</b></p><p v-else-if="phase==='playing'">尚未起叫，最低数量为 {{participants.length}} 个。</p>
   <div v-if="!readOnly" class="liar-controls">
    <template v-if="pending"><button v-if="error&&!working" type="button" @click="emit('npcAction')">重试本轮行动</button></template>
    <template v-else-if="phase==='playing'&&round.turn==='player'">
     <form @submit.prevent="submitBid"><div v-if="hasLegalBid" class="liar-bid-fields">
      <label>数量<input :value="countText" type="number" inputmode="numeric" step="1" :min="minimum" :max="maximum" :disabled="working" aria-label="叫号数量" @input="onCountInput" @change="normaliseCount" @blur="normaliseCount"></label>
      <label>叫法<select :value="pure?'pure':'wild'" :disabled="working" aria-label="斋或非" @change="changeMode"><option value="wild" :disabled="!modeAllowed(false)">非（1可作万能）</option><option value="pure" :disabled="!modeAllowed(true)">斋（只计本点）</option></select></label>
      <label>点数<select :value="face" :disabled="working" aria-label="叫号点数" @change="changeFace"><option v-for="point in 6" :key="point" :value="point" :disabled="!faceAllowed(point)">{{point}}</option></select></label>
     </div><p v-if="hasLegalBid" class="liar-hint">当前组合至少 {{minimum}} 个，最多 {{maximum}} 个。</p><p v-else class="liar-hint">已经无法再加叫，请开上家。</p>
     <label>你说的话（可选）<textarea :value="draft" maxlength="500" rows="2" :disabled="working" placeholder="可以诈唬、半真半假，或者只感慨一句。" @input="emit('update:draft',($event.target as HTMLTextAreaElement).value)" /></label>
     <div v-if="modern&&targetOptions.length" class="liar-targets"><strong>选择开/劈对象</strong><label v-for="option in targetOptions" :key="option.id" class="liar-target"><input type="checkbox" :checked="selectedTargets.includes(option.id)" :disabled="working" @change="toggleTarget(option.id)"/><span>{{challengeLabel(option)}}</span></label><small>默认选中最近叫号者，可多选；未叫过的人不参与本次挑战。</small></div>
     <div class="liar-actions"><button v-if="hasLegalBid" type="submit" :disabled="working||!chosen">叫号并继续</button><button type="button" :disabled="working||!previous||(modern&&!selectedTargets.length)" @click="openChallenge">{{modern?'开所选（输者1杯/家）':'开上家'}}</button><button v-if="modern" type="button" :disabled="working||!previous||!selectedTargets.length" @click="splitChallenge">劈所选（输者2杯/家）</button></div>
     </form>
    </template><button v-else-if="phase==='playing'&&error&&!working" type="button" @click="emit('npcAction')">重试角色行动</button>
   </div>
   <section v-if="challenge" class="liar-challenge-result" aria-label="开骰结算"><h3>{{challenge.action==='split'?'劈骰结果':'开骰结果'}}</h3><p v-for="duel in challenge.duels" :key="duel.target">{{name(challenge.opener)}} 对 {{name(duel.target)}} · {{liarBidLabel(duel.bid)}}：{{duel.actual}}个 · {{name(duel.winner)}}胜，{{name(duel.loser)}}饮{{duel.cups}}杯</p><p v-for="(cups,id) in challenge.penalties" :key="id">{{name(String(id))}}本次共饮{{cups}}杯</p><p>下局先叫：{{name(challenge.nextStarter)}}</p></section>
   <p v-if="phase==='complete'" class="liar-result">{{challengeResultText}}</p>
   <details v-if="round.moves.length" class="liar-bid-history"><summary>叫号记录</summary><p v-for="(move,index) in round.moves" :key="index"><strong>{{name(move.id)}}：</strong>{{move.bid?liarBidLabel(move.bid):'开骰'}}</p><p v-for="(duel,index) in challenge?.duels||[]" :key="'challenge:'+index"><strong>{{name(challenge.opener)}}：</strong>{{challenge.action==='split'?'劈':'开'}}{{name(duel.target)}} · {{liarBidLabel(duel.bid)}}，{{duel.actual}}个，{{name(duel.loser)}}饮{{duel.cups}}杯</p></details>
  </template>
  <GameChat v-if="showDialogue" :lines="dialogue" :name="name" label="大话骰桌上对话" />
 </section>
</template>
<style scoped>
.liar-table{min-width:0}.liar-dice-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.liar-cup{padding:10px;border:1px solid #71839280;border-radius:9px;background:#152c3d99}.liar-dice{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.liar-dice>span{display:inline-flex;align-items:center;justify-content:center;width:27px;height:30px;background:#e7dfcf;color:#233746;border-radius:4px;font-size:27px;line-height:1}.liar-controls label{display:block}.liar-bid-fields{display:grid;grid-template-columns:minmax(72px,.8fr) minmax(130px,1.5fr) minmax(70px,.7fr);gap:8px}.liar-bid-fields input,.liar-bid-fields select{box-sizing:border-box;width:100%;min-width:0}.liar-hint,.liar-controls small{font-size:12px;color:var(--pt-muted,#9baec1)}.liar-actions{display:flex;gap:10px;margin:10px 0;flex-wrap:wrap}.liar-current,.liar-result{border-left:2px solid #c8b67c;padding:10px}.liar-challenge-result{border-top:1px solid #71839266;margin-top:12px;padding-top:8px}.liar-challenge-result h3{margin:6px 0}.liar-targets{border-left:2px solid #c8b67c;padding-left:10px}.liar-target{display:flex!important;align-items:center;gap:8px}.liar-target input{width:auto!important}.liar-bid-history p{white-space:pre-wrap;overflow-wrap:anywhere}.liar-primary{border-color:#c8b67c!important;color:#f1d89f!important}@media(max-width:360px){.liar-bid-fields{grid-template-columns:1fr 1fr}.liar-bid-fields label:nth-child(2){grid-column:1/3;grid-row:2}}
</style>
