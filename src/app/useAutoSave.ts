import {ref,watch,type WatchSource} from 'vue';
import {saveOnLeave} from './saveOnLeave';
import {onScopeDispose} from 'vue';
export function useAutoSave(source:WatchSource,save:()=>Promise<unknown>,delay=500,blocked:()=>boolean=()=>false){
 const status=ref(''),error=ref(''),lastSaved=ref('');let timer:ReturnType<typeof setTimeout>|undefined,dirty=false,running:Promise<void>|undefined;
 function cancel(){clearTimeout(timer);dirty=false;status.value='';}
 async function flush():Promise<void>{clearTimeout(timer);if(running){await running;if(dirty)return flush();return;}if(!dirty)return;if(blocked()){status.value='等待当前操作完成后保存';return;}dirty=false;status.value='保存中…';error.value='';running=Promise.resolve().then(async()=>{try{const ok=await save();status.value=ok===false?'等待填写完整':'已自动保存';if(ok!==false)lastSaved.value=new Date().toISOString();}catch(e){error.value=e instanceof Error?e.message:'保存失败';status.value='保存失败，请重试';}finally{running=undefined;}});await running;if(dirty)await flush();}
 watch(source,()=>{dirty=true;status.value='待保存';clearTimeout(timer);timer=setTimeout(()=>void flush(),delay);},{deep:true,flush:'sync'});
 watch(blocked,value=>{if(!value&&dirty)void flush();},{flush:'sync'});
 saveOnLeave(()=>{void flush();});
 onScopeDispose(()=>{clearTimeout(timer);void flush();});return {status,error,lastSaved,flush,cancel,retry:()=>{dirty=true;return flush();}};
}
