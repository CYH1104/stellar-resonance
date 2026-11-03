import {createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';

const digest=value=>createHash('sha256').update(value).digest('hex');
const prefix='academy-invite:';
const failure=(code,status=400)=>Object.assign(Error(code),{code,status});

/** Native account store and native account creation; no second user database. */
export function academyAccounts({store,create,now=Date.now}){
  let tail=Promise.resolve();
  const serial=fn=>{const task=tail.then(fn);tail=task.catch(()=>{});return task;};
  return {
    async invite(owner){
      if(!owner?.admin)throw failure('NATIVE_ADMIN_REQUIRED',403);
      const code=randomBytes(18).toString('base64url');
      await store.setItem(prefix+digest(code),{version:1,created:now(),createdBy:owner.handle,status:'unused'});
      return {code};
    },
    register(body){return serial(async()=>{
      const handle=typeof body?.handle==='string'?body.handle.trim().toLowerCase():'';
      const name=typeof body?.name==='string'?body.name.trim():'';
      const password=body?.password,code=typeof body?.inviteCode==='string'?body.inviteCode.trim():'';
      if(!/^[a-z0-9][a-z0-9-]{2,63}$/.test(handle)||handle==='default-user'||!name||name.length>80)throw failure('NATIVE_REGISTRATION_INVALID');
      if(typeof password!=='string'||password.length<8||password.length>128)throw failure('NATIVE_PASSWORD_INVALID');
      if(!/^[A-Za-z0-9_-]{24}$/.test(code))throw failure('NATIVE_INVITE_INVALID');
      const key=prefix+digest(code),invite=await store.getItem(key);
      if(invite?.version!==1||invite.status!=='unused')throw failure('NATIVE_INVITE_INVALID');
      if(await store.getItem('user:'+handle))throw failure('NATIVE_ACCOUNT_EXISTS',409);
      // Reserve before creating. A failed/uncertain native write never makes an
      // invite usable again; the administrator can issue a replacement.
      await store.setItem(key,{...invite,status:'reserved',handle});
      const result=await create({handle,name,password,admin:false});
      if(result?.handle!==handle)throw failure('NATIVE_ACCOUNT_CREATE_FAILED',502);
      await store.setItem(key,{...invite,status:'used',handle,used:now()});
      return {handle};
    });},
  };
}

/** Append to the original public router, which retains native CSRF/session middleware. */
export async function installNativeAccounts(pluginRouter){
  const require=createRequire(new URL('../SillyTavern/package.json',import.meta.url));
  const store=require('node-persist');
  const {RateLimiterMemory}=require('rate-limiter-flexible');
  const {router:publicRouter}=await import('../SillyTavern/src/endpoints/users-public.js');
  const {router:adminRouter}=await import('../SillyTavern/src/endpoints/users-admin.js');
  const {invokeNative}=await import('./storage.mjs');
  const accounts=academyAccounts({store,create:body=>invokeNative(adminRouter,'/create',{user:{profile:{admin:true}}},body)});
  const limiter=new RateLimiterMemory({points:8,duration:900});
  const sendError=(response,error)=>response.status([400,403,409,429,502].includes(error?.status)?error.status:500).json({error:/^NATIVE_[A-Z_]+$/.test(error?.code||'')?error.code:'NATIVE_ACCOUNT_CREATE_FAILED'});
  publicRouter.post('/register',async(request,response)=>{
    try{
      if(request.user)return response.status(409).json({error:'NATIVE_LOGOUT_FIRST'});
      if(!request.session)return response.status(403).json({error:'NATIVE_LOGIN_REQUIRED'});
      // The public gateway supplies a dedicated address header. Ignore all
      // client-supplied forwarding headers when reaching the native loopback.
      try{await limiter.consume(request.headers['x-academy-client-address']||request.socket.remoteAddress||'unknown');}
      catch{return response.status(429).json({error:'NATIVE_REGISTER_RATE_LIMIT'});}
      return response.json(await accounts.register(request.body));
    }catch(error){return sendError(response,error);}
  });
  pluginRouter.post('/accounts/invites/create',async(request,response)=>{
    try{return response.json(await accounts.invite(request.user?.profile));}
    catch(error){return sendError(response,error);}
  });
}
