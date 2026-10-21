import {ref,watch,onScopeDispose,type WatchSource} from 'vue';
export function useAutoSave(source:WatchSource,save:()=>Promise<unknown>,delay=500){
 const status=ref(''),error=ref('');let timer:ReturnType<typeof setTimeout>|undefined,dirty=false,running:Promise<void>|undefined;
 function cancel(){clearTimeout(timer);dirty=false;status.value='';}
 async function flush():Promise<void>{clearTimeout(timer);if(running){await running;if(dirty)return flush();return;}if(!dirty)return;dirty=false;status.value='保存中…';error.value='';running=(async()=>{try{const ok=await save();status.value=ok===false?'等待填写完整':'已自动保存';}catch(e){error.value=e instanceof Error?e.message:'保存失败';status.value='保存失败，请重试';}finally{running=undefined;}})();await running;if(dirty)await flush();}
 watch(source,()=>{dirty=true;status.value='待保存';clearTimeout(timer);timer=setTimeout(()=>void flush(),delay);},{deep:true,flush:'sync'});
 onScopeDispose(()=>{clearTimeout(timer);void flush();});return {status,error,flush,cancel,retry:()=>{dirty=true;return flush();}};
}
