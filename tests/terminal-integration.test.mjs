import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';

test('original terminal serves the mounted functional workspace and assets on the API origin',async()=>{
  const app=await createLocalServer({projectRoot:resolve(import.meta.dirname,'..'),port:0});
  const base=`http://127.0.0.1:${await app.start()}`;
  try{
    const response=await fetch(base+'/terminal');assert.equal(response.status,200);
    const html=await response.text();
    assert.ok(html.includes('academy-home'));assert.ok(html.includes('interstellarTitle'));assert.ok(!html.includes('--terminal-engraving')); assert.ok(html.includes("mount.id='academy-workspace'"));
    const scripts=[...html.matchAll(/<script[^>]*src="(\/assets\/[^"<>]+)"/g)];assert.equal(scripts.length,1);
    const script=await fetch(base+scripts[0][1]);assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);
    const css=[...html.matchAll(/<link[^>]*href="(\/assets\/[^"<>]+\.css)"/g)];assert.ok(css.length);
    assert.equal((await fetch(base+css[0][1])).status,200);
    const bootstrap=await fetch(base+'/api/bootstrap');const data=await bootstrap.json();assert.equal(data.runtime,'local-card');assert.ok(data.counts.characters>0);
    const cookie=bootstrap.headers.get('set-cookie').split(';')[0];
    const game=await fetch(base+'/api/new-game',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({persona:{name:'整合测试'}})});
    assert.equal(game.status,200);const state=await game.json();assert.equal(state.initial.player.name,'整合测试');assert.equal(state.initial.characters.length,data.counts.characters);
    const head=await fetch(base+'/terminal',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    for(const path of ['/terminal-workspace.js','/server/private/extracted-pro.json','/terminal/../server/app.mjs'])assert.equal((await fetch(base+path)).status,404);
  }finally{app.server.closeAllConnections();await new Promise(resolve=>app.server.close(resolve));}
});
