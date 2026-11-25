import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {TableIdleSound,TableSoundCursor,type TableSoundSnapshot} from '../domain/tableSoundEvents';
import {TableSoundPlayer} from './tableSoundPlayer';
// Shared across both tables for this page session. No new localStorage/backup field.
const soundsEnabled=ref(true);
export function useTableSounds(snapshot:()=>TableSoundSnapshot,active:()=>boolean,busy:()=>boolean,waiting=false){
 const visible=ref(typeof document==='undefined'||!document.hidden);
 const allowed=computed(()=>active()&&visible.value&&soundsEnabled.value);
 const cursor=new TableSoundCursor(),idle=new TableIdleSound(),player=new TableSoundPlayer();
 let timer:ReturnType<typeof setInterval>|undefined;
 function observe(){
  const change=cursor.observe(snapshot());if(change.reset){player.stop();idle.reset();}
  if(allowed.value)for(const event of change.events)player.play(event.sounds);
 }
 watch(()=>snapshot(),observe,{immediate:true});
 watch(allowed,()=>{player.stop();cursor.reset();idle.reset();observe();},{flush:'sync'});
 function gesture(){if(allowed.value)player.unlock();}
 function visibility(){visible.value=!document.hidden;}
 function toggleSound(){soundsEnabled.value=!soundsEnabled.value;if(soundsEnabled.value)gesture();}
 onMounted(()=>{
  document.addEventListener('pointerdown',gesture,{capture:true});
  document.addEventListener('keydown',gesture,{capture:true});
  document.addEventListener('visibilitychange',visibility);
  if(waiting)timer=setInterval(()=>{if(idle.update(snapshot().waitingKey,Date.now(),allowed.value&&player.ready,busy()))player.play(['waiting'],true);},1000);
 });
 onBeforeUnmount(()=>{clearInterval(timer);document.removeEventListener('pointerdown',gesture,true);document.removeEventListener('keydown',gesture,true);document.removeEventListener('visibilitychange',visibility);player.dispose();});
 return {soundsEnabled,toggleSound};
}
