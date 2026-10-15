// Read-only transport check: no API Key, model generation, or response body output.
import {lookup} from 'node:dns/promises';
import {endpoint} from '../server/ai.mjs';
const target=new URL(endpoint(process.argv[2]));
if(process.argv.includes('--through-local')){
  const local='http://127.0.0.1:5173',bootstrap=await fetch(local+'/api/bootstrap');
  const cookie=bootstrap.headers.get('set-cookie')?.split(';')[0];await bootstrap.body?.cancel();
  // Deliberately invalid credential: checks transport via the running backend only.
  const response=await fetch(local+'/api/models',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie||''},body:JSON.stringify({apiBaseUrl:process.argv[2],key:'network-diagnostic-invalid-key'})});
  const result=await response.json();console.log(JSON.stringify({phase:'running-backend',status:response.status,code:result.code}));
  process.exitCode=result.code==='UPSTREAM_AUTH'?0:1;
}else{
try{const addresses=await lookup(target.hostname,{all:true});console.log(JSON.stringify({phase:'dns',ok:true,families:[...new Set(addresses.map(a=>a.family))]}));}
catch(error){console.log(JSON.stringify({phase:'dns',ok:false,code:error.code}));}
let reachable=false;
for(const path of [...new Set([target.pathname.replace(/chat\/completions$/,'models'),'/v1/models'])]){
  const url=new URL(path,target.origin),started=Date.now();
  try{const response=await fetch(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});reachable=true;console.log(JSON.stringify({phase:'models-without-key',path,ok:true,status:response.status,elapsedMs:Date.now()-started,contentType:response.headers.get('content-type')}));await response.body?.cancel();}
  catch(error){console.log(JSON.stringify({phase:'models-without-key',path,ok:false,name:error.name,code:error.code,causeCode:error.cause?.code,elapsedMs:Date.now()-started,errors:error.cause?.errors?.map(e=>({code:e.code}))}));}
}
if(!reachable)process.exitCode=1;
}
