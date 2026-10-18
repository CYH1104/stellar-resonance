import {internalPrompt} from './internal-prompts.mjs';
import {cleanDiceEvent} from '../src/domain/dice.ts';
import {modelError} from './ai.mjs';
import {cleanCommitments,memoryState,normalizeMemoryResult} from '../src/domain/memories.ts';
import {validateOutcome} from '../src/domain/story.ts';
import {stripReasoning} from '../src/domain/reasoning.ts';
export function memoryMessages(data){
 if(!data||typeof data.turnId!=='string'||data.turnId.length>200||typeof data.variantId!=='string'||data.variantId.length>200||typeof data.input!=='string'||!data.input.trim()||data.input.length>16000||typeof data.story!=='string'||!data.story.trim()||data.story.length>400000)throw modelError(400,'INVALID_MEMORY_REQUEST');
 try{for(const state of [data.before,data.after]){if(!state||!state.player||!Array.isArray(state.characters)||state.characters.length>1000)throw Error();validateOutcome({event:'状态校验',player:Object.fromEntries(Object.entries(state.player).filter(([k])=>k!=='id')),characters:state.characters},state);}data={...data,priorCommitments:cleanCommitments(data.priorCommitments)};}catch{throw modelError(400,'INVALID_MEMORY_REQUEST');}
 const input={turnId:data.turnId,variantId:data.variantId,input:data.input,story:stripReasoning(data.story),...(typeof data.event==='string'&&data.event.length<=500?{event:data.event}:{}),...(data.diceEvent?{diceEvent:cleanDiceEvent(data.diceEvent)}:{}),before:memoryState(data.before),after:memoryState(data.after),priorCommitments:data.priorCommitments};
 const instruction=internalPrompt("memory.1");
 return {input,messages:[{role:'system',content:instruction},{role:'user',content:JSON.stringify(input)}]};
}
export function parseMemoryResult(content,input){try{const clean=stripReasoning(content).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');return normalizeMemoryResult(JSON.parse(clean),input);}catch{throw modelError(502,'INVALID_MEMORY_RESULT');}}
