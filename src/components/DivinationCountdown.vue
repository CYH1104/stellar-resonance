<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {createCountdown,countdownText,type CountdownTick} from '../domain/countdown';
/** Local countdown for the daily sign. It derives the remaining time from an absolute
 * deadline instead of decrementing a stored number, and only ticks while this page is
 * actually visible: hidden tabs and a minimised terminal stop the interval entirely.
 * It never writes saves, checks the date or calls a model. */
const props=defineProps<{deadline:number;active:boolean}>();
const emit=defineEmits<{expire:[]}>();
const remaining=ref(0);
const text=computed(()=>countdownText(remaining.value));
const visible=()=>props.active&&(typeof document==='undefined'||document.visibilityState==='visible');
const clock=createCountdown({
 deadline:()=>props.deadline,
 running:visible,
 onTick:(value:CountdownTick)=>{remaining.value=value.remaining;},
 onExpire:()=>emit('expire')
});
function onVisibility(){if(visible())clock.start();else clock.stop();}
watch(()=>props.active,()=>{if(visible())clock.start();else clock.stop();});
watch(()=>props.deadline,()=>clock.restart());
onMounted(()=>{clock.start();if(typeof document!=='undefined')document.addEventListener('visibilitychange',onVisibility);});
onBeforeUnmount(()=>{clock.stop();if(typeof document!=='undefined')document.removeEventListener('visibilitychange',onVisibility);});
</script>
<template>
 <p class="pt-div-countdown" role="timer">距离刷新 <b>{{text}}</b></p>
</template>
<style scoped>
.pt-div-countdown{margin:2px 0 0;font-size:12px;letter-spacing:.04em;opacity:.85}
.pt-div-countdown b{font-variant-numeric:tabular-nums;font-feature-settings:"tnum";display:inline-block;min-width:5.4em}
</style>
