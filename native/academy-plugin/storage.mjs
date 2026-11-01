import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomInt} from 'node:crypto';
import {cleanTheaterShare} from '../../src/domain/theaterShare.ts';
/** Delegate all writes to the unmodified native routers. No second file store. */
export function invokeNative(router,path,request,body){return new Promise((done,reject)=>{
  const child=Object.create(request);Object.assign(child,{url:path,originalUrl:path,baseUrl:'',method:'POST',body});let status=200;
  const response={locals:{},status(value){status=value;return this;},set(){return this;},setHeader(){},send(value){status<400?done(value):reject(Object.assign(Error('NATIVE_STORAGE_FAILED'),{status,code:'NATIVE_STORAGE_FAILED'}));return this;},json(value){return this.send(value);},sendStatus(value){status=value;return this.send({status:value});},end(value){return this.send(value);}};
  try{router.handle(child,response,error=>reject(error||Error('NATIVE_ROUTE_MISSING')));}catch(error){reject(error);}
});}
const queues=new Map();
async function nativeFiles(request,catalog,changes){
  if(changes===undefined)return async()=>{};
  if(!Array.isArray(changes)||changes.length>4000)throw Object.assign(Error('INVALID_NATIVE_FILES'),{status:400,code:'INVALID_NATIVE_FILES'});
  const {router:presets}=await import('../SillyTavern/src/endpoints/presets.js'),{router:worlds}=await import('../SillyTavern/src/endpoints/worldinfo.js');
  const seen=new Set();
  for(const op of changes){
    if(!op||!['presets','worldinfo'].includes(op.family)||typeof op.name!=='string'||!op.name||/[\\/:*?"<>|]/.test(op.name)||['.','..'].includes(op.name)||seen.has(op.family+':'+op.name)||op.before===undefined&&op.after===undefined)throw Object.assign(Error('INVALID_NATIVE_FILES'),{status:400,code:'INVALID_NATIVE_FILES'});seen.add(op.family+':'+op.name);
    const names=op.family==='presets'?catalog.openai_setting_names:catalog.world_names,index=names.indexOf(op.name);
    let current;if(index>=0)current=op.family==='presets'?JSON.parse(catalog.openai_settings[index]):await invokeNative(worlds,'/get',request,{name:op.name});
    if(JSON.stringify(current)!==JSON.stringify(op.before))throw Object.assign(Error('NATIVE_DATA_CONFLICT'),{status:409,code:'NATIVE_DATA_CONFLICT'});
  }
  async function write(op,value){const target=op.family==='presets'?presets:worlds;if(value===undefined)return invokeNative(target,'/delete',request,{name:op.name,...(op.family==='presets'?{apiId:'openai'}:{})});const result=await invokeNative(target,op.family==='presets'?'/save':'/edit',request,op.family==='presets'?{apiId:'openai',name:op.name,preset:value}:{name:op.name,data:value});if(op.family==='presets'?result?.name!==op.name:result?.ok!==true)throw Object.assign(Error('NATIVE_FILE_WRITE_FAILED'),{status:502,code:'NATIVE_FILE_WRITE_FAILED'});}
  const applied=[];const undo=async()=>{for(const op of applied.slice().reverse())await write(op,op.before);};
  try{for(const op of changes){await write(op,op.after);applied.push(op);}}catch(error){try{await undo();}catch{throw Object.assign(Error('NATIVE_CONFIG_ROLLBACK_FAILED'),{status:502,code:'NATIVE_CONFIG_ROLLBACK_FAILED'});}throw error;}
  return undo;
}
export function nativeStorageRoutes(router,route){
  const serial=(owner,fn)=>{const task=(queues.get(owner)||Promise.resolve()).catch(()=>{}).then(fn);queues.set(owner,task);return task.finally(()=>{if(queues.get(owner)===task)queues.delete(owner);});};
  router.post('/settings/save',route((owner,body,request)=>serial(owner,async()=>{
    const {router:native}=await import('../SillyTavern/src/endpoints/settings.js');
    const current=await invokeNative(native,'/get',request,{});if(typeof body.expected!=='string'||JSON.stringify(JSON.parse(current.settings))!==body.expected)throw Object.assign(Error('NATIVE_DATA_CONFLICT'),{status:409,code:'NATIVE_DATA_CONFLICT'});
    const undo=await nativeFiles(request,current,body.nativeFiles);
    try{const saved=await invokeNative(native,'/save',request,body.document);if(saved?.result!=='ok')throw Object.assign(Error('NATIVE_SETTINGS_WRITE_FAILED'),{status:502,code:'NATIVE_SETTINGS_WRITE_FAILED'});return saved;}catch(error){try{await undo();await invokeNative(native,'/save',request,JSON.parse(current.settings));}catch{throw Object.assign(Error('NATIVE_CONFIG_ROLLBACK_FAILED'),{status:502,code:'NATIVE_CONFIG_ROLLBACK_FAILED'});}throw error;}
  })));
  router.post('/chats/save',route((owner,body,request)=>serial(owner,async()=>{
    const {router:native}=await import('../SillyTavern/src/endpoints/chats.js');
    const current=await invokeNative(native,'/get',request,{avatar_url:body.document?.avatar_url,file_name:body.document?.file_name});
    if(typeof body.expected!=='string'||JSON.stringify(current)!==body.expected)throw Object.assign(Error('NATIVE_DATA_CONFLICT'),{status:409,code:'NATIVE_DATA_CONFLICT'});
    return invokeNative(native,'/save',request,body.document);
  })));
  router.post('/shares/create',route((owner,body,request)=>serial(owner,async()=>{
    const {router:native}=await import('../SillyTavern/src/endpoints/files.js');
    let template;try{template=cleanTheaterShare(body.template);}catch{throw Object.assign(Error('INVALID_SHARE'),{status:400,code:'INVALID_SHARE'});}const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const code='T'+Array.from({length:9},()=>alphabet[randomInt(alphabet.length)]).join('');
    await invokeNative(native,'/upload',request,{name:'academy-share-'+code+'.json',data:Buffer.from(JSON.stringify({version:1,template})).toString('base64')});return {code};
  })));
  router.post('/shares/lookup',route(async(owner,body)=>{
    if(typeof body.code!=='string'||!/^T[A-Za-z0-9]{9}$/.test(body.code))throw Object.assign(Error('SHARE_NOT_FOUND'),{status:404,code:'SHARE_NOT_FOUND'});
    const {getAllUserHandles,getUserDirectories}=await import('../SillyTavern/src/users.js');
    for(const handle of await getAllUserHandles())try{const data=JSON.parse(await readFile(resolve(getUserDirectories(handle).files,'academy-share-'+body.code+'.json'),'utf8'));if(data.version!==1)throw Error('unknown share');return {template:cleanTheaterShare(data.template)};}catch(error){if(error.code!=='ENOENT')throw error;}
    throw Object.assign(Error('SHARE_NOT_FOUND'),{status:404,code:'SHARE_NOT_FOUND'});
  }));
}
