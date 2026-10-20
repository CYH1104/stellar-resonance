import {shallowReactive} from 'vue';
export const noticeDuration=8000;
export const notices=shallowReactive<{id:number;message:string;error:boolean}[]>([]);
let nextId=0;
const timers=new Map<number,ReturnType<typeof setTimeout>>();
export function dismissNotice(id:number){clearTimeout(timers.get(id));timers.delete(id);const index=notices.findIndex(n=>n.id===id);if(index>=0)notices.splice(index,1);}
export function showNotice(message:string,error=false){
  if(!message.trim())return;
  const existing=notices.find(n=>n.message===message&&n.error===error);if(existing)return existing.id;
  while(notices.length>=3)dismissNotice(notices[0]!.id);
  const id=++nextId;notices.push({id,message,error});timers.set(id,setTimeout(()=>dismissNotice(id),noticeDuration));return id;
}
