// 发布快照命令行：准备（--prepare）→ 重启并由发布方验证 → 确认（--commit）。
// 用法：
//   node scripts/release-snapshot.mjs --instance test --channel test --prepare   # 只打印 buildId
//   node scripts/release-snapshot.mjs --instance test --channel test --commit <buildId>
//   node scripts/release-snapshot.mjs --instance test --channel test             # 准备并立即确认
//   node scripts/release-snapshot.mjs --instance test --current                  # 打印已确认的 buildId
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {instanceDescriptor,resolveChannel,resolveInstanceName} from '../server/channel.mjs';
import {commitRelease,prepareRelease,readReleaseSnapshot} from '../server/release.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const option=name=>{const index=args.indexOf('--'+name);return index>=0?args[index+1]||'':'';};
try{
  const port=Number(option('port')||process.env.PORT||0)||undefined;
  const channel=resolveChannel({explicit:option('channel')||process.env.TERMINAL_CHANNEL||'',port});
  const instanceName=resolveInstanceName({explicit:option('instance')||process.env.TERMINAL_INSTANCE||'',channel});
  instanceDescriptor({channel,instanceName});
  if(args.includes('--current')){
    const current=await readReleaseSnapshot(root,instanceName);
    if(current)console.log(current.buildId);
    process.exit(0);
  }
  if(args.includes('--commit')){
    const buildId=option('commit')||'';
    const record=await commitRelease(root,instanceName,buildId);
    console.error(`已确认发布：${instanceName}（${channel}）→ ${record.buildId}`);
    process.exit(0);
  }
  if(args.includes('--prepare')){
    const prepared=await prepareRelease(root,instanceName,{buildId:option('build')});
    process.stdout.write(prepared.buildId+'\n');
    console.error(`构建快照已准备：${instanceName}（${channel}）→ ${prepared.dir}${prepared.depsId?`，依赖 ${prepared.depsId}`:''}`);
    process.exit(0);
  }
  const prepared=await prepareRelease(root,instanceName,{buildId:option('build')});
  const record=await commitRelease(root,instanceName,prepared.buildId);
  console.log(`构建快照已固定：${instanceName}（${channel}）→ ${record.dir}`);
}catch(error){
  console.error(error.code==='INVALID_TERMINAL_CHANNEL'||error.code==='INVALID_TERMINAL_INSTANCE'?'通道或实例配置不合法：保留名 stable/test 不能跨通道使用。':'构建快照生成失败：'+(error.message||error));
  process.exit(1);
}
