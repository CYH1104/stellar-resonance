// Runs upstream browser modules and the real helper runner; no model endpoint is called.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {loopbackOrigin} from './native-client.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=resolve(process.env.NATIVE_RUNTIME||resolve(root,'../stellar-native-runtime-20261028'));
const helper=resolve(process.env.NATIVE_HELPER||resolve(root,'../stellar-native-helper-20261028'));
const pins=JSON.parse(await readFile(new URL('./versions.json',import.meta.url),'utf8'));
for(const [path,commit]of [[runtime,pins.sillyTavern.commit],[helper,pins.helper.commit]])assert.equal(execFileSync('git',['-c',`safe.directory=${path.replaceAll('\\','/')}`,'-C',path,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),commit,'pinned upstream commit');
assert.equal(createHash('sha256').update(await readFile(resolve(helper,'dist/index.js'))).digest('hex'),createHash('sha256').update(await readFile(resolve(runtime,'public/scripts/extensions/third-party/stellar-pinned-helper/dist/index.js'))).digest('hex'),'installed helper bundle matches pinned original');
const origin=loopbackOrigin(process.env.NATIVE_COMPAT_ORIGIN||'http://127.0.0.1:8840');
if(!process.env.PLAYWRIGHT_MODULE)throw Error('PLAYWRIGHT_MODULE_REQUIRED');
const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const context=await browser.newContext(),page=await context.newPage();
const errors=[],httpFailures=[],modelRequests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)httpFailures.push({path:new URL(r.url()).pathname,status:r.status()});});
page.on('request',r=>{if(r.url().includes('/api/backends/chat-completions/generate'))modelRequests.push(r.url());});
// The original default selects Horde and performs status requests. Block those
// external service calls explicitly; they are not needed to assemble a prompt.
await page.route('**/*',r=>{const url=new URL(r.request().url());return ['http:','https:'].includes(url.protocol)&&url.origin!==origin?r.abort():r.continue();});
await page.route('**/api/horde/**',r=>r.fulfill({json:[]}));
const rawPreset=await readFile(resolve(runtime,'default/content/presets/openai/Default.json'),'utf8');
const out=resolve(root,'.integration/native-step3');await mkdir(out,{recursive:true});
try{
 await page.goto(origin);await page.waitForFunction(()=>typeof globalThis.TavernHelper==='object',{},{timeout:60000});await page.waitForTimeout(1500);
 const native=await page.evaluate(async raw=>{
  const H=TavernHelper,C=SillyTavern.getContext(),S=await import('/script.js'),O=await import('/scripts/openai.js'),W=await import('/scripts/world-info.js');
  H.replaceScriptTrees([],{type:'global'});
  await H.createOrReplaceCharacter('Step3Probe',{description:'SYNTHETIC_PRIVATE_CANARY_8840',first_messages:['合成开场']});
  await C.selectCharacterById(String(C.characters.findIndex(c=>c.name==='Step3Probe')));S.changeMainAPI('openai');
  const imported=await H.importRawPreset('Step3OfficialDefault',raw);H.loadPreset('Step3OfficialDefault');await O.getPresetApplicationPromise();
  const defaultThoughts=H.getPreset('in_use').settings.request_thoughts;
  const preset=H.getPreset('in_use');preset.settings.request_thoughts=false;
  preset.prompts.unshift({id:'step3-first',name:'first',enabled:true,role:'system',position:{type:'relative'},content:'FIRST {{user}} {{char}}'});
  preset.prompts.push({id:'step3-depth',name:'depth',enabled:true,role:'assistant',position:{type:'in_chat',depth:0,order:5},content:'DEPTH_PROOF'},{id:'step3-disabled',name:'disabled',enabled:false,role:'system',position:{type:'relative'},content:'DISABLED_PROMPT'});
  await H.replacePreset('in_use',preset,{render:'immediate'});
  const rawDepth=O.oai_settings.prompts.find(p=>p.identifier==='step3-depth');if(!rawDepth)throw Error(JSON.stringify({rawIds:O.oai_settings.prompts.map(p=>p.identifier),helperIds:H.getPreset('in_use').prompts.map(p=>p.id)}));rawDepth.injection_trigger=['normal'];
  await H.createOrReplaceWorldbook('Step3Book',[
   {name:'keyword',enabled:true,strategy:{type:'selective',keys:['gateword']},position:{type:'before_character_definition',order:200},content:'LORE_A SECOND_TRIGGER',probability:100},
   {name:'recursive',enabled:true,strategy:{type:'selective',keys:['SECOND_TRIGGER']},position:{type:'before_character_definition',order:100},content:'LORE_B',probability:100},
   {name:'disabled',enabled:false,strategy:{type:'constant'},content:'DISABLED_LORE'},
   {name:'prob0',enabled:true,strategy:{type:'constant'},content:'PROBABILITY_ZERO',probability:0},
   {name:'depth',enabled:true,strategy:{type:'selective',keys:['gateword']},position:{type:'at_depth',role:'assistant',depth:2,order:20},content:'DEPTH_LORE',probability:100},
  ]);
  W.setWorldInfoSettings({world_info_recursive:true,world_info_budget:100,world_info_budget_cap:0,world_info_depth:4},{});await H.rebindGlobalWorldbooks(['Step3Book']);
  const lore=await W.getWorldInfoPrompt(['gateword'],8192,true),noTrigger=await W.getWorldInfoPrompt(['other'],8192,true);
  W.setWorldInfoSettings({world_info_budget_cap:1},{});const budget=await W.getWorldInfoPrompt(['gateword'],8192,true);W.setWorldInfoSettings({world_info_budget_cap:0},{});
  C.chat.splice(0,C.chat.length,{name:'Step3Probe',is_user:false,is_system:false,mes:'合成开场',send_date:new Date().toISOString()},{name:'User',is_user:true,is_system:false,mes:'gateword',send_date:new Date().toISOString()});
  const compiled={};
  for(const kind of ['normal','regenerate']){let messages;const handler=e=>{messages=e.chat;};C.eventSource.on(C.eventTypes.CHAT_COMPLETION_PROMPT_READY,handler);try{await S.Generate(kind,{},true);}finally{C.eventSource.removeListener(C.eventTypes.CHAT_COMPLETION_PROMPT_READY,handler);}compiled[kind]=messages;}
  const macroMode=C.powerUserSettings.experimental_macro_engine;
  C.powerUserSettings.experimental_macro_engine=false;const legacyMacros=C.substituteParams('{{user}}|{{char}}');
  C.powerUserSettings.experimental_macro_engine=true;const nestedMacro=C.substituteParams('{{setvar::step3who::{{user}}}}{{getvar::step3who}}');C.powerUserSettings.experimental_macro_engine=macroMode;
  const typedRoundtrip=H.getPreset('in_use');await H.replacePreset('in_use',typedRoundtrip,{render:'immediate'});
  const helperRoundtripPreservesTrigger=O.oai_settings.prompts.find(p=>p.identifier==='step3-depth')?.injection_trigger?.includes('normal')===true;
  localStorage.setItem('step3-synthetic-key','synthetic-key-only');
  H.replaceScriptTrees([{type:'script',id:'step3-probe',name:'合成权限验证脚本',enabled:true,content:`
    insertOrAssignVariables({step3Proof:'ran'},{type:'chat'});
    const ctx=parent.SillyTavern.getContext();
    ctx.chatCompletionSettings.show_thoughts=true;
    const response=await fetch('/api/characters/all',{method:'POST',headers:ctx.getRequestHeaders(),body:'{}'});
    parent.__step3Script={ran:true,variable:getVariables({type:'chat'}).step3Proof,parentDom:!!parent.document.querySelector('#send_textarea'),sameOriginStorage:parent.localStorage.getItem('step3-synthetic-key')==='synthetic-key-only',privateCard:(await getCharacter('current')).description.includes('SYNTHETIC_PRIVATE_CANARY_8840'),sameOriginApi:response.ok,reasoningReenabled:ctx.chatCompletionSettings.show_thoughts===true};
  `}],{type:'global'});
  return {imported,defaultThoughts,lore,noTrigger,budget,compiled,legacyMacros,nestedMacro,helperRoundtripPreservesTrigger,privateCardVisibleViaHelper:(await H.getCharacter('current')).description.includes('SYNTHETIC_PRIVATE_CANARY_8840')};
 },rawPreset);
 await page.waitForFunction(()=>globalThis.__step3Script?.ran,{},{timeout:20000});
 native.script=await page.evaluate(()=>globalThis.__step3Script);
 const checks=[];function check(name,condition){checks.push({name,passed:!!condition});assert.ok(condition,name);}
 const normal=JSON.stringify(native.compiled.normal),regen=JSON.stringify(native.compiled.regenerate);
 check('official default raw preset imported',native.imported);
 check('native normal Generate dry-run assembled messages',Array.isArray(native.compiled.normal)&&native.compiled.normal.length>0);
 check('user/char macros expanded',native.legacyMacros==='User|Step3Probe'&&normal.includes('FIRST User Step3Probe'));
 check('native experimental nested variable macro expanded',native.nestedMacro==='User');
 check('preset relative ordering preserved',native.compiled.normal[0].content==='FIRST User Step3Probe');
 check('preset disabled entry absent',!normal.includes('DISABLED_PROMPT'));
 check('preset depth injection role preserved',native.compiled.normal.at(-1).role==='assistant'&&native.compiled.normal.at(-1).content==='DEPTH_PROOF');
 check('generation trigger excludes normal-only prompt during regenerate',normal.includes('DEPTH_PROOF')&&!regen.includes('DEPTH_PROOF'));
 check('worldbook keyword and recursive entry triggered',native.lore.worldInfoBefore.includes('LORE_A')&&native.lore.worldInfoBefore.includes('LORE_B'));
 check('worldbook native ordering observed',native.lore.worldInfoBefore==='LORE_B\nLORE_A SECOND_TRIGGER');
 check('worldbook disabled/zero probability entries absent',!normal.includes('DISABLED_LORE')&&!normal.includes('PROBABILITY_ZERO'));
 check('worldbook no-key input does not trigger',native.noTrigger.worldInfoString==='');
 check('worldbook budget cap excludes over-budget entries',native.budget.worldInfoString===''&&native.budget.worldInfoDepth.length===0);
 check('full native Generate applies worldbook depth role',native.compiled.normal.some(m=>m.role==='assistant'&&m.content==='DEPTH_LORE'));
 check('actual helper script runner executed variable API',native.script.ran&&native.script.variable==='ran');
 check('no model generation endpoint called',modelRequests.length===0);
 const exposure={helperReadsPrivateCard:native.privateCardVisibleViaHelper,scriptReadsPrivateCard:native.script.privateCard,scriptReadsParentDOM:native.script.parentDom,scriptReadsSameOriginStorage:native.script.sameOriginStorage,scriptCallsSameOriginAPI:native.script.sameOriginApi,scriptReenablesReasoning:native.script.reasoningReenabled,defaultReasoningRequested:native.defaultThoughts};
 const privacyGatePassed=![exposure.helperReadsPrivateCard,exposure.scriptReadsPrivateCard,exposure.scriptReenablesReasoning,exposure.defaultReasoningRequested].some(Boolean);
 const report={phase:'step-3-native-compatibility-and-boundary-probe',pins,presetSource:'upstream/default/content/presets/openai/Default.json',presetSha256:createHash('sha256').update(rawPreset).digest('hex'),compatibilityChecks:checks,scope:'native runtime in isolated browser; not an integrated private server compiler',helperTypedPresetRoundtripPreservesInjectionTrigger:native.helperRoundtripPreservesTrigger,vanillaExposure:exposure,privacyGatePassed,modelRequests:modelRequests.length,externalBrowserNetworkBlocked:true,backgroundHordeStatusMocked:true,pageErrors:errors,httpFailures};
 assert.ok(report.vanillaExposure.helperReadsPrivateCard&&report.vanillaExposure.scriptReadsPrivateCard&&report.vanillaExposure.scriptReadsSameOriginStorage&&report.vanillaExposure.scriptReenablesReasoning,'native exposure reproduction must be real');
 await writeFile(resolve(out,'compatibility-report.json'),JSON.stringify(report,null,2));await writeFile(resolve(out,'synthetic-compiled-messages.json'),JSON.stringify(native.compiled,null,2));await page.screenshot({path:resolve(out,'native-compatibility.png'),fullPage:true});
 await page.evaluate(()=>{TavernHelper.replaceScriptTrees([],{type:'global'});localStorage.removeItem('step3-synthetic-key');SillyTavern.getContext().chatCompletionSettings.show_thoughts=false;});
 console.log(JSON.stringify({compatibilityPassed:checks.length,vanillaExposure:report.vanillaExposure,privacyGatePassed,pageErrors:errors,httpFailures}));
}catch(error){await writeFile(resolve(out,'compatibility-failure.json'),JSON.stringify({message:error.stack,errors,httpFailures},null,2));throw error;}finally{await page.evaluate(()=>{globalThis.TavernHelper?.replaceScriptTrees([],{type:'global'});localStorage.removeItem('step3-synthetic-key');if(globalThis.SillyTavern)SillyTavern.getContext().chatCompletionSettings.show_thoughts=false;}).catch(()=>{});await context.close();await browser.close();}
