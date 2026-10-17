import {memoryMessages,parseMemoryResult} from './memory.mjs';
import {internalPrompt} from './internal-prompts.mjs';
import {modelError} from './ai.mjs';
import {stripReasoning} from '../src/domain/reasoning.ts';
export function batchMemoryMessages(rounds){
 if(!Array.isArray(rounds)||!rounds.length||rounds.length>20)throw modelError(400,'INVALID_MEMORY_REQUEST');
 const inputs=rounds.map(r=>memoryMessages(r).input),ids=new Set(inputs.map(r=>r.turnId));if(ids.size!==inputs.length||JSON.stringify(inputs).length>1000000)throw modelError(400,'INVALID_MEMORY_REQUEST');
 return {inputs,messages:[{role:'system',content:internalPrompt('memory.1')+'\n'+internalPrompt('memory.batch')},{role:'user',content:JSON.stringify({rounds:inputs})}]};
}
export function parseBatchMemoryResult(content,inputs){
 try{const raw=JSON.parse(stripReasoning(content).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));if(!Array.isArray(raw.records)||raw.records.length!==inputs.length)throw Error();const ids=new Set(),commitments=new Map();return inputs.map(input=>{const entry=raw.records.find(r=>r.turnId===input.turnId&&r.variantId===input.variantId);if(!entry||ids.has(entry.turnId))throw Error();ids.add(entry.turnId);for(const c of input.priorCommitments)if(!commitments.has(c.id))commitments.set(c.id,c);const record=parseMemoryResult(JSON.stringify(entry.record),{...input,priorCommitments:[...commitments.values()]});for(const c of record.commitments)commitments.set(c.id,c);return record;});}catch{throw modelError(502,'INVALID_MEMORY_RESULT');}
}
