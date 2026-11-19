<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import {minimumLiarCount,isLegalLiarBid,lastLiarBid,liarBidLabel,type LiarRound,type LiarBid} from '../domain/liarDice';
import {liarDialogueLines} from '../domain/partyDialogueView';
import GameChat from './GameChat.vue';
const props=withDefaults(defineProps<{round:LiarRound;participants:string[];name:(id:string)=>string;working:boolean;draft:string;readOnly?:boolean;error?:string;showDialogue?:boolean}>(),{error:'',showDialogue:true});
const emit=defineEmits<{'update:draft':[value:string];bid:[bid:LiarBid];open:[];npcAction:[]}>();
const countText=ref(''),pure=ref(false),face=ref(1);
const pending=computed(()=>props.round.moves.at(-1)?.pending===true),previous=computed(()=>lastLiarBid(props.round));
const maximum=computed(()=>props.participants.length*5);
const minimum=computed(()=>minimumLiarCount(previous.value?.bid,pure.value,face.value,props.participants.length));
// Only the twelve mode/face combinations are inspected; no list of every legal bid is built.
const combinations=computed(()=>[false,true].flatMap(mode=>[1,2,3,4,5,6].map(point=>({pure:mode,face:point,count:minimumLiarCount(previous.value?.bid,mode,point,props.participants.length)}))).filter(b=>b.count<=maximum.value).sort((a,b)=>a.count-b.count||a.face-b.face||Number(a.pure)-Number(b.pure)));
const hasLegalBid=computed(()=>combinations.value.length>0);
const chosen=computed<LiarBid|undefined>(()=>{
 const raw=countText.value.trim();if(!/^\d+$/.test(raw))return;
 const bid={count:Number(raw),face:face.value,pure:pure.value};
 if(Number.isSafeInteger(bid.count)&&isLegalLiarBid(previous.value?.bid,bid,props.participants.length))return bid;
});
function resetForm(){
 const first=combinations.value[0];pure.value=first?.pure??previous.value?.bid?.pure??false;face.value=first?.face??previous.value?.bid?.face??1;countText.value=String(first?.count??maximum.value);
}
// This watch resets local input only. The parent owns all automatic game progression and requests.
watch(()=>JSON.stringify([props.round.number,props.round.moves.length,props.round.turn,props.round.phase,props.participants]),resetForm,{immediate:true});
function normaliseCount(){
 if(minimum.value>maximum.value)return;
 const parsed=Number(countText.value.trim());const n=countText.value.trim()&&Number.isFinite(parsed)?Math.trunc(parsed):minimum.value;
 countText.value=String(Math.min(maximum.value,Math.max(minimum.value,n)));
}
function onCountInput(event:Event){countText.value=(event.target as HTMLInputElement).value;}
function modeAllowed(mode:boolean){return combinations.value.some(b=>b.pure===mode);}
function faceAllowed(point:number){return minimumLiarCount(previous.value?.bid,pure.value,point,props.participants.length)<=maximum.value;}
function changeMode(event:Event){
 const mode=(event.target as HTMLSelectElement).value==='pure';if(!modeAllowed(mode))return;pure.value=mode;
 if(!faceAllowed(face.value))face.value=combinations.value.find(b=>b.pure===mode)!.face;
 normaliseCount();
}
function changeFace(event:Event){const point=Number((event.target as HTMLSelectElement).value);if(!Number.isInteger(point)||point<1||point>6||!faceAllowed(point))return;face.value=point;normaliseCount();}
function submitBid(){if(!props.working&&!pending.value&&props.round.phase==='playing'&&props.round.turn==='player'&&chosen.value)emit('bid',chosen.value);}
const pendingText=computed(()=>props.round.moves.at(-1)?.action==='open'?'开骰已保存，正在等待全桌回应。':'叫号已保存，正在等待下家行动和全桌回应。');
const diceGlyph=['','⚀','⚁','⚂','⚃','⚄','⚅'];
const dialogue=computed(()=>liarDialogueLines(props.round));
</script>

<template>
 <section class="liar-table" aria-label="大话骰牌桌">
  <p>本局先叫：{{name(round.starter)}} · 每人5颗骰子</p>
  <div class="liar-dice-row"><article v-for="id in participants" :key="id" class="liar-cup"><strong>{{name(id)}}</strong><div v-if="id==='player'||round.phase==='complete'" class="liar-dice" :aria-label="name(id)+'的骰子：'+round.dice[id].join('、')"><span v-for="(point,i) in round.dice[id]" :key="i" :title="point+'点'">{{diceGlyph[point]}}</span></div><div v-else class="liar-dice" :aria-label="name(id)+'的五颗暗骰'"><span v-for="i in 5" :key="i" aria-hidden="true">?</span></div></article></div>
  <p v-if="pending" role="status">{{pendingText}}</p>
  <p v-else-if="round.phase==='playing'" role="status">{{round.turn==='player'?'轮到你叫号或开骰':'正在等待'+name(round.turn)+'自动叫号或开骰…'}}</p>
  <p v-if="previous?.bid" class="liar-current">当前叫号：{{name(previous.id)}} · <b>{{liarBidLabel(previous.bid)}}</b></p><p v-else>尚未起叫，最低数量为 {{participants.length}} 个。</p>
  <div v-if="!readOnly" class="liar-controls">
   <template v-if="pending"><button v-if="error&&!working" type="button" @click="emit('npcAction')">重试本轮行动</button></template>
   <template v-else-if="round.phase==='playing'&&round.turn==='player'">
    <form @submit.prevent="submitBid">
     <div v-if="hasLegalBid" class="liar-bid-fields">
      <label>数量<input :value="countText" type="number" inputmode="numeric" step="1" :min="minimum" :max="maximum" :disabled="working" aria-label="叫号数量" @input="onCountInput" @change="normaliseCount" @blur="normaliseCount"></label>
      <label>叫法<select :value="pure?'pure':'wild'" :disabled="working" aria-label="斋或非" @change="changeMode"><option value="wild" :disabled="!modeAllowed(false)">非（1可作万能）</option><option value="pure" :disabled="!modeAllowed(true)">斋（只计本点）</option></select></label>
      <label>点数<select :value="face" :disabled="working" aria-label="叫号点数" @change="changeFace"><option v-for="point in 6" :key="point" :value="point" :disabled="!faceAllowed(point)">{{point}}</option></select></label>
     </div>
     <p v-if="hasLegalBid" class="liar-hint">当前组合至少 {{minimum}} 个，最多 {{maximum}} 个。</p><p v-else class="liar-hint">已经无法再加叫，请开上家。</p>
     <label>你说的话（可选）<textarea :value="draft" maxlength="500" rows="2" :disabled="working" placeholder="可以诈唬、半真半假，或者只感慨一句。" @input="emit('update:draft',($event.target as HTMLTextAreaElement).value)"/></label>
     <div class="liar-actions"><button v-if="hasLegalBid" type="submit" :disabled="working||!chosen">叫号并继续</button><button type="button" :disabled="working||!previous" @click="emit('open')">开上家</button></div>
    </form>
   </template>
   <button v-else-if="round.phase==='playing'&&error&&!working" type="button" @click="emit('npcAction')">重试角色行动</button>
  </div>
  <p v-if="round.phase==='complete'" class="liar-result">实际共有 {{round.actual}} 个符合叫号的骰子。赢家：{{name(round.winner!)}}；{{name(round.loser!)}}罚酒一杯，下局由输家先叫。</p>
  <details v-if="round.moves.length" class="liar-bid-history"><summary>叫号记录</summary><p v-for="(move,index) in round.moves" :key="index"><strong>{{name(move.id)}}：</strong>{{move.bid?liarBidLabel(move.bid):'开骰'}}</p></details>
  <GameChat v-if="showDialogue" :lines="dialogue" :name="name" label="大话骰桌上对话" />
 </section>
</template>

<style scoped>
.liar-table{min-width:0}.liar-dice-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.liar-cup{padding:10px;border:1px solid #71839280;border-radius:9px;background:#152c3d99}.liar-dice{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.liar-dice>span{display:inline-flex;align-items:center;justify-content:center;width:27px;height:30px;background:#e7dfcf;color:#233746;border-radius:4px;font-size:27px;line-height:1}.liar-controls label{display:block}.liar-bid-fields{display:grid;grid-template-columns:minmax(72px,.8fr) minmax(130px,1.5fr) minmax(70px,.7fr);gap:8px}.liar-bid-fields input,.liar-bid-fields select{box-sizing:border-box;width:100%;min-width:0}.liar-hint{font-size:12px;color:var(--pt-muted,#9baec1)}.liar-actions{display:flex;gap:10px;margin:10px 0;flex-wrap:wrap}.liar-current,.liar-result{border-left:2px solid #c8b67c;padding:10px}.liar-moves{padding-left:22px}.liar-moves li{padding:4px 0 12px;border-bottom:1px solid #71839255}.liar-moves h4{margin:10px 0}.liar-moves p{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:360px){.liar-bid-fields{grid-template-columns:1fr 1fr}.liar-bid-fields label:nth-child(2){grid-column:1/3;grid-row:2}}
</style>
