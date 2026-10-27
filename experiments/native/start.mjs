import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createLocalServer} from '../../server/app.mjs';
import {createNativeClient,createNativeFetch} from './native-client.mjs';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const lock=JSON.parse(await readFile(new URL('./versions.json',import.meta.url),'utf8'));
const args=process.argv.slice(2), option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const runtime=resolve(option('--runtime',resolve(projectRoot,'../stellar-native-runtime-20261028')));
const helper=resolve(option('--helper',resolve(projectRoot,'../stellar-native-helper-20261028')));
for(const [path,expected] of [[runtime,lock.sillyTavern.commit],[helper,lock.helper.commit]]){
 const actual=execFileSync('git',['-c',`safe.directory=${path.replaceAll('\\','/')}`,'-C',path,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(actual!==expected)throw Error('PINNED_COMMIT_MISMATCH: '+path);
}
const data=resolve(projectRoot,'.integration/native-step2');await mkdir(data,{recursive:true});
const nativePort=8830,academyPort=8831,fixturePort=8832;
const nativeOrigin=`http://127.0.0.1:${nativePort}`;
const installed=resolve(runtime,'public/scripts/extensions/third-party/stellar-pinned-helper');
await mkdir(installed,{recursive:true});
for(const item of ['dist','lib','i18n','manifest.json']){await access(resolve(helper,item));await cp(resolve(helper,item),resolve(installed,item),{recursive:true});}
const manifest=JSON.parse(await readFile(resolve(installed,'manifest.json'),'utf8'));manifest.auto_update=false;
await writeFile(resolve(installed,'manifest.json'),JSON.stringify(manifest,null,2));
let config=await readFile(resolve(runtime,'default/config.yaml'),'utf8');
config=config.replace('dataRoot: ./data',`dataRoot: ${JSON.stringify(resolve(data,'native-data'))}`)
 .replace('port: 8000',`port: ${nativePort}`).replace('  enabled: true\n  # Browser','  enabled: false\n  # Browser')
 .replace('  autoUpdate: true','  autoUpdate: false');
// The CLI below is authoritative for no browser launch, loopback listen and data root.
await writeFile(resolve(data,'config.yaml'),config);

const trace={phase:lock.phase,nativeCommit:lock.sillyTavern.commit,helperCommit:lock.helper.commit,nativeRequests:[],fixtureRequests:[]};
const fixture=createServer(async(req,res)=>{
 if(req.method!=='POST'||req.url!=='/v1/chat/completions'){res.writeHead(404).end();return;}
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024){res.writeHead(413).end();return;}chunks.push(chunk);}
 const body=JSON.parse(Buffer.concat(chunks));
 let memoryInput;try{const value=JSON.parse(body.messages?.at(-1)?.content);if(value?.turnId&&value?.variantId&&value?.story)memoryInput=value;}catch{}
 trace.fixtureRequests.push({kind:memoryInput?'memory':'story',model:body.model,messageCount:body.messages?.length,requestDigest:createHash('sha256').update(JSON.stringify(body)).digest('hex'),nativeAuthorization:req.headers.authorization==='Bearer synthetic-native-fixture'});
 await writeFile(resolve(data,'trace.json'),JSON.stringify(trace,null,2));
 const story='原生链路验证成功。\n\n接待员抬起头，示意你查看训练安排。\n\n这是本地模拟模型返回的合成正文，已实际经过原生酒馆服务端。';
 const content=memoryInput?JSON.stringify({participants:['合成玩家'],time:'未明确',location:'未明确',userActions:[memoryInput.input],charActions:[{name:'接待员',actions:['说明训练安排']}],gains:[],losses:[],commitments:[],affinityChanges:[]}):story+'<SR_STATE>{"event":"接待员说明训练安排"}</SR_STATE><SR_DONE>';
 res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store'});
 for(const text of [content.slice(0,25),content.slice(25)])res.write('data: '+JSON.stringify({choices:[{delta:{content:text},finish_reason:null}]})+'\n\n');
 res.write('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\n');res.end('data: [DONE]\n\n');
});
await new Promise((ok,fail)=>{fixture.once('error',fail);fixture.listen(fixturePort,'127.0.0.1',ok);});
const native=spawn(process.execPath,['server.js','--configPath',resolve(data,'config.yaml'),'--dataRoot',resolve(data,'native-data'),'--port',String(nativePort),'--listen','false','--browserLaunchEnabled','false'],{cwd:runtime,windowsHide:true,stdio:['ignore','pipe','pipe']});
let nativeLog='';native.stdout.on('data',chunk=>{nativeLog+=chunk;});native.stderr.on('data',chunk=>{nativeLog+=chunk;});
native.on('error',e=>console.error('Native startup:',e.message));
let academy;
let stopping=false;
async function shutdown(){if(stopping)return;stopping=true;academy?.server.closeAllConnections();academy?.server.close();fixture.closeAllConnections();fixture.close();native.kill();await writeFile(resolve(data,'native.log'),nativeLog);}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void shutdown().then(()=>process.exit(0));});
try{
 let ready=false;for(let i=0;i<120;i++){if(native.exitCode!==null)throw Error('NATIVE_EXITED: '+nativeLog.slice(-3000));try{const r=await fetch(nativeOrigin+'/csrf-token',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
 if(!ready)throw Error('NATIVE_START_TIMEOUT: '+nativeLog.slice(-3000));
 const client=createNativeClient({origin:nativeOrigin,upstream:`http://127.0.0.1:${fixturePort}/v1`,onRequest:item=>trace.nativeRequests.push(item)});
 const card=JSON.parse(await readFile(resolve(projectRoot,'server/example/feature-demo.json'),'utf8'));
 academy=await createLocalServer({projectRoot,port:academyPort,editorPort:0,host:'127.0.0.1',authRequired:false,card,fetchImpl:createNativeFetch(client),accountDirectory:resolve(data,'academy-private')});
 await academy.start();await writeFile(resolve(data,'trace.json'),JSON.stringify(trace,null,2));
 console.log(JSON.stringify({ready:true,academy:`http://127.0.0.1:${academyPort}/`,native:nativeOrigin,fixture:`http://127.0.0.1:${fixturePort}`,data,phase:lock.phase}));
 native.once('exit',()=>{if(!stopping)void shutdown().then(()=>process.exit(1));});
}catch(error){await shutdown();throw error;}
