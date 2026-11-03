import {privateGeneration} from './generation.mjs';
import {terminalPlans} from './terminal.mjs';
import {academyCatalog,academyTasks,catalogFromEditor} from './tasks.mjs';
import {nativeVectors} from './vectors.mjs';
import {nativeStorageRoutes} from './storage.mjs';
import {installNativeAccounts} from './accounts.mjs';
import {nativeAuthor,nativeAuthorRoutes} from './author.mjs';
import {nativeModelBody,nativeModelPolicy} from './modelRequest.mjs';
export const info={id:'academy-compat',name:'Academy feature compatibility',description:'Academy feature contracts on original native requests and storage'};
export async function init(router,{installAccounts=installNativeAccounts}={}){
  await installAccounts(router);
  const plans=terminalPlans();
  let catalogPromise;const catalog=()=>catalogPromise??=academyCatalog().catch(error=>{catalogPromise=undefined;throw error;});
  let tasksPromise;const tasks=()=>tasksPromise??=catalog().then(academyTasks).catch(error=>{tasksPromise=undefined;throw error;});
  nativeAuthorRoutes(router,nativeAuthor({catalog,changed:async editor=>{const next=catalogFromEditor((await catalog()).base,editor);catalogPromise=Promise.resolve(next);if(tasksPromise)(await tasksPromise).updateCatalog(next);}}));
  const generation=privateGeneration({catalog,tasks,terminal:plans});
  let policy;const modelPolicy=()=>policy??=nativeModelPolicy();
  const publicPlan=value=>({token:value.token,...(value.requestId?{requestId:value.requestId}:{})});
  const route=action=>async(request,response)=>{
    const owner=request.user?.profile?.handle;
    if(!owner)return response.status(401).send({error:'NATIVE_LOGIN_REQUIRED'});
    if(process.env.ACADEMY_PUBLIC_PREVIEW==='1'&&['/terminal/plan','/terminal/finish','/tasks/plan','/tasks/finish','/prepare'].includes(request.path))return response.status(503).send({error:'NATIVE_PRIVATE_COMPILER_PENDING'});
    try{return response.send(await action(owner,request.body,request,response));}
    catch(error){return response.status([400,401,403,404,409,429,502,503].includes(error?.status)?error.status:500).send({error:/^[A-Z_]{1,100}$/.test(error?.code||'')?error.code:'NATIVE_TASK_FAILED'});}
  };
  nativeStorageRoutes(router,route);
  router.post('/model-service',route(async(owner,body)=>{await modelPolicy().assert(body?.apiBaseUrl);return {origin:new URL(body.apiBaseUrl).origin};}));
  router.post('/model-policy/read',route(async(owner,body,request)=>{if(!request.user.profile.admin)throw Object.assign(Error('NATIVE_ADMIN_REQUIRED'),{status:403,code:'NATIVE_ADMIN_REQUIRED'});return modelPolicy().read();}));
  router.post('/model-policy/save',route(async(owner,body,request)=>{if(!request.user.profile.admin)throw Object.assign(Error('NATIVE_ADMIN_REQUIRED'),{status:403,code:'NATIVE_ADMIN_REQUIRED'});return modelPolicy().save(body?.origins);}));
  router.post('/terminal/plan',route(async(owner,body)=>publicPlan(plans.plan(owner,body?.input,(await catalog()).card))));
  router.post('/terminal/finish',route((owner,body)=>{const value=plans.finish(owner,body?.token,body?.text);if(value.review)value.review=publicPlan(value.review);return value;}));
  router.post('/terminal/cancel',route((owner,body)=>{generation.cancel(owner,'terminal',body?.token);plans.cancel(owner,body?.token);return {ok:true};}));
  router.post('/catalog',route(async()=> (await tasks()).catalog()));
  router.post('/cards',route(async()=> (await tasks()).cards()));
  router.post('/map',route(async()=> (await tasks()).map()));
  router.post('/new-game',route(async(owner,body)=>(await tasks()).newGame(body.persona)));
  router.post('/place',route(async(owner,body)=>(await tasks()).place(body.id)));
  router.post('/tasks/plan',route(async(owner,body)=>publicPlan((await tasks()).plan(owner,body.task,body.input))));
  router.post('/tasks/finish',route(async(owner,body)=>(await tasks()).finish(owner,body.token,body.text)));
  router.post('/tasks/cancel',route(async(owner,body)=>{generation.cancel(owner,'tasks',body.token);(await tasks()).cancel(owner,body.token);return {ok:true};}));
  // Author assets must never be exposed to the player's native iframe or scripts.
  router.post('/author-books',route(()=>{throw Object.assign(Error('PRIVATE_AUTHOR_DATA_FORBIDDEN'),{status:403,code:'PRIVATE_AUTHOR_DATA_FORBIDDEN'});}));
  router.post('/prepare',route(async(owner,body,request,response)=>{const controller=new AbortController();response.on('close',()=>controller.abort());return generation.prepare(owner,body,AbortSignal.any([controller.signal,AbortSignal.timeout(600000)]));}));
  const completion=operation=>async(request,response,next)=>{
    const owner=request.user?.profile?.handle;if(!owner)return response.status(401).send({error:'NATIVE_LOGIN_REQUIRED'});
    if(operation==='generate'&&process.env.ACADEMY_PUBLIC_PREVIEW==='1')return response.status(503).send({error:'NATIVE_PRIVATE_COMPILER_PENDING'});
    try{
      const body=nativeModelBody(request.body);
      await modelPolicy().assert(body.custom_url);
      if(operation==='generate'){const messages=generation.consume(owner,body);if(messages)body.messages=messages;}
      const {router:native}=await import('../SillyTavern/src/endpoints/backends/chat-completions.js');
      const child=Object.assign(Object.create(request),{url:'/'+operation,body});
      native.handle(child,response,error=>error?response.status(502).send({error:'NATIVE_COMPLETION_FAILED'}):next());
    }catch(error){if(!response.headersSent)response.status([400,403,409,429,503].includes(error.status)?error.status:502).send({error:/^[A-Z_]+$/.test(error.code||'')?error.code:'NATIVE_COMPLETION_FAILED'});}
  };
  router.post('/completions/generate',completion('generate'));
  router.post('/completions/status',completion('status'));
  router.post('/vectors',route(async(owner,body,request,response)=>{await modelPolicy().assert(body?.profile?.apiBaseUrl);const controller=new AbortController();response.on('close',()=>controller.abort());return nativeVectors(request,AbortSignal.any([controller.signal,AbortSignal.timeout(600000)]));}));
}
