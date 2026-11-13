// Both instances receive one build. A partial restart/commit must not become a successful deployment.
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,rename,rm,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareRelease,releaseBuildId,readReleaseSnapshot,commitRelease} from '../server/release.mjs';
import {projectRoot,healthCheck,writePendingRelease,clearPendingRelease} from './release-deploy.mjs';

async function atomic(file,text){await writeFile(file+'.tmp',text);await rename(file+'.tmp',file);}
async function optionalRead(file){try{return await readFile(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}

export async function deployPair({instances,target,commit,journal=async()=>{},log=()=>{}}){
  if(instances.length!==2||new Set(instances.map(i=>i.name)).size!==2)throw Error('Two distinct instances are required');
  // Complete preflight before touching any pointer or process.
  const markers=[];
  for(const instance of instances){
    if(!instance.previous||await instance.current()!==instance.previous)throw Error('Previous release changed: '+instance.name);
    markers.push(await instance.readMarker());
  }
  const touched=new Set(),switched=new Set();let stage='准备双端切换';
  try{
    await journal({status:'deploying',target,commit,previous:instances.map(i=>({name:i.name,release:i.previous}))});
    for(const instance of instances){touched.add(instance);await instance.pending(target);}
    for(const instance of instances){
      stage='启动 '+instance.name;switched.add(instance);await instance.restart(target);
      stage='检查 '+instance.name;await instance.health(target);
    }
    // No current pointer advances before BOTH services have passed health checks.
    stage='确认双端版本';
    for(const instance of instances)await instance.confirm(target);
    for(const instance of instances)if(await instance.current()!==target)throw Error('Current pointer mismatch: '+instance.name);
    stage='记录共同提交';
    for(const instance of instances)await instance.mark(commit);
    for(const instance of instances)await instance.clear();
    await journal({status:'complete',target,commit});
    return {ok:true,target,commit};
  }catch(error){
    log(`双端发布失败（${stage}）：${error.message}；恢复本次已切换的实例。`);
    const rollback=[];
    for(const [index,instance] of instances.entries()){
      if(!touched.has(instance))continue;
      try{
        await instance.pending(instance.previous);
        // Restore the confirmed pointer first; an unsuccessful restart must not leave a new default.
        await instance.confirm(instance.previous);
        if(switched.has(instance)){await instance.restart(instance.previous);await instance.health(instance.previous);}
        if(await instance.current()!==instance.previous)throw Error('Rollback pointer mismatch');
        await instance.restoreMarker(markers[index]);
        await instance.clear();
        rollback.push({name:instance.name,ok:true});
      }catch(rollbackError){rollback.push({name:instance.name,ok:false,message:rollbackError.message});}
    }
    const result={ok:false,stage,message:error.message,target,rollback};
    await journal({status:'failed',...result}).catch(e=>log('发布记录写入失败：'+e.message));
    return result;
  }
}

function restart({origin,name,log}){
  return async release=>{
    log(`切换 ${name} → ${release}`);
    await new Promise((done,fail)=>{
      const child=spawn('bash',['-c','exec 200>&-; exec 201>&-; exec 202>&-; exec bash scripts/restart-server.sh "$1"','bash',origin],{
        cwd:projectRoot,env:{...process.env,TERMINAL_INSTANCE:name,TERMINAL_CHANNEL:name,SERVICE_NAME:name==='stable'?'stellar-resonance':'stellar-resonance-test'},stdio:['ignore','inherit','inherit']});
      child.on('error',fail);child.on('exit',code=>code===0?done():fail(Error('Restart failed: '+name)));
    });
  };
}

async function waitForIdle(instances,log){
  for(let attempt=0;attempt<120;attempt++){
    const connections=execFileSync('ss',['-Hntp','state','established','( dport = :443 )'],{encoding:'utf8'});
    const busy=[];
    for(const instance of instances){
      const health=await (await fetch(`http://127.0.0.1:${instance.port}/api/health`,{signal:AbortSignal.timeout(2000)})).json();
      if(connections.includes(`pid=${health.pid},`))busy.push(instance.name);
    }
    if(!busy.length)return;
    if(attempt%6===0)log('等待正在运行的模型连接结束：'+busy.join('、'));
    await new Promise(done=>setTimeout(done,5000));
  }
  throw Error('仍有模型连接，已保留旧版本，未执行切换');
}

export async function main(args=process.argv.slice(2)){
  const option=name=>{const i=args.indexOf('--'+name);return i<0?'':args[i+1]||'';};
  const commit=option('commit');if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Missing exact Git commit');
  if(execFileSync('git',['rev-parse','HEAD'],{cwd:projectRoot,encoding:'utf8'}).trim()!==commit)throw Error('Git HEAD does not match deployment commit');
  const journalFile=resolve(projectRoot,'server/.local/paired-update.json');
  const prior=await optionalRead(journalFile);
  if(prior&&JSON.parse(prior).status==='deploying')throw Error('上次双端切换未收尾，请先核查 paired-update.json，未覆盖恢复记录');
  const log=message=>process.stderr.write(message+'\n');
  const instances=[];
  for(const [name,port] of [['stable',8807],['test',9000]]){
    const origin=option(name+'-origin'),url=new URL(origin);
    if(url.protocol!=='http:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||Number(url.port)!==port)throw Error('Invalid instance origin');
    const stateDir=resolve(projectRoot,name==='stable'?'server/.local':'server/.local/instances/test');
    try{await access(resolve(stateDir,'pending-release.json'));throw Error('Unfinished pending release: '+name);}catch(e){if(e.code!=='ENOENT')throw e;}
    const previous=(await readReleaseSnapshot(projectRoot,name))?.buildId;
    if(!previous)throw Error('Missing previous confirmed release: '+name);
    const marker=resolve(stateDir,'last-deployed-main');
    const check=healthCheck({root:projectRoot,port,channel:name,instanceName:name,stateDir,log});
    await check(previous);
    instances.push({name,port,origin,stateDir,previous,current:async()=>(await readReleaseSnapshot(projectRoot,name))?.buildId,
      pending:id=>writePendingRelease(stateDir,id),clear:()=>clearPendingRelease(stateDir),confirm:id=>commitRelease(projectRoot,name,id),
      readMarker:()=>optionalRead(marker),mark:sha=>atomic(marker,sha+'\n'),restoreMarker:value=>value===null?rm(marker,{force:true}):atomic(marker,value),
      restart:restart({origin,name,log}),health:check});
  }
  const target=await releaseBuildId(projectRoot);
  for(const instance of instances){
    const prepared=await prepareRelease(projectRoot,instance.name,{buildId:target});
    if(prepared.buildId!==target)throw Error('Prepared release mismatch');
    const check=instance.health;
    instance.health=async id=>{const result=await check(id);if(id===target&&!result.terminal)throw Error('手机终端未开启：'+instance.name);return result;};
  }
  // Preparing snapshots does not touch the running versions. Avoid interrupting existing model connections.
  await waitForIdle(instances,log);
  const result=await deployPair({instances,target,commit,log,journal:record=>atomic(journalFile,JSON.stringify({...record,at:new Date().toISOString()})+'\n')});
  log(JSON.stringify(result));return result.ok?0:1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().then(code=>process.exitCode=code).catch(error=>{console.error(error.message);process.exitCode=1;});
}
