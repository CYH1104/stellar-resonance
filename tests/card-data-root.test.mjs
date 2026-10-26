// 回归：世界卡与世界书属于「用户数据」，必须按实例私有目录读取。
// 从发布快照启动时 projectRoot 指向快照目录，快照里刻意不含 server/private；
// 若把快照目录当成数据根，旧卡会被示例卡顶掉（地点、院系、世界设定全部退化）。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createLocalServer} from '../server/app.mjs';
import {loadCard} from '../server/load-card.mjs';
import {loadPrivateWorldbooks} from '../server/worldbooks.mjs';

const realRoot=resolve(import.meta.dirname,'..');
const character=(id,name,no)=>({id,name,no,title:'测试角色',str:'无',shos:'无',intro:`${name}的简介。`,quote:'……'});
const synthetic={
 version:1,
 source:{fileName:'synthetic.json',sha256:'a'.repeat(64)},
 world:{name:'合成世界',greeting:['**“合成开场。”**'],departments:[{name:'甲系'},{name:'乙系'},{name:'丙系'},{name:'丁系'}],sourceText:{name:'合成世界'}},
 characters:[character('c-1','测试甲','01'),character('c-2','测试乙','02'),character('c-3','测试丙','03')],
 places:[{id:'p-1',name:'地点一',area:'甲区',px:1,py:1},{id:'p-2',name:'地点二',area:'乙区',px:2,py:2},{id:'p-3',name:'地点三',area:'丙区',px:3,py:3}],
 eventPool:[]
};
const demoPlaces=2;

async function fixture(){
 const base=await mkdtemp(resolve(tmpdir(),'stellar-card-root-'));
 // 代码根：模拟发布快照——有 dist 与示例资源，但**没有** server/private。
 const code=resolve(base,'release');
 await mkdir(resolve(code,'dist'),{recursive:true});
 await writeFile(resolve(code,'dist/index.html'),'<!doctype html><title>test</title>');
 await cp(resolve(realRoot,'server/example'),resolve(code,'server/example'),{recursive:true});
 // 内置地点目录是随代码发布的资源，会覆盖编辑器的默认地点；这里去掉它，
 // 让地图数据只能来自实例私有目录，测试才验得到「数据根」这一件事。
 await rm(resolve(code,'server/example/academy-places.json'),{force:true});
 // 数据根：真实实例的私有目录，只放这张合成卡。
 const privateDir=resolve(base,'data');
 await mkdir(privateDir,{recursive:true});
 await writeFile(resolve(privateDir,'extracted-pro.json'),JSON.stringify(synthetic));
 return {base,code,privateDir};
}

test('loadCard reads the data directory, not the code root',async()=>{
 const f=await fixture();
 try{
  const card=await loadCard(f.code,resolve(f.privateDir));
  assert.equal(card.places.length,3);
  assert.equal(card.world.departments.length,4);
  assert.deepEqual(card.characters.map(c=>c.name),['测试甲','测试乙','测试丙']);
 }finally{await rm(f.base,{recursive:true,force:true});}
});

test('without a data directory the code root falls back to the demo card',async()=>{
 const f=await fixture();
 try{
  const card=await loadCard(f.code);
  assert.equal(card.places.length,demoPlaces);
 }finally{await rm(f.base,{recursive:true,force:true});}
});

test('private worldbooks are read from the data directory',async()=>{
 const f=await fixture();
 try{
  await mkdir(resolve(f.privateDir,'worldbooks'),{recursive:true});
  await writeFile(resolve(f.privateDir,'worldbooks','basic.json'),JSON.stringify({name:'运营世界书',entries:[{content:'只能在私有目录里找到的设定。',key:['测试']}]}));
  const books=await loadPrivateWorldbooks(f.code,resolve(f.privateDir));
  assert.equal(books.length,1);
  assert.deepEqual(await loadPrivateWorldbooks(f.code),[]);
 }finally{await rm(f.base,{recursive:true,force:true});}
});

test('a server started from a release snapshot still serves the real world data',async()=>{
 const f=await fixture();
 let app;
 try{
  app=await createLocalServer({projectRoot:f.code,releaseDir:f.code,privateDir:f.privateDir,identityRoot:f.code,channel:'stable',instanceName:'stable',editorPort:0,port:0});
  const origin=`http://127.0.0.1:${await app.start()}`;
  const bootstrap=await (await fetch(origin+'/api/bootstrap')).json();
  assert.equal(bootstrap.counts.places,3);
  assert.equal(bootstrap.counts.departments,4);
  assert.deepEqual(bootstrap.places.map(p=>p.name),['地点一','地点二','地点三']);
 }finally{
  if(app){app.server.closeAllConnections();await new Promise(done=>app.server.close(done));}
  await rm(f.base,{recursive:true,force:true});
 }
});
