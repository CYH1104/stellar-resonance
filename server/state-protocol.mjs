import {stateOutputPrompt} from './state-output-prompt.mjs';
import {internalPrompt} from './internal-prompts.mjs';
export function stateExample({state,stateEnabled=true}={}){
 const example={event:'A concrete change already enacted in the scene.'};
 if(stateEnabled){const actors=state?.characters?.filter(c=>c.present)||[];example.presentCharacterIds=actors.map(c=>c.id);example.characters=actors.map(actor=>({id:actor.id,name:actor.name,present:true,attitude:'neutral',strength:'small',innerThought:'A brief in-character reaction.',...(actor.relationship?{relationship:actor.relationship}:{}),...(actor.spiritAnimal?{spiritThought:'A private remark in the established spirit voice.'}:{})}));if(state?.player?.spiritAnimal)example.player={spiritThought:'My own reaction as the established player spirit.'};}
 return example;
}
export function stateProtocol(options={}){return options.stateEnabled===false?internalPrompt('state-protocol.prose')+'\n'+internalPrompt('state-protocol.compatibility'):internalPrompt('state-protocol.1')+'\n'+stateOutputPrompt(options);}
export function applyStateProtocol(messages,input,featureContract='',options={}){
 const result=messages.map(m=>({...m})),action=result.findLastIndex(m=>m.role==='user'&&m.content===input);
 // Post-history preset rules must not follow and override the output contract.
 // Keep a deliberate trailing assistant prefill in its original final position.
 let at=action<0?result.length:action;
 if(action>=0&&action<result.length-1){at=result.length;while(at>action+1&&result[at-1].role==='assistant')at--;}
 result.splice(at,0,{role:'system',content:(featureContract?featureContract+'\n':'')+stateProtocol(options)});return result;
}
