<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
import type {SettlementTalk} from '../domain/settlementTalk';
import TerminalActorAvatar from './TerminalActorAvatar.vue';
defineProps<{w:ViewModel;talk?:SettlementTalk;name:(id:string)=>string;busy?:boolean;readOnly?:boolean}>();
const emit=defineEmits<{retry:[]}>();
</script>
<template>
 <section v-if="talk" class="settlement-voices" aria-label="本局角色感想">
  <div v-if="talk.status==='ready'" class="voice-list"><article v-for="line in talk.lines" :key="line.id" class="voice"><TerminalActorAvatar class="voice-avatar" :w="w" :id="line.id"/><div><strong>{{name(line.id)}}</strong><p class="voice-bubble">{{line.text}}</p></div></article></div>
  <p v-else role="status" class="voice-status">{{busy?'积分已结算，大家正在说说这一局…':talk.status==='failed'?'积分已保存，角色发言暂未完成。':'本局角色发言待补齐。'}} <button v-if="!busy&&!readOnly" type="button" @click="emit('retry')">补齐本局发言</button></p>
 </section>
</template>
<style scoped>
.settlement-voices{width:100%;min-width:0}.voice-list{display:flex;flex-wrap:wrap;gap:8px}.voice{display:flex;align-items:flex-start;gap:7px;min-width:0;flex:1 1 180px}.voice>div{flex:1;min-width:0}.voice-avatar{width:32px!important;height:32px!important;flex:0 0 32px;border-radius:50%;overflow:hidden}.voice strong{font-size:11px}.voice-bubble{margin:3px 0!important;padding:6px 9px;background:#edf4e6;color:#20342f;border-radius:0 10px 10px 10px;overflow-wrap:anywhere;font:12px/1.5 system-ui}.voice-status{font-size:12px!important;line-height:1.5}.voice-status button{font-size:11px!important;min-height:28px!important;padding:3px 9px!important}
</style>
