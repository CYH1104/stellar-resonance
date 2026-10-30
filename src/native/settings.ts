import {NativeApi} from './api';
export interface NativeChatReference {id:string;avatar:string;file:string}
export interface AcademySettings {
  version:1; revision:number;
  preferences?:import('../domain/contracts').Preferences;
  chats?:NativeChatReference[];
  editorDrafts?:Record<string,string>;
  inputDrafts?:Record<string,string>;
  apiCredentials?:{version:1;remember:boolean;keys:Record<string,string>;confirmed:Record<string,{apiBaseUrl:string;model:string}>};
  nativePresetName?:string;
  nativeWorldbookBindings?:Record<string,string[]>;
  nativeBindings?:{presetNames:Record<string,string>;bookNames:Record<string,string>;presetOrder?:string[];bookOrder?:string[];taskPresets?:Record<string,string>;defaultIds:string[];taskBooks?:Record<string,string[]>;sessionBooks?:Record<string,string[]>};
  personas?:Record<string,unknown>[];
  personaRevision?:string;
  personaDraft?:Record<string,unknown>|null;
  recovery?:Record<string,string>;
  restorePending?:boolean;
  restoreLock?:{owner:string;expires:number};
}
const namespace='stellar_academy';
const allowed=new Set(['version','revision','preferences','chats','editorDrafts','inputDrafts','apiCredentials','nativePresetName','nativeWorldbookBindings','nativeBindings','personas','personaRevision','personaDraft','recovery','restorePending','restoreLock']);
const clone=<T>(value:T):T=>structuredClone(value);
export function academySettings(value:unknown):AcademySettings {
  if(value===undefined)return {version:1,revision:0};
  if(!value||typeof value!=='object'||Array.isArray(value)||(value as AcademySettings).version!==1||!Number.isSafeInteger((value as AcademySettings).revision)||(value as AcademySettings).revision<0||Object.keys(value).some(key=>!allowed.has(key)))throw Error('原生学院资料版本无法识别，原数据未覆盖。');
  const credentials=(value as AcademySettings).apiCredentials;
  if(credentials&&Object.values(credentials.keys||{}).some(key=>typeof key!=='string'||key!==''&&!/^native-secret:[A-Za-z0-9_-]{1,128}$/.test(key)))throw Error('普通设置不能保存原始 API Key，请使用原生密钥库。');
  return clone(value as AcademySettings);
}

/** Uses original settings/get and settings/save, preserving other extensions. */
export class NativeSettings {
  private value:AcademySettings={version:1,revision:0};
  private stamp='';private loaded=false;private tail:Promise<unknown>=Promise.resolve();
  constructor(readonly api:NativeApi,private updated?:(value:AcademySettings)=>void){}
  private async document(){const result=await this.api.post('/api/settings/get',{});if(typeof result?.settings!=='string')throw Error('原生设置未返回，原资料保留。');const value=JSON.parse(result.settings);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('原生设置格式不正确。');return value;}
  async load(){const document=await this.document();this.value=academySettings(document.extension_settings?.[namespace]);this.stamp=JSON.stringify(document.extension_settings?.[namespace]);this.loaded=true;this.updated?.(clone(this.value));return clone(this.value);}
  current(){if(!this.loaded)throw Error('原生学院资料尚未载入。');return clone(this.value);}
  private loading?:Promise<AcademySettings>;
  async ensure(){if(this.loaded)return this.current();this.loading??=this.load().finally(()=>{this.loading=undefined;});return this.loading;}
  async nativeDocument(){await this.ensure();return this.document();}
  async assertCurrent(){await this.tail;await this.ensure();const raw=(await this.document()).extension_settings?.[namespace];academySettings(raw);if(JSON.stringify(raw)!==this.stamp)throw Error('原生资料已在其他页面修改，已停止覆盖；请重新载入。');}
  async update(change:(draft:AcademySettings)=>void,patchNative?:(document:Record<string,any>)=>void):Promise<AcademySettings>{
    const task=this.tail.then(async()=>{
      if(!this.loaded)await this.load();
      const document=await this.document(),raw=document.extension_settings?.[namespace];
      academySettings(raw);
      if(JSON.stringify(raw)!==this.stamp)throw Error('原生资料已在其他页面修改，已停止覆盖；请重新载入。');
      const next=clone(this.value);change(next);next.revision=this.value.revision+1;academySettings(next);
      document.extension_settings={...document.extension_settings,[namespace]:next};
      patchNative?.(document);
      const response=await this.api.post('/api/settings/save',document);
      if(response?.result!=='ok')throw Error('原生设置未确认保存，当前资料保留。');
      const saved=(await this.document()).extension_settings?.[namespace];
      if(JSON.stringify(saved)!==JSON.stringify(next))throw Error('原生设置保存结果发生变化，已停止后续写入；请重新载入。');
      this.value=next;this.stamp=JSON.stringify(saved);this.updated?.(clone(next));return clone(next);
    });
    this.tail=task;
    return task;
  }
  /** Explicit reload clears a failed queue; subsequent writes never silently retry. */
  async reload(){await this.tail.catch(()=>{});const value=await this.load();this.tail=Promise.resolve();return value;}
}
