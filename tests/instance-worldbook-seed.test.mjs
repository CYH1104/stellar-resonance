// 回归：新测试实例初次初始化必须拿到稳定版私有世界书的**独立副本**。
// 之前 seedInstance 只复制 editor-data.json 与 extracted-pro.json，而 loadPrivateWorldbooks
// 只读实例自己的 privateDir/worldbooks，于是新实例的私有世界书静默为空，模型拿不到这部分设定。
// 这里跑真实启动入口 server/index.mjs，只把最终加载的 main 换成不监听的结果报告器：
// 不碰真实账号库、密钥或用户数据。
import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readdir,readFile,rm,symlink,writeFile,copyFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {loadPrivateWorldbooks} from '../server/worldbooks.mjs';

const root=resolve(import.meta.dirname,'..');
const reporter=`import {readdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir=process.env.STELLAR_PRIVATE_DIR,books={};
for(const name of await readdir(resolve(dir,'worldbooks')).catch(()=>[]))books[name]=JSON.parse(await readFile(resolve(dir,'worldbooks',name),'utf8'));
console.log(JSON.stringify({channel:process.env.TERMINAL_CHANNEL,books}));
`;
const book=name=>JSON.stringify({name:'运营世界书',entries:[{content:name,key:['测试']}]});
const stableBook=(base,name)=>resolve(base,'server/private/worldbooks',name);
const instanceDir=base=>resolve(base,'server/private/instances/test');
const instanceBook=(base,name)=>resolve(instanceDir(base),'worldbooks',name);
const created=[];

async function fixture(){
  const base=await mkdtemp(resolve('.integration','instance-books-'));
  created.push(base);
  for(const file of ['index.mjs','channel.mjs','release.mjs']){await mkdir(resolve(base,'server'),{recursive:true});await copyFile(resolve(root,'server',file),resolve(base,'server',file));}
  await mkdir(resolve(base,'dist'),{recursive:true});
  await writeFile(resolve(base,'dist/index.html'),'<!doctype html><title>synthetic</title>');
  await writeFile(resolve(base,'package.json'),'{"type":"module"}');
  await writeFile(resolve(base,'server/index-main.mjs'),reporter);
  const privateDir=resolve(base,'server/private');
  await mkdir(resolve(privateDir,'worldbooks'),{recursive:true});
  await writeFile(resolve(privateDir,'editor-data.json'),'{}');
  await writeFile(resolve(privateDir,'extracted-pro.json'),'{"version":1}');
  // 密钥、账号库与发布状态一律不是实例该继承的东西。
  await writeFile(resolve(privateDir,'server.config.json'),'{"apiKey":"synthetic-decoy"}');
  await writeFile(resolve(privateDir,'accounts.db'),'synthetic-decoy');
  await writeFile(stableBook(base,'alpha.json'),book('stable-lore-alpha'));
  await writeFile(stableBook(base,'beta.json'),book('stable-lore-beta'));
  return base;
}
// 走真实入口：选实例 → seedInstance → 生成快照 → 加载 index-main.mjs。
function run(base){
  return new Promise((done,reject)=>{
    const child=spawn(process.execPath,['server/index.mjs'],{cwd:base,env:{...process.env,TERMINAL_CHANNEL:'test',TERMINAL_INSTANCE:'test',PORT:'18888'},windowsHide:true});
    let out='',err='';
    child.stdout.on('data',chunk=>out+=chunk);
    child.stderr.on('data',chunk=>err+=chunk);
    child.on('error',reject);
    child.on('close',code=>code?reject(Error(`server/index.mjs 退出码 ${code}：${err}`)):done(JSON.parse(out.trim())));
  });
}

test('a new instance is seeded with every stable private worldbook and then evolves independently',async()=>{
  const base=await fixture();
  const first=await run(base);
  assert.deepEqual(Object.keys(first.books).sort(),['alpha.json','beta.json']);
  assert.equal(first.books['alpha.json'].entries[0].content,'stable-lore-alpha');
  assert.equal(first.books['beta.json'].entries[0].content,'stable-lore-beta');
  // 实例只拿到自己的复制：后续稳定版改动不能回流。
  await writeFile(stableBook(base,'alpha.json'),book('stable-changed-alpha'));
  const second=await run(base);
  assert.equal(second.books['alpha.json'].entries[0].content,'stable-lore-alpha');
  // 实例里的改动同样影响不到稳定版，也不会被下一次启动覆盖回去。
  await writeFile(instanceBook(base,'beta.json'),book('instance-owned-beta'));
  const third=await run(base);
  assert.equal(third.books['beta.json'].entries[0].content,'instance-owned-beta');
  assert.equal(JSON.parse(await readFile(stableBook(base,'beta.json'))).entries[0].content,'stable-lore-beta');
  // 世界设定真的能被服务加载，不再静默缺失。
  const books=await loadPrivateWorldbooks(base,instanceDir(base));
  assert.equal(books.length,2);
  // 密钥、账号库都不是新实例该继承的东西，私有目录里只有这三类运行资料。
  assert.deepEqual((await readdir(instanceDir(base))).sort(),['editor-data.json','extracted-pro.json','worldbooks']);
});

test('a book already edited in the target instance is never overwritten by the stable copy',async()=>{
  const base=await fixture();
  await mkdir(resolve(instanceDir(base),'worldbooks'),{recursive:true});
  await writeFile(instanceBook(base,'alpha.json'),book('目标实例改过的版本'));
  const report=await run(base);
  assert.equal(report.books['alpha.json'].entries[0].content,'目标实例改过的版本');
  assert.equal(report.books['beta.json'].entries[0].content,'stable-lore-beta');
});

test('a symlinked entry never pulls files from outside the private directory into the instance',async()=>{
  const base=await fixture();
  const outside=await mkdtemp(resolve('.integration','instance-books-outside-'));
  created.push(outside);
  await writeFile(resolve(outside,'leak.json'),book('私有目录之外的内容'));
  const link=stableBook(base,'gamma.json');
  try{await symlink(resolve(outside,'leak.json'),link,'file');}
  // Windows 无开发者模式时建不了文件链接：目录联接在 readdir 里同样是符号链接条目。
  catch(error){if(error.code!=='EPERM')throw error;await symlink(outside,link,'junction');}
  const report=await run(base);
  assert.equal(report.books['gamma.json'],undefined,'外部内容不能被当作世界书复制进来');
  assert.deepEqual((await readdir(resolve(instanceDir(base),'worldbooks'))).sort(),['alpha.json','beta.json']);
});

after(async()=>{for(const base of created)await rm(base,{recursive:true,force:true}).catch(()=>{});});
