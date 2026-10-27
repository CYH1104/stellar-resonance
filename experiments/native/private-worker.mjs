import {protectedRuntimePreset} from './preset-policy.mjs';
import {loopbackOrigin} from './native-client.mjs';
import {randomUUID} from 'node:crypto';

/** Server-owned browser: never expose this object or its native origin to clients. */
export async function createPrivateCompiler({chromium,executablePath,origin,privateCard,privateLore}){
 origin=loopbackOrigin(origin);
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(20000);
 await page.route('**/*',route=>{const url=new URL(route.request().url());return ['http:','https:'].includes(url.protocol)&&url.origin!==origin?route.abort():route.continue();});
 await page.route('**/api/horde/**',r=>r.fulfill({json:[]}));
 // No generation can accidentally bypass the server's locked model exit.
 await page.route('**/api/backends/chat-completions/generate',r=>r.abort());
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
 }catch(error){await browser.close();throw error;}
 let queue=Promise.resolve();
 async function compile({input,preset,signal}){
  const effective=protectedRuntimePreset(preset);const task=queue.catch(()=>{}).then(async()=>{
   signal?.throwIfAborted();
   const result=await page.evaluate(async({input,effective})=>{
    const H=TavernHelper,C=SillyTavern.getContext(),O=await import('/scripts/openai.js'),S=await import('/script.js');
    const flags=C.extensionSettings.tavern_helper.script.enabled;
    if(flags.global!==false||flags.presets.length||flags.characters.length)throw Error('PRIVATE_SCRIPT_POLICY_CHANGED');
    await H.importRawPreset('PrivateRuntime',JSON.stringify(effective));H.loadPreset('PrivateRuntime');await O.getPresetApplicationPromise();
    O.oai_settings.show_thoughts=false;await H.rebindGlobalWorldbooks(['PrivateAcademyLore']);
    C.chat.splice(0,C.chat.length,{name:'User',is_user:true,is_system:false,mes:input,send_date:new Date().toISOString()});
    let messages;const handler=event=>{messages=event.chat;};C.eventSource.on(C.eventTypes.CHAT_COMPLETION_PROMPT_READY,handler);
    try{await S.Generate('normal',{},true);}finally{C.eventSource.removeListener(C.eventTypes.CHAT_COMPLETION_PROMPT_READY,handler);}
    if(O.oai_settings.show_thoughts!==false||!Array.isArray(messages)||!messages.length)throw Error('PRIVATE_COMPILATION_FAILED');
    if(document.querySelector('iframe[name^="TH-script--"]')||globalThis.__PLAYER_SCRIPT_EXECUTED__===true)throw Error('PRIVATE_SCRIPT_EXECUTED');
    if(flags.global!==false||flags.presets.length||flags.characters.length)throw Error('PRIVATE_SCRIPT_POLICY_CHANGED');
    return {messages,requestReasoning:false,scriptsDisabled:true};
   },{input,effective});
   signal?.throwIfAborted();return result;
  });queue=task;return task;
 }
 return {compile,close:()=>browser.close()};
}
