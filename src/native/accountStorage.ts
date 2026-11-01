import {NativeSettings} from './settings';
import {reportHttpFailure} from '../gateway/requestFailure';
/** Synchronous view over original accountStorage; all durable writes use native settings. */
export class NativeAccountStorage {
  private tail:Promise<unknown>=Promise.resolve();private failure?:unknown;
  private baseline='';private requested=0;private saved=0;private writing=false;
  constructor(private settings:NativeSettings,private state:Record<string,string>,private changed?:()=>void){}
  getItem(key:string){return Object.hasOwn(this.state,key)?this.state[key]:null;}
  getState(){return {...this.state};}
  key(index:number){return Object.keys(this.state)[index]??null;}
  get length(){return Object.keys(this.state).length;}
  setItem(key:string,value:string){if(['__proto__','prototype','constructor'].includes(key))throw Error('设置名称不正确。');this.state[key]=String(value);this.schedule();}
  removeItem(key:string){delete this.state[key];this.schedule();}
  private schedule(){
    this.requested++;if(this.writing)return;this.writing=true;
    this.tail=this.tail.then(async()=>{while(this.saved<this.requested){
      const revision=this.requested,snapshot={...this.state};
      await this.settings.update(()=>{},document=>{
        if(JSON.stringify(document.accountStorage||{})!==this.baseline)throw Error('界面设置已被其他页面修改，请重新载入；原资料保留。');
        document.accountStorage=snapshot;
      });
      this.baseline=JSON.stringify(snapshot);this.saved=revision;this.changed?.();
    }}).finally(()=>{this.writing=false;});
    void this.tail.catch(error=>{
      this.failure=error;
      reportHttpFailure({task:'保存界面设置',code:'NATIVE_SETTINGS_UNSAVED',message:error instanceof Error?error.message:'界面设置尚未保存，请保留页面并重试。'});
    });
  }
  async initialize(){const document=await this.settings.nativeDocument();this.baseline=JSON.stringify(document.accountStorage||{});if(this.baseline!==JSON.stringify(this.state))this.schedule();await this.flush();}
  async flush(){await this.tail;if(this.failure)throw this.failure;}
}
