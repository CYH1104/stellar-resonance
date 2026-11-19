import {cleanOutputParsing,outputParsingTags} from '../src/domain/outputParsing.ts';
import {createCloudBackup} from './cloud-backup.mjs';
import {cleanCompletionRequestShape} from '../src/domain/completionRequestShape.ts';
const upstreamStatusField=error=>Number.isInteger(error?.upstreamStatus)&&error.upstreamStatus>=100&&error.upstreamStatus<=599?{upstreamStatus:error.upstreamStatus}:{};
const completionFailureFields=error=>{const requestShape=cleanCompletionRequestShape(error?.requestShape);return {...upstreamStatusField(error),...(typeof error?.reason==='string'?{reason:error.reason}:{}),...(requestShape?{requestShape}:{})};};
import {majorCharacter} from '../src/domain/characterImages.ts';
import {terminalCodeBindings} from '../src/domain/terminalCodeVariables.ts';
import {terminalCodePrompt} from './terminal-codes.mjs';
import {terminalPlan,terminalFollowupPlan,parseTerminalResult,terminalActors} from './personal-terminal.mjs';
import {instanceDescriptor,normalizeChannel} from './channel.mjs';
import {markReleaseActive} from './release.mjs';
import {MODEL_REQUEST_TIMEOUT_MS} from '../src/domain/requestTimeout.ts';
import {createRelayPolicy} from './relay-policy.mjs';
import {createTheaterShares} from './theater-shares.mjs';
import {guardPromptRequest} from './prompt-guard.mjs';
import {cleanTheaters} from '../src/domain/theaters.ts';
import {repairNeedsState,validateRepairPlan} from '../src/domain/repairPlan.ts';
import {bootHead,bootScreen} from './boot-screen.mjs';
import {batchMemoryMessages,parseBatchMemoryResult} from './memory-batch.mjs';
import {internalPrompt,withInternalPrompts,setInternalPrompts} from './internal-prompts.mjs';
import {separatedState} from './separate-state.mjs';
import {loadPrivateWorldbooks} from './worldbooks.mjs';
import {memoryMessages,parseMemoryResult} from './memory.mjs';
import {createEditorStore,cardWithEditor,publicCards} from './editor-store.mjs';
import {readPersonaExtra} from '../src/domain/personaExtras.ts';
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import { buildMessages, buildPersonaMessages, parsePersonaResult, completionChunks, endpoint, modelError, openCompletion } from './ai.mjs';
import { normalizePersona } from '../src/domain/persona.ts';
import {publicActor,mentalPowerLevelOf,identityOf,abilityOf} from './card.mjs';
import {fetchModelList} from './models.mjs';
import {requestEmbeddings} from './embeddings.mjs';
import {continuedMessages,repairedMessages,streamStory} from './story-stream.mjs';
import {loadCard} from './load-card.mjs';
import {setTavernContext} from './tavern-macro-engine.mjs';
import {personaDescription} from './participants.mjs';
import {developerAllowed,developerTrace} from './developer-mode.mjs';
import {createAccounts} from './accounts.mjs';
import {createEditorGateway} from './editor-gateway.mjs';
import {randomEventMessages,parseRandomEvent} from './random-events.mjs';
import {forumReplyMessages,parseForumReply,forumThreadMessages,parseForumThread} from './forum.mjs';
import {stripReasoning} from '../src/domain/reasoning.ts';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'};
const safeString=(value,max)=>typeof value==='string'&&value.length<=max;

export async function createLocalServer({projectRoot,port=5173,fetchImpl=fetch,card,host='127.0.0.1',publicOrigin='',authRequired=host!=='127.0.0.1',privateDir=resolve(projectRoot,'server/private'),accountDirectory,invitesRequired=true,editorPort=8808,channel='test',instanceName='',releaseDir='',identityRoot=''}){
  let external;
  if(publicOrigin){external=new URL(publicOrigin);if(!['http:','https:'].includes(external.protocol)||external.username||external.password||external.pathname!=='/'||external.search||external.hash)throw Error('INVALID_PUBLIC_ORIGIN');}
  if(host!=='127.0.0.1'&&(!external||!authRequired))throw Error('PUBLIC_SERVER_REQUIRES_ORIGIN_AND_AUTH');
  // 通道是部署配置：稳定版只关闭手机功能面，不改动任何存档结构或备份字段。
  // 通道、实例名、Cookie 后缀全部从同一份实例描述派生，避免各处推断出不一致的身份。
  channel=normalizeChannel(channel)||'test';
  const identity=instanceDescriptor({channel,instanceName});
  const terminalEnabled=identity.terminal,instanceLabel=identity.instanceName,cookieSuffix=identity.cookieSuffix,editorCookie=identity.editorCookie;
  // 运行实例只从自己的发布快照读取页面与静态资源：另一个实例更新共享工作树不会改变这里正在提供的内容。
  const runtimeRoot=releaseDir?resolve(releaseDir):projectRoot;
  const releaseId=releaseDir?releaseDir.replace(/[\\/]+$/,'').split(/[\\/]/).pop()||'':'';
  const dataDir=resolve(privateDir),accountDir=accountDirectory||resolve(dataDir,'accounts');
  const cloudBackup=createCloudBackup(fetchImpl);
  // 卡与世界书是用户数据，按实例私有目录读取；projectRoot 可能是发布快照，里面没有 server/private。
  const source=card||await loadCard(projectRoot,dataDir);
  const privateBooks=await loadPrivateWorldbooks(projectRoot,dataDir);
  const baseSource=source;
  const editorStore=card?null:createEditorStore(projectRoot,source,{directory:dataDir});
  const dist=await realpath(resolve(runtimeRoot,'dist')),dataset=`world-card-v1-pro-${source.source.sha256.slice(0,16)}`;
  // 身份仍按真实项目根计算：从发布快照运行的实例必须和部署脚本、启动器认出彼此。
  const projectId=createHash('sha256').update(identityRoot||projectRoot).digest('hex').slice(0,16),instance=randomBytes(16).toString('hex');
  const accounts=authRequired?await createAccounts({directory:accountDir,requireInvite:invitesRequired}):null;
  const relayPolicy=createRelayPolicy(resolve(accountDir,'relay-policy.json'),{required:authRequired,enabled:channel!=='test'});
  fetchImpl=relayPolicy.guard(fetchImpl);
  const editorGateway=await createEditorGateway({projectRoot:runtimeRoot,privateDir:dataDir,editorPort,accounts,relayPolicy,editorCookie,gameOrigin:()=>external?.origin||`http://127.0.0.1:${server.address()?.port||port}`,protectedAccess:authRequired,secure:external?.protocol==='https:'});
  const capabilities={continue:true,keyRequired:true,embeddings:true,terminal:terminalEnabled,channel};

  const theaterShares=createTheaterShares(resolve(dataDir,'theater-shares'));
  const sessions=new Map(),cookieName=`stellar_${projectId}${cookieSuffix}`,accountCookie=`academy_account_${projectId}${cookieSuffix}`;
  const accountTokenOf=request=>request.headers.cookie?.split(';').map(p=>p.trim()).find(p=>p.startsWith(accountCookie+'='))?.slice(accountCookie.length+1);
  const worldName=source.world.greeting?.[0]?.match(/欢迎您，(.+?)第/)?.[1]||'';
  let server;
  function json(response,status,value,headers={}){response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});response.end(JSON.stringify(value));}
  function token(request){return request.headers.cookie?.split(';').map(p=>p.trim()).find(p=>p.startsWith(cookieName+'='))?.slice(cookieName.length+1);}
  function session(request){const value=sessions.get(token(request));if(!value||value.expires<=Date.now()||accounts&&value.accountId!==accounts.user(accountTokenOf(request))?.id)throw modelError(401,'LOCAL_SESSION_REQUIRED');return value;}
  function authorize(request,response){try{return session(request);}catch{}if(sessions.size>=512)sessions.clear();const fresh=randomBytes(24).toString('hex');const value={expires:Date.now()+86400000,connections:new Map(),accountId:accounts?.user(accountTokenOf(request))?.id};sessions.set(fresh,value);response.setHeader('Set-Cookie',`${cookieName}=${fresh}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=86400`);return value;}
  async function body(request,maxBytes=2*1024*1024){if(!request.headers['content-type']?.startsWith('application/json'))throw modelError(415,'JSON_REQUIRED');let size=0;const chunks=[];for await(const chunk of request){size+=chunk.length;if(size>maxBytes)throw modelError(413,'REQUEST_TOO_LARGE');chunks.push(chunk);}try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw modelError(400,'INVALID_JSON');}}
  async function connection(current,data){const selected=current.connections.get(data.profile?.id);if(!selected)throw modelError(412,'MODEL_NOT_CONFIGURED');if(data.profile.apiBaseUrl&&endpoint(data.profile.apiBaseUrl)!==selected.url)throw modelError(412,'MODEL_NOT_CONFIGURED');await relayPolicy.assert(selected.url);accounts?.recordRelay(current.accountId,selected.url,'request');return selected;}
  function createGame(data,source){
    if(Object.hasOwn(data,'presentCharacterIds'))throw modelError(400,'CAST_IS_AI_CONTROLLED');
    if(!data.persona||!safeString(data.persona.name,Infinity)||!data.persona.name.trim())throw modelError(400,'PLAYER_NAME_REQUIRED');
    try{data={...data,persona:normalizePersona(data.persona)};}catch{throw modelError(400,'INVALID_PERSONA');}
    const player={id:'player',name:data.persona.name.trim(),present:true};
    const level=readPersonaExtra(data.persona.other,'\u7cbe\u795e\u529b\u7b49\u7ea7');if(level)player.mentalPowerLevel=level;
    if(data.persona.spiritAnimal)player.spiritAnimal=data.persona.spiritAnimal;
    if(data.persona.identity)player.identity=data.persona.identity;
    if(data.persona.ability)player.ability=data.persona.ability;
    if(data.persona.mentalPowerLevel)player.mentalPowerLevel=data.persona.mentalPowerLevel;
    for(const field of ['primaryGender','secondaryGender'])if(data.persona[field]){if(!safeString(data.persona[field],Infinity))throw modelError(400,'INVALID_PERSONA');player[field]=data.persona[field];}
    return {dataset,opening:source.world.greeting.join('\n'),presenceStatus:'awaiting-ai',initial:{player,characters:source.characters.map(publicActor)}};
  }
  server=createServer((request,response)=>withInternalPrompts({},async()=>{
    const currentPort=server.address()?.port||port,allowedHosts=new Set([`127.0.0.1:${currentPort}`,`localhost:${currentPort}`]);
    if(external)allowedHosts.add(external.host);
    if(!allowedHosts.has(request.headers.host)){json(response,403,{code:'LOCAL_HOST_ONLY'});return;}
    const allowedOrigins=new Set([`http://127.0.0.1:${currentPort}`,`http://localhost:${currentPort}`,...(external?[external.origin]:[])]);
    // Opaque-origin HTML sandboxes may load only these public, immutable runtime libraries.
    const renderLibrary=['GET','HEAD'].includes(request.method)&&/^\/assets\/academy-render-(?:jquery|lodash)\.js$/.test(request.url||'');
    if(!renderLibrary&&(request.headers.origin&&!allowedOrigins.has(request.headers.origin)||request.headers['sec-fetch-site']==='cross-site')){json(response,403,{code:'SAME_ORIGIN_ONLY'});return;}
    response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');
    let path;try{path=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);}catch{json(response,400,{code:'INVALID_PATH'});return;}
    try{
      const accountToken=accountTokenOf(request);
      const account=accounts?.user(accountToken);
      const setAccountCookie=(value,age=604800)=>response.setHeader('Set-Cookie',`${accountCookie}=${value}; HttpOnly; SameSite=Strict; Path=/${age===null?'':`; Max-Age=${age}`}${external?.protocol==='https:'?'; Secure':''}`);
      response.setHeader('Cache-Control','no-store');
      if(path==='/api/health'&&request.method==='GET'){json(response,200,{app:'stellar-resonance-local',version:'0.20.5',runtime:'local-card',dataset,projectId,instance,pid:process.pid,accountsRequired:!!accounts,channel,terminal:terminalEnabled,instanceName:instanceLabel,port:currentPort,release:releaseId});return;}
      const authFiles={'/reset':['reset.html','text/html'],'/auth/reset.js':['reset.js','text/javascript'],'/auth/manage.js':['manage.js','text/javascript'],'/login':['login.html','text/html'],'/auth/login.css':['login.css','text/css'],'/auth/login.js':['login.js','text/javascript'],'/auth/account.js':['account.js','text/javascript'],'/auth/editor-login.js':['editor-login.js','text/javascript'],'/auth/boot.js':['boot.js','text/javascript'],'/auth/boot.css':['boot.css','text/css']};
      if(authFiles[path]&&['GET','HEAD'].includes(request.method)){
        if(path==='/login'&&(!accounts||account)){response.writeHead(302,{Location:'/terminal'});response.end();return;}
        const [file,type]=authFiles[path];response.writeHead(200,{'Content-Type':type+'; charset=utf-8',...(['/login','/reset'].includes(path)?{'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",'X-Frame-Options':'DENY'}:{})});response.end(request.method==='HEAD'?undefined:await readFile(resolve(runtimeRoot,'server/auth-ui',file)));return;
      }
      if(path==='/editor'||path.startsWith('/editor/')){await editorGateway(request,response,path);return;}
      if(path.startsWith('/api/auth/')){
        if(!accounts)throw modelError(404,'API_NOT_FOUND');
        if(path==='/api/auth/me'&&request.method==='GET'){json(response,200,{user:account});return;}
        if(path==='/api/auth/policy'&&request.method==='GET'){json(response,200,accounts.registrationPolicy());return;}
        if(path==='/api/auth/reset/check'&&request.method==='GET'){json(response,200,{ok:accounts.checkReset(new URL(request.url,'http://localhost').searchParams.get('token'))});return;}
        if(request.method!=='POST')throw modelError(405,'POST_REQUIRED');
        if(Number(request.headers['content-length']||0)>8192)throw modelError(413,'REQUEST_TOO_LARGE');
        const data=await body(request,8192);
        if(path==='/api/auth/reset/check'){json(response,200,{ok:accounts.checkReset(data.token)});return;}
        if(path==='/api/auth/reset/apply'){await accounts.applyReset(data,request.socket.remoteAddress||'unknown');for(const [id,value]of sessions)if(!accounts.user(accountTokenOf(request))&&value.accountId===account?.id)sessions.delete(id);setAccountCookie('',0);json(response,200,{ok:true});return;}
        if(path==='/api/auth/delete'||path==='/api/auth/reset-data'){await accounts.maintain(accountToken,data,path.endsWith('/delete')?'delete':'reset',request.socket.remoteAddress||'unknown');for(const [id,value]of sessions)if(value.accountId===account?.id)sessions.delete(id);setAccountCookie('',0);json(response,200,{ok:true});return;}
        if(path==='/api/auth/register'||path==='/api/auth/login'){
          const result=await accounts.enter(path.endsWith('/register')?'register':'login',data,request.socket.remoteAddress||'unknown');
          accounts.logout(accountToken);setAccountCookie(result.token,result.maxAge);json(response,200,{user:result.user});return;
        }
        if(path==='/api/auth/logout'){accounts.logout(accountToken);setAccountCookie('',0);const accountExpiry=response.getHeader('Set-Cookie');response.setHeader('Set-Cookie',[accountExpiry,`${cookieName}=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${external?.protocol==='https:'?'; Secure':''}`]);sessions.delete(token(request));json(response,200,{ok:true});return;}
        throw modelError(404,'API_NOT_FOUND');
      }
      if(accounts&&!account&&!/^\/assets\/[A-Za-z0-9_.-]+$/.test(path)&&path!=='/favicon.svg'){
        if(path.startsWith('/api/')){json(response,401,{code:'ACCOUNT_REQUIRED'});return;}
        if(['GET','HEAD'].includes(request.method)&&['/','/index.html','/terminal','/account'].includes(path)){response.writeHead(302,{Location:'/login'});response.end();return;}
        throw modelError(404,'NOT_FOUND');
      }
      if(['GET','HEAD'].includes(request.method)&&['/','/index.html'].includes(path)){response.writeHead(302,{Location:'/terminal'});response.end();return;}
      function accountHtml(html){const info=JSON.stringify(account).replace(/</g,'\\u003c');return html.replace(/\blocalStorage\b/g,'academyStorage').replace(/<head\b[^>]*>/i,match=>match+`<script>window.__ACADEMY_ACCOUNT__=${info};</script><script src="/auth/account.js"></script>`).replace('</body>','<style>.account-tools{position:fixed;z-index:2147480000;right:12px;bottom:8px;display:flex;gap:10px;align-items:center;padding:4px 9px;background:#fffaf2e8;border-radius:4px;font-size:11px;color:#73869a}.account-tools button{border:0;background:transparent;color:inherit;font:inherit;padding:3px 5px;cursor:pointer}.account-tools button:hover{color:#294a68}</style></body>');}
      if(path==='/account'&&['GET','HEAD'].includes(request.method)){if(!account){response.writeHead(302,{Location:'/login'});response.end();return;}response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Frame-Options':'DENY','Content-Security-Policy':"frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});response.end(accountHtml(await readFile(resolve(runtimeRoot,'server/auth-ui/manage.html'),'utf8')));return;}
      const editorial=editorStore?await editorStore.read():null;
      const source=editorial?cardWithEditor(baseSource,editorial.data):baseSource;setInternalPrompts(editorial?.data.internalPrompts);
      if(path==='/api/character-cards'&&request.method==='GET'){json(response,200,{revision:editorial?.revision||dataset,characters:publicCards({characters:source.characters})});return;}
      if(path==='/api/map-assets'&&request.method==='GET'){json(response,200,{revision:editorial?.revision||dataset,map:{...(editorial?.data.map||{main:'',places:{}}),locations:source.places}});return;}
      if(path==='/api/health'&&request.method==='GET'){json(response,200,{app:'stellar-resonance-local',version:'0.20.5',runtime:'local-card',dataset,projectId,instance,pid:process.pid,channel,terminal:terminalEnabled,instanceName:instanceLabel,port:currentPort,release:releaseId});return;}
      if(path==='/api/bootstrap'&&request.method==='GET'){authorize(request,response);json(response,200,{runtime:'local-card',developerMode:developerAllowed(account),dataset,name:worldName,narratorName:source.world.name||'星穹学院',capabilities,greeting:source.world.greeting,characters:[],majorCharacters:source.characters.filter(c=>majorCharacter(c.name)).map(({id,name,img})=>({id,name,...(img?{img}: {})})),characterFacts:source.characters.filter(c=>c.primaryGender||identityOf(c)||abilityOf(c)||mentalPowerLevelOf(c)).map(c=>({id:c.id,primaryGender:c.primaryGender||'',...(identityOf(c)?{identity:identityOf(c)}:{}),...(abilityOf(c)?{ability:abilityOf(c)}:{}),...(mentalPowerLevelOf(c)?{mentalPowerLevel:mentalPowerLevelOf(c)}:{})})),places:source.places.map(p=>({id:p.id,name:p.name,area:p.area,px:p.px,py:p.py})),counts:{characters:source.characters.length,departments:source.world.departments.length,places:source.places.length},missing:source.missing});return;}
      if(path==='/api/access'&&request.method==='POST'){await body(request);authorize(request,response);json(response,200,{capabilities});return;}
      if(path==='/api/cloud-backup'&&request.method==='POST'){session(request);const data=await body(request,12*1024*1024);json(response,200,await cloudBackup(data));return;}
      if(path.startsWith('/api/')){
        if(request.method!=='POST')throw modelError(405,'POST_REQUIRED');const current=session(request),data=await body(request);
        if(path==='/api/theater-shares'||path==='/api/theater-shares/lookup'){json(response,200,await theaterShares(path.endsWith('/lookup')?'lookup':'create',data,account?.id||'local'));return;}
        if(path==='/api/terminal-code'){
          if(!terminalEnabled)throw modelError(403,'TERMINAL_DISABLED');
          if(typeof data.sessionId!=='string'||!data.sessionId||data.sessionId.length>128)throw modelError(400,'INVALID_TERMINAL_REQUEST');
          const actors=terminalActors(source,data.state),entries=Object.entries(terminalCodeBindings({...data.state,characters:actors})).map(([id,code])=>({id,code}));
          if(data.self===true){json(response,200,{code:entries.find(e=>e.id==='player')?.code||''});return;}
          if(typeof data.code!=='string'||!/^\d{11}$/.test(data.code))throw modelError(400,'INVALID_TERMINAL_CODE');
          const entry=entries.find(e=>e.code===data.code&&e.id!=='player'),actor=actors.find(c=>c.id===entry?.id);
          if(!actor)throw modelError(404,'TERMINAL_CODE_NOT_FOUND');json(response,200,{id:actor.id,name:actor.name,identity:identityOf(actor)||'',code:entry.code});return;
        }
        guardPromptRequest(path,data);
        setTavernContext({user:data.persona?.name||data.before?.player?.name||'',char:source.world.name||'群星共振世界卡',persona:data.persona?personaDescription(data.persona):'',input:data.input||'',history:data.history||[]});
        if(path==='/api/connection'){
          if(!safeString(data.profileId,128)||!data.profileId||!safeString(data.apiBaseUrl,2000))throw modelError(400,'INVALID_MODEL_URL');
          const url=endpoint(data.apiBaseUrl);if(current.connections.size>=30&&!current.connections.has(data.profileId))throw modelError(400,'TOO_MANY_CONNECTIONS');
          await relayPolicy.assert(url);accounts?.recordRelay(current.accountId,url,'configured');current.connections.set(data.profileId,{url});json(response,200,{profileId:data.profileId,origin:new URL(url).origin,registered:true});return;
        }
        if(path==='/api/models'){
          if(!safeString(data.apiBaseUrl,2000))throw modelError(400,'INVALID_MODEL_URL');if(data.kind!==undefined&&data.kind!=='embedding')throw modelError(400,'INVALID_MODEL_KIND');
          const controller=new AbortController();response.on('close',()=>controller.abort());
          const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]);
          await relayPolicy.assert(endpoint(data.apiBaseUrl));accounts?.recordRelay(current.accountId,endpoint(data.apiBaseUrl),'models');
          const result=await fetchModelList({apiBaseUrl:data.apiBaseUrl,key:data.key,signal,fetchImpl,kind:data.kind});
          signal.throwIfAborted();json(response,200,result);return;
        }
        if(path==='/api/probe'){
          if(!['text','embedding'].includes(data.kind))throw modelError(400,'INVALID_PROBE');
          if(!safeString(data.profile?.apiBaseUrl,2000))throw modelError(400,'INVALID_MODEL_URL');
          const selected={url:endpoint(data.profile.apiBaseUrl)},controller=new AbortController();response.on('close',()=>controller.abort());
          await relayPolicy.assert(selected.url);accounts?.recordRelay(current.accountId,selected.url,'probe');
          const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]),started=performance.now();
          if(data.kind==='embedding'){
            const {vectors}=await requestEmbeddings({connection:selected,profile:data.profile,key:data.key,texts:['连接测试'],signal,fetchImpl});
            signal.throwIfAborted();json(response,200,{kind:'embedding',durationMs:Math.round(performance.now()-started),dimensions:vectors[0].length});
          }else{
            const upstream=await openCompletion({connection:selected,profile:{...data.profile,temperature:0.7,maxTokens:512,topP:undefined,frequencyPenalty:undefined,presencePenalty:undefined},key:data.key,messages:[{role:'user',content:internalPrompt('app.3')}],signal,fetchImpl});
            let visibleChars=0;for await(const chunk of completionChunks(upstream,{signal})){visibleChars+=chunk.length;}
            signal.throwIfAborted();if(!visibleChars)throw modelError(502,'MODEL_EMPTY_RESPONSE');
            json(response,200,{kind:'text',durationMs:Math.round(performance.now()-started),visibleChars});
          }return;
        }
        if(path==='/api/personal-terminal'){
          if(!terminalEnabled)throw modelError(403,'TERMINAL_DISABLED');
          const plan=terminalPlan(source,data,privateBooks),selected=await connection(current,data),privateCards=['party-eleven','party-eleven-talk','party-eleven-batch','party-liar-turn','party-liar-reply'].includes(plan.task);
          const controller=new AbortController();response.on('close',()=>controller.abort());
          const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]);
          const clipRaw=(value,limit=48000)=>{if(typeof value!=='string')return '';if(value.length<=limit)return value;const marker=`\n…[已截断，原长度 ${value.length} 字符]`;return value.slice(0,Math.max(0,limit-marker.length))+marker;};
          const terminalRaw=text=>clipRaw(text,48000);
          const combinedRaw=(first,second)=>second?clipRaw(first,24000)+'\n\n[纠正稿]\n'+clipRaw(second,24000):terminalRaw(first);
          let content='',corrected='';
          const isAfterparty=plan.task==='afterparty',taskMaxTokens=isAfterparty?4000:6000,taskContentCap=isAfterparty?24000:48000;
          try{
          const upstream=await openCompletion({connection:selected,profile:{...data.profile,maxTokens:taskMaxTokens},key:data.key,messages:plan.messages,signal,fetchImpl});
          for await(const chunk of completionChunks(upstream,{signal})){content+=chunk;if(content.length>taskContentCap)throw modelError(502,'INVALID_TERMINAL_RESULT');}
          signal.throwIfAborted();let result;
          try{result=parseTerminalResult(content,plan);}
          catch(error){
            if(!error?.retryable||signal.aborted)throw error;
            const correction=[...plan.messages,{role:'assistant',content:content.slice(0,16000)},{role:'user',content:`上一次回复未通过格式检查（${error.reason}）。仍使用同一组已锁定目标，不得改选、重新抽签或泄露任何姓名/编号映射；请严格只输出系统要求的 JSON。`}];
            const retryUpstream=await openCompletion({connection:selected,profile:{...data.profile,maxTokens:taskMaxTokens},key:data.key,messages:correction,signal,fetchImpl});
            for await(const chunk of completionChunks(retryUpstream,{signal})){corrected+=chunk;if(corrected.length>taskContentCap)throw modelError(502,'INVALID_TERMINAL_RESULT');}
            signal.throwIfAborted();
            try{result=parseTerminalResult(corrected,plan);}catch(next){next.raw=combinedRaw(content,corrected);throw next;}
          }
          let raw=combinedRaw(content,corrected);
          if(plan.task==='react'){
            const review=terminalFollowupPlan(source,data,'review',{command:data.input,result},privateBooks);
            const upstream=await openCompletion({connection:selected,profile:{...data.profile,maxTokens:1000},key:data.key,messages:review.messages,signal,fetchImpl});
            let checked='';for await(const part of completionChunks(upstream,{signal})){checked+=part;if(checked.length>4000)throw modelError(502,'INVALID_TERMINAL_RESULT');}
            try{signal.throwIfAborted();parseTerminalResult(checked,review);}catch(error){error.raw=terminalRaw(checked);throw error;}
            raw=clipRaw(raw+'\n\n[复核]\n'+checked,48000);
          }
          json(response,200,{...result,...(!privateCards?{raw:terminalRaw(raw)}:{})});return;
          }catch(error){if(privateCards)delete error.raw;else if(typeof error?.raw!=='string')error.raw=terminalRaw(content+(corrected?'\n\n[纠正稿]\n'+corrected:''));throw error;}
        }
        if(path==='/api/new-game'){json(response,200,createGame(data,source));return;}
        if(path==='/api/persona'){
          const selected=await connection(current,data),messages=buildPersonaMessages(source,data.wish,data.draft);
          const controller=new AbortController();response.on('close',()=>controller.abort());
          const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]);
          const upstream=await openCompletion({connection:selected,key:data.key,profile:data.profile,messages,signal,fetchImpl});
          let content='';for await(const chunk of completionChunks(upstream,{signal})){signal.throwIfAborted();content+=chunk;if(content.length>16000)throw modelError(502,'INVALID_PERSONA_RESULT');}
          signal.throwIfAborted();json(response,200,{persona:parsePersonaResult(content)});return;
        }
        if(path==='/api/place'){const place=source.places.find(p=>p.id===data.id);if(!place)throw modelError(404,'PLACE_NOT_FOUND');json(response,200,{id:place.id,name:place.name,description:place.intro||place.note});return;}
        if(path==='/api/generate'){
          try{data.outputParsing=cleanOutputParsing(data.outputParsing);}catch{throw modelError(400,'INVALID_OUTPUT_PARSING');}
          if(Object.hasOwn(data,'presentCharacterIds'))throw modelError(400,'CAST_IS_AI_CONTROLLED');
          // 正文请求不再携带终端上下文：手机通讯走独立的 /api/personal-terminal 任务。
          // 旧页面仍可能带上该字段，直接丢弃而不是报错。
          delete data.terminalContext;
          let partial='',stateOnly=false;
          if(data.continuation!==undefined){if(!data.continuation||Array.isArray(data.continuation)||Object.keys(data.continuation).some(k=>!['partial','mode','repairPlan'].includes(k))||data.continuation.mode!==undefined&&data.continuation.mode!=='state'||!safeString(data.continuation.partial,200000)||!data.continuation.partial.trim())throw modelError(400,'INVALID_CONTINUATION');partial=data.continuation.partial;stateOnly=data.continuation.mode==='state';}
          let repairPlan;if(stateOnly&&data.continuation?.repairPlan!==undefined){try{repairPlan=validateRepairPlan(data.continuation.repairPlan);}catch{throw modelError(400,'INVALID_REPAIR_PLAN');}}
          if(repairPlan){data.stateEnabled=data.stateEnabled!==false&&repairNeedsState(repairPlan);data.suggestionsEnabled=repairPlan.suggestions;data.theaterSettings=cleanTheaters(data.theaterSettings).map(s=>({...s,enabled:s.enabled&&repairPlan.theaterSlots.includes(s.slot)}));}
          const generation=data;
          const selected=await connection(current,generation),{requestId,messages,state,theaterSettings,dice,card:generationCard,presetDiagnostics,repairLore}=buildMessages(source,{...data,stateSeparate:false},privateBooks);
          if(terminalEnabled)messages.splice(3,0,terminalCodePrompt(Object.entries(terminalCodeBindings({...data.state,characters:terminalActors(source,data.state)})).map(([id,code])=>({id,code})),terminalActors(source,data.state),data.stateEnabled!==false));
          if(partial){partial=stripReasoning(partial,outputParsingTags(data.outputParsing));if(!partial.trim())throw modelError(400,'INVALID_CONTINUATION');}
          const controller=new AbortController();response.on('close',()=>controller.abort());
          const firstSignal=AbortSignal.any([controller.signal,AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]);
          const initialMessages=stateOnly?repairedMessages(messages,partial,generationCard,state,{requestId,theaterSettings,persona:data.persona,dice,stateEnabled:data.stateEnabled,suggestionsEnabled:data.suggestionsEnabled,input:data.input,worldInfo:repairLore,repairPlan}):partial?continuedMessages(messages,partial,state.player.name):messages;
          const developerStarted=performance.now();
          const upstream=await openCompletion({connection:selected,key:generation.key,profile:generation.profile,messages:initialMessages,signal:firstSignal,fetchImpl});
          response.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});
          if(developerAllowed(account))response.write(`data: ${JSON.stringify({type:'developer-trace',trace:developerTrace(initialMessages,{stage:'request',model:generation.profile.model,stateAuxiliary:false,presets:presetDiagnostics,profile:generation.profile})})}\n\n`);
          let lastProgress=0;const onProgress=stats=>{if(Date.now()-lastProgress<1000)return;lastProgress=Date.now();if(!response.destroyed)response.write(`data: ${JSON.stringify({type:'progress',phase:stats.visibleChars?'receiving':stats.contentChars||stats.reasoningChars?'hidden':'waiting'})}\n\n`);};
          const validationCodes=[];const heartbeat=setInterval(()=>{if(!response.destroyed)response.write(': keepalive\n\n');},15000);
          try{for await(const event of streamStory({card:generationCard,state,options:{outputParsing:data.outputParsing,requestId,repairPlan,input:data.input,stateEnabled:data.stateEnabled,suggestionsEnabled:data.suggestionsEnabled,theaterSettings,persona:data.persona,dice,requireDynamicState:!repairPlan,captureFormatErrors:data.captureFormatErrors===true,singleStateCall:data.singleStateCall===true},messages,partial,stateOnly,connection:selected,profile:generation.profile,key:generation.key,firstResponse:upstream,firstSignal,signal:controller.signal,fetchImpl,onProgress})){if(event.type==='diagnostic')validationCodes.push(event.diagnostic.code);if(event.type==='done'){if(developerAllowed(account))response.write(`data: ${JSON.stringify({type:'developer-trace',trace:developerTrace(initialMessages,{stage:'complete',model:generation.profile.model,elapsedMs:performance.now()-developerStarted,stateAuxiliary:false,outcome:event.outcome,validationCodes})})}\n\n`);}response.write(`data: ${JSON.stringify(event)}\n\n`);}response.end();}
          catch(error){const code=error.code||'MODEL_STREAM_INTERRUPTED';controller.abort();if(!response.destroyed)response.end(`data: ${JSON.stringify({type:'error',code,...completionFailureFields(error),...(error.reasonCode?{reasonCode:error.reasonCode}:{})})}\n\n`);}
          finally{clearInterval(heartbeat);}
          return;
        }
        if(path==='/api/random-event'){
          const selected=await connection(current,data),messages=randomEventMessages(source,data);const controller=new AbortController();response.on('close',()=>controller.abort());const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]);
          const upstream=await openCompletion({connection:selected,key:data.key,profile:{...data.profile,maxTokens:Math.min(data.profile.maxTokens,2000)},messages,signal,fetchImpl});let content='';for await(const chunk of completionChunks(upstream,{signal})){content+=chunk;if(content.length>8000)throw modelError(502,'INVALID_RANDOM_EVENT_RESULT');}signal.throwIfAborted();json(response,200,parseRandomEvent(content,data.kind));return;
        }
        if(path==='/api/forum-reply'){
          const selected=await connection(current,data),thread=data.minReplies!==undefined,plan=thread?forumThreadMessages(source,data):forumReplyMessages(source,data),{speaker,messages}=plan;
          const controller=new AbortController();response.on('close',()=>controller.abort());const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]);
          const upstream=await openCompletion({connection:selected,key:data.key,profile:thread?{...data.profile,maxTokens:Math.max(data.profile.maxTokens,3000)}:data.profile,messages,signal,fetchImpl});let content='';
          for await(const chunk of completionChunks(upstream,{signal})){content+=chunk;if(content.length>(thread?60000:8000))throw modelError(502,'INVALID_FORUM_REPLY_RESULT');}
          signal.throwIfAborted();json(response,200,thread?parseForumThread(content,plan):parseForumReply(content,speaker));return;
        }
        if(path==='/api/memory'){
          const selected=await connection(current,data),batch=data.rounds!==undefined,{input,inputs,messages}=batch?batchMemoryMessages(data.rounds):memoryMessages(data);const controller=new AbortController();response.on('close',()=>controller.abort());const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]);
          const upstream=await openCompletion({connection:selected,key:data.key,profile:data.profile,messages,signal,fetchImpl});let content='';for await(const chunk of completionChunks(upstream,{signal})){content+=chunk;if(content.length>(batch?150000:20000))throw modelError(502,'INVALID_MEMORY_RESULT');}
          signal.throwIfAborted();json(response,200,batch?{records:parseBatchMemoryResult(content,inputs)}:{record:parseMemoryResult(content,input)});return;
        }
        if(path==='/api/utility'){
          if(!['summary','suggestions'].includes(data.task)||!Array.isArray(data.texts)||data.texts.length>10||data.texts.some(t=>!safeString(t,100000)))throw modelError(400,'INVALID_UTILITY');
          const selected=await connection(current,data),signal=AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS);
          const instruction=data.task==='summary'?internalPrompt('app.2'):internalPrompt("app.1");
          const upstream=await openCompletion({connection:selected,key:data.key,profile:data.profile,messages:[{role:'system',content:instruction},{role:'user',content:JSON.stringify(data.texts)}],signal,fetchImpl});
          let result='';for await(const chunk of completionChunks(upstream,{signal})){result+=chunk;if(result.length>12000)throw modelError(502,'MODEL_RESPONSE_TOO_LARGE');}
          json(response,200,{items:data.task==='summary'?[result.trim()]:result.split('\n').map(s=>s.replace(/^\s*[-*\d.、)]+\s*/,'').trim()).filter(Boolean).slice(0,4)});return;
        }
        if(path==='/api/embeddings'){
          const selected=await connection(current,data),controller=new AbortController();response.on('close',()=>controller.abort());
          const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS)]);
          const result=await requestEmbeddings({connection:selected,profile:data.profile,key:data.key,texts:data.texts,signal,fetchImpl});signal.throwIfAborted();json(response,200,result);return;
        }
        throw modelError(404,'API_NOT_FOUND');
      }
      if(!['GET','HEAD'].includes(request.method))throw modelError(405,'GET_REQUIRED');
      if(path==='/terminal'){
        let terminal=await readFile(resolve(runtimeRoot,'星穹游戏终端 (1).html'),'utf8');
        const catalog=JSON.stringify(publicCards({characters:source.characters})).replace(/</g,'\\u003c');
        terminal=terminal.replace('<script>','<script>window.__ACADEMY_MAP_ASSETS__='+JSON.stringify({...editorial?.data.map,locations:source.places}).replace(/</g,'\\u003c')+';');
        terminal=terminal.replace(/const SPLASH_CHARACTERS = \[[\s\S]*?\n    \];/,()=> 'const SPLASH_CHARACTERS = '+catalog+';window.__ACADEMY_CARD_REVISION__='+JSON.stringify(editorial?.revision||dataset)+';');
        const index=await readFile(resolve(dist,'index.html'),'utf8');
        const assets=[...index.matchAll(/<(?:script\b[^>]*src="\/assets\/[^"]+"[^>]*><\/script>|link\b[^>]*href="\/assets\/[^"]+"[^>]*>)/g)].map(match=>match[0]).join('\n');
        const boot=bootHead;
        const composed=terminal.replace('<html ','<html data-academy-boot ').replace('</head>',boot+'</head>').replace(/<body\b[^>]*>/i,body=>body+bootScreen).replace('</body>',assets+'\n</body>');
        const html=account?accountHtml(composed):composed;
        response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end(request.method==='HEAD'?undefined:html);return;
      }
      if(!['/','/index.html','/favicon.svg'].includes(path)&&!/^\/assets\/[A-Za-z0-9_.-]+$/.test(path))throw modelError(404,'NOT_FOUND');
      const candidate=resolve(dist,path==='/'?'index.html':'.'+path),file=await realpath(candidate).catch(()=>null);if(!file||!file.startsWith(dist+sep))throw modelError(404,'NOT_FOUND');
      let bytes=await readFile(file);if(account&&extname(file)==='.html')bytes=Buffer.from(accountHtml(bytes.toString('utf8')));response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});response.end(request.method==='HEAD'?undefined:bytes);
    }catch(error){
      // Disconnects abort upstream work with a DOMException whose code is numeric.
      // A closed response needs no error body; never let error formatting reject
      // this async request handler and terminate the process (and every session).
      if(response.destroyed||response.writableEnded)return;
      if(response.headersSent){response.destroy();return;}
      const failure=error!==null&&typeof error==='object'?error:{};
      if(failure.name==='TimeoutError'){json(response,504,{code:'MODEL_TIMEOUT'});return;}
      const validStatus=Number.isInteger(failure.status)&&failure.status>=400&&failure.status<=599;
      const status=validStatus?failure.status:500;
      const code=validStatus&&typeof failure.code==='string'&&failure.code?failure.code:'SERVER_ERROR';
      json(response,status,{code,...completionFailureFields(failure),...(typeof failure.raw==='string'?{raw:failure.raw.slice(0,48000)}:{}),...(code.startsWith('CLOUD_')&&typeof failure.cloudDetail==='string'?{cloudDetail:failure.cloudDetail}:{}),...(code.startsWith('CLOUD_')&&typeof failure.cloudStep==='string'?{cloudStep:failure.cloudStep}:{})});
    }
  }));
  let accountsClosed=false;const closeAccounts=()=>{if(!accountsClosed){accountsClosed=true;accounts?.close();}};
  server.once('close',closeAccounts);server.once('error',closeAccounts);
  // 运行中的实例登记自己的快照：清理旧快照时必须保护正在服务的版本。
  const releaseHandle=releaseDir?await markReleaseActive(runtimeRoot).catch(()=>undefined):undefined;
  if(releaseHandle)server.once('close',()=>{void releaseHandle();});
  return {server,dataset,start:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>resolve(server.address().port));})};
}
