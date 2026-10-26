// 实例发布快照：同一份源码可以共用，但每个运行实例必须固定自己的发布版本。
// 共享工作树里的 dist 与 server/src 会被任一实例的 reset + build 覆盖，所以“准备发布”
// 把这些运行期真正加载的内容（页面、静态资源、后端代码、运行依赖）复制成不可变目录，
// 服务只从该目录加载。两个动作刻意分开：
//   prepareRelease —— 只生成快照，不动 current.json（发布方还没证明它能启动）
//   commitRelease  —— 健康检查通过后，才把实例的已确认版本推进到它
import {createHash,randomBytes} from 'node:crypto';
import {copyFile,cp,mkdir,readFile,readdir,readlink,rename,rm,stat,symlink,unlink,writeFile} from 'node:fs/promises';
import {basename,dirname,join,relative,resolve,sep} from 'node:path';

// 运行期从项目根读取的全部内容。少了代码或依赖，普通重启仍会跟着共享工作树漂移。
export const RUNTIME_PATHS=['dist','src','server','星穹游戏终端 (1).html','package.json'];
const EXCLUDED=[/^server[/\\]\.local([/\\]|$)/,/^server[/\\]private([/\\]|$)/,/^server[/\\]node_modules([/\\]|$)/,/^server[/\\]\.cache([/\\]|$)/];
const LOCKFILES=['pnpm-lock.yaml','package-lock.json','yarn.lock'];
const KEEP_SNAPSHOTS=3;
const posix=value=>value.split(sep).join('/');
const skipped=rel=>EXCLUDED.some(pattern=>pattern.test(rel));

export function releaseBase(projectRoot,instanceName){return resolve(projectRoot,'server/.local/releases',instanceName);}
export function depsBase(projectRoot){return resolve(projectRoot,'server/.local/deps');}

async function isDirectory(path){try{return (await stat(path)).isDirectory();}catch{return false;}}
async function readJson(path){try{return JSON.parse(await readFile(path,'utf8'));}catch{return undefined;}}

async function listFiles(root,base,out){
  let entries;
  try{entries=await readdir(root,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return out;throw e;}
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
    const full=join(root,entry.name);
    if(skipped(posix(relative(base,full))))continue;
    if(entry.isDirectory())await listFiles(full,base,out);
    else if(entry.isFile())out.push(full);
  }
  return out;
}

/** 依赖标识：lockfile 内容一致就复用同一份依赖快照，变了就必须重新固定。 */
export async function depsId(projectRoot){
  for(const name of LOCKFILES){
    const file=resolve(projectRoot,name);
    try{const content=await readFile(file);return createHash('sha256').update(name).update('\0').update(content).digest('hex').slice(0,16);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  return undefined;
}

/**
 * 把当前 node_modules 复制成按 lockfile 内容寻址的不可变依赖目录。
 * 复制（而不是软链）是刻意的：软链仍然指向共享工作树，pnpm install 会就地改掉它。
 */
export async function ensureDepsSnapshot(projectRoot){
  const id=await depsId(projectRoot);if(!id)return undefined;
  const source=resolve(projectRoot,'node_modules');
  if(!await isDirectory(source))return undefined;
  const target=resolve(depsBase(projectRoot),id);
  if(await isDirectory(target))return id;
  await mkdir(depsBase(projectRoot),{recursive:true});
  const temporary=`${target}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
  try{
    try{await cp(source,temporary,{recursive:true,verbatimSymlinks:true});}
    catch{await rm(temporary,{recursive:true,force:true});await cp(source,temporary,{recursive:true,dereference:true});}
    await rename(temporary,target);
  }catch(e){await rm(temporary,{recursive:true,force:true});throw e;}
  return id;
}

/** 内容哈希：同样的页面、代码和依赖永远解析到同一个快照。 */
export async function releaseBuildId(projectRoot){
  const hash=createHash('sha256'),prefix=projectRoot+sep;
  for(const rel of RUNTIME_PATHS){
    const full=resolve(projectRoot,rel),info=await stat(full).catch(()=>null);
    if(!info)continue;
    const files=info.isDirectory()?await listFiles(full,projectRoot,[]):[full];
    for(const file of files){
      hash.update(posix(relative(prefix,file))).update('\0');
      hash.update(await readFile(file)).update('\0');
    }
  }
  const id=await depsId(projectRoot);
  if(id)hash.update('deps\0').update(id);
  return hash.digest('hex').slice(0,16);
}

async function linkDeps(projectRoot,targetDir,id){
  if(!id)return;
  const link=join(targetDir,'node_modules');
  if(await isDirectory(link).catch(()=>false))return;
  const absolute=resolve(depsBase(projectRoot),id);
  const relativeTarget=relative(targetDir,absolute);
  try{await symlink(relativeTarget,link,'dir');}
  catch{await symlink(absolute,link,'junction');}
}

async function writeAtomic(path,value){
  await writeFile(`${path}.tmp`,value);
  await rename(`${path}.tmp`,path);
}

// 快照目录位于 server/.local 之内，所以不能用 fs.cp 直接复制 server（会命中“复制进自身子目录”），
// 必须自己遍历并在进入 server/.local、server/private 之前就跳过。
async function copyTree(projectRoot,source,destination){
  const info=await stat(source);
  if(!info.isDirectory()){await mkdir(dirname(destination),{recursive:true});await copyFile(source,destination);return;}
  await mkdir(destination,{recursive:true});
  for(const entry of await readdir(source,{withFileTypes:true})){
    const from=join(source,entry.name),to=join(destination,entry.name);
    if(skipped(posix(relative(projectRoot,from))))continue;
    if(entry.isSymbolicLink()){
      const link=await readlink(from).catch(()=>'');
      if(!link)continue;
      try{await symlink(link,to);}catch{/* 已有同名链接或平台不支持时保持原状 */}
      continue;
    }
    if(entry.isDirectory())await copyTree(projectRoot,from,to);
    else if(entry.isFile())await copyFile(from,to);
  }
}

/**
 * 生成快照但**不**推进已确认版本。发布方必须先让服务用这个快照启动并通过健康检查，
 * 再调用 commitRelease；启动失败时旧指针与旧快照都还在，可以直接回滚。
 */
export async function prepareRelease(projectRoot,instanceName,{buildId=''}={}){
  const id=buildId||await releaseBuildId(projectRoot);
  const base=releaseBase(projectRoot,instanceName),target=join(base,id);
  const deps=await ensureDepsSnapshot(projectRoot);
  if(!await isDirectory(target)){
    await mkdir(base,{recursive:true});
    const temporary=join(base,`.tmp-${process.pid}-${randomBytes(6).toString('hex')}`);
    try{
      await mkdir(temporary,{recursive:true});
      for(const rel of RUNTIME_PATHS){
        const source=resolve(projectRoot,rel),info=await stat(source).catch(()=>null);
        if(!info)continue;
        await copyTree(projectRoot,source,join(temporary,rel));
      }
      await linkDeps(projectRoot,temporary,deps);
      // Windows 上并发准备同一个 buildId 时 rename 会以 EPERM 拒绝；重试后复用已存在的快照。
      let placed=false;
      for(let attempt=0;attempt<6&&!placed;attempt++){
        try{await rename(temporary,target);placed=true;}
        catch(error){
          if(await isDirectory(target)){await rm(temporary,{recursive:true,force:true});placed=true;break;}
          if(attempt===5)throw error;
          await new Promise(done=>setTimeout(done,50));
        }
      }
    }catch(e){await rm(temporary,{recursive:true,force:true});throw e;}
  }else if(deps&&!await isDirectory(join(target,'node_modules')).catch(()=>false)){
    await linkDeps(projectRoot,target,deps);
  }
  const record={buildId:id,instanceName,depsId:deps||null,preparedAt:new Date().toISOString()};
  await writeAtomic(join(base,`${id}.json`),JSON.stringify(record));
  await pruneReleases(projectRoot,instanceName,{protect:[id]});
  return {...record,dir:target};
}

/** 只有健康检查通过后才会走到这里：把实例的已确认版本推进到 buildId。 */
export async function commitRelease(projectRoot,instanceName,buildId){
  const base=releaseBase(projectRoot,instanceName),target=join(base,buildId);
  if(!await isDirectory(target))throw Object.assign(Error('RELEASE_SNAPSHOT_MISSING'),{code:'RELEASE_SNAPSHOT_MISSING'});
  const record=(await readJson(join(base,`${buildId}.json`)))||{buildId,instanceName};
  await writeAtomic(join(base,'current.json'),JSON.stringify({...record,buildId,instanceName,committedAt:new Date().toISOString()}));
  return {...record,buildId,instanceName,dir:target};
}

/** 兼容入口：准备并立即确认（首次启动与显式发布使用）。 */
export async function createReleaseSnapshot(projectRoot,instanceName,options={}){
  const prepared=await prepareRelease(projectRoot,instanceName,options);
  return commitRelease(projectRoot,instanceName,prepared.buildId);
}

/** 读该实例已确认的发布版本，不碰共享构建产物。 */
export async function readReleaseSnapshot(projectRoot,instanceName){
  const base=releaseBase(projectRoot,instanceName);
  const record=await readJson(join(base,'current.json'));
  if(!record?.buildId)return undefined;
  const dir=join(base,record.buildId);
  if(!await isDirectory(dir))return undefined;
  return {...record,dir};
}

/** 解析一个明确指定的版本（显式发布用）：不存在就报错，绝不悄悄换成共享工作树。 */
export async function resolveRelease(projectRoot,instanceName,buildId){
  const base=releaseBase(projectRoot,instanceName),dir=join(base,buildId);
  if(!buildId||!/^[a-f0-9]{8,64}$/.test(buildId)||!await isDirectory(dir))return undefined;
  const record=(await readJson(join(base,`${buildId}.json`)))||{buildId,instanceName};
  return {...record,buildId,instanceName,dir};
}

function alive(pid){try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}}

/** 运行中的实例登记自己的快照，GC 据此保护“正在跑”和“可回滚”的版本。 */
export async function markReleaseActive(releaseDir){
  const target=resolve(releaseDir),instanceDir=dirname(target),base=dirname(instanceDir);
  if(basename(base)!=='releases')return ()=>{};
  const recordDir=join(instanceDir,'active');
  const file=join(recordDir,`${process.pid}-${basename(target)}.json`);
  try{
    await mkdir(recordDir,{recursive:true});
    await writeFile(file,JSON.stringify({pid:process.pid,buildId:basename(target),startedAt:new Date().toISOString()}));
  }catch{return ()=>{};}
  return async()=>{await unlink(file).catch(()=>{});};
}

async function activeBuildIds(instanceDir){
  const recordDir=join(instanceDir,'active'),out=[];
  let entries=[];
  try{entries=await readdir(recordDir,{withFileTypes:true});}catch{return out;}
  for(const entry of entries){
    if(!entry.isFile()||!entry.name.endsWith('.json'))continue;
    const file=join(recordDir,entry.name),record=await readJson(file);
    if(!record||!Number.isSafeInteger(record.pid)||!alive(record.pid)){await unlink(file).catch(()=>{});continue;}
    out.push(record.buildId);
  }
  return out;
}

/**
 * 清理旧快照：已确认版本、正在运行版本、刚准备的版本永远保留，其余只按时间留少量回滚点。
 * 不能只按“刚创建的那个 + 最近两个目录”判断——旧进程可能还在服务它自己的快照。
 */
async function pruneReleases(projectRoot,instanceName,{protect=[]}={}){
  const base=releaseBase(projectRoot,instanceName);
  const kept=new Set(protect.filter(Boolean));
  const pointer=await readJson(join(base,'current.json'));
  if(pointer?.buildId)kept.add(pointer.buildId);
  for(const id of await activeBuildIds(base))kept.add(id);
  let entries=[];
  try{entries=await readdir(base,{withFileTypes:true});}catch{return;}
  const candidates=[];
  for(const entry of entries){
    if(!entry.isDirectory()||entry.name.startsWith('.tmp-')||entry.name==='active'||kept.has(entry.name))continue;
    const full=join(base,entry.name),info=await stat(full).catch(()=>null);
    if(info)candidates.push({id:entry.name,dir:full,at:info.mtimeMs});
  }
  candidates.sort((a,b)=>b.at-a.at);
  for(const stale of candidates.slice(KEEP_SNAPSHOTS)){
    await rm(stale.dir,{recursive:true,force:true}).catch(()=>{});
    await unlink(join(base,`${stale.id}.json`)).catch(()=>{});
  }
}
