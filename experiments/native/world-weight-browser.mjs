// Run last against the isolated academy-demo fixture, after worldbooks-browser creates its native worker.
// This page loads the original native WI module, bypassing the academy guard for the reference compilation.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
import {protectedRuntimePreset} from './preset-policy.mjs';
import {assertNativeWorldbookOptions,nativeWorldbooksForRequest} from '../../src/domain/nativeWorldbooks.ts';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href),browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH}),context=await browser.newContext(),page=await context.newPage();
const out=resolve('.integration/native-world-weight');await mkdir(out,{recursive:true});
const report={baseline:'e82e636c56437bd04cf4cb4ee54734ab2086e230',paidModel:false,checks:[],cases:[]};
const entry=(uid,weight)=>({uid,key:[],keysecondary:[],comment:'Synthetic entry '+uid,content:'BOUNDARY_CANARY_'+uid,constant:true,disable:false,selective:false,order:100,position:0,depth:4,probability:100,useProbability:true,group:'boundary-review-group',groupWeight:weight,groupOverride:false});
try{
 const origin='http://127.0.0.1:8864';
 await page.route('**/*',r=>{const u=new URL(r.request().url());return ['http:','https:'].includes(u.protocol)&&u.origin!==origin?r.abort():r.continue();});
 await page.route('**/api/horde/**',r=>r.fulfill({json:[]}));
 await page.route('**/api/backends/**',r=>new URL(r.request().url()).pathname.endsWith('/status')?r.fulfill({json:{result:'no_connection'}}):r.abort());
 await page.goto(origin);await page.waitForFunction(()=>typeof TavernHelper==='object');
 const preset=protectedRuntimePreset(JSON.parse(await readFile(resolve(process.env.NATIVE_RUNTIME,'default/content/presets/openai/Default.json'),'utf8')));
 await page.evaluate(async preset=>{const H=TavernHelper,C=SillyTavern.getContext(),S=await import('/script.js'),O=await import('/scripts/openai.js');H.replaceScriptTrees([],{type:'global'});await H.createOrReplaceCharacter('IndependentBoundaryReview',{description:'Synthetic character',first_messages:['Synthetic opening']});await C.selectCharacterById(String(C.characters.findIndex(c=>c.name==='IndependentBoundaryReview')));await H.importRawPreset('IndependentBoundaryReview',JSON.stringify(preset));H.loadPreset('IndependentBoundaryReview');await O.getPresetApplicationPromise();S.changeMainAPI('openai');},preset);
 for(const weights of [[1.5,2.125],[0,1],[10001,1],[.5,1],[100000,1]]){
  const raw={entries:{0:entry(0,weights[0]),1:entry(1,weights[1])}};
  const native=await page.evaluate(async raw=>{
   const H=TavernHelper,C=SillyTavern.getContext(),S=await import('/script.js'),W=await import('/scripts/world-info.js'),name='IndependentBoundaryReview';
   await H.createOrReplaceWorldbook(name,[],{render:'immediate'});if(!await H.importRawWorldbook(name,JSON.stringify(raw)))throw Error('NATIVE_IMPORT_FAILED');await H.rebindGlobalWorldbooks([name]);
   const before=Object.values((await W.loadWorldInfo(name)).entries).map(e=>e.groupWeight);
   C.chat.splice(0,C.chat.length,{name:'User',is_user:true,is_system:false,mes:'Synthetic action',send_date:new Date().toISOString()});
   let messages;const handler=e=>messages=e.chat;C.eventSource.on(C.eventTypes.CHAT_COMPLETION_PROMPT_READY,handler);
   try{await S.Generate('normal',{},true);}finally{C.eventSource.removeListener(C.eventTypes.CHAT_COMPLETION_PROMPT_READY,handler);}
   const after=Object.values((await W.loadWorldInfo(name)).entries).map(e=>e.groupWeight),text=JSON.stringify(messages);
   return {before,after,compiled:!!messages?.length,selected:[0,1].filter(i=>text.includes('BOUNDARY_CANARY_'+i))};
  },raw);
  assert.deepEqual(native.before,weights);assert.deepEqual(native.after,weights);assert.equal(native.compiled,true);assert.equal(native.selected.length,1);
  let saveAccepted=true,runtimeAccepted=true;try{assertNativeWorldbookOptions(raw);}catch{saveAccepted=false;}
  try{nativeWorldbooksForRequest({version:1,books:[{id:'review',name:'review',worldbook:raw}],defaultIds:['review']},'generate',{});}catch{runtimeAccepted=false;}
  report.cases.push({weights,native,saveAccepted,runtimeAccepted});
 }
 report.nativeComparisonComplete=true;
 assert.ok(report.cases.every(c=>c.saveAccepted&&c.runtimeAccepted),'native runtime accepts unchanged weights that the academy save/runtime guards reject');
 report.passed=true;
}catch(e){report.error=e.stack;throw e;}finally{await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();}
