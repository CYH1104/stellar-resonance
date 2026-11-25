<script setup lang="ts">
import {computed} from 'vue';
import {mahjongArtworkName} from '../domain/mahjongArtwork';
import {mahjongTileLabel} from '../domain/mahjong';
import front from '../assets/mahjong/Front.svg?url';
import back from '../assets/playing-cards/Back.webp?url';
const props=withDefaults(defineProps<{tile:string;decorative?:boolean}>(),{decorative:false});
const artwork=import.meta.glob('../assets/mahjong/*.svg',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const src=computed(()=>props.tile==='back'?back:artwork['../assets/mahjong/'+mahjongArtworkName(props.tile)+'.svg']);
const label=computed(()=>props.tile==='back'?'暗牌':mahjongTileLabel(props.tile));
</script>
<template><span class="mj-tile-art" :class="{'mj-tile-back':tile==='back'}" :style="{backgroundImage:'url('+front+')'}"><img :src="src" :alt="decorative?'':label" :aria-hidden="decorative||undefined" draggable="false"/></span></template>
<style scoped>
.mj-tile-art{display:inline-block;width:100%;height:100%;aspect-ratio:3/4;background-position:center;background-size:100% 100%;background-repeat:no-repeat;vertical-align:middle;pointer-events:none;flex-shrink:0}
.mj-tile-art img{display:block;width:100%;height:100%;object-fit:fill;user-select:none;transform:scale(.8);transform-origin:center}
.mj-tile-back{display:inline-flex;align-items:center;justify-content:center}
.mj-tile-back img{width:90%;height:90%;border-radius:8%;transform:none}
</style>
