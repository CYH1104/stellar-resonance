import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,readFile,rm} from 'node:fs/promises';import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';import {createEditorServer} from '../server/editor.mjs';import {editorAccessKey} from '../server/editor-gateway.mjs';import {validateMapAssets} from '../server/map-assets.mjs';
const root=resolve(import.meta.dirname,'..');
test('map URL schema rejects executable URLs and preserves main/place values',()=>{assert.deepEqual(validateMapAssets({main:'https://example.com/map.jpg',places:{学院:'https://example.com/campus.png'}}),{main:'https://example.com/map.jpg',secondary:'',places:{学院:'https://example.com/campus.png'}});for(const raw of [{main:'javascript:alert(1)'},{main:'https://name:password@example.com/a'},{places:JSON.parse('{"__proto__":"https://example.com/a"}')}])assert.throws(()=>validateMapAssets(raw));});
test('same-origin admin page requires a separate key, proxies editor writes, syncs map URLs, and revokes logout',async()=>{
 const fixture=await mkdtemp(resolve(root,'.integration/gateway-test-'));let editor,game;
 try{
  await mkdir(fixture+'/server/private',{recursive:true});await cp(root+'/server/auth-ui',fixture+'/server/auth-ui',{recursive:true});await cp(root+'/server/editor-ui',fixture+'/server/editor-ui',{recursive:true});await cp(root+'/dist',fixture+'/dist',{recursive:true});await cp(root+'/星穹游戏终端 (1).html',fixture+'/星穹游戏终端 (1).html');
  const card=JSON.parse(await readFile(root+'/server/example/feature-demo.json','utf8'));card.characters=[{id:'real',name:'Real',no:'01'}];await writeFile(fixture+'/server/private/extracted-pro.json',JSON.stringify(card));
  editor=createEditorServer({projectRoot:fixture,card,port:0,gameUrl:'http://game.example:8807/terminal'});const editorPort=await editor.start();
  game=await createLocalServer({projectRoot:fixture,port:0,authRequired:true,editorPort});const base='http://127.0.0.1:'+await game.start();
  const post=(path,data,cookie='',headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...headers},body:JSON.stringify(data)});
  const login=await fetch(base+'/editor/');assert.equal(login.status,200);assert.match(await login.text(),/editor-login/);
  assert.equal((await fetch(base+'/editor/api/editor')).status,401);
  const registration=await post('/api/auth/register',{email:'admin-test@qq.com',password:'synthetic-pass'});const userCookie=registration.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base+'/editor/api/editor',{headers:{Cookie:userCookie}})).status,401);
  assert.equal((await post('/editor/login',{key:'wrong'})).status,401);
  const key=await editorAccessKey(fixture);assert.equal((await post('/editor/login',{key},'',{Origin:'https://outside.example'})).status,403);
  const accepted=await post('/editor/login',{key});assert.equal(accepted.status,200);const cookie=accepted.headers.get('set-cookie').split(';')[0];assert.match(accepted.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/editor/);
  const html=await(await fetch(base+'/editor/',{headers:{Cookie:cookie}})).text();assert.match(html,/\.\/editor.js/);assert.ok(!html.includes(key));
  const data=await(await fetch(base+'/editor/api/editor',{headers:{Cookie:cookie}})).json();assert.equal(data.gameUrl,'http://game.example:8807/terminal');data.data.map={main:'https://example.com/map.png',places:{学院:'https://example.com/campus.png'}};
  const saved=await post('/editor/api/editor',{data:data.data,revision:data.revision},cookie,{'X-Editor-Token':data.token});assert.equal(saved.status,200);
  const publicMap=await(await fetch(base+'/api/map-assets',{headers:{Cookie:userCookie}})).json();assert.equal(publicMap.map.main,'https://example.com/map.png');assert.ok(!JSON.stringify(publicMap).includes(key));
  const terminal=await(await fetch(base+'/terminal',{headers:{Cookie:userCookie}})).text();assert.match(terminal,/data-academy-boot/);assert.match(terminal,/__ACADEMY_MAP_ASSETS__/);assert.ok(terminal.includes('https://example.com/map.png'));
  assert.equal((await fetch(base+'/editor/../server/private/editor-access-key.txt')).status,404);
  assert.equal((await post('/editor/logout',{},cookie)).status,200);assert.equal((await fetch(base+'/editor/api/editor',{headers:{Cookie:cookie}})).status,401);
 }finally{for(const app of [game,editor])if(app){app.server.closeAllConnections();await new Promise(r=>app.server.close(r));}await rm(fixture,{recursive:true,force:true});}
});
