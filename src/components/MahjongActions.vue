<script setup lang="ts">
import {computed,nextTick,ref,watch} from 'vue';
import {mahjongMeldTiles,mahjongTileLabel,type MahjongOption,type MahjongReply} from '../domain/mahjong';
import MahjongTile from './MahjongTile.vue';
import chiArt from '../assets/mahjong/actions/chow.png';
import ponArt from '../assets/mahjong/actions/pong.png';
import kanArt from '../assets/mahjong/actions/kong.png';
import winArt from '../assets/mahjong/actions/hu.png';
const props=defineProps<{options:MahjongOption[];enabled:boolean}>();
const emit=defineEmits<{action:[reply:MahjongReply]}>();
const artwork={chi:chiArt,pon:ponArt,kan:kanArt,win:winArt};
const names={chi:'吃',pon:'碰',kan:'杠',win:'胡'};
type ArtKind=keyof typeof artwork;
const kinds:ArtKind[]=['chi','pon','kan','win'];
const groups=computed(()=>kinds.map(kind=>({kind,options:props.options.filter(o=>o.kind===kind)})).filter(g=>g.options.length));
const other=computed(()=>props.options.filter(o=>!kinds.includes(o.kind as ArtKind)));
const expanded=ref<ArtKind>();
const choices=computed(()=>props.options.filter(o=>o.kind===expanded.value));
const root=ref<HTMLElement>();
watch(()=>[props.options.map(o=>o.key).join('|'),props.enabled],()=>{expanded.value=undefined;});
function tiles(o:MahjongOption){return mahjongMeldTiles(o.reply.fulou||o.reply.gang||'');}
function label(o:MahjongOption){return [o.label,...tiles(o).map(mahjongTileLabel)].join(' ');}
function choose(o:MahjongOption){if(!props.enabled||!props.options.some(current=>current.key===o.key))return;expanded.value=undefined;emit('action',o.reply);}
async function closeChoices(){const kind=expanded.value;expanded.value=undefined;await nextTick();root.value?.querySelector<HTMLButtonElement>(`[data-action-kind="${kind}"]`)?.focus();}
async function activate(group:{kind:ArtKind;options:MahjongOption[]}){
 if(!props.enabled)return;
 if(group.options.length===1){choose(group.options[0]);return;}
 if(expanded.value===group.kind){await closeChoices();return;}
 expanded.value=group.kind;await nextTick();root.value?.querySelector<HTMLButtonElement>('.mj-meld-choice')?.focus();
}
</script>
<template>
 <div ref="root" class="mj-call-dock" :class="{choosing:expanded}" role="group" aria-label="吃碰杠胡操作" @keydown.esc.stop.prevent="closeChoices">
  <div v-if="expanded&&choices.length" class="mj-call-choices" role="group" :aria-label="'选择'+names[expanded]+'牌组合'">
   <div class="mj-choice-heading"><strong>选择{{names[expanded]}}牌组合</strong><button type="button" class="mj-call-cancel" @click="closeChoices">取消</button></div>
   <div class="mj-choice-list"><button v-for="o in choices" :key="o.key" type="button" class="mj-meld-choice" :disabled="!enabled" :aria-label="label(o)" @click="choose(o)"><small>{{o.label}}</small><span class="mj-call-tiles"><span v-for="(p,i) in tiles(o)" :key="i" class="mj-call-tile"><MahjongTile :tile="p" decorative/></span></span></button></div>
  </div>
  <button v-for="group in groups" :key="group.kind" type="button" class="mj-call-button" :class="{'mj-call-win':group.kind==='win'}" :data-action-kind="group.kind" :disabled="!enabled" :aria-label="group.options.length>1?names[group.kind]+'，选择组合':label(group.options[0])" :aria-expanded="group.options.length>1?expanded===group.kind:undefined" @click="activate(group)">
   <img :src="artwork[group.kind]" alt="" draggable="false" class="mj-call-art"/>
   <small v-if="group.options.length>1">选择组合 · {{group.options.length}}</small>
   <span v-else-if="tiles(group.options[0]).length" class="mj-call-tiles"><span v-for="(p,i) in tiles(group.options[0])" :key="i" class="mj-call-tile"><MahjongTile :tile="p" decorative/></span></span>
   <small v-else>{{group.options[0].label}}</small>
  </button>
  <button v-for="o in other" :key="o.key" type="button" class="mj-call-other" :disabled="!enabled" @click="choose(o)">{{o.label}}</button>
 </div>
</template>
<style scoped>
.mj-call-dock{position:relative;display:flex;align-items:end;justify-content:flex-end;gap:8px;flex:0 0 auto;margin-left:auto;isolation:isolate}
.mj-call-dock.choosing>.mj-call-button,.mj-call-dock.choosing>.mj-call-other{visibility:hidden}
.mj-call-art{display:block;width:100%;height:70px;object-fit:contain;filter:drop-shadow(0 3px 3px #0007);pointer-events:none}
.mj-call-tiles{display:flex;align-items:center;justify-content:center;gap:2px}
.mj-call-tile{display:block;width:17px;height:23px}
.mj-call-choices{position:absolute;z-index:6;bottom:0;right:0;box-sizing:border-box;min-width:max(220px,100%);max-width:min(480px,70vw);padding:10px;border:1px solid #d5bd75;border-radius:12px;background:#102b2bf5;box-shadow:0 6px 24px #0008;color:#fff4d3}
.mj-choice-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:6px;font-size:13px}
.mj-choice-list{display:flex;gap:8px;overflow-x:auto;padding:3px}
@media(max-height:500px),(orientation:portrait) and (max-width:700px){.mj-call-dock{gap:5px}.mj-call-art{height:52px}.mj-call-tile{width:15px;height:20px}.mj-call-choices{padding:7px;max-width:400px}.mj-choice-heading{font-size:12px;margin-bottom:3px}}
</style>
<style>
/* The terminal skin has global button rules; keep the artwork and touch targets intact. */
#academy-workspace .pt .mahjong-table .mj-call-dock button.mj-call-button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;box-sizing:border-box;flex:0 0 104px;width:104px;min-width:104px;height:100px;min-height:100px!important;padding:2px 5px!important;border:1px solid #e3c87766!important;border-radius:12px!important;background:linear-gradient(0deg,#113c32c7,#244f3b30)!important;color:#ffedb6!important;box-shadow:none!important;font-size:12px!important;line-height:1.2!important;transition:filter .15s,border-color .15s}
#academy-workspace .pt .mahjong-table .mj-call-dock button.mj-call-win{border-color:#edd587!important;background:linear-gradient(0deg,#6c4728c9,#6c472815)!important}
#academy-workspace .pt .mahjong-table .mj-call-dock button:enabled:hover{filter:brightness(1.2)}
#academy-workspace .pt .mahjong-table .mj-call-dock button:focus-visible{outline:3px solid #ffe7a2!important;outline-offset:2px}
#academy-workspace .pt .mahjong-table .mj-call-dock button:disabled{opacity:.45;cursor:default}
#academy-workspace .pt .mahjong-table .mj-call-dock button.mj-call-other,#academy-workspace .pt .mahjong-table .mj-call-dock button.mj-call-cancel{min-width:44px;min-height:44px!important;padding:6px 10px!important;font-size:13px!important}
#academy-workspace .pt .mahjong-table .mj-call-dock button.mj-meld-choice{display:flex;flex:0 0 auto;flex-direction:column;align-items:center;gap:3px;min-height:52px!important;padding:5px 8px!important;font-size:12px!important}
@media(max-height:500px),(orientation:portrait) and (max-width:700px){
 #academy-workspace .pt .mahjong-table .mj-call-dock button.mj-call-button{flex-basis:84px;width:84px;min-width:84px;height:78px;min-height:78px!important;padding:2px 4px!important;font-size:11px!important}
}
</style>
