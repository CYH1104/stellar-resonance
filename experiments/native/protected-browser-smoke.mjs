import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),out=resolve(root,'.integration/native-protected');
if(!process.env.PLAYWRIGHT_MODULE)throw Error('PLAYWRIGHT_MODULE_REQUIRED');const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});const context=await browser.newContext(),page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8851/');
 const result=await page.evaluate(async()=>{
  const session=await fetch('/api/session').then(r=>r.json());
  const post=(path,body,token=session.csrf)=>fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify(body)});
  const card=await fetch('/api/public-card').then(r=>r.json());
  const before=await fetch('/api/preset').then(r=>r.json());
  const patch=await post('/api/preset',{changes:{temperature:0.2,prompts:[{identifier:'protected-example',content:'EDITED_PUBLIC_ENTRY'}]}});const after=await patch.json();
  const attacks=[];for(const extra of [{include_reasoning:true},{show_thoughts:true},{messages:[]},{script:'fetch("/api/export")'},{privateCard:true},{key:'synthetic'}]){const r=await post('/api/generate',{input:'询问安排',...extra});attacks.push(r.status);}
  const csrf=await post('/api/generate',{input:'询问安排'},'wrong-token');
  const blocked=[];for(const path of ['/api/characters/all','/api/worldinfo/get','/api/compile','/api/export','/api/secrets/read','/experiments/native/private-worker.mjs']){const r=await fetch(path);blocked.push({path,status:r.status,body:await r.text()});}
  let directNativeBlocked=false;try{await fetch('http://127.0.0.1:8850/api/characters/all',{method:'POST',body:'{}'});}catch{directNativeBlocked=true;}
  const reply=await post('/api/generate',{input:'询问训练安排。'});const text=await reply.text();
  document.querySelector('#reply').textContent=text;
  return {card,before,after,attacks,csrf:csrf.status,blocked,directNativeBlocked,replyStatus:reply.status,text,helperExposed:typeof globalThis.TavernHelper!=='undefined',storage:JSON.stringify({...localStorage})};
 });
 const checks=[];const check=(name,value)=>{checks.push({name,passed:!!value});assert.ok(value,name);};
 check('public card contains public fields only',JSON.stringify(Object.keys(result.card).sort())===JSON.stringify(['introduction','name']));
 const prompt=result.after.preset.prompts.find(p=>p.identifier==='protected-example');
 check('raw prompt edit preserves native trigger and future fields',prompt.content==='EDITED_PUBLIC_ENTRY'&&JSON.stringify(prompt.injection_trigger)==='["normal"]'&&prompt.custom_future_field.keep===true);
 check('raw settings edit preserves unknown extensions',result.after.preset.temperature===0.2&&result.after.preset.extensions.future_unknown.value==='keep-me');
 check('imported reasoning setting is locked off in effective view',result.before.preset.show_thoughts===false&&result.after.preset.show_thoughts===false);
 check('public override/script/key/messages attempts rejected',result.attacks.every(v=>v===400));
 check('invalid CSRF token rejected',result.csrf===403);
 check('private/native/export/source routes not exposed',result.blocked.every(v=>v.status===404));
 check('public browser cannot fetch native worker via CSP',result.directNativeBlocked);
 check('visible response delivered',result.replyStatus===200&&result.text.includes('受保护正文：训练安排已确认。')&&result.text.includes('"type":"done"'));
 const trace=JSON.parse(await readFile(resolve(out,'trace.json'),'utf8'));
 check('private card and worldbook really participated in native compilation',trace.privateCardInCompiled&&trace.privateLoreInCompiled);
 check('player preset script did not run inside private worker',trace.workerScriptsDisabled);
 check('actual upstream request forcibly disabled reasoning',trace.requests===1&&trace.upstreamReasoningRequested.every(v=>v===false));
 const captured=await page.content()+JSON.stringify(result);
 check('private markers and thought fields never appeared in client responses/storage',!/(PRIVATE_CARD_|PRIVATE_LORE_|HIDDEN_THOUGHT_|reasoning_content|<think>)/.test(captured));
 check('private helper object is not present in public page',!result.helperExposed);
 check('no uncaught public page error',errors.length===0);
 const report={scope:'isolated server-owned native compiler path; not full academy migration or unrestricted player helper compatibility',checks,protectedPathGatePassed:checks.every(c=>c.passed),originalVanillaGateChanged:false,realModel:false,trace,errors,deniedRoutes:result.blocked};
 await writeFile(resolve(out,'protection-report.json'),JSON.stringify(report,null,2));await page.screenshot({path:resolve(out,'protected-preview.png'),fullPage:true});console.log(JSON.stringify({protectedPathGatePassed:report.protectedPathGatePassed,checks:checks.length,trace,errors}));
}finally{await context.close();await browser.close();}
