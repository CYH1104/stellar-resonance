import type {Variant} from './contracts';
import type {ViewModel} from '../app/useWorkspace';

// Missing metadata in older saves is not evidence that prose needs continuation.
export function canContinueProse(variant:Variant|undefined,enabled:boolean){
  return !!enabled&&!!variant?.text.trim()&&variant.status==='incomplete'&&variant.outcome?.stateUpdate?.storyComplete===false;
}

export function bindRoundAction(w:Pick<ViewModel,'active'|'busy'|'problem'>,index:number,perform:(index:number)=>unknown){
  const sessionId=w.active?.id,turnId=w.active?.turns[index]?.id;
  return ()=>{
    if(w.busy)return;
    if(!sessionId||!turnId||w.active?.id!==sessionId||w.active.turns[index]?.id!==turnId){w.problem='会话或目标楼层已变化，请重新打开操作菜单。';return;}
    perform(index);
  };
}
