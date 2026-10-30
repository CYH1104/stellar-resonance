import {cleanLocalApiCredentials,type LocalApiCredentials} from '../storage/apiCredentials';
import {NativeSettings} from './settings';
const secretKey='api_key_custom',prefix='native-secret:';
export const nativeSecretId=(value:string)=>value.startsWith(prefix)?value.slice(prefix.length):undefined;
/** Native Secrets holds values; academy settings hold IDs, never raw keys. */
export class NativeCredentials {
  private memory=new Map<string,string>();
  constructor(private settings:NativeSettings){}
  async read():Promise<LocalApiCredentials|undefined>{
    await this.settings.ensure();
    const stored=this.settings.current().apiCredentials;
    if(!stored)return;
    const value=cleanLocalApiCredentials(stored);
    if(Object.values(value.keys).some(key=>key&&!nativeSecretId(key)))throw Error('原生配置中存在未迁移的密钥，已停止读取；请重新配置。');
    return value;
  }
  async write(input:LocalApiCredentials){
    await this.settings.assertCurrent();
    const value=cleanLocalApiCredentials(input),prior=this.settings.current().apiCredentials;
    const state=await this.settings.api.post('/api/secrets/read',{}),secrets=state?.[secretKey]||[];
    if(!Array.isArray(secrets))throw Error('原生密钥目录无法识别，已停止保存。');
    const active=secrets.find((entry:any)=>entry.active)?.id;
    const keys:Record<string,string>={};
    const pendingMemory=new Map<string,string>(),deleted=new Set<string>();
    try{
      for(const [profile,key]of Object.entries(value.keys)){
        if(!key){keys[profile]='';continue;}
        const id=nativeSecretId(key);
        if(id){if(!secrets.some((entry:any)=>entry.id===id))throw Error('所选原生密钥已不存在，请重新输入。');keys[profile]=key;continue;}
        if(value.remember){const result=await this.settings.api.post('/api/secrets/write',{key:secretKey,value:key,label:'学院接口 · '+profile});if(typeof result?.id!=='string')throw Error('原生密钥未确认保存。');keys[profile]=prefix+result.id;pendingMemory.set(keys[profile],key);}
      }
      const next={...value,keys:value.remember?keys:{},confirmed:value.remember?value.confirmed:{}};
      await this.settings.update(draft=>{draft.apiCredentials=next;});
      for(const [ref,key]of pendingMemory)this.memory.set(ref,key);
      const retained=new Set(Object.values(next.keys).map(nativeSecretId));
      for(const ref of Object.values(prior?.keys||{})){const id=nativeSecretId(ref);if(id&&!retained.has(id)){await this.settings.api.empty('/api/secrets/delete',{key:secretKey,id});deleted.add(id);this.memory.delete(ref);}}
      // If saving has an ambiguous network result, retain newly created secrets:
      // settings may already reference them. Never destroy a potentially saved key.
    }finally{if(active&&!deleted.has(active))await this.settings.api.empty('/api/secrets/rotate',{key:secretKey,id:active});}
  }
  async payload(key:string):Promise<Record<string,unknown>>{
    const id=nativeSecretId(key);
    if(id)return {secret_id:id};
    return key?{custom_include_headers:JSON.stringify({Authorization:'Bearer '+key})}:{};
  }
  /** A download may use an input still in RAM; it must never export a secret ID as a key. */
  async exportKeys(value:LocalApiCredentials){
    const result=cleanLocalApiCredentials(value);
    for(const [profile,key]of Object.entries(result.keys))if(nativeSecretId(key)){
      const raw=this.memory.get(key);
      if(!raw)throw Error('此接口使用原生受保护密钥，请重新输入 Key 后再导出接口配置。');
      result.keys[profile]=raw;
    }
    return result;
  }
}
