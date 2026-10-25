import {computed,onBeforeUnmount,ref,watch} from 'vue';
import type {ViewModel} from './useWorkspace';
import {avatarFrameStyle} from './avatarFraming';

export function useAvatarAdjustment(w:ViewModel,report:(message:string)=>void){
 const initial=()=>({scale:1,x:0,y:0,...w.active?.terminal?.avatarView});
 const avatarDraft=ref(initial());let dirty=false,saving=false,revision=0;
 let timer:ReturnType<typeof setTimeout>|undefined;
 watch(()=>[w.active?.id,w.active?.terminal?.avatar],()=>{clearTimeout(timer);revision++;dirty=false;avatarDraft.value=initial();});
 watch(()=>w.active?.terminal?.avatarView,()=>{if(!dirty)avatarDraft.value=initial();},{deep:true});
 async function flushAvatar(){
  clearTimeout(timer);if(saving||!dirty)return;
  const session=w.active;if(!session?.terminal)return;
  const sid=session.id,version=revision,previous=session.terminal.avatarView;
  const value={...avatarDraft.value};dirty=false;saving=true;
  session.terminal.avatarView=value;
  try{await w.save();if(w.storageStatus==='failed')throw Error('保存失败');}
  catch{if(w.active?.id===sid&&revision===version){session.terminal.avatarView=previous;avatarDraft.value=initial();report('头像位置未保存，请重试或下载备份。');}}
  finally{saving=false;if(dirty)void flushAvatar();}
 }
 function adjustAvatar(field:'scale'|'x'|'y',value:number){
  if(!Number.isFinite(value))return;
  const bounded=field==='scale'?Math.max(1,Math.min(4,value)):Math.max(-50,Math.min(50,value));
  avatarDraft.value={...avatarDraft.value,[field]:bounded};revision++;dirty=true;
  clearTimeout(timer);timer=setTimeout(()=>void flushAvatar(),300);
 }
 onBeforeUnmount(()=>{clearTimeout(timer);void flushAvatar();});
 return {avatarDraft,avatarStyle:computed(()=>avatarFrameStyle(avatarDraft.value)),adjustAvatar,flushAvatar};
}
