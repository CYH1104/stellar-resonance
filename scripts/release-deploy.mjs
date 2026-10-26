// 发布最后一步：让目标快照真正跑起来，跑不起来就回到上一个已确认版本。
// 这段控制流原来写在 bash 里：脚本开了 set -Eeuo pipefail，`bash scripts/restart-server.sh`
// 一旦因 systemd 启动失败或端口冲突返回非零，脚本当场退出，根本走不到后面的健康检查与
// 回滚分支——旧版本没被恢复，pending-release 还指着失败的目标。这里把它收敛成一个可注入
// 的 Node 流程：启动失败与健康失败共用同一条回滚路径，回滚要核对跑起来的确实是旧版本，
// 回滚失败如实报告，只有目标健康并确认后才推进 current / last-deployed。
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {rm,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {commitRelease,readReleaseSnapshot} from '../server/release.mjs';

export const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');

export function pendingPath(stateDir){return resolve(stateDir,'pending-release.json');}

export async function writePendingRelease(stateDir,buildId){
  await writeFile(pendingPath(stateDir),`${JSON.stringify({buildId})}\n`);
}

/** 无论成功失败都必须回到「没有 pending 目标」的状态：下次启动按已确认版本走。 */
export async function clearPendingRelease(stateDir){
  await rm(pendingPath(stateDir),{force:true});
}

function run(command,args,cwd){
  return new Promise((done,fail)=>{
    const child=spawn(command,args,{cwd,stdio:['ignore','inherit','inherit']});
    child.on('error',fail);
    child.on('exit',(code,signal)=>done(signal?1:code??1));
  });
}

/**
 * 真实重启。注意 `exec 200>&-`：pkill/nohup 出来的服务进程会继承本脚本持有的
 * 实例更新锁（fd 200），不关掉的话后台服务会一直占着锁，下一次更新会误报
 * 「另一次更新正在执行」。这与原先 `bash scripts/restart-server.sh "$ORIGIN" 200>&-` 等价。
 */
export function restartServer({root,origin}){
  return async function restart(releaseId){
    const code=await run('bash',['-c','cd "$1"; exec 200>&-; exec bash scripts/restart-server.sh "$2"','bash',root,origin],root);
    if(code!==0)throw Object.assign(Error(`重启命令以退出码 ${code} 结束（目标快照 ${releaseId}）`),{code:'RESTART_FAILED',exitCode:code});
  };
}

/** 真实健康检查：端口上跑的必须就是本项目本实例通道、且固定在我们指定的快照上。 */
export function healthCheck({root,port,channel,instanceName,stateDir,attempts=20,intervalMs=500,log=()=>{}}){
  return async function checkHealth(expectedRelease){
    const projectId=createHash('sha256').update(root).digest('hex').slice(0,16);
    let last='未收到健康响应';
    for(let attempt=0;attempt<attempts;attempt++){
      try{
        const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1000)});
        if(!response.ok)throw Error(`健康检查 HTTP ${response.status}`);
        const info=await response.json();
        if(info.app!=='stellar-resonance-local'||info.projectId!==projectId||!info.accountsRequired||!Number.isSafeInteger(info.pid)||info.pid<=1)throw Error('健康信息与当前项目或账号配置不匹配');
        if((info.channel||'stable')!==channel)throw Error(`该端口运行的是 ${info.channel} 通道，与目标 ${channel} 不一致`);
        if((info.instanceName||info.channel||'stable')!==instanceName)throw Error(`该端口运行的是 ${info.instanceName} 实例，与目标 ${instanceName} 不一致`);
        if(!info.release)throw Error('该实例没有固定自己的构建快照');
        if(info.release!==expectedRelease)throw Error(`运行中的快照 ${info.release} 与期望的 ${expectedRelease} 不一致`);
        log(`启动检查通过：端口 ${port}，通道 ${channel}，实例 ${instanceName}，快照 ${info.release}（与期望版本一致），进程 PID ${info.pid}，应用版本 ${info.version}，账号系统已启用。`);
        return info;
      }catch(error){last=error.message;}
      await new Promise(done=>setTimeout(done,intervalMs));
    }
    throw Error(`服务启动检查失败：${last}。请查看 ${stateDir}/deploy.log 或 systemd 日志。`);
  };
}

export function commitSnapshot({root,instanceName}){
  return async function commit(releaseId){
    await commitRelease(root,instanceName,releaseId);
  };
}

export function readCommittedRelease({root,instanceName}){
  return async function readCurrent(){
    const current=await readReleaseSnapshot(root,instanceName);
    return current?.buildId;
  };
}

/**
 * 回滚到上一个已确认版本。启动失败和健康失败都走这里：
 * 失败原因不同，恢复动作必须一致。
 */
async function rollbackToPrevious({stateDir,targetRelease,previousRelease,restart,checkHealth,writePending,clearPending,readCurrent,log}){
  if(!previousRelease){
    await clearPending(stateDir);
    log('本次之前没有已确认版本，无法回滚；已清除 pending-release，下次启动按已确认快照或无快照启动处理。');
    return {attempted:false,ok:false,reason:'NO_PREVIOUS_RELEASE',release:undefined,message:'未回滚：没有上一已确认版本。'};
  }
  log(`回滚到上一已确认版本 ${previousRelease} 并检查它是否真的起来了…`);
  try{
    await writePending(stateDir,previousRelease);
    await restart(previousRelease);
    await checkHealth(previousRelease);
  }catch(error){
    await clearPending(stateDir);
    return {attempted:true,ok:false,reason:'ROLLBACK_FAILED',release:previousRelease,
      message:`回滚失败：${error.message}。已清除 pending-release，current 与 last-deployed 均未推进，服务可能处于停止状态，请人工处理。`};
  }
  // 回滚成功不能只看重启命令的退出码，还要核对跑起来的确实是旧版本，且已确认指针没被推进。
  try{
    const current=await readCurrent();
    if(current!==previousRelease)throw Error(`已确认版本为 ${current||'无'}，与回滚目标 ${previousRelease} 不一致`);
  }catch(error){
    await clearPending(stateDir);
    return {attempted:true,ok:false,reason:'ROLLBACK_STATE_MISMATCH',release:previousRelease,
      message:`回滚后状态不一致：${error.message}。已清除 pending-release，current 与 last-deployed 均未推进，请人工核对。`};
  }
  await clearPending(stateDir);
  return {attempted:true,ok:true,release:previousRelease,message:`已回滚到 ${previousRelease}（健康检查通过，且它仍是已确认版本）。`};
}

/**
 * 发布一个已准备好的快照。任何一步失败都会回到上一已确认版本；只有目标快照真正健康，
 * 才调用 commit 推进已确认版本。返回值供调用方决定退出码，不抛异常给 shell 去猜。
 */
export async function deployRelease({
  stateDir,targetRelease,previousRelease='',
  restart,checkHealth,commit,readCurrent,
  writePending=writePendingRelease,clearPending=clearPendingRelease,
  log=()=>{}
}={}){
  const failWith=(stage,error,rollback)=>({ok:false,stage,release:targetRelease,message:error?.message||String(error),rollback});
  let stage='重启';
  await writePending(stateDir,targetRelease);
  try{
    log(`重启服务并检查目标快照 ${targetRelease}…`);
    await restart(targetRelease);
    stage='启动检查';
    await checkHealth(targetRelease);
    stage='确认发布';
    await commit(targetRelease);
  }catch(error){
    const rollback=await rollbackToPrevious({stateDir,targetRelease,previousRelease,restart,checkHealth,writePending,clearPending,readCurrent,log});
    return failWith(stage,error,rollback);
  }
  await clearPending(stateDir);
  return {ok:true,stage:'已发布',release:targetRelease,message:`目标快照 ${targetRelease} 已启动并通过启动检查，已确认发布。`};
}

function option(args,name){const index=args.indexOf('--'+name);return index>=0?args[index+1]||'':'';}

/** CLI 入口，供 scripts/update-server.sh 调用：成功退出 0，失败退出 1 并说明回滚结果。 */
export async function main(args=process.argv.slice(2)){
  const stateDir=option(args,'state-dir'),targetRelease=option(args,'target'),origin=option(args,'origin');
  if(!stateDir||!targetRelease||!origin){
    console.error('用法：node scripts/release-deploy.mjs --instance <实例> --channel <通道> --state-dir <目录> --target <buildId> [--previous <buildId>] --origin <公开地址> --port <端口>');
    return 1;
  }
  const instanceName=option(args,'instance'),channel=option(args,'channel'),port=Number(option(args,'port'))||80;
  const log=message=>process.stderr.write(`${message}\n`);
  const report=await deployRelease({
    stateDir,targetRelease,previousRelease:option(args,'previous'),
    restart:restartServer({root:projectRoot,origin}),
    checkHealth:healthCheck({root:projectRoot,port,channel,instanceName,stateDir,log}),
    commit:commitSnapshot({root:projectRoot,instanceName}),
    readCurrent:readCommittedRelease({root:projectRoot,instanceName}),
    log
  });
  if(!report.ok){
    log(`发布失败（${report.stage}）：${report.message}`);
    log(report.rollback.message);
    return 1;
  }
  log(report.message);
  return 0;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.exitCode=await main();}
  catch(error){console.error(`发布流程异常终止：${error.message||error}`);process.exitCode=1;}
}
