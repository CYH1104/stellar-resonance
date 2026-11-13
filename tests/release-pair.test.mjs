import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rename,rm,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {deployPair} from '../scripts/release-pair.mjs';

// Real pointer/pending/marker files, injected process failures. No model calls or customer storage.
async function fixture(t,{fail=''}={}){
  const root=await mkdtemp(resolve('.integration','paired-release-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const events=[],state={},instances=[],target='new-build',commit='b'.repeat(40);let failed=false;
  for(const name of ['stable','test']){
    const dir=resolve(root,name);await mkdir(dir);
    const prior=name+'-old';state[name]=prior;
    await writeFile(resolve(dir,'current'),prior);await writeFile(resolve(dir,'marker'),'old-'+name);
    const put=async(file,text)=>{await writeFile(resolve(dir,file+'.tmp'),text);await rename(resolve(dir,file+'.tmp'),resolve(dir,file));};
    const read=file=>readFile(resolve(dir,file),'utf8');
    const maybe=(phase,id)=>{if(!failed&&fail===name+':'+phase&&id===target){failed=true;throw Error('injected '+fail);}};
    instances.push({name,previous:prior,current:()=>read('current'),readMarker:()=>readFile(resolve(dir,'marker')),
      mark:async sha=>{maybe('marker',target);await put('marker',sha);},restoreMarker:bytes=>put('marker',bytes),
      pending:async id=>{maybe('pending',id);events.push(name+':pending:'+id);await put('pending',id);},
      clear:async()=>{maybe('clear',state[name]);await rm(resolve(dir,'pending'),{force:true});},
      restart:async id=>{events.push(name+':restart:'+id);state[name]=id;maybe('restart',id);},
      health:async id=>{events.push(name+':health:'+id);maybe('health',id);assert.equal(state[name],id);},
      confirm:async id=>{events.push(name+':confirm:'+id);maybe('confirm',id);await put('current',id);}});
  }
  return {root,events,state,instances,target,commit};
}
test('both health checks precede confirmation and both markers advance together',async t=>{
  const f=await fixture(t);const result=await deployPair(f);assert.equal(result.ok,true);
  assert.ok(f.events.indexOf('test:health:new-build')<f.events.indexOf('stable:confirm:new-build'));
  for(const i of f.instances){assert.equal(await i.current(),f.target);assert.equal((await i.readMarker()).toString(),f.commit);await assert.rejects(access(resolve(f.root,i.name,'pending')));}
});
for(const fail of ['test:pending','stable:restart','test:restart','test:health','test:confirm','test:marker','test:clear']){
  test('failure at '+fail+' restores both pointers, processes and previous markers',async t=>{
    const f=await fixture(t,{fail}),result=await deployPair(f);assert.equal(result.ok,false);
    assert.ok(result.rollback.every(r=>r.ok),JSON.stringify(result));
    for(const i of f.instances){assert.equal(await i.current(),i.previous);assert.equal(f.state[i.name],i.previous);assert.equal((await i.readMarker()).toString(),'old-'+i.name);await assert.rejects(access(resolve(f.root,i.name,'pending')));}
    if(fail==='test:pending')assert.equal(f.events.filter(e=>e.includes(':restart:')).length,0);
  });
}
test('a slow second health check cannot publish a half-updated release',async t=>{
  const f=await fixture(t);let release,entered;const reached=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
  const original=f.instances[1].health;f.instances[1].health=async id=>{entered();await gate;return original(id);};
  const pending=deployPair(f);await reached;
  for(const i of f.instances){assert.equal(await i.current(),i.previous);assert.equal((await i.readMarker()).toString(),'old-'+i.name);}
  release();assert.equal((await pending).ok,true);
});
test('journal failure after switching is treated as a failed deployment and rolled back',async t=>{
  const f=await fixture(t);const result=await deployPair({...f,journal:async r=>{if(r.status==='complete')throw Error('disk full');}});
  assert.equal(result.ok,false);for(const i of f.instances)assert.equal(await i.current(),i.previous);
});
test('rollback failure is explicit and keeps a previous-release pending target for recovery',async t=>{
  const f=await fixture(t,{fail:'test:health'});const restart=f.instances[0].restart;
  f.instances[0].restart=async id=>{if(id===f.instances[0].previous)throw Error('service unavailable');await restart(id);};
  const result=await deployPair(f);assert.equal(result.ok,false);assert.equal(result.rollback[0].ok,false);
  assert.equal(await f.instances[0].current(),f.instances[0].previous);
  assert.equal(await readFile(resolve(f.root,'stable/pending'),'utf8'),f.instances[0].previous);
});
test('changed current pointer fails preflight without any restart or pending write',async t=>{
  const f=await fixture(t);await writeFile(resolve(f.root,'test/current'),'someone-else');
  await assert.rejects(deployPair(f),/Previous release changed/);assert.deepEqual(f.events,[]);
});
