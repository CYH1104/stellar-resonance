import { watch } from 'vue';
import type { ViewModel } from './useWorkspace';
import { stateAt, selected, copy } from '../domain/story';
import { applyMvu, dataFromState, parseMvuMessage, patchData, replacementOperations, readPath, type MvuData } from '../domain/mvu';

interface VariableOption {type?:'chat'|'message';message_id?:number|'latest'}
export const mvuEvents={VARIABLE_INITIALIZED:'mag_variable_initialized',VARIABLE_UPDATE_STARTED:'mag_variable_update_started',VARIABLE_UPDATE_ENDED:'mag_variable_update_ended',BEFORE_MESSAGE_UPDATE:'mag_before_message_update'} as const;
/** Only the active chat/message variable boundary is exposed, never global or character storage. */
export function installMvuBridge(w:ViewModel,host:Window=window){
  const listeners=new Map<string,Set<(...args:unknown[])=>unknown>>();
  const emit=async(name:string,...args:unknown[])=>{for(const callback of listeners.get(name)||[])await callback(...args);};
  function resolve(options:VariableOption={}){
    if(options.type&&options.type!=='chat'&&options.type!=='message')throw Error('仅支持当前会话和消息变量');
    const session=w.active;if(!session)throw Error('请先打开一个会话');
    let before=session.turns.length;
    if(options.type==='message'&&options.message_id!==undefined&&options.message_id!=='latest'){
      const message=options.message_id;if(!Number.isInteger(message))throw Error('消息位置不正确');
      // 0=opening, 1=user, 2=assistant, ...; negative values count from latest.
      const last=session.turns.length*2,index=message<0?last+message+1:message;
      if(index<0||index>last)throw Error('消息不存在');before=Math.floor(index/2);
    }
    return {session,before};
  }
  const getVariables=(options?:VariableOption)=>{const {session,before}=resolve(options);return copy(dataFromState(stateAt(session,before)));};
  async function replaceVariables(data:MvuData,options?:VariableOption){
    if(w.busy||w.creatingGame||w.workingMemory||w.workingPersona)throw Error('请等待当前操作完成后修改变量');
    const {session,before}=resolve(options),sessionId=session.id,old=getVariables(options),baseline=JSON.stringify(stateAt(session,before)),ops=replacementOperations(data?.stat_data);
    applyMvu(stateAt(session,before),ops);
    await emit(mvuEvents.VARIABLE_UPDATE_STARTED,data,old);
    // Event hooks may transform the candidate; validate again before touching a save.
    await emit(mvuEvents.BEFORE_MESSAGE_UPDATE,data);
    if(w.active?.id!==sessionId||w.busy||JSON.stringify(stateAt(session,before))!==baseline)throw Error('会话或变量已变化，未写入旧变量');
    const validated=replacementOperations(data.stat_data),result=applyMvu(stateAt(session,before),validated);
    if(before===0)session.initial=result;
    else {const variant=selected(session.turns[before-1]);if(variant?.status!=='complete'||!variant.outcome)throw Error('未完成的回复不能提交变量');variant.mvuOverride=validated;}
    session.updatedAt=new Date().toISOString();await w.save();
  }
  const api={
    events:mvuEvents,getMvuData:getVariables,replaceMvuData:replaceVariables,
    parseMessage:async(message:string,old:MvuData)=>({...copy(old),stat_data:patchData(old.stat_data,parseMvuMessage(message))}),
    getMvuVariable:(data:MvuData,path:string,{default_value=undefined,category='stat'}:{default_value?:unknown;category?:'stat'|'display'|'delta'}={})=>{try{const value=readPath((category==='display'?data.display_data:category==='delta'?data.delta_data:data.stat_data)||{},'/'+path.replace(/^stat_data\./,'').split('.').map(p=>p.replace(/~/g,'~0').replace(/\//g,'~1')).join('/'));return Array.isArray(value)&&value.length===2&&typeof value[1]==='string'?value[0]:value;}catch{return default_value;}},
    setMvuVariable:async(data:MvuData,path:string,value:unknown)=>{const message='<UpdateVariable>_.set('+JSON.stringify(path)+','+JSON.stringify(value)+');</UpdateVariable>';data.stat_data=patchData(data.stat_data,parseMvuMessage(message));return true;},
    getCurrentMvuData:()=>getVariables({type:'message'}),replaceCurrentMvuData:(data:MvuData)=>replaceVariables(data,{type:'message'}),
  };
  const eventOn=(name:string,callback:(...args:unknown[])=>unknown)=>{let set=listeners.get(name);if(!set)listeners.set(name,set=new Set());set.add(callback);return {stop:()=>set!.delete(callback)};};
  let previousId='',previous='';
  const stop=watch(()=>[w.active?.id,JSON.stringify(w.state)],()=>{
    if(!w.active||!w.state){previousId='';previous='';return;}const data=dataFromState(w.state),next=JSON.stringify(data);
    if(previousId!==w.active.id){previousId=w.active.id;previous=next;void emit(mvuEvents.VARIABLE_INITIALIZED,copy(data),0).catch(()=>{});}
    else if(next!==previous){const before=JSON.parse(previous) as MvuData;previous=next;void emit(mvuEvents.VARIABLE_UPDATE_ENDED,copy(data),before).catch(()=>{});}
  },{immediate:true,flush:'post'});
  const bridge={Mvu:api,TavernHelper:{getVariables,replaceVariables},getVariables,replaceVariables,eventOn,eventEmit:emit,getCurrentMessageId:()=>resolve().before*2};
  const target=host as unknown as Record<string,unknown>,original=new Map(Object.keys(bridge).map(key=>[key,target[key]]));
  Object.assign(target,bridge);
  return ()=>{stop();listeners.clear();for(const [key,value] of original){if(value===undefined)delete target[key];else target[key]=value;}};
}
