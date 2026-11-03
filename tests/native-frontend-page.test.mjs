import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {renderAcademyFrontend,nativeFrontendHead} from '../native/academy-frontend/page.mjs';
import {bootHead,bootScreen} from '../server/boot-screen.mjs';

test('完整原学院HTML、内联样式和脚本原样保留，只接入加载和原App资源',async()=>{
  const original=await readFile(new URL('../星穹游戏终端 (1).html',import.meta.url),'utf8');
  const output=renderAcademyFrontend(original,{script:'/academy-assets/workspace.js',styles:['/academy-assets/main.css']});
  const removed=output.replace('<html data-academy-boot ','<html ').replace(nativeFrontendHead,'').replace(bootHead,'').replace(/<div id="academy-loading"[^>]*>[\s\S]*?<\/div>/,'').replace('<link rel="stylesheet" href="/academy-assets/main.css">\n<script type="module" src="/academy-assets/workspace.js"></script>\n','');
  assert.equal(removed,original.replace(/\blocalStorage\b/g,'academyStorage'));
  assert.ok(output.includes('academy-loading-ring'));
  assert.ok(output.includes('id="gate"'));
  assert.ok(output.includes('__exp_splash__'));
  assert.ok(output.includes('正在加载学院资源，请稍候…'));
  assert.ok(!output.includes('加载时间较长，请检查网络或刷新重试。'));
  assert.ok(bootScreen.includes('加载时间较长，请检查网络或刷新重试。'));
});
test('经典学院脚本也使用原生AccountStorage，不读取或写入浏览器旧资料',()=>{
  const code=nativeFrontendHead.slice('<script>'.length,-'</script>'.length);
  let writes=0;
  const native={getItem:()=> '原生账号设置',setItem:()=>{writes++;},removeItem:()=>{},getState:()=>({'interstellarPRO:layout':'1','academy:brightness':'80'})};
  const window={parent:{SillyTavern:{getContext:()=>({accountStorage:native})},academyNativeWorkspacePorts:Promise.resolve({})}};
  vm.runInNewContext(code,{window,localStorage:{getItem(){throw Error('不应访问旧库');}}});
  assert.equal(window.__ACADEMY_BACKEND__,'native');
  assert.equal(window.academyStorage.getItem('academy:master-persona:v1'),'原生账号设置');
  window.academyStorage.setItem('academy:brightness','80');assert.equal(writes,1);
  assert.equal(window.academyStorage.length,2);assert.equal(window.academyStorage.key(0),'interstellarPRO:layout');assert.equal(window.academyStorage.key(2),null);
  const standalone={};standalone.parent=standalone;
  vm.runInNewContext(code,{window:standalone});
  assert.throws(()=>standalone.academyStorage.getItem('旧数据'));
  assert.throws(()=>standalone.academyStorage.setItem('旧数据','x'));
  assert.throws(()=>standalone.academyStorage.length);
  const topLevel={__ACADEMY_NATIVE_CONTEXT__:{accountStorage:native},__ACADEMY_NATIVE_PORTS__:Promise.resolve({})};topLevel.parent=topLevel;
  vm.runInNewContext(code,{window:topLevel});
  assert.equal(topLevel.academyStorage.getItem('academy:brightness'),'原生账号设置');
});
test('拒绝缺失原前端或不安全的脚本路径，不能换成精简聊天外壳',()=>{
  assert.throws(()=>renderAcademyFrontend('<html><body>聊天</body></html>',{script:'/academy-assets/workspace.js'}));
  const original='<html lang="zh"><head></head><body id="gate"><div id="__exp_splash__"></div></body></html>';
  assert.throws(()=>renderAcademyFrontend(original,{script:'/academy-assets/../bad.js'}));
  assert.throws(()=>renderAcademyFrontend(original,{script:'https://other.test/script.js'}));
});
