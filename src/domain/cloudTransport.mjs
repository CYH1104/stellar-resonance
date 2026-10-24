import {parseCloudSave} from './cloudBackup.ts';
const fail=(status,code)=>Object.assign(new Error(code),{status,code});
const directory='stellar-backups';
const workspaceFile='stellar-workspace-backup.json';
export function createCloudBackup(fetchImpl=fetch,signal){return async function cloudBackup(data){
 const {provider,token,repository,action}=data;
 if(!['github','gitee'].includes(provider)||typeof token!=='string'||!token.trim()||token.length>4096||/[\r\n]/.test(token)||typeof repository!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(repository)||repository.endsWith('.git')||!['connect','list','upload','download'].includes(action))throw fail(400,'CLOUD_INVALID_CONFIGURATION');
 const platformLimit=provider==='github'?100*1024*1024:undefined;
 const base=provider==='github'?'https://api.github.com':'https://gitee.com/api/v5';
 const headers={Authorization:'Bearer '+token,Accept:provider==='github'?'application/vnd.github+json':'application/json','Content-Type':'application/json'};
 async function api(path,method='GET',body,missing=false){
  const form=provider==='gitee'&&body?new URLSearchParams(Object.entries({...body,access_token:token}).map(([k,v])=>[k,String(v)])):undefined;
  let r;try{r=await fetchImpl(base+path,{method,mode:'cors',credentials:'omit',headers:{...headers,...(form?{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'}:{})},redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000),...(body?{body:form?form.toString():JSON.stringify(body)}:{})});}catch{throw fail(502,'CLOUD_CONNECTION_FAILED');}
  if(missing&&r.status===404)return undefined;
  if(!r.ok){
   const codes={400:'CLOUD_REQUEST_REJECTED',401:'CLOUD_TOKEN_INVALID',403:'CLOUD_PERMISSION_DENIED',409:'CLOUD_CONFLICT',413:'CLOUD_FILE_TOO_LARGE',422:'CLOUD_VALIDATION_FAILED',429:'CLOUD_RATE_LIMITED'};
   const error=fail([400,401,403,409,413,422,429].includes(r.status)?r.status:502,codes[r.status]||'CLOUD_UPSTREAM_FAILED');
   error.upstreamStatus=r.status;error.cloudStep=path.includes('/contents/')?(method==='POST'?'新建备份文件':method==='PUT'?'更新备份文件':'查询备份文件'):path==='/user'?'识别平台账号':path==='/user/repos'?'创建仓库':'读取仓库信息';
   // Return only bounded error-message fields, never the response body, credentials or file content.
   try{const reader=r.body?.getReader();let raw='',size=0;if(reader){while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();break;}raw+=new TextDecoder().decode(part.value);}}
    const detail=JSON.parse(raw);const parts=[detail.message,typeof detail.error==='string'?detail.error:detail.error?.message,typeof detail.data==='string'?detail.data:detail.data?.message];
    if(Array.isArray(detail.errors))for(const item of detail.errors.slice(0,3))if(typeof item?.message==='string')parts.push(item.message);
    error.cloudDetail=parts.filter(v=>typeof v==='string').join('；').split(token).join('[令牌已隐藏]').replace(/(?:Bearer\s+|access_token[=:]\s*)[^\s,;]+/gi,'[令牌已隐藏]').replace(/data:[^\s]+/gi,'[数据已隐藏]').slice(0,300);
   }catch{}
   throw error;
  }
  const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(platformLimit&&size>platformLimit*2)throw fail(413,'CLOUD_FILE_TOO_LARGE');chunks.push(chunk);}try{return JSON.parse(decodeChunks(chunks,size));}catch{throw fail(502,'CLOUD_INVALID_RESPONSE');}
 }
 const user=await api('/user');if(typeof user.login!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(user.login))throw fail(502,'CLOUD_INVALID_RESPONSE');
 const root='/repos/'+encodeURIComponent(user.login)+'/'+encodeURIComponent(repository);
 let repo=await api(root,'GET',undefined,true),created=false;
 if(!repo&&action==='connect'){try{repo=await api('/user/repos','POST',{name:repository,private:true,auto_init:true,description:'星穹学院手动存档备份'});created=true;}catch(e){repo=await api(root,'GET',undefined,true);if(!repo)throw e;}}
 if(!repo)throw fail(404,'CLOUD_REPOSITORY_NOT_FOUND');
 if(repo.private!==true)throw fail(409,'CLOUD_PRIVATE_REPOSITORY_REQUIRED');
 if(repo.archived||repo.permissions?.push===false)throw fail(403,'CLOUD_PERMISSION_DENIED');
 const branch=typeof repo.default_branch==='string'&&repo.default_branch?repo.default_branch:'';
 const info={provider,owner:user.login,repository,branch,created,url:(provider==='github'?'https://github.com/':'https://gitee.com/')+encodeURIComponent(user.login)+'/'+encodeURIComponent(repository)};
 if(action==='connect')return info;
 if(action==='list'){const rootFile=await api(root+'/contents/'+workspaceFile+(branch?'?ref='+encodeURIComponent(branch):''),'GET',undefined,true);const currentFile=existingFile(rootFile,workspaceFile);const rootRows=currentFile?[{name:workspaceFile,sha:currentFile.sha,size:currentFile.size}]:[];const rows=await api(root+'/contents/'+directory+(branch?'?ref='+encodeURIComponent(branch):''),'GET',undefined,true);if(rows===undefined)return {...info,files:rootRows};if(!Array.isArray(rows))throw fail(502,'CLOUD_INVALID_RESPONSE');return {...info,files:[...rootRows,...rows.filter(r=>r.type==='file'&&validFile(r.name)).map(r=>({name:r.name,sha:r.sha,size:r.size})).sort((a,b)=>a.name.localeCompare(b.name))]};}
 if(!validFile(data.file))throw fail(400,'CLOUD_INVALID_FILE');
 const path=root+'/contents/'+(data.file===workspaceFile?'':directory+'/')+encodeURIComponent(data.file);
 const found=await api(path+(branch?'?ref='+encodeURIComponent(branch):''),'GET',undefined,true);
 // Some Gitee responses encode a missing file in a successful HTTP envelope.
 // A truthy JSON object alone is never proof that a file exists.
 const old=existingFile(found,data.file);
 if(action==='download'){
  if(!old||old.type!=='file'||(platformLimit&&old.size>platformLimit))throw fail(404,'CLOUD_BACKUP_NOT_FOUND');
  let content=old.content;if(!content&&provider==='github'&&/^[a-f0-9]{40,64}$/.test(old.sha)){const blob=await api(root+'/git/blobs/'+old.sha);if(blob.encoding!=='base64')throw fail(502,'CLOUD_INVALID_RESPONSE');content=blob.content;}
  if(typeof content!=='string')throw fail(502,'CLOUD_INVALID_RESPONSE');const text=decodeBase64(content);parseCloudSave(text);return {...info,text,sha:old.sha};
 }
 if(typeof data.text!=='string')throw fail(400,'CLOUD_INVALID_BACKUP');let canonical;try{canonical=JSON.stringify(parseCloudSave(data.text));}catch{throw fail(400,'CLOUD_INVALID_BACKUP');}
 if(platformLimit&&new TextEncoder().encode(canonical).length>platformLimit)throw fail(413,'CLOUD_FILE_TOO_LARGE');
 const payload={message:'手动备份星穹学院存档',content:encodeBase64(canonical),...(branch?{branch}:{}),...(old?{sha:old.sha}:{})};
 await api(path,provider==='github'||old?'PUT':'POST',payload);return {...info,file:data.file};
};}
function validFile(name){return typeof name==='string'&&name.length<=150&&/^[\p{L}\p{N}_ -]+\.json$/u.test(name);}

function existingFile(value,name,depth=0){
 if(depth>3)throw fail(502,'CLOUD_INVALID_FILE_METADATA');
 if(value===undefined||value===null)return undefined;
 if(Array.isArray(value)){const item=value.find(item=>item&&item.name===name);return item?existingFile(item,name,depth+1):undefined;}
 if(typeof value!=='object')throw fail(502,'CLOUD_INVALID_FILE_METADATA');
 if(value.data!==undefined)return existingFile(value.data,name,depth+1);
 if(value.content&&typeof value.content==='object'&&!Array.isArray(value.content))return existingFile(value.content,name,depth+1);
 if((value.type===undefined||value.type==='file')&&typeof value.sha==='string'&&/^[a-f0-9]{40,64}$/i.test(value.sha)&&(!value.name||value.name===name))return {...value,type:'file'};
 const message=typeof value.message==='string'?value.message:typeof value.error==='string'?value.error:value.error?.message;
 if((value.status===404||value.code===404||value.status==='404'||value.code==='404')||(/^File(?: not found)?$/i.test(message||'')&&value.type!=='file'&&!value.sha))return undefined;
 throw fail(502,'CLOUD_INVALID_FILE_METADATA');
}

function decodeChunks(chunks,size){const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(bytes);}
function encodeBase64(text){const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
function decodeBase64(text){const binary=atob(text.replace(/\s/g,''));return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}
