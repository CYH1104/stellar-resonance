import {request as httpRequest} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest();
export async function editorAccessKey(projectRoot){
  const file=resolve(projectRoot,'server/private/editor-access-key.txt');await mkdir(resolve(projectRoot,'server/private'),{recursive:true,mode:0o700});
  const existing=async()=>{const key=(await readFile(file,'utf8')).trim();if(!/^[A-Za-z0-9_-]{24,128}$/.test(key))throw Error('EDITOR_KEY_INVALID');return key;};
  try{return await existing();}catch(e){if(e.code!=='ENOENT')throw e;}
  const key=randomBytes(24).toString('base64url');try{await writeFile(file,key+'\n',{flag:'wx',mode:0o600});return key;}catch(e){if(e.code==='EEXIST')return existing();throw e;}
}
export async function createEditorGateway({projectRoot,editorPort,protectedAccess,secure=false,accounts,gameOrigin}){
  const key=protectedAccess?await editorAccessKey(projectRoot):'',sessions=new Map(),attempts=new Map();
  const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  const cookie=(res,value,age)=>res.setHeader('Set-Cookie',`academy_editor=${value}; HttpOnly; SameSite=Strict; Path=/editor; Max-Age=${age}${secure?'; Secure':''}`);
  function authorized(req){if(!protectedAccess)return true;const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('academy_editor='))?.slice(15);return token&&sessions.get(hash(token).toString('hex'))>Date.now();}
  return async function editorGateway(req,res,path){
    if(path==='/editor'){res.writeHead(302,{Location:'/editor/'});res.end();return;}
    if(path==='/editor/login'&&req.method==='POST'){
      const ip=req.socket.remoteAddress||'unknown',now=Date.now();for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);
      const attempt=attempts.get(ip)||{count:0,until:now+15*60*1000};if(attempt.count>=10||!attempts.has(ip)&&attempts.size>=10000){json(res,429,{code:'AUTH_RATE_LIMIT'});return;}attempt.count++;attempts.set(ip,attempt);
      if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{code:'JSON_REQUIRED'});return;}
      let size=0,chunks=[];for await(const part of req){size+=part.length;if(size>2048){json(res,413,{code:'REQUEST_TOO_LARGE'});return;}chunks.push(part);}
      let submitted;try{submitted=JSON.parse(Buffer.concat(chunks).toString('utf8')).key;}catch{json(res,400,{code:'INVALID_JSON'});return;}
      if(!protectedAccess||typeof submitted!=='string'||!timingSafeEqual(hash(submitted),hash(key))){json(res,401,{code:'INVALID_EDITOR_KEY'});return;}
      for(const [token,expires]of sessions)if(expires<now)sessions.delete(token);if(sessions.size>=1000){json(res,503,{code:'AUTH_BUSY'});return;}
      const token=randomBytes(32).toString('hex');sessions.set(hash(token).toString('hex'),now+8*3600000);cookie(res,token,8*3600);json(res,200,{ok:true});return;
    }
    if(!authorized(req)){
      if(path==='/editor/'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(await readFile(resolve(projectRoot,'server/auth-ui/editor-login.html')));return;}
      json(res,401,{code:'EDITOR_ACCESS_REQUIRED'});return;
    }
    if(path==='/editor/logout'&&req.method==='POST'){const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('academy_editor='))?.slice(15);if(token)sessions.delete(hash(token).toString('hex'));cookie(res,'',0);json(res,200,{ok:true});return;}
    if(path==='/editor/accounts'||path==='/editor/accounts.js'){
      if(req.method!=='GET'){json(res,405,{code:'GET_REQUIRED'});return;}
      res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(await readFile(resolve(projectRoot,path.endsWith('.js')?'server/auth-ui/admin-accounts.js':'server/auth-ui/admin-accounts.html')));return;
    }
    if(path.startsWith('/editor/api/accounts/')){
      if(!accounts){json(res,503,{code:'ACCOUNTS_UNAVAILABLE'});return;}
      if(req.method!=='POST'){json(res,405,{code:'POST_REQUIRED'});return;}
      if(!req.headers['content-type']?.startsWith('application/json')){json(res,415,{code:'JSON_REQUIRED'});return;}
      let size=0,chunks=[];for await(const part of req){size+=part.length;if(size>8192){json(res,413,{code:'REQUEST_TOO_LARGE'});return;}chunks.push(part);}
      let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw Error();}catch{json(res,400,{code:'INVALID_JSON'});return;}
      if(path==='/editor/api/accounts/relays'){json(res,200,{records:accounts.relayRecords({email:data.email||'',limit:200})});return;}
      if(path==='/editor/api/accounts/search'){json(res,200,{user:accounts.find(data.email||'')});return;}
      if(path==='/editor/api/accounts/reset'){const reset=accounts.issueReset(data.email||'');json(res,200,reset?{url:new URL('/reset?token='+reset.token,gameOrigin()).href,expires:reset.expires}:null);return;}
      if(path==='/editor/api/accounts/invites'){json(res,200,{codes:accounts.generateInvites(data)});return;}
      if(path==='/editor/api/accounts/stats'){json(res,200,{batches:accounts.inviteStats(data.batch||'')});return;}
      if(path==='/editor/api/accounts/revoke'){json(res,200,{revoked:accounts.revokeInvite(data.code)});return;}
      json(res,404,{code:'NOT_FOUND'});return;
    }
    const tail=path.slice('/editor'.length);if(!['/','/editor.css','/editor.js','/worldbook.js','/api/editor'].includes(tail)){json(res,404,{code:'NOT_FOUND'});return;}
    await new Promise(resolve=>{
      const headers={host:`127.0.0.1:${editorPort}`};for(const name of ['content-type','content-length','x-editor-token'])if(req.headers[name])headers[name]=req.headers[name];if(req.headers.origin)headers.origin=`http://127.0.0.1:${editorPort}`;
      const upstream=httpRequest({host:'127.0.0.1',port:editorPort,path:tail,method:req.method,headers},reply=>{res.writeHead(reply.statusCode,{'Content-Type':reply.headers['content-type']||'application/octet-stream','Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: http:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"});reply.pipe(res);reply.once('end',resolve);reply.once('error',()=>{res.destroy();resolve();});});
      upstream.setTimeout(10000,()=>upstream.destroy());upstream.once('error',()=>{if(!res.headersSent)json(res,502,{code:'EDITOR_UNAVAILABLE'});else res.destroy();resolve();});res.once('close',()=>{upstream.destroy();resolve();});req.pipe(upstream);
    });
  };
}
