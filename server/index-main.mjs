// 真正的启动逻辑：从**自己所在的发布快照**加载页面、静态资源与后端模块。
// projectRoot 由本文件位置推导，所以运行中的实例永远加载被固定的那一版代码。
import {createEditorServer} from './editor.mjs';
import {loadCard} from './load-card.mjs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLocalServer} from './app.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {instanceDescriptor} from './channel.mjs';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const releaseDir=resolve(process.env.STELLAR_RELEASE_DIR||projectRoot);
// 身份按真实项目根，而不是快照目录：健康检查与部署脚本据此认出同一个实例。
const identityRoot=resolve(process.env.STELLAR_PROJECT_ROOT||projectRoot);
const releaseId=process.env.STELLAR_RELEASE_ID||releaseDir.split(/[\\/]/).pop()||'';
const channel=process.env.TERMINAL_CHANNEL||'stable';
const instanceName=process.env.TERMINAL_INSTANCE||channel;
// 状态与私有数据不属于发布内容：重启、回滚都不能覆盖存档和账号。
const stateDir=resolve(process.env.STELLAR_STATE_DIR||resolve(projectRoot,'server/.local'));
const privateDir=resolve(process.env.STELLAR_PRIVATE_DIR||resolve(projectRoot,'server/private'));
const host=process.env.HOST||'127.0.0.1';
let port=Number(process.env.PORT||5173);
const editorPortSetting=Number(process.env.EDITOR_PORT||(channel==='test'?9001:8808));
const identity=instanceDescriptor({channel,instanceName});
try{
  const app=await createLocalServer({projectRoot,port,host,publicOrigin:process.env.PUBLIC_ORIGIN||'',authRequired:process.env.AUTH_REQUIRED==='1'||host!=='127.0.0.1',editorPort:editorPortSetting,channel,instanceName,privateDir,releaseDir,identityRoot});
  const editor=createEditorServer({projectRoot:releaseDir,card:await loadCard(releaseDir,privateDir),port:editorPortSetting,dataDir:privateDir,gameUrl:()=> (process.env.PUBLIC_ORIGIN?new URL(process.env.PUBLIC_ORIGIN).origin:`http://127.0.0.1:${port}`)+'/terminal'});
  const editorPort=await editor.start();
  port=await app.start();
  console.log('Private editor ready: http://127.0.0.1:'+editorPort+'/');
  const response=await fetch(`http://127.0.0.1:${port}/api/health`);const health=await response.json();
  await mkdir(stateDir,{recursive:true});
  await writeFile(resolve(stateDir,'runtime.json'),JSON.stringify({...health,port,editorPort,stateDir,privateDir,releaseDir,releaseId,editorCookie:identity.editorCookie}));
  console.log(`Local server ready (${channel}): http://127.0.0.1:${port}/\nRelease ${releaseId} · State ${stateDir}\nServer-held world card. Configure a model in Settings to generate stories. Private files are not served.`);
}catch(error){console.error(error.code==='EADDRINUSE'?'Port already in use. Close the old preview window first.':'Local server could not start. Check the build and server/private data.');process.exit(1);}
