// 回归：发布最后一步不能因为「重启命令非零退出」就把回滚整段跳过。
// 原先把这段写在 bash 里，set -Eeuo pipefail 下 `bash scripts/restart-server.sh` 返回非零时
// 脚本当场退出：旧版本没被恢复，pending-release 还指着失败的目标。现在流程在
// scripts/release-deploy.mjs，restart / checkHealth / commit 全部可注入，四条路径用替身验证。
// 只用合成替身与临时目录，不碰真实服务、真实仓库和用户资料。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {deployRelease,pendingPath} from '../scripts/release-deploy.mjs';

const TARGET='target0000000001';
const PREVIOUS='previous0000001';

/** 组装一次发布所需的注入替身；每一步都记录调用，便于断言「失败时不推进」。 */
function harness({previous=PREVIOUS,behavior={}}={}){
  const calls={restart:[],health:[],commit:[],log:[]};
  const state={running:previous,current:previous||undefined};
  const pendingPathOf=stateDir=>pendingPath(stateDir);
  const impl={
    targetRelease:TARGET,
    previousRelease:previous,
    log:message=>calls.log.push(message),
    writePending:async(stateDir,buildId)=>{await writeFile(pendingPathOf(stateDir),`${JSON.stringify({buildId})}\n`);},
    clearPending:async stateDir=>{await rm(pendingPathOf(stateDir),{force:true});},
    readCurrent:async()=>state.current,
    restart:async releaseId=>{
      calls.restart.push(releaseId);
      if(behavior.restartFails?.includes(releaseId))throw Error(`重启命令以退出码 1 结束（目标快照 ${releaseId}）`);
      state.running=releaseId;
    },
    checkHealth:async releaseId=>{
      calls.health.push(releaseId);
      if(behavior.healthFails?.includes(releaseId))throw Error(`运行中的快照 ${state.running} 与期望的 ${releaseId} 不一致`);
      assert.equal(state.running,releaseId);
      return {release:releaseId,pid:4321};
    },
    commit:async releaseId=>{
      calls.commit.push(releaseId);
      if(behavior.commitFails)throw Error('RELEASE_SNAPSHOT_MISSING');
      state.current=releaseId;
    }
  };
  return {calls,state,impl};
}

async function runDeploy(implOverrides={},options={}){
  const {calls,state,impl}=harness(options);
  const stateDir=await mkdtemp(resolve(tmpdir(),'stellar-release-deploy-'));
  const report=await deployRelease({...impl,stateDir,...implOverrides});
  return {report,calls,state,stateDir};
}

const pendingGone=async stateDir=>{
  await assert.rejects(stat(pendingPath(stateDir)));
};

test('restart returning non-zero rolls back to the previous release and clears pending',async()=>{
  const {report,calls,state,stateDir}=await runDeploy({},{behavior:{restartFails:[TARGET]}});
  assert.equal(report.ok,false);
  assert.equal(report.stage,'重启');
  assert.deepEqual(calls.commit,[]);
  assert.deepEqual(calls.restart,[TARGET,PREVIOUS]);
  assert.deepEqual(calls.health,[PREVIOUS]);
  assert.equal(report.rollback.ok,true);
  assert.equal(report.rollback.release,PREVIOUS);
  assert.equal(state.running,PREVIOUS);
  assert.equal(state.current,PREVIOUS);
  await pendingGone(stateDir);
  await rm(stateDir,{recursive:true,force:true});
});

test('failing health after a successful restart takes the same rollback path',async()=>{
  const {report,calls,state,stateDir}=await runDeploy({},{behavior:{healthFails:[TARGET]}});
  assert.equal(report.ok,false);
  assert.equal(report.stage,'启动检查');
  assert.deepEqual(calls.commit,[]);
  assert.deepEqual(calls.health,[TARGET,PREVIOUS]);
  assert.equal(report.rollback.ok,true);
  assert.equal(state.running,PREVIOUS);
  await pendingGone(stateDir);
  await rm(stateDir,{recursive:true,force:true});
});

test('a rollback that fails itself is reported honestly instead of claimed recovered',async()=>{
  const {report,calls,state,stateDir}=await runDeploy({},{behavior:{restartFails:[TARGET,PREVIOUS]}});
  assert.equal(report.ok,false);
  assert.equal(report.rollback.attempted,true);
  assert.equal(report.rollback.ok,false);
  assert.equal(report.rollback.reason,'ROLLBACK_FAILED');
  assert.match(report.rollback.message,/回滚失败/);
  assert.deepEqual(calls.commit,[]);
  assert.equal(state.current,PREVIOUS);
  await pendingGone(stateDir);
  await rm(stateDir,{recursive:true,force:true});
});

test('a rollback that comes up but changes the committed pointer is reported, not trusted',async()=>{
  const {report,calls,state,stateDir}=await runDeploy({
    readCurrent:async()=>TARGET
  },{behavior:{healthFails:[TARGET]}});
  assert.equal(report.ok,false);
  assert.equal(report.rollback.ok,false);
  assert.equal(report.rollback.reason,'ROLLBACK_STATE_MISMATCH');
  assert.match(report.rollback.message,/不一致/);
  assert.deepEqual(calls.commit,[]);
  await pendingGone(stateDir);
  await rm(stateDir,{recursive:true,force:true});
});

test('a healthy target commits once and leaves no pending pointer',async()=>{
  const {report,calls,state,stateDir}=await runDeploy();
  assert.equal(report.ok,true);
  assert.deepEqual(calls.restart,[TARGET]);
  assert.deepEqual(calls.health,[TARGET]);
  assert.deepEqual(calls.commit,[TARGET]);
  assert.equal(state.current,TARGET);
  await pendingGone(stateDir);
  await rm(stateDir,{recursive:true,force:true});
});

test('a failed first deployment reports that there is nothing to roll back to',async()=>{
  const {report,calls,state,stateDir}=await runDeploy({},{previous:'',behavior:{restartFails:[TARGET]}});
  assert.equal(report.ok,false);
  assert.equal(report.rollback.attempted,false);
  assert.equal(report.rollback.reason,'NO_PREVIOUS_RELEASE');
  assert.deepEqual(calls.restart,[TARGET]);
  await pendingGone(stateDir);
  await rm(stateDir,{recursive:true,force:true});
});

test('the rollback target is written to pending before the rollback restart',async()=>{
  const seen=[];
  const {report,stateDir}=await runDeploy({
    writePending:async(dir,buildId)=>{
      await writeFile(pendingPath(dir),`${JSON.stringify({buildId})}\n`);
      seen.push(buildId);
    }
  },{behavior:{restartFails:[TARGET]}});
  assert.equal(report.ok,false);
  assert.deepEqual(seen,[TARGET,PREVIOUS]);
  await rm(stateDir,{recursive:true,force:true});
});

test('the target snapshot is what pending points at while it is being started',async()=>{
  const stateDir=await mkdtemp(resolve(tmpdir(),'stellar-release-pending-'));
  const report=await deployRelease({
    targetRelease:TARGET,previousRelease:PREVIOUS,stateDir,log:()=>{},
    restart:async()=>{
      assert.deepEqual(JSON.parse(await readFile(pendingPath(stateDir),'utf8')),{buildId:TARGET});
      throw Error('重启命令以退出码 1 结束');
    },
    checkHealth:async()=>{assert.fail('回滚前不应检查目标：目标没起来');},
    commit:async()=>{assert.fail('没起来的目标不能被确认');},
    readCurrent:async()=>PREVIOUS
  });
  assert.equal(report.ok,false);
  await pendingGone(stateDir);
  await rm(stateDir,{recursive:true,force:true});
});
