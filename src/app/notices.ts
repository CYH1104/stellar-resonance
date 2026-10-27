import {shallowReactive} from 'vue';
export const noticeDuration=8000;
export const httpNoticeDuration=5000;
export const notices=shallowReactive<{id:number;message:string;error:boolean;key:string}[]>([]);
let nextId=0;
const timers=new Map<number,ReturnType<typeof setTimeout>>();
export function dismissNotice(id:number){clearTimeout(timers.get(id));timers.delete(id);const index=notices.findIndex(n=>n.id===id);if(index>=0)notices.splice(index,1);}
function arm(id:number,duration:number){clearTimeout(timers.get(id));timers.set(id,setTimeout(()=>dismissNotice(id),duration));}
/**
 * One HTTP failure reaches the top bar through several channels (gateway sink, `problem` text, component notices).
 * Registering the canonical text lets every channel resolve to the same dedup key and the same 5 second timer,
 * so one failure produces one toast no matter how many channels report it.
 */
const httpKeys=new Map<string,string>(),httpTexts=new Map<string,string>();
export function registerHttpNotice(message:string,key:string){
  if(httpKeys.size>256){httpKeys.clear();httpTexts.clear();}
  httpKeys.set(message,key);httpTexts.set(key,message);
}
export function noticeKeyFor(message:string){return httpKeys.get(message);}
export function noticeTextFor(key:string){return httpTexts.get(key);}
export function clearHttpNotices(){httpKeys.clear();httpTexts.clear();}
/** Exactly what `DismissibleNotice` does when its message prop changes; kept here so tests drive the real path. */
export function publishNotice(message:string,error=false){
  // The gateway owns an HTTP failure's lifetime. Mounting a panel later must not
  // resurrect an expired failure or extend its five-second timer.
  const key=noticeKeyFor(message);
  if(error&&key!==undefined)return notices.find(n=>n.key===key&&n.error)?.id;
  return showNotice(message,error);
}
/**
 * `key` groups repeat occurrences of one request so several channels cannot stack three copies of the same error.
 * A repeat re-arms its own timer instead of inheriting the earlier one's remaining time.
 */
export function showNotice(message:string,error=false,duration?:number,key?:string){
  if(!message.trim())return;
  const resolved=key??noticeKeyFor(message)??message;
  const life=duration??(noticeKeyFor(message)!==undefined?httpNoticeDuration:noticeDuration);
  const existing=notices.find(n=>n.key===resolved&&n.error===error);
  if(existing){existing.message=message;arm(existing.id,life);return existing.id;}
  while(notices.length>=3)dismissNotice(notices[0]!.id);
  const id=++nextId;notices.push({id,message,error,key:resolved});arm(id,life);return id;
}
