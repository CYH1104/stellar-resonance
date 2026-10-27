// Supply an existing Playwright installation; do not install dependencies in production.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
if(!process.env.PLAYWRIGHT_MODULE)throw Error('Set PLAYWRIGHT_MODULE to an installed playwright-core/index.mjs');
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
const errors=[],requests=[],apiFailures=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)apiFailures.push({path:new URL(r.url()).pathname,status:r.status()});});page.on('request',r=>{if(r.url().includes('/api/generate'))requests.push(r.postDataJSON());});
const output=resolve(project,'.integration/native-step2');await mkdir(output,{recursive:true});
try{
 await page.goto('http://127.0.0.1:8833/');await page.waitForSelector('.opening-menu');
 await page.evaluate(async()=>{
  const {newSession,defaults}=await import('/src/domain/story.ts');const {IndexedDbRepository}=await import('/src/storage/repository.ts');
  const bootstrap=await fetch('/api/bootstrap').then(r=>r.json());
  const s=newSession('原生链路验证',{name:'合成玩家',identity:'访客',appearance:'',personality:'',background:''},'本地合成开场');s.id='native-step2';s.sourceDataset=bootstrap.dataset;
  const p=defaults();p.mode='server';p.vectorEnabled=false;p.stateEnabled=false;p.suggestionsEnabled=false;p.terminalEnabled=false;p.theaters=p.theaters.map(t=>({...t,enabled:false}));
  for(const profile of p.profiles){profile.apiBaseUrl='https://native-verification.invalid/v1';profile.model='native-fixture-model';}
  const repo=new IndexedDbRepository();await repo.read();await repo.write({version:1,sessions:[s],preferences:p});
  await repo.writeApiCredentials({version:1,remember:true,keys:{main:'synthetic-only',aux:'synthetic-only',embed:'synthetic-only'},confirmed:{main:{apiBaseUrl:'https://native-verification.invalid/v1',model:'native-fixture-model'},aux:{apiBaseUrl:'https://native-verification.invalid/v1',model:'native-fixture-model'}}});
 });
 await page.reload();await page.waitForSelector('.opening-menu');await page.getByRole('button',{name:'继续游戏',exact:true}).click();await page.getByRole('button',{name:'继续游戏',exact:true}).click();
 await page.waitForSelector('.composer textarea');await page.getByRole('textbox',{name:'本轮行动'}).fill('向接待员询问训练安排。');await page.getByRole('button',{name:'发送',exact:true}).click();
 await page.getByText('原生链路验证成功。',{exact:false}).first().waitFor({timeout:30000});
 await page.waitForFunction(()=>!document.querySelector('.composer button[type="submit"]')?.textContent?.includes('停止'));
 await page.waitForTimeout(1500);await page.screenshot({path:resolve(output,'native-story-desktop.png'),fullPage:true});
 const persisted=await page.evaluate(async()=>{const {IndexedDbRepository}=await import('/src/storage/repository.ts');const r=new IndexedDbRepository();const s=await r.read();return s.sessions[0].turns[0].variants[0];});
 assert.match(persisted.text,/原生链路验证成功/);assert.equal(persisted.status,'complete');
 await page.reload();await page.waitForSelector('.opening-menu');await page.getByRole('button',{name:'继续游戏',exact:true}).click();await page.getByRole('button',{name:'继续游戏',exact:true}).click();await page.getByText('原生链路验证成功。',{exact:false}).first().waitFor();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(output,'native-story-mobile.png'),fullPage:true});
 const trace=JSON.parse(await readFile(resolve(output,'trace.json'),'utf8'));
 assert.ok(trace.nativeRequests.length>=1);assert.ok(trace.fixtureRequests.length>=1);assert.ok(trace.fixtureRequests.every(r=>r.nativeAuthorization));assert.equal(errors.length,0);assert.equal(apiFailures.length,0);
 const report={passed:true,source:'current Vue App -> real academy server -> real pinned native SillyTavern server -> loopback synthetic OpenAI fixture',browserApiMocking:false,realPaidModel:false,privateCardUsed:false,persistedStatus:persisted.status,nativeRequests:trace.nativeRequests.length,fixtureRequests:trace.fixtureRequests.length,fixtureKinds:trace.fixtureRequests.map(r=>r.kind),generationRequests:requests.length,errors,apiFailures,scope:'transport spike only; native frontend prompt compilation/helper execution NOT validated'};
 await writeFile(resolve(output,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:resolve(output,'failure.png'),fullPage:true});await writeFile(resolve(output,'failure.json'),JSON.stringify({message:error.message,errors,text:(await page.locator('body').innerText()).slice(0,12000)},null,2));throw error;}finally{await context.close();await browser.close();}
