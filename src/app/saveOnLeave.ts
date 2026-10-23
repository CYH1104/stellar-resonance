import {onScopeDispose} from 'vue';

// Start the pending IndexedDB transaction while the page is still alive.
export function saveOnLeave(flush:()=>void){
 if(typeof window==='undefined'||typeof document==='undefined')return;
 const hidden=()=>{if(document.visibilityState==='hidden')flush();};
 window.addEventListener('pagehide',flush);
 document.addEventListener('visibilitychange',hidden);
 onScopeDispose(()=>{window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden);flush();});
}
