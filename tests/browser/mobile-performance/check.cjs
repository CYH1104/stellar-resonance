// Run against the actual academy shell, including the backgrounds behind the workspace.
// PLAYWRIGHT_MODULE may point at an existing Playwright installation; no paid APIs are used.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const html=await fs.readFile(process.env.TERMINAL_TEMPLATE||path.resolve('星穹游戏终端 (1).html'),'utf8');
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});const errors=[],checks=[];
 async function page(mobile){const p=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>r.request().url().endsWith('/shell.html')?r.fulfill({contentType:'text/html',body:html}):r.fulfill({json:{}}));await p.addInitScript(()=>{window.draws={};const clear=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){const k=this.canvas.className;window.draws[k]=(window.draws[k]||0)+1;return clear.apply(this,args);};});await p.goto('http://localhost/shell.html');await p.waitForSelector('#enterRegistration');await p.waitForTimeout(500);return p;}
 async function counts(p){await p.evaluate(()=>window.draws={});await p.waitForTimeout(1200);return p.evaluate(()=>window.draws);}
 const sum=draws=>Object.values(draws).reduce((a,b)=>a+b,0),visible=draws=>Object.entries(draws).filter(([,n])=>n>0);
 try{
  const p=await page(true);assert.ok(await p.locator('.ah-waves-gate').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some(n=>n!==0)),'phone still frame is drawn');assert.equal(sum(await counts(p)),0,'phone gate must not keep repainting');
  await p.locator('#enterRegistration').click();await p.waitForTimeout(200);assert.equal(sum(await counts(p)),0,'phone home must not keep repainting');checks.push('phone gate and home retain still backgrounds with no idle canvas redraws');
  await p.setViewportSize({width:844,height:390});await p.waitForTimeout(200);assert.equal(sum(await counts(p)),0,'landscape phone is still low power');checks.push('phone rotation remains static');await p.close();
  const d=await page(false);let frames=await counts(d);assert.equal(visible(frames).length,1);assert.match(visible(frames)[0][0],/gate/);assert.ok(sum(frames)>5&&sum(frames)<45,'desktop draws at a bounded frame rate');
  await d.locator('#enterRegistration').click();await d.waitForTimeout(200);frames=await counts(d);assert.equal(visible(frames).length,1);assert.match(visible(frames)[0][0],/home/);checks.push('desktop runs only the exposed canvas, below 30fps');
  await d.evaluate(()=>document.querySelector('#academy-workspace').hidden=false);await d.waitForTimeout(200);assert.equal(sum(await counts(d)),0,'covered backgrounds pause');
  await d.evaluate(()=>document.querySelector('#academy-workspace').hidden=true);await d.waitForTimeout(200);assert.ok(sum(await counts(d))>5);checks.push('opening workspace stops both backgrounds and returning home resumes');
  await d.emulateMedia({reducedMotion:'reduce'});await d.waitForTimeout(200);assert.equal(sum(await counts(d)),0);await d.emulateMedia({reducedMotion:'no-preference'});await d.waitForTimeout(200);assert.ok(sum(await counts(d))>5);checks.push('reduced motion changes stop and resume the same scheduler');
  await d.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(sum(await counts(d)),0);
  await d.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await d.waitForTimeout(200);assert.ok(sum(await counts(d))>5);checks.push('visibility lifecycle cancels and resumes timers');assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
