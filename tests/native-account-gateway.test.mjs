import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {spawn} from 'node:child_process';import {once} from 'node:events';
import {academyLoginPage} from '../native/academy-frontend/login.mjs';
test('gateway rejects stale account requests before native access and offers independent registration/login',async()=>{
  const writes=[];let unavailable=false;const native=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/users/me'){if(unavailable)res.writeHead(503);res.end(JSON.stringify({handle:'account-b'}));return;}
    writes.push(req.url);res.end(JSON.stringify({ok:true}));
  });native.listen(0,'127.0.0.1');await once(native,'listening');
  const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(done=>reserve.close(done));
  const child=spawn(process.execPath,['native/academy-frontend/server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,ACADEMY_NATIVE_ORIGIN:'http://127.0.0.1:'+native.address().port,ACADEMY_FRONTEND_PORT:String(port)},stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
  try{
    const end=Date.now()+10000;while(!log.includes('Academy frontend ready')){if(child.exitCode!==null||Date.now()>end)throw Error('Gateway failed to start');await new Promise(r=>setTimeout(r,30));}
    const origin='http://127.0.0.1:'+port;
    const login=await fetch(origin+'/login');assert.equal(login.status,200);assert.equal(login.headers.get('cache-control'),'no-store');assert.equal(await login.text(),academyLoginPage);
    const stale=await fetch(origin+'/api/settings/save',{method:'POST',headers:{'X-Academy-Account':'account-a'},body:'{}'});assert.equal(stale.status,409);assert.deepEqual(await stale.json(),{error:'NATIVE_ACCOUNT_CHANGED'});assert.deepEqual(writes,[]);
    const current=await fetch(origin+'/api/settings/get',{method:'POST',headers:{'X-Academy-Account':'account-b'},body:'{}'});assert.equal(current.status,200);await current.json();assert.deepEqual(writes,['/api/settings/get']);
    unavailable=true;const outage=await fetch(origin+'/api/settings/get',{method:'POST',headers:{'X-Academy-Account':'account-b'},body:'{}'});assert.equal(outage.status,502);assert.ok(!(await outage.text()).includes('NATIVE_ACCOUNT_CHANGED'));assert.deepEqual(writes,['/api/settings/get']);
  }finally{child.kill();await once(child,'exit');native.closeAllConnections();await new Promise(done=>native.close(done));}
});
