const {createRequire}=require('node:module'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=process.env.PLAYWRIGHT_MODULE_ROOT?createRequire(path.join(process.env.PLAYWRIGHT_MODULE_ROOT,'package.json'))('playwright'):require('playwright');
const base=process.env.TABLE_TEST_URL||'http://127.0.0.1:5199',out=process.env.TABLE_TEST_OUTPUT||'.integration/card-fixes-20261126';fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});const results=[];
try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function open(game){await page.goto(base+'/tests/browser/card-tables/'+game+'.html');await page.getByRole('button',{name:'打开个人终端',exact:true}).click();await page.waitForFunction(()=>window.fixture.find('PersonalTerminal'));}
 async function visibleCards(selector){const bad=await page.locator(selector).evaluateAll(els=>els.flatMap(e=>{const r=e.getBoundingClientRect();for(let a=e.parentElement;a;a=a.parentElement){const s=getComputedStyle(a),q=a.getBoundingClientRect();if((/hidden|clip|auto|scroll/.test(s.overflowY)&&(r.top<q.top-1||r.bottom>q.bottom+1))||(/hidden|clip|auto|scroll/.test(s.overflowX)&&(r.left<q.left-1||r.right>q.right+1)))return [{selector:e.className,rect:[r.left,r.top,r.right,r.bottom],parent:a.className,bounds:[q.left,q.top,q.right,q.bottom],overflow:[s.overflowX,s.overflowY]}];}return [];}));if(bad.length){await page.screenshot({path:path.join(out,'failure.png')});console.log('Failure viewport',page.viewportSize());}assert.deepEqual(bad,[],selector+' clipped');}
 await page.setViewportSize({width:844,height:390});await open('mahjong');
 for(const drawn of [false,true]){
  await page.evaluate(d=>window.fixture.duplicateScene(d),drawn);const tiles=page.locator('.mj-hand-tile').filter({has:page.locator('img')});const label=drawn?'东':'1万';const copies=page.getByRole('button',{name:label,exact:true});assert.equal(await copies.count(),2);
  for(let i=0;i<2;i++){await copies.nth(i).click();assert.equal(await page.locator('.mj-hand-tile.selected').count(),1);assert.equal(await copies.nth(i).getAttribute('aria-pressed'),'true');}
  await page.locator('.mj-primary').click();await page.waitForFunction(()=>window.fixture.getRound().steps.length>0);
  const discard=await page.evaluate(()=>window.fixture.getRound().steps[0].choices[0].dapai);assert.equal(discard,drawn?'z1_':'m1');
  results.push({case:drawn?'drawn duplicate':'concealed duplicate',selected:1,discard});
 }
 for(const game of ['mahjong','landlord'])for(const size of [{width:844,height:390},{width:780,height:360},{width:390,height:844},{width:360,height:780},{width:320,height:700},{width:1000,height:650}]){
  await page.setViewportSize(size);await open(game);
  for(const scene of ['settlement','playing','final']){
   await page.evaluate(s=>window.fixture.scene(s),scene);await page.waitForTimeout(80);
   assert.equal(await page.locator('.terminal-device-landscape').count(),scene==='final'?0:1);
   if(scene==='playing'){
    await visibleCards(game==='mahjong'?'.mj-hand-tile':'.hand-card');
    if(game==='mahjong'){assert.equal(await page.locator('.mj-hand-tile.selected').count(),0);await page.getByRole('button',{name:'提示',exact:true}).click();assert.equal(await page.locator('.mj-hand-tile.selected').count(),1);}
   }
   if(scene==='settlement'){
    const button=page.getByRole('button',{name:'下一局',exact:true});await button.scrollIntoViewIfNeeded();assert(await button.isVisible());
    assert(await button.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'next-round button blocked');
   }
   if(size.width===390||size.width===844)await page.screenshot({path:path.join(out,`${game}-${size.width}-${scene}.png`)});
   results.push({game,size,scene});
  }
  if(game==='landlord'){
   await page.evaluate(async()=>{await window.fixture.playing();await window.fixture.audioMove('player',{kind:'play',cards:['S-3','S-4','S-5','S-6','S-7','S-8','S-9','S-10','S-J','S-Q','S-K','S-A']});await window.fixture.audioMove('a',{kind:'pass'});await window.fixture.audioMove('b',{kind:'pass'});});
   assert(await page.getByText('新一轮，可自由领牌',{exact:true}).isVisible());await visibleCards('.mini-card.played');await visibleCards('.hand-card');
   await page.screenshot({path:path.join(out,`landlord-${size.width}-trick.png`)});results.push({game,size,scene:'new trick',fullCards:12});
  }
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));console.log('PASS '+results.length+' card selection/layout scenarios, no page errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
