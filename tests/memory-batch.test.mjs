import {test} from 'node:test';import assert from 'node:assert/strict';
import {batchMemoryMessages,parseBatchMemoryResult} from '../server/memory-batch.mjs';
import {initialState} from '../src/domain/story.ts';
const input=i=>({turnId:'t'+i,variantId:'v'+i,input:'行动'+i,story:'完整正文'+i,before:initialState('玩家'),after:initialState('玩家'),priorCommitments:[]});
const record=i=>({participants:['玩家'],time:'未明确',location:'报到台',userActions:['行动'+i],charActions:[],gains:[],losses:[],commitments:[],affinityChanges:[]});
test('one batch prompt includes full ordered rounds and normalized records match IDs rather than model ordering',()=>{
 const inputs=[input(0),input(1)],built=batchMemoryMessages(inputs);assert.equal(built.inputs.length,2);assert.ok(built.messages[1].content.includes('完整正文1'));const raw={records:[{turnId:'t1',variantId:'v1',record:record(1)},{turnId:'t0',variantId:'v0',record:record(0)}]};assert.deepEqual(parseBatchMemoryResult(JSON.stringify(raw),built.inputs).map(r=>r.userActions[0]),['行动0','行动1']);
 for(const records of [raw.records.slice(0,1),[raw.records[0],raw.records[0]],[{...raw.records[1],variantId:'wrong'},raw.records[0]]])assert.throws(()=>parseBatchMemoryResult(JSON.stringify({records}),built.inputs),{code:'INVALID_MEMORY_RESULT'});
});
test('batch size and duplicate turn identifiers are bounded before making a model request',()=>{for(const rounds of [[],Array.from({length:21},(_,i)=>input(i)),[input(0),input(0)]])assert.throws(()=>batchMemoryMessages(rounds),{code:'INVALID_MEMORY_REQUEST'});});
