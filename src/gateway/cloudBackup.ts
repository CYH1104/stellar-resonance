import {createCloudBackup,type CloudTransportError} from '../domain/cloudTransport.mjs';
export type BackupTransport='direct'|'server';
interface BackupRequest {provider:string;repository:string;token:string;action:string;file?:string;text?:string}
const fail=(code:string,cloudStep:string)=>Object.assign(new Error(code),{code,cloudStep});
/** Never switch transports implicitly: server mode requires the user's explicit selection. */
export async function requestCloudBackup(data:BackupRequest,transport:BackupTransport,signal:AbortSignal,fetchImpl:typeof fetch=fetch){
 if(transport==='direct'){
  let step='',timedOut=false;
  const directFetch:typeof fetch=async(input,init)=>{try{return await fetchImpl(input,init);}catch(e){const url=String(input),method=init?.method||'GET';step=url.includes('/contents/')?(method==='PUT'?'更新备份文件':method==='POST'?'新建备份文件':'查询备份文件'):url.endsWith('/user')?'识别平台账号':'读取仓库信息';timedOut=init?.signal?.reason?.name==='TimeoutError';throw e;}};
  try{return await createCloudBackup(directFetch,signal)(data);}catch(e){if(signal.aborted)throw signal.reason;const error=e as CloudTransportError;if(error.code==='CLOUD_CONNECTION_FAILED'){error.cloudStep=step;if(timedOut)error.code='CLOUD_REQUEST_TIMEOUT';}throw e;}
 }
 signal.throwIfAborted();
 const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(180000)]);
 let response:Response;
 try{response=await fetchImpl('/api/cloud-backup',{method:'POST',mode:'same-origin',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:requestSignal});}
 catch{if(signal.aborted)throw signal.reason;throw fail(requestSignal.reason?.name==='TimeoutError'?'CLOUD_REQUEST_TIMEOUT':'CLOUD_RELAY_UNREACHABLE','连接本站备份传输服务');}
 if(response.redirected||response.type==='opaqueredirect')throw fail('CLOUD_RELAY_SESSION_REQUIRED','登录校验');
 let value:any;try{value=await response.json();}catch{if(signal.aborted)throw signal.reason;throw fail(requestSignal.reason?.name==='TimeoutError'?'CLOUD_REQUEST_TIMEOUT':'CLOUD_RELAY_FAILED','读取本站传输结果');}
 if(!response.ok){
  const code=typeof value?.code==='string'&&/^CLOUD_[A-Z_]+$/.test(value.code)?value.code:response.status===401||response.status===403?'CLOUD_RELAY_SESSION_REQUIRED':response.status===413?'CLOUD_RELAY_TOO_LARGE':'CLOUD_RELAY_FAILED';
  const error=fail(code,'本站备份传输服务') as CloudTransportError;
  const clean=(s:unknown)=>typeof s==='string'?(data.token?s.split(data.token).join('[令牌已隐藏]'):s).replace(/[\r\n]/g,' ').slice(0,300):undefined;
  error.cloudStep=clean(value?.cloudStep)||error.cloudStep;error.cloudDetail=clean(value?.cloudDetail);
  if(Number.isInteger(value?.upstreamStatus)&&value.upstreamStatus>=400&&value.upstreamStatus<=599)error.upstreamStatus=value.upstreamStatus;
  throw error;
 }
 signal.throwIfAborted();return value;
}
