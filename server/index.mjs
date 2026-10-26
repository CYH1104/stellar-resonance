// 启动入口只做一件事：选版本，然后把进程交给那个版本的代码。
// 普通重启读实例已确认的 current.json；首次启动才从共享工作树生成快照；
// 显式发布通过 pending-release.json 或 TERMINAL_RELEASE 指定目标版本。
// 之后加载的是快照里的 server/index-main.mjs，所以后端代码与运行依赖同样被固定。
import {readFile,copyFile,mkdir,readdir,realpath,stat} from 'node:fs/promises';
import {dirname,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {instanceDescriptor,resolveChannel,resolveInstanceName} from './channel.mjs';
import {createReleaseSnapshot,resolveRelease,readReleaseSnapshot} from './release.mjs';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');

// 稳定版沿用既有目录（server/private、server/.local）；测试版各自独立，更新或重启互不覆盖。
export function instancePaths(projectRoot,instanceName){
  const stable=instanceName==='stable';
  return {stateDir:stable?resolve(projectRoot,'server/.local'):resolve(projectRoot,'server/.local/instances',instanceName),privateDir:stable?resolve(projectRoot,'server/private'):resolve(projectRoot,'server/private/instances',instanceName)};
}
async function exists(file){try{await stat(file);return true;}catch{return false;}}
// 世界书同样属于运营商私有资料：新实例要看到与稳定版一致的世界设定，之后各自独立演进。
// 只复制私有目录内真实存在的常规文件，符号链接一律跳过，避免把目录外内容复制进实例。
async function seedWorldbooks(privateDir,stablePrivate){
  const sourceBase=await realpath(resolve(stablePrivate,'worldbooks')).catch(()=>'');
  if(!sourceBase)return;
  const names=(await readdir(sourceBase,{withFileTypes:true}).catch(()=>[]))
    .filter(entry=>entry.isFile()&&entry.name.toLowerCase().endsWith('.json')).map(entry=>entry.name).sort();
  if(!names.length)return;
  const targetBase=resolve(privateDir,'worldbooks');
  await mkdir(targetBase,{recursive:true});
  for(const name of names){
    // 已有同名世界书视为"用户改过的版本"，保留，不覆盖。
    if(await exists(resolve(targetBase,name)))continue;
    await copyFile(resolve(sourceBase,name),resolve(targetBase,name));
  }
}
// 测试实例首次启动复制稳定版的编辑器资料与世界书，让两个通道初始角色／世界书一致；之后各自独立演进。
async function seedInstance(privateDir,stablePrivate){
  if(privateDir===stablePrivate)return;
  await mkdir(privateDir,{recursive:true});
  // 世界卡与编辑器资料同源：测试通道要能复现稳定版看到的世界，但也只在缺失时复制，绝不覆盖。
  for(const name of ['editor-data.json','extracted-pro.json']){
    const target=resolve(privateDir,name),source=resolve(stablePrivate,name);
    if(await exists(target)||!await exists(source))continue;
    await copyFile(source,target);
  }
  await seedWorldbooks(privateDir,stablePrivate);
}
/** 显式发布：更新脚本在重启前写目标版本，健康检查通过后才由发布方推进 current.json。 */
async function pendingRelease(stateDir){
  try{const record=JSON.parse(await readFile(resolve(stateDir,'pending-release.json'),'utf8'));return typeof record?.buildId==='string'?record.buildId:'';}catch{return '';}
}
try {
  const host=process.env.HOST||'127.0.0.1';
  let port=Number(process.env.PORT||5173);
  const channel=resolveChannel({explicit:process.env.TERMINAL_CHANNEL,port});
  const instanceName=resolveInstanceName({explicit:process.env.TERMINAL_INSTANCE,channel});
  instanceDescriptor({channel,instanceName});
  const {stateDir,privateDir}=instancePaths(projectRoot,instanceName);
  const editorPortSetting=Number(process.env.EDITOR_PORT||(channel==='test'?9001:8808));
  if(editorPortSetting===port)throw Object.assign(Error('EDITOR_PORT_CONFLICTS_WITH_GAME_PORT'),{code:'EDITOR_PORT_CONFLICTS_WITH_GAME_PORT'});
  await seedInstance(privateDir,resolve(projectRoot,'server/private'));
  // 版本选择：显式指定 > 待确认的发布目标 > 已确认版本 > 首次启动。
  // 普通重启不会重新计算快照，所以另一个实例更新共享工作树也不会改变这里运行的版本。
  const requested=(process.env.TERMINAL_RELEASE||'').trim();
  let release;
  if(requested){
    release=await resolveRelease(projectRoot,instanceName,requested);
    if(!release)throw Object.assign(Error('RELEASE_NOT_FOUND '+requested),{code:'RELEASE_NOT_FOUND'});
  }else{
    const pending=await pendingRelease(stateDir);
    if(pending)release=await resolveRelease(projectRoot,instanceName,pending);
    if(pending&&!release)throw Object.assign(Error('RELEASE_NOT_FOUND '+pending),{code:'RELEASE_NOT_FOUND'});
    release||=await readReleaseSnapshot(projectRoot,instanceName);
    release||=await createReleaseSnapshot(projectRoot,instanceName);
  }
  process.env.STELLAR_RELEASE_DIR=release.dir;
  process.env.STELLAR_RELEASE_ID=release.buildId;
  process.env.STELLAR_PRIVATE_DIR=privateDir;
  process.env.STELLAR_PROJECT_ROOT=projectRoot;
  process.env.STELLAR_STATE_DIR=stateDir;
  process.env.TERMINAL_CHANNEL=channel;
  process.env.TERMINAL_INSTANCE=instanceName;
  process.env.PORT=String(port);
  process.env.HOST=host;
  process.env.EDITOR_PORT=String(editorPortSetting);
  const main=pathToFileURL(resolve(release.dir,'server/index-main.mjs')).href;
  await import(main);
}catch(error){
  const code=error?.code;
  console.error(code==='EADDRINUSE'?'Port already in use. Close the old preview window first.'
    :code==='INVALID_TERMINAL_CHANNEL'||code==='INVALID_TERMINAL_INSTANCE'?'TERMINAL_CHANNEL must be stable or test, and TERMINAL_INSTANCE must not switch channels.'
    :code==='EDITOR_PORT_CONFLICTS_WITH_GAME_PORT'?'EDITOR_PORT must differ from PORT.'
    :code==='RELEASE_NOT_FOUND'?'The requested release snapshot is missing. Publish it again with scripts/release-snapshot.mjs.'
    :code==='ENOENT'&&/dist/.test(error.message)?'Build output is missing. Run pnpm build first.'
    :'Local server could not start. Check the build and server/private data.');
  process.exit(1);
}
