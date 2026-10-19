import {test} from 'node:test';
import assert from 'node:assert/strict';
import {internalPrompt} from '../server/internal-prompts.mjs';
import {parseMvuMessage,applyMvu} from '../src/domain/mvu.ts';
test('mandatory variable summary renders with protocol markers and patch applies once',()=>{
 const prompt=internalPrompt('ai.5',{p0:'<status>',p1:'<done>'});
 assert.ok(prompt.includes('Every turn'));
 assert.ok(prompt.includes('<attitudes>')); 
 assert.ok(prompt.includes('small changes of 2 or large changes of 5')); 
 assert.ok(prompt.includes('<status>'));assert.ok(prompt.includes('<done>'));
 const patch=parseMvuMessage('<UpdateVariable><Analysis>- Affinity: 10 to 13; practical help. Relationship unchanged.</Analysis><JSONPatch>[{"op":"delta","path":"/characters/npc-lin/affinity","value":3}]</JSONPatch></UpdateVariable>');
 const state={player:{id:'player',name:'Player',present:true},characters:[{id:'npc-lin',name:'Lin',present:true,affinity:10}]};
 assert.equal(applyMvu(state,patch).characters[0].affinity,13);
 assert.deepEqual(parseMvuMessage('<UpdateVariable><Analysis>No qualifying changes.</Analysis><JSONPatch>[]</JSONPatch></UpdateVariable>'),[]);
});
