import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createNativeClient} from './native-client.mjs';
import {createPrivateCompiler} from './private-worker.mjs';
import {createLocalServer} from '../../server/app.mjs';
import {createAccountRuntime} from './account-runtime.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dir=resolve(root,'.integration/native-step4');await mkdir(dir,{recursive:true});
const runtime=resolve(process.env.NATIVE_RUNTIME||resolve(root,'../stellar-native-runtime-20261028')),helper=resolve(process.env.NATIVE_HELPER||resolve(root,'../stellar-native-helper-20261028'));
const pins=JSON.parse(await readFile(new URL('./versions.json',import.meta.url),'utf8'));
for(const [path,commit]of [[runtime,pins.sillyTavern.commit],[helper,pins.helper.commit]])if(execFileSync('git',['-c',`safe.directory=${path.replaceAll('\\','/')}`,'-C',path,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==commit)throw Error('PIN_MISMATCH');
if(!process.env.PLAYWRIGHT_MODULE)throw Error('PLAYWRIGHT_MODULE_REQUIRED');const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const installed=resolve(runtime,'public/scripts/extensions/third-party/stellar-pinned-helper');await mkdir(installed,{recursive:true});for(const name of ['dist','lib','i18n','manifest.json'])await cp(resolve(helper,name),resolve(installed,name),{recursive:true});
const manifest=JSON.parse(await readFile(resolve(installed,'manifest.json'),'utf8'));manifest.auto_update=false;await writeFile(resolve(installed,'manifest.json'),JSON.stringify(manifest,null,2));
const config=(await readFile(resolve(runtime,'default/config.yaml'),'utf8')).replace('  autoUpdate: true','  autoUpdate: false');await writeFile(resolve(dir,'config.yaml'),config);
const trace={requests:[],compiles:[]};await writeFile(resolve(dir,'trace.json'),JSON.stringify(trace));
const failedTerminalInputs=new Set();
const fixture=createServer(async(req,res)=>{
 if(req.method!=='POST'||req.url!=='/v1/chat/completions'){res.writeHead(404).end();return;}
 let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);
 let memory,terminal,terminalInput,terminalActors=[];for(const message of body.messages){try{const value=JSON.parse(message.content);if(value.turnId&&value.story)memory=value;if(value.mode&&typeof value.input==='string')terminalInput=value.input;}catch{}for(const line of message.content.split('\n')){const label='终端上下文（数据）：',at=line.indexOf(label);if(at>=0)try{terminal=JSON.parse(line.slice(at+label.length));}catch{}try{const value=JSON.parse(line);if(Array.isArray(value.actors))terminalActors=value.actors.map(a=>a.id);}catch{}}}

 const who=JSON.stringify(body.messages).includes('测试乙')?'乙':'甲';
 const terminalNumber=trace.requests.filter(r=>r.kind==='terminal').length+1,terminalTag='TERMINAL_BATCH_'+terminalNumber;
 trace.requests.push({kind:terminal?'terminal':memory?'memory':'story',who,temperature:body.temperature,max_tokens:body.max_tokens,reasoning:body.include_reasoning,...(terminal?{input:terminalInput,tag:terminalTag}:!memory?{terminalFacts:[...new Set(JSON.stringify(body.messages).match(/TERMINAL_BATCH_\d+/g)||[])]}:{})});
 await writeFile(resolve(dir,'trace.json'),JSON.stringify(trace,null,2));
 if(terminal&&terminalInput?.includes('终端故障')&&!failedTerminalInputs.has(terminalInput)){failedTerminalInputs.add(terminalInput);res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({error:{message:'SYNTHETIC_TERMINAL_FAILURE'}}));return;}
 const requestId=body.messages.map(m=>m.content).join('\n').match(/"requestId"\s*:\s*"([^"]+)"/)?.[1];
 const state={schemaVersion:'state-output-v1',requestId,event:'接待员说明训练安排',presentCharacterIds:['pro-01'],characters:[{id:'pro-01',affinity:{delta:0,reason:'正常接待，态度保持。'},relationship:{action:'set',value:'已接待访客'},innerThought:{action:'set',value:'认真说明训练安排。'},spiritThought:{action:'set',value:'安静旁听。'}}],customUpdates:[]};
 const latest=body.messages.map(m=>m.content).join('\n'),mode=!memory&&latest.includes('测试截断')?'length':!memory&&latest.includes('测试停止')?'slow':'stop';
 const groups=terminal?(terminal.socialOnly?[]:terminal.initialized?terminal.groups:terminal.newGroupIds.slice(0,2).map((id,i)=>({id,title:'合成群'+i,members:terminalActors,ownerId:terminalActors[0],adminIds:[],announcement:''}))):[];
 const content=terminal?JSON.stringify({protocolVersion:2,groups:groups.map(g=>({...g,messages:Array.from({length:4},(_,i)=>({id:g.members.filter(id=>id!=='player')[i%g.members.filter(id=>id!=='player').length],text:terminalTag+' 合成通讯 '+i})),topic:terminalTag})),privateMessages:[],friendRequests:[],groupActions:[],courses:[]}):memory?JSON.stringify({participants:['测试'+who],time:'未明确',location:'接待处',userActions:[memory.input],charActions:[],gains:[],losses:[],commitments:[],affinityChanges:[]}):'账号'+who+'原生正文已完成。\n\n接待员指向训练安排。<SR_STATE>'+JSON.stringify(state)+'</SR_STATE><SR_DONE>';
 if(terminal&&terminalInput?.includes('终端等待'))await new Promise(r=>setTimeout(r,8000));
 res.writeHead(200,{'Content-Type':'text/event-stream'});
 res.write('data: '+JSON.stringify({choices:[{delta:{reasoning_content:'HIDDEN_THOUGHT_TEST',content:'<think>PRIVATE_CARD_NOT_FOR_BROWSER</think>'+(mode==='stop'?content:'已收到的部分正文。')},finish_reason:null}]})+'\n\n');
 if(mode==='slow')await new Promise(r=>setTimeout(r,8000));
 res.end('data: '+JSON.stringify({choices:[{delta:{},finish_reason:mode==='length'?'length':'stop'}]})+'\n\ndata: [DONE]\n\n');
});await new Promise(ok=>fixture.listen(8862,'127.0.0.1',ok));
const preset=JSON.parse(await readFile(resolve(runtime,'default/content/presets/openai/Default.json'),'utf8'));
let index=0;
const runtimeBridge=createAccountRuntime({directory:resolve(dir,'configs'),defaultPreset:preset,onRequest:(item,messages)=>{const text=JSON.stringify(messages);trace.compiles.push({...item,hasA:text.includes('ACCOUNT_CONFIG_0'),hasB:text.includes('ACCOUNT_CONFIG_1'),regeneratePrompt:text.includes('REGEN_ONLY_PROBE'),worldStory:text.includes('NATIVE_WORLD_STORY_CANARY'),worldMemory:text.includes('NATIVE_WORLD_MEMORY_CANARY'),worldDisabled:text.includes('NATIVE_WORLD_DISABLED_CANARY'),worldUnused:text.includes('NATIVE_WORLD_UNUSED_CANARY'),worldSticky:text.includes('NATIVE_WORLD_STICKY_CANARY'),worldCooldown:text.includes('NATIVE_WORLD_COOLDOWN_CANARY'),worldDelay:text.includes('NATIVE_WORLD_DELAY_CANARY'),scopeBounded:text.includes('only to these NPCs')});},createWorker:async key=>{
 const workerDir=resolve(dir,'workers',key),port=8864+index++;await mkdir(workerDir,{recursive:true});
 await writeFile(resolve(workerDir,'config.yaml'),config);
 const native=spawn(process.execPath,['server.js','--configPath',resolve(workerDir,'config.yaml'),'--dataRoot',resolve(workerDir,'data'),'--port',String(port),'--listen','false','--browserLaunchEnabled','false'],{cwd:runtime,windowsHide:true,stdio:'ignore'});
 let compiler;try{
  let ready=false;for(let i=0;i<120;i++){if(native.exitCode!==null)throw Error('NATIVE_START_FAILED');try{if((await fetch(`http://127.0.0.1:${port}/csrf-token`,{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('NATIVE_START_TIMEOUT');
  const settingsPath=resolve(workerDir,'data/default-user/settings.json'),settings=JSON.parse(await readFile(settingsPath,'utf8'));settings.extension_settings||={};settings.extension_settings.tavern_helper={script:{enabled:{global:false,presets:[],characters:[]},scripts:[]},listener:{enabled:false}};await writeFile(settingsPath,JSON.stringify(settings));
  compiler=await createPrivateCompiler({chromium,executablePath:process.env.CHROMIUM_PATH,origin:`http://127.0.0.1:${port}`,privateCard:'PRIVATE_CARD_'+randomUUID(),privateLore:'PRIVATE_LORE_'+randomUUID()});
  return {compiler,client:createNativeClient({origin:`http://127.0.0.1:${port}`,upstream:'http://127.0.0.1:8862/v1'}),async close(){await compiler.close();native.kill();}};
 }catch(e){await compiler?.close();native.kill();throw e;}
}});
const accountsDir=resolve(dir,'accounts');await mkdir(accountsDir,{recursive:true});await writeFile(resolve(accountsDir,'relay-policy.json'),JSON.stringify({version:1,origins:['https://native-verification.invalid']}));
const card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8'));
const academy=await createLocalServer({projectRoot:root,port:8861,host:'127.0.0.1',authRequired:true,invitesRequired:false,editorPort:0,card,privateDir:resolve(dir,'private'),accountDirectory:accountsDir,nativeRuntime:runtimeBridge,fetchImpl:()=>{throw Error('EXTERNAL_MODEL_BLOCKED');}});await academy.start();
let stopping=false;async function stop(){if(stopping)return;stopping=true;academy.server.closeAllConnections();await new Promise(r=>academy.server.close(r));await runtimeBridge.close();fixture.closeAllConnections();fixture.close();}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{void stop().then(()=>process.exit(0));});
console.log(JSON.stringify({ready:true,preview:'http://127.0.0.1:8861/terminal',scope:'isolated accounts and current academy UI; synthetic model only'}));
