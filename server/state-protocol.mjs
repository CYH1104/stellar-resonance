import {internalPrompt} from './internal-prompts.mjs';
export function stateProtocol(){return internalPrompt("state-protocol.1");}
export function applyStateProtocol(messages,input){const result=messages.map(m=>({...m})),at=result.findLastIndex(m=>m.role==='user'&&m.content===input);result.splice(at<0?result.length:at,0,{role:'system',content:stateProtocol()});return result;}
