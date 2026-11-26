<script setup lang="ts">
import {computed,reactive,ref,watch,nextTick} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {useWerewolf} from '../app/useWerewolf';
import {wolfRoleNames,wolfRules} from '../domain/werewolf';
import TerminalActorAvatar from './TerminalActorAvatar.vue';
const props=withDefaults(defineProps<{w:ViewModel;active?:boolean}>(),{active:true});
const u=reactive(useWerewolf(props.w));
const feed=ref<HTMLElement>(),showRole=ref(false),showRules=ref(false);
watch(()=>props.active,v=>u.setActive(v),{immediate:true});
watch(()=>u.gameId,()=>showRole.value=false);
watch(()=>u.view?.inspections?.length,(n,old)=>{if(n&&n!==old)showRole.value=true;});
watch(()=>u.view?.publicLog.length,async()=>{await nextTick();if(feed.value)feed.value.scrollTop=feed.value.scrollHeight;});
const phase=computed(()=>({night:'夜间行动',speech:'依次发言',lastwords:'遗言',vote:'独立投票',complete:'本局结束'}[u.view?.phase||'night']));
const name=(id:string)=>u.view?.players.find(p=>p.id===id)?.name||id;
const canSave=computed(()=>u.view?.medicine?.antidote&&u.view.victim&&(u.view.day===1||u.view.victim!=='player'));
const targetHint=computed(()=>({knife:'选择今晚的最终刀口（可自刀或刀队友）',inspect:'选择一位存活玩家查验',vote:'选择投票对象',medicine:'如需用毒，选择一位存活玩家',speak:'', '':''}[u.humanAction]||''));
defineExpose({handleBack:()=>u.back()});
</script>
<template>
<section class="wolf-room" aria-label="六人狼人杀">
 <div v-if="!u.view" class="wolf-lobby">
  <span class="wolf-kicker">MOONLIGHT · 06</span><h2>狼人杀</h2><p>你与五位好友，一场暗牌对局。</p>
  <div class="wolf-rule-chips"><span>2 狼人</span><span>2 村民</span><span>1 预言家</span><span>1 女巫</span></div>
  <p class="wolf-muted">身份随机发放 · 狼人互认 · 身份不公开</p>
  <h3>邀请好友 <small>{{u.picked.length}} / 5</small></h3>
  <p v-if="u.friends.length<5">需要先在终端添加至少5位好友。</p>
  <div class="wolf-friends"><button v-for="f in u.friends" :key="f.id" type="button" :aria-pressed="u.picked.includes(f.id)" :disabled="u.blocked||u.picked.length===5&&!u.picked.includes(f.id)" @click="u.toggle(f.id)"><TerminalActorAvatar :w="w" :id="f.id"/><span>{{f.name}}</span><b>{{u.picked.includes(f.id)?'✓':'＋'}}</b></button></div>
  <button type="button" class="wolf-primary" :disabled="u.blocked||u.picked.length!==5" @click="u.start">随机发身份 · 开始</button>
  <h3 v-if="u.games.length">对局记录</h3><button v-for="g in [...u.games].reverse()" :key="g.id" type="button" class="wolf-history" :disabled="u.working" @click="u.open(g.id)">{{new Date(g.at).toLocaleString('zh-CN')}} · 继续 / 回看 ›</button>
 </div>
 <template v-else>
  <header class="wolf-status"><div><span class="wolf-kicker">MOONLIGHT</span><strong>第 {{u.view.day}} {{u.view.phase==='night'?'夜':'天'}} · {{phase}}</strong></div><button type="button" :aria-expanded="showRole" @click="showRole=!showRole">{{showRole?'收起身份':'我的身份'}}</button></header>
  <div v-if="showRole" class="wolf-private" aria-label="仅自己可见的身份"><strong>{{wolfRoleNames[u.view.selfRole]}}</strong><p v-if="u.view.wolfIds">狼队：{{u.view.wolfIds.map(name).join('、')}}</p><p v-for="i in u.view.inspections" :key="i.day">第{{i.day}}夜查验 {{name(i.target)}}：{{i.result==='wolf'?'狼人':'好人'}}</p><p v-if="u.view.medicine">解药{{u.view.medicine.antidote?'剩余1瓶':'已用完'}} · 毒药{{u.view.medicine.poison?'剩余1瓶':'已用完'}}</p><small>只在你的视角展示</small></div>
  <div class="wolf-table">
   <aside v-for="side in [0,1]" :key="side" class="wolf-seats" :class="side?'wolf-right':'wolf-left'" :aria-label="side?'右侧座位':'左侧座位'">
    <div v-for="p in u.view.players.filter((_,i)=>i%2===side)" :key="p.id" class="wolf-seat" :class="{'wolf-dead':!p.alive,'wolf-speaking':u.view.speaking===p.id}">
     <span class="wolf-seat-number">{{u.view.players.findIndex(x=>x.id===p.id)+1}}号</span><div class="wolf-portrait"><TerminalActorAvatar :w="w" :id="p.id"/><b v-if="!p.alive" class="wolf-death">死亡</b></div><strong :title="p.name">{{p.name}}</strong><small v-if="u.view.speaking===p.id">{{u.view.phase==='lastwords'?'遗言中':'发言中'}}</small><small v-else-if="p.id==='player'">我</small>
    </div>
   </aside>
   <div ref="feed" class="wolf-feed" role="log" aria-label="公开聊天区" aria-live="polite" aria-relevant="additions text">
    <article v-for="(line,i) in u.view.publicLog" :key="i" class="wolf-message" :class="{'wolf-host':line.speaker==='host','wolf-mine':line.speaker==='player'}"><small>{{line.speaker==='host'?'主持':name(line.speaker)}}</small><p>{{line.text}}</p></article>
   </div>
  </div>
  <section class="wolf-controls" aria-label="本人的行动">
   <p v-if="u.working" role="status">正在等待角色回应…<button type="button" @click="u.cancel">暂停</button></p>
   <p v-if="u.view.winner" class="wolf-result">{{u.view.winner==='good'?'好人阵营获胜':'狼人阵营获胜'}}<small>本局身份继续保密</small></p>
   <template v-else-if="u.humanAction==='speak'"><label for="wolf-speech">{{u.view.phase==='lastwords'?'留下你的遗言':'轮到你发言'}}</label><textarea id="wolf-speech" v-model="u.draft" rows="3" maxlength="1600" :disabled="u.blocked" placeholder="说说你的判断…"/><button type="button" class="wolf-primary" :disabled="u.blocked||!u.draft.trim()" @click="u.submit('speak')">发言结束 · 下一位</button></template>
   <template v-else-if="u.humanAction">
    <div v-if="u.humanAction==='knife'&&u.view.opinions?.length" class="wolf-council"><small>狼队私下讨论 · 只有你可见</small><p v-for="o in u.view.opinions" :key="o.id"><b>{{name(o.id)}}</b>：建议刀 {{name(o.target)}}。{{o.reason}}</p></div>
    <p v-if="u.humanAction==='medicine'">{{u.view.victim?'今晚刀口：'+name(u.view.victim):'解药已用完，今晚刀口不可见。'}}</p>
    <label for="wolf-target">{{targetHint}}</label><select id="wolf-target" v-model="u.target" :disabled="u.blocked"><option value="">请选择</option><option v-for="p in u.targets" :key="p.id" :value="p.id">{{u.view.players.findIndex(x=>x.id===p.id)+1}}号 · {{p.name}}</option></select>
    <div class="wolf-actions"><template v-if="u.humanAction==='medicine'"><button type="button" :disabled="u.blocked||!canSave" @click="u.submit('save')">使用解药</button><button type="button" :disabled="u.blocked||!u.view.medicine?.poison||!u.target" @click="u.submit('poison')">使用毒药</button><button type="button" :disabled="u.blocked" @click="u.submit('skip')">不用药</button></template><template v-else><button type="button" class="wolf-primary" :disabled="u.blocked||!u.target" @click="u.submit('choose')">{{u.humanAction==='knife'?'确认刀口':u.humanAction==='inspect'?'查验身份':'确认投票'}}</button><button v-if="u.humanAction==='vote'" type="button" :disabled="u.blocked" @click="u.submit('abstain')">弃票</button></template></div>
   </template>
   <button v-else-if="!u.working" type="button" class="wolf-primary" :disabled="u.blocked" @click="u.resume">继续{{phase}}</button>
  </section>
 </template>
 <p v-if="u.error" class="wolf-error" role="alert">{{u.error}}</p>
 <footer class="wolf-footer"><button type="button" :aria-expanded="showRules" @click="showRules=!showRules">{{showRules?'收起规则':'查看规则'}}</button><button v-if="u.view" type="button" @click="u.back">返回对局列表</button></footer>
 <p v-if="showRules" class="wolf-rules">{{wolfRules}}</p>
</section>
</template>
<style>
#academy-workspace .wolf-room{display:flex;flex-direction:column;gap:10px;min-width:0;flex:1;color:#e5eaf4;line-height:1.55}
#academy-workspace .pt-screen.pt-werewolf-screen{display:flex;flex-direction:column;padding:10px 8px;overflow-y:auto}
#academy-workspace .wolf-kicker{font-size:10px;letter-spacing:3px;color:#cbb6ef;display:block}
#academy-workspace .wolf-lobby h2{margin:6px 0;font-size:30px}#academy-workspace .wolf-muted{color:#9aaac5;font-size:12px}
#academy-workspace .wolf-rule-chips{display:flex;gap:6px;flex-wrap:wrap}#academy-workspace .wolf-rule-chips span{padding:5px 8px;border:1px solid #544a6a;border-radius:7px;background:#21223b;font-size:12px}
#academy-workspace .wolf-friends{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:14px}#academy-workspace .wolf-friends button{display:flex;align-items:center;gap:6px;min-width:0;padding:6px!important}#academy-workspace .wolf-friends button[aria-pressed=true]{border-color:#cbb6ef!important;background:#3d3456!important}#academy-workspace .wolf-friends .pt-avatar{width:32px;height:32px;flex:none}#academy-workspace .wolf-friends button>span:not(.pt-avatar){white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#academy-workspace .wolf-friends b{margin-left:auto}
#academy-workspace .wolf-status{display:flex;gap:5px;justify-content:space-between;align-items:center;flex:none}#academy-workspace .wolf-status strong{font-size:14px;display:block}#academy-workspace .wolf-status button{font-size:11px!important;padding:6px 9px!important}
#academy-workspace .wolf-private,#academy-workspace .wolf-council{background:#28213b;border:1px solid #77628f;border-radius:10px;padding:9px 12px;font-size:12px}#academy-workspace .wolf-private strong{color:#e2ccff}#academy-workspace .wolf-private p{margin:4px 0}
#academy-workspace .wolf-table{display:grid;grid-template-columns:54px minmax(0,1fr) 54px;gap:7px;min-height:270px;flex:1}
#academy-workspace .wolf-left{grid-column:1;grid-row:1}#academy-workspace .wolf-right{grid-column:3;grid-row:1}#academy-workspace .wolf-seats{display:flex;flex-direction:column;justify-content:space-evenly;gap:15px;padding:6px 0}
#academy-workspace .wolf-seat{text-align:center;min-width:0;padding:5px 1px;border-radius:10px;border:1px solid transparent}#academy-workspace .wolf-seat-number{font-size:10px;color:#a4b3ca}#academy-workspace .wolf-seat strong{font-size:11px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px}#academy-workspace .wolf-seat small{display:block;font-size:9px;color:#c6a6ec}
#academy-workspace .wolf-portrait{position:relative;width:44px;height:44px;margin:3px auto}#academy-workspace .wolf-portrait .pt-avatar{display:block;width:44px;height:44px;border-radius:50%;overflow:hidden}#academy-workspace .wolf-dead .pt-avatar{filter:grayscale(1);opacity:.4}#academy-workspace .wolf-dead strong{color:#8492a7}#academy-workspace .wolf-death{position:absolute;bottom:-2px;left:1px;right:1px;border-radius:4px;background:#292d38e8;color:#d3d7df;font-size:11px;line-height:19px;letter-spacing:2px}#academy-workspace .wolf-speaking{border-color:#c4a3e8;background:#44345366}
#academy-workspace .wolf-feed{grid-column:2;grid-row:1;min-width:0;overflow-y:auto;max-height:54dvh;border:1px solid #43506b70;border-radius:12px;background:#07101ed9;padding:9px;scrollbar-width:thin}
#academy-workspace .wolf-message{margin:0 0 15px;min-width:0}#academy-workspace .wolf-message small{font-size:10px;color:#c7b4de}#academy-workspace .wolf-message p{font-size:12px;line-height:1.65;background:#1c2a3d;border-radius:2px 10px 10px 10px;padding:8px;margin:4px 0;overflow-wrap:anywhere}#academy-workspace .wolf-mine p{background:#34314e}#academy-workspace .wolf-host{text-align:center}#academy-workspace .wolf-host p{background:transparent;padding:4px 0;color:#acbdd0;font-size:11px}
#academy-workspace .wolf-controls{flex:none;border-top:1px solid #3e455a;padding-top:8px}#academy-workspace .wolf-controls label{margin:3px 0;font-size:12px}#academy-workspace .wolf-controls textarea{min-height:65px;max-height:130px;margin:5px 0!important}#academy-workspace .wolf-actions{display:flex;gap:6px;flex-wrap:wrap}#academy-workspace .wolf-actions button{flex:1;padding:7px!important;font-size:12px!important}#academy-workspace .wolf-room button.wolf-primary{background:linear-gradient(130deg,#675180,#3b466a)!important;border-color:#aa94bd!important}#academy-workspace .wolf-controls>.wolf-primary,#academy-workspace .wolf-lobby>.wolf-primary{width:100%}
#academy-workspace .wolf-error{background:#61384799;padding:10px;border:1px solid #ad7e8a;border-radius:9px;font-size:12px}#academy-workspace .wolf-result{text-align:center;color:#e4d3a3;font-size:18px}#academy-workspace .wolf-result small{display:block;font-size:11px}
#academy-workspace .wolf-footer{display:flex;justify-content:space-between;gap:8px}#academy-workspace .wolf-footer button{font-size:11px!important;padding:5px 9px!important;background:transparent!important}#academy-workspace .wolf-history{width:100%;font-size:11px!important;margin:4px 0}#academy-workspace .wolf-rules{font-size:12px;color:#bcc7d9}
@media(max-width:360px){#academy-workspace .wolf-table{grid-template-columns:46px minmax(0,1fr) 46px;gap:4px}#academy-workspace .wolf-feed{padding:6px}}
</style>
