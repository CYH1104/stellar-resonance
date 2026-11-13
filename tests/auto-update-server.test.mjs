import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {once} from 'node:events';
import {promisify} from 'node:util';
const exec=promisify(execFile),old='a'.repeat(40),next='b'.repeat(40);
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'stellar-auto-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const dir of ['scripts','server/.local/instances/test','bin','home'])await mkdir(join(root,dir),{recursive:true});
 await copyFile(new URL('../scripts/auto-update-server.sh',import.meta.url),join(root,'scripts/auto-update-server.sh'));
 await writeFile(join(root,'bin/git'),'#!/bin/bash\nif [ "$1" = ls-remote ]; then printf "%s\\trefs/heads/main\\n" "$(cat server/.local/remote)"; else cat server/.local/head; fi\n',{mode:0o755});
 await writeFile(join(root,'scripts/update-server.sh'),'#!/bin/bash\nset -eu\ntest ! -e /proc/$$/fd/201\necho update >> server/.local/calls\ncp server/.local/remote server/.local/head\nif [ -f server/.local/fail ]; then exit 7; fi\ncp server/.local/remote server/.local/last-deployed-main\ncp server/.local/remote server/.local/instances/test/last-deployed-main\n');
 for(const name of ['remote','head','last-deployed-main','instances/test/last-deployed-main'])await writeFile(join(root,'server/.local',name),old+'\n');
 const env={...process.env,HOME:join(root,'home'),NVM_DIR:join(root,'home/.nvm'),PATH:join(root,'bin')+':'+process.env.PATH};
 return {root,put:(name,value)=>writeFile(join(root,'server/.local',name),value),get:name=>readFile(join(root,'server/.local',name),'utf8'),run:()=>exec('bash',['scripts/auto-update-server.sh','http://127.0.0.1:8807'],{cwd:root,env})};
}
test('auto deploy skips unchanged main and deploys a new commit only once',{skip:process.platform!=='linux'},async t=>{
 const f=await fixture(t);assert.equal((await f.run()).stdout,'');await assert.rejects(f.get('calls'),{code:'ENOENT'});
 await f.put('remote',next+'\n');await f.run();assert.equal(await f.get('calls'),'update\n');assert.equal((await f.get('last-deployed-main')).trim(),next);
 assert.equal((await f.run()).stdout,'');assert.equal(await f.get('calls'),'update\n');
});
test('failed builds are not marked deployed; retry survives HEAD already being changed',{skip:process.platform!=='linux'},async t=>{
 const f=await fixture(t);await f.put('remote',next+'\n');await f.put('fail','1');await assert.rejects(f.run(),{code:7});
 assert.equal((await f.get('head')).trim(),next);assert.equal((await f.get('last-deployed-main')).trim(),old);
 await f.run();assert.equal(await f.get('calls'),'update\n');
 await rm(join(f.root,'server/.local/fail'));await f.put('auto-update-failed',next+' 1\n');await f.run();assert.equal(await f.get('calls'),'update\nupdate\n');
 assert.equal((await f.get('last-deployed-main')).trim(),next);
});
test('polling skips both a manual update and another poller holding a lock',{skip:process.platform!=='linux',timeout:5000},async t=>{
 const f=await fixture(t);await f.put('remote',next+'\n');
 for(const lock of ['update.lock','instances/test/update.lock','auto-update.lock']){
  const holder=spawn('flock',[join(f.root,'server/.local',lock),'bash','-c','echo ready; cat >/dev/null']);
  await once(holder.stdout,'data');
  try{assert.equal((await f.run()).stdout,'');await assert.rejects(f.get('calls'),{code:'ENOENT'});}
  finally{holder.stdin.end();await once(holder,'close');}
 }
});
test('installer creates independent user services and preserves an existing game service',{skip:process.platform!=='linux'},async t=>{
 const f=await fixture(t);await copyFile(new URL('../scripts/install-auto-update.sh',import.meta.url),join(f.root,'scripts/install-auto-update.sh'));
 await writeFile(join(f.root,'bin/systemd-analyze'),'#!/bin/bash\nexec /usr/bin/systemd-analyze "$@"\n',{mode:0o755});
 await writeFile(join(f.root,'bin/id'),'#!/bin/bash\nif [ "$1" = -u ]; then echo 1000; else echo ubuntu; fi\n',{mode:0o755});
 await writeFile(join(f.root,'bin/loginctl'),'#!/bin/bash\necho yes\n',{mode:0o755});
 await writeFile(join(f.root,'bin/systemctl'),'#!/bin/bash\nif [ "$2" = cat ]; then test -e "$HOME/.config/systemd/user/$3"; else echo "$*" >> "$HOME/systemctl-calls"; fi\n',{mode:0o755});
 const env={...process.env,HOME:join(f.root,'home'),NVM_DIR:join(f.root,'home/.nvm'),PATH:join(f.root,'bin')+':'+process.env.PATH};
 const run=()=>exec('bash',['scripts/install-auto-update.sh','http://127.0.0.1:8807'],{cwd:f.root,env});await run();
 const units=join(f.root,'home/.config/systemd/user');
 assert.match(await readFile(join(units,'stellar-resonance-auto-update.timer'),'utf8'),/OnUnitInactiveSec=60s/);
 const game=join(units,'stellar-resonance.service');assert.match(await readFile(game,'utf8'),/AUTH_REQUIRED=1/);
 assert.match(await readFile(join(units,'stellar-resonance-auto-update.service'),'utf8'),/Type=oneshot/);
 const custom=(await readFile(game,'utf8')).replace('RestartSec=5','RestartSec=8');await writeFile(game,custom);await run();assert.equal(await readFile(game,'utf8'),custom);
 assert.match(await readFile(join(f.root,'home/systemctl-calls'),'utf8'),/enable --now stellar-resonance-auto-update.timer/);
});


test('matching 8807 marker does not hide an outdated 9000 marker',{skip:process.platform!=='linux'},async t=>{
 const f=await fixture(t);await f.put('instances/test/last-deployed-main',next+'\n');await f.run();
 assert.equal(await f.get('calls'),'update\n');assert.equal((await f.get('instances/test/last-deployed-main')).trim(),old);
});
