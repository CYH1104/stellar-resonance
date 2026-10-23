import {computed,onBeforeUnmount,onMounted,ref} from 'vue';

/** Display device time without changing the story calendar or course schedule. */
export function useDeviceClock(){
 const now=ref(new Date());
 let timer:ReturnType<typeof setInterval>|undefined;
 onMounted(()=>{now.value=new Date();timer=setInterval(()=>{now.value=new Date();},1000);});
 onBeforeUnmount(()=>{if(timer!==undefined)clearInterval(timer);});
 return computed(()=>({time:`${String(now.value.getHours()).padStart(2,'0')}:${String(now.value.getMinutes()).padStart(2,'0')}`,label:now.value.toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',weekday:'long'})}));
}
