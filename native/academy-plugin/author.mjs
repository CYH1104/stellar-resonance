import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createEditorStore} from '../../server/editor-store.mjs';
import {promptDefinitions} from '../../server/internal-prompts.mjs';

const fail=(code,status)=>Object.assign(Error(code),{code,status});
/** The existing author editor writes only the independent native author directory. */
export function nativeAuthor({catalog,changed,root=fileURLToPath(new URL('../../',import.meta.url)),directory=process.env.ACADEMY_AUTHOR_DATA}){
  let storePromise,tail=Promise.resolve();
  const store=()=>storePromise??=(async()=>{
    if(!directory)throw fail('ACADEMY_AUTHOR_DATA_REQUIRED',503);
    const base=JSON.parse(await readFile(resolve(directory,'extracted-pro.json'),'utf8'));
    return createEditorStore(root,base,{directory});
  })().catch(error=>{storePromise=undefined;throw error;});
  const view=snapshot=>({...snapshot,gameUrl:'/',prompts:{definitions:promptDefinitions,layout:[],paths:[{id:'native',label:'由所选原生预设决定',layout:[]}],notes:['此处编辑学院功能规则。最终消息顺序、宏和世界书扫描由所选酒馆原生预设与编排决定；这里不使用旧版消息图冒充实际原生请求。']}});
  return {
    async read(){return view(await(await store()).read());},
    save(body){const task=tail.then(async()=>{if(!body||typeof body.revision!=='string')throw fail('INVALID_EDITOR_DATA',400);await catalog();const result=await(await store()).save(body.data,body.revision);await changed(result.data);return view(result);});tail=task.catch(()=>{});return task;},
  };
}

export function nativeAuthorRoutes(router,service){
  const route=action=>async(request,response)=>{
    if(!request.user?.profile?.admin)return response.status(403).json({code:'NATIVE_ADMIN_REQUIRED'});
    try{return response.json(await action(request.body));}
    catch(error){return response.status([400,403,409,413,503].includes(error.status)?error.status:500).json({code:/^[A-Z_]+$/.test(error.code||'')?error.code:'NATIVE_AUTHOR_UNAVAILABLE'});}
  };
  router.post('/author/read',route(()=>service.read()));
  router.post('/author/save',route(body=>service.save(body)));
}
