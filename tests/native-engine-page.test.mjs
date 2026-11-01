import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nativeEnginePage} from '../native/academy-frontend/enginePage.mjs';
test('native tabs remain local and cannot reload a second native application',()=>{
  const original=readFileSync(new URL('../native/SillyTavern/public/index.html',import.meta.url),'utf8');
  const html=nativeEnginePage(original),base=new URL('/native-engine/','http://localhost:8088');
  assert.match(html,/<base href="\/native-engine\/">/);
  const anchors=[...html.matchAll(/href="(#[^"]+)"/g)];assert.ok(anchors.length>0);
  for(const [,anchor] of anchors)assert.equal(new URL(anchor,base).pathname,base.pathname);
  assert.match(html,/src="\/script.js"/);assert.doesNotMatch(html,/src="(?:scripts|lib)\//);
  assert.match(original,/<base href="\/">/);
});
