import {protectedRuntimePreset} from './preset-policy.mjs';
import {loopbackOrigin} from './native-client.mjs';
import {randomUUID} from 'node:crypto';
import {cleanNativeWorldbookRequest,assertNativeWorldbooksRuntime,projectNativeWorldScopes} from '../../src/domain/nativeWorldbooks.ts';
import {cleanNativeWorldSeed,cleanNativeEffects} from '../../src/domain/nativeWorldState.ts';
import {projectNativeWorldInfoModule} from './world-effects-adapter.mjs';

/** Server-owned browser: never expose this object or its native origin to clients. */
export async function createPrivateCompiler({chromium,executablePath,origin,privateCard,privateLore}){
 origin=loopbackOrigin(origin);
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(20000);
 await page.route('**/*',route=>{const url=new URL(route.request().url());return ['http:','https:'].includes(url.protocol)&&url.origin!==origin?route.abort():route.continue();});
 await page.route('**/api/horde/**',r=>r.fulfill({json:[]}));
 let moduleFailure;
 await page.route('**/scripts/world-info.js*',async route=>{if(new URL(route.request().url()).pathname!=='/scripts/world-info.js')return route.continue();try{const response=await route.fetch();await route.fulfill({response,body:projectNativeWorldInfoModule(await response.text())});}catch(error){moduleFailure=error;await route.abort().catch(()=>{});}});
 // No generation can accidentally bypass the server's locked model exit.
 await page.route('**/api/backends/**',r=>new URL(r.request().url()).pathname.endsWith('/status')?r.fulfill({json:{result:'no_connection'}}):r.abort());
 try{
  await page.goto(origin);await page.waitForFunction(()=>typeof globalThis.TavernHelper==='object');
  await page.evaluate(async({privateCard,privateLore,characterName})=>{
   const H=TavernHelper,C=SillyTavern.getContext();H.replaceScriptTrees([],{type:'global'});
   const controls=C.extensionSettings.tavern_helper?.script?.enabled;
   if(!controls||controls.global!==false||controls.presets.length||controls.characters.length)throw Error('PRIVATE_WORKER_SCRIPTS_NOT_DISABLED');
   await H.createOrReplaceCharacter(characterName,{description:privateCard,first_messages:['合成开场']});
   await C.selectCharacterById(String(C.characters.findIndex(c=>c.name===characterName)));
   await H.createOrReplaceWorldbook('PrivateAcademyLore',[{name:'server-private',enabled:true,strategy:{type:'constant'},content:privateLore,probability:100}]);
   await H.rebindGlobalWorldbooks(['PrivateAcademyLore']);
   const native=await import('/script.js');native.changeMainAPI('openai');
  },{privateCard,privateLore,characterName:'PrivateAcademy-'+randomUUID()});
 }catch(error){await browser.close();throw moduleFailure||error;}
 let queue=Promise.resolve();
 async function compile({input,preset,worldbooks:requestedWorldbooks,worldState:requestedState,worldActors=[],signal,messages:history,generationType='normal'}){
  const worldState=requestedState===undefined?undefined:cleanNativeWorldSeed(requestedState),worldbooks=projectNativeWorldScopes(cleanNativeWorldbookRequest(requestedWorldbooks),worldActors);assertNativeWorldbooksRuntime(worldbooks,{effects:!!worldState,scope:true});
  const effective=protectedRuntimePreset(preset);
   if(history){const identifier='academy-task-context';if(effective.prompts.some(p=>p.identifier===identifier))throw Error('RESERVED_PROMPT_ID');effective.prompts.push({identifier,name:'学院任务协议',role:'system',content:history.filter(m=>m.role==='system').map(m=>m.content).join('\n\n'),system_prompt:false,injection_position:1,injection_depth:0,injection_order:0,injection_trigger:[]});for(const group of effective.prompt_order)group.order.push({identifier,enabled:true});}
   const task=queue.catch(()=>{}).then(async()=>{
   signal?.throwIfAborted();
   const result=await page.evaluate(async({input,effective,history,generationType,worldbooks,worldState})=>{
    const H=TavernHelper,C=SillyTavern.getContext(),O=await import('/scripts/openai.js'),S=await import('/script.js');
    const flags=C.extensionSettings.tavern_helper.script.enabled;
    if(flags.global!==false||flags.presets.length||flags.characters.length)throw Error('PRIVATE_SCRIPT_POLICY_CHANGED');
    await H.importRawPreset('PrivateRuntime',JSON.stringify(effective));H.loadPreset('PrivateRuntime');await O.getPresetApplicationPromise();
    O.oai_settings.show_thoughts=false;
    const names=worldbooks.map(book=>'PlayerRuntime-'+book.id);await H.rebindGlobalWorldbooks(['PrivateAcademyLore']);
    for(const old of H.getWorldbookNames().filter(name=>name.startsWith('PlayerRuntime-')&&!names.includes(name)))if(!await H.deleteWorldbook(old))throw Error('NATIVE_WORLD_PROJECTION_CLEANUP_FAILED');
    for(const book of worldbooks){const name='PlayerRuntime-'+book.id;await H.createOrReplaceWorldbook(name,[],{render:'immediate'});if(!await H.importRawWorldbook(name,JSON.stringify(book.worldbook)))throw Error('NATIVE_WORLD_IMPORT_FAILED');}
    // Every compile replaces the projection bindings, including an explicitly empty selection.
    await H.rebindGlobalWorldbooks(['PrivateAcademyLore',...names]);
    const chat=history?.filter(m=>m.role!=='system').map(m=>({name:m.role==='assistant'?'学院':'User',is_user:m.role==='user',is_system:false,mes:m.content,send_date:new Date().toISOString()}));
    C.chat.splice(0,C.chat.length,...(chat?.length?chat:[{name:'User',is_user:true,is_system:false,mes:input,send_date:new Date().toISOString()}]));
    S.updateChatMetadata({timedWorldInfo:worldState?structuredClone(worldState.effects):{}},false);
    if(worldState)globalThis.__ACADEMY_NATIVE_WORLD_PROJECTION__={messageCount:worldState.messageCount};
    let messages;const handler=event=>{messages=event.chat;};C.eventSource.on(C.eventTypes.CHAT_COMPLETION_PROMPT_READY,handler);
    try{await S.Generate(generationType,{},true);
    if(O.oai_settings.show_thoughts!==false||O.oai_settings.chat_completion_source!=='openai'||O.oai_settings.reverse_proxy||!Array.isArray(messages)||!messages.length)throw Error('PRIVATE_COMPILATION_FAILED');
    if(document.querySelector('iframe[name^="TH-script--"]')||globalThis.__PLAYER_SCRIPT_EXECUTED__===true)throw Error('PRIVATE_SCRIPT_EXECUTED');
    if(flags.global!==false||flags.presets.length||flags.characters.length)throw Error('PRIVATE_SCRIPT_POLICY_CHANGED');
    const timed=S.chat_metadata.timedWorldInfo||{},names=new Set(worldbooks.map(b=>'PlayerRuntime-'+b.id));
    const effects=Object.fromEntries(['sticky','cooldown'].map(kind=>[kind,Object.fromEntries(Object.entries(timed[kind]||{}).filter(([key])=>names.has(key.slice(0,key.lastIndexOf('.')))))]));
    return {messages,requestReasoning:false,scriptsDisabled:true,...(worldState?{effects}:{})};
    }finally{C.eventSource.removeListener(C.eventTypes.CHAT_COMPLETION_PROMPT_READY,handler);delete globalThis.__ACADEMY_NATIVE_WORLD_PROJECTION__;delete S.chat_metadata.timedWorldInfo;}
   },{input,effective,history,generationType,worldbooks,worldState});
   signal?.throwIfAborted();return {...result,...(worldState?{effects:cleanNativeEffects(result.effects)}:{})};
  });queue=task;return task;
 }
 return {compile,close:()=>browser.close()};
}
