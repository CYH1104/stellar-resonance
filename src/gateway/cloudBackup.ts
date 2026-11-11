import {createCloudBackup,type CloudTransportError} from '../domain/cloudTransport.mjs';
import {parseCloudSave} from '../domain/cloudBackup';
interface BackupRequest {provider:string;repository:string;token:string;action:string;file?:string;text?:string}

/** All backup traffic goes from this browser directly to the user's selected platform. */
export async function requestCloudBackup(data:BackupRequest,signal:AbortSignal,fetchImpl:typeof fetch=fetch){
 let failedStep='',failedMethod='',timedOut=false,requestBytes=0;
 const directFetch:typeof fetch=async(input,init)=>{
  const method=init?.method||'GET';
  try{return await fetchImpl(input,{...init,...(method==='GET'?{cache:'no-store' as const}:{})});}
  catch(e){const url=String(input);failedStep=url.includes('/contents/')?(method==='PUT'?'更新备份文件':method==='POST'?'新建备份文件':'查询备份文件'):url.endsWith('/user')?'识别平台账号':'读取仓库信息';failedMethod=method;timedOut=init?.signal?.reason?.name==='TimeoutError';requestBytes=typeof init?.body==='string'?new TextEncoder().encode(init.body).length:0;throw e;}
 };
 try{const result=await createCloudBackup(directFetch,signal)(data);signal.throwIfAborted();return result;}
 catch(e){
  if(signal.aborted)throw signal.reason;
  const error=e as CloudTransportError;
  if(error.code!=='CLOUD_CONNECTION_FAILED')throw e;
  error.cloudStep=failedStep;
  if(timedOut)error.code='CLOUD_REQUEST_TIMEOUT';
  // A CORS/network failure does not prove the platform rejected the write. Read back
  // once, never issue another write, and accept only the exact complete canonical backup.
  if(data.action==='upload'&&data.text&&['POST','PUT'].includes(failedMethod)){
   const verificationSignal=AbortSignal.any([signal,AbortSignal.timeout(15000)]);
   const verificationFetch:typeof fetch=(input,init)=>fetchImpl(input,{...init,cache:'no-store',signal:verificationSignal});
   try{
    const downloaded=await createCloudBackup(verificationFetch,verificationSignal)({...data,action:'download',text:undefined});
    signal.throwIfAborted();
    if(JSON.stringify(parseCloudSave(downloaded.text))===JSON.stringify(parseCloudSave(data.text)))return {...downloaded,file:data.file,verifiedAfterNetworkError:true};
   }catch{if(signal.aborted)throw signal.reason;}
   const mb=(n:number)=>(n/1024/1024).toFixed(2)+' MB';
   error.cloudDetail=`尚未确认仓库保存了这次完整备份；文件 ${mb(new TextEncoder().encode(data.text).length)}，请求 ${mb(requestBytes)}。本地数据保留，可刷新备份列表后重试。`;
  }
  throw error;
 }
}
