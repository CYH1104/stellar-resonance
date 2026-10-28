import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createNativeClient} from './native-client.mjs';
import {createPrivateCompiler} from './private-worker.mjs';
import {createProtectedGateway} from './protected-gateway.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dir=resolve(root,'.integration/native-protected');await mkdir(dir,{recursive:true});
const runtime=resolve(process.env.NATIVE_RUNTIME||resolve(root,'../stellar-native-runtime-20261028')),helper=resolve(process.env.NATIVE_HELPER||resolve(root,'../stellar-native-helper-20261028'));
const pins=JSON.parse(await readFile(new URL('./versions.json',import.meta.url),'utf8'));
for(const [path,commit]of [[runtime,pins.sillyTavern.commit],[helper,pins.helper.commit]])if(execFileSync('git',['-c',`safe.directory=${path.replaceAll('\\','/')}`,'-C',path,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==commit)throw Error('PIN_MISMATCH');
if(!process.env.PLAYWRIGHT_MODULE)throw Error('PLAYWRIGHT_MODULE_REQUIRED');const {chromium}=await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href);
const installed=resolve(runtime,'public/scripts/extensions/third-party/stellar-pinned-helper');await mkdir(installed,{recursive:true});for(const name of ['dist','lib','i18n','manifest.json'])await cp(resolve(helper,name),resolve(installed,name),{recursive:true});
const manifest=JSON.parse(await readFile(resolve(installed,'manifest.json'),'utf8'));manifest.auto_update=false;await writeFile(resolve(installed,'manifest.json'),JSON.stringify(manifest,null,2));
const config=(await readFile(resolve(runtime,'default/config.yaml'),'utf8')).replace('  autoUpdate: true','  autoUpdate: false');await writeFile(resolve(dir,'config.yaml'),config);
const privateCard='PRIVATE_CARD_'+randomUUID(),privateLore='PRIVATE_LORE_'+randomUUID(),hiddenThought='HIDDEN_THOUGHT_'+randomUUID();
const trace={privateCardInCompiled:false,privateLoreInCompiled:false,workerScriptsDisabled:false,upstreamReasoningRequested:[],requests:0,sampling:[],publicEntryInCompiled:[]};
const fixture=createServer(async(req,res)=>{
 if(req.method!=='POST'||req.url!=='/v1/chat/completions'){res.writeHead(404).end();return;}
 let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);trace.requests++;trace.sampling.push({temperature:body.temperature,max_tokens:body.max_tokens});trace.upstreamReasoningRequested.push(body.include_reasoning);await writeFile(resolve(dir,'trace.json'),JSON.stringify(trace,null,2));
 const packets=[{reasoning_content:hiddenThought},{content:'<thi'},{content:'nk>'+privateCard+'</think>受保护正文：训练安排已确认。'}];
 res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8'});
 for(const delta of packets)res.write('data: '+JSON.stringify({choices:[{delta,finish_reason:null}]})+'\n\n');res.end('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');
});await new Promise((ok,fail)=>{fixture.once('error',fail);fixture.listen(8852,'127.0.0.1',ok);});
const native=spawn(process.execPath,['server.js','--configPath',resolve(dir,'config.yaml'),'--dataRoot',resolve(dir,'data'),'--port','8850','--listen','false','--browserLaunchEnabled','false'],{cwd:runtime,windowsHide:true,stdio:['ignore','pipe','pipe']});
let nativeLog='';native.stdout.on('data',v=>nativeLog+=v);native.stderr.on('data',v=>nativeLog+=v);
let compiler,gateway;let stopping=false;
async function stop(){if(stopping)return;stopping=true;await gateway?.close();await compiler?.close();fixture.closeAllConnections();fixture.close();native.kill();}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{void stop().then(()=>process.exit(0));});
try{
 let ready=false;for(let i=0;i<120;i++){if(native.exitCode!==null)throw Error('NATIVE_START_FAILED');try{if((await fetch('http://127.0.0.1:8850/csrf-token',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('NATIVE_START_TIMEOUT');
 const settingsPath=resolve(dir,'data/default-user/settings.json'),settings=JSON.parse(await readFile(settingsPath,'utf8'));
 settings.extension_settings||={};settings.extension_settings.tavern_helper={script:{enabled:{global:false,presets:[],characters:[]},scripts:[]},listener:{enabled:false}};await writeFile(settingsPath,JSON.stringify(settings,null,2));
 compiler=await createPrivateCompiler({chromium,executablePath:process.env.CHROMIUM_PATH,origin:'http://127.0.0.1:8850',privateCard,privateLore});
 const preset=JSON.parse(await readFile(resolve(runtime,'default/content/presets/openai/Default.json'),'utf8'));
 preset.prompts.push({identifier:'protected-example',name:'验证条目',role:'system',content:'PUBLIC_PRESET_ENTRY',system_prompt:false,enabled:true,injection_position:1,injection_depth:0,injection_order:10,injection_trigger:['normal'],custom_future_field:{keep:true}});
 for(const order of preset.prompt_order)order.order.push({identifier:'protected-example',enabled:true});
 preset.extensions||={};preset.extensions.tavern_helper={scripts:[{type:'script',enabled:true,id:'forbidden-player-script',name:'不可执行的玩家脚本',content:'parent.__PLAYER_SCRIPT_EXECUTED__=true;'}]};preset.extensions.future_unknown={value:'keep-me'};
 const client=createNativeClient({origin:'http://127.0.0.1:8850',upstream:'http://127.0.0.1:8852/v1'});
 gateway=await createProtectedGateway({compiler,client,preset,port:8851,onPrivateCompile:async compiled=>{
  const text=JSON.stringify(compiled.messages);trace.publicEntryInCompiled.push(text.includes("EDITED_PUBLIC_ENTRY"));trace.privateCardInCompiled=text.includes(privateCard);trace.privateLoreInCompiled=text.includes(privateLore);trace.workerScriptsDisabled=compiled.scriptsDisabled;await writeFile(resolve(dir,'trace.json'),JSON.stringify(trace,null,2));
 }});
 // Only booleans and public route names are exported as verification metadata.
 await writeFile(resolve(dir,'trace.json'),JSON.stringify(trace,null,2));
 console.log(JSON.stringify({ready:true,preview:gateway.origin,scope:'local private compiler proof; synthetic data only',nativeWorker:'server-internal loopback'}));
 native.on('exit',()=>{if(!stopping)void stop().then(()=>process.exit(1));});
}catch(error){await stop();await writeFile(resolve(dir,'startup-error.log'),error.stack);throw error;}
