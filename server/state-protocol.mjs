import {internalPrompt} from './internal-prompts.mjs';
export function stateExample({state,stateEnabled=true}={}){
 const example={event:'A concrete change already enacted in the scene.'};
 if(stateEnabled){const actor=state?.characters?.find(c=>c.present)||state?.characters?.[0];example.presentCharacterIds=actor?[actor.id]:[];example.characters=actor?[{id:actor.id,affinity:actor.affinity??0,innerThought:'A brief in-character reaction.',...(actor.spiritAnimal?{spiritThought:'A private remark in the established spirit voice.'}:{})}]:[];if(state?.player?.spiritAnimal)example.player={spiritThought:'My own reaction as the established player spirit.'};}
 return example;
}
export function stateProtocol(options={}){return internalPrompt("state-protocol.1")+'\n'+internalPrompt('state-protocol.example',{p0:JSON.stringify(stateExample(options))});}
export function applyStateProtocol(messages,input,featureContract='',options={}){const result=messages.map(m=>({...m})),at=result.findLastIndex(m=>m.role==='user'&&m.content===input);result.splice(at<0?result.length:at,0,{role:'system',content:stateProtocol(options)+(featureContract?'\n'+featureContract:'')});return result;}
