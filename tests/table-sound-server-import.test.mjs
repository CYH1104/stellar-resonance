import {test} from 'node:test';
import assert from 'node:assert/strict';

// Production loads the shared TypeScript graph directly with Node, without Vite's resolver.
test('server imports the table sound event graph with native Node resolution',async()=>{
  const {createLocalServer}=await import('../server/app.mjs');
  assert.equal(typeof createLocalServer,'function');
});
