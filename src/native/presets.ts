import {cleanNativePresetConfig,type NativePresetConfig,type NativePresetItem} from '../domain/nativePreset';
import type {NativeWorldbook} from '../domain/nativeWorldbooks';
import {NativeSettings,type NativeFileChange} from './settings';
import {nativeDigest} from './digest';
import type {NativePresetFiles} from './repository';
const copy=<T>(value:T):T=>structuredClone(value);
async function identity(prefix:string,name:string){const hash=await nativeDigest(new TextEncoder().encode(name));return prefix+Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,32);}
const filename=(name:string)=>{if(!name||/[\\/:*?"<>|]/.test(name)||name==='.'||name==='..')throw Error('请使用不含路径字符的原生文件名称。');return name;};

/** Preset/worldbook JSON stays in original files; only UI bindings use metadata. */
export class NativePresets implements NativePresetFiles {
  constructor(private settings:NativeSettings){}
  async read():Promise<NativePresetConfig>{
    await this.settings.ensure();
    const response=await this.settings.api.post('/api/settings/get',{}),document=JSON.parse(response.settings);
    if(!Array.isArray(response.openai_setting_names)||!Array.isArray(response.openai_settings)||response.openai_setting_names.length!==response.openai_settings.length)throw Error('原生预设目录未完整返回。');
    const bindings=this.settings.current().nativeBindings;
    const presets:NativePresetItem[]=[];
    for(let n=0;n<response.openai_setting_names.length;n++){
      const name=response.openai_setting_names[n];if(typeof name!=='string')throw Error('原生预设名称不正确。');
      const raw=response.openai_settings[n],preset=typeof raw==='string'?JSON.parse(raw):raw;
      const id=Object.entries(bindings?.presetNames||{}).find(([,file])=>file===name)?.[0]||await identity('np_',name);
      presets.push({id,name,preset});
    }
    if(!presets.length)throw Error('原生预设库为空，请先导入预设；原数据未覆盖。');
    if(bindings?.presetOrder)presets.sort((a,b)=>{const order=bindings.presetOrder!;return (order.indexOf(a.id)<0?order.length:order.indexOf(a.id))-(order.indexOf(b.id)<0?order.length:order.indexOf(b.id));});
    const selected=presets.find(item=>item.name===document.oai_settings?.preset_settings_openai)||presets.find(item=>item.name==='Default')||presets[0];
    const books:NativeWorldbook[]=[];
    if(!Array.isArray(response.world_names))throw Error('原生世界书目录未完整返回。');
    for(const name of response.world_names){
      if(typeof name!=='string')throw Error('原生世界书名称不正确。');
      const id=Object.entries(bindings?.bookNames||{}).find(([,file])=>file===name)?.[0]||await identity('nw_',name);
      books.push({id,name,worldbook:await this.settings.api.post('/api/worldinfo/get',{name})});
    }
    if(bindings?.bookOrder)books.sort((a,b)=>{const order=bindings.bookOrder!;return (order.indexOf(a.id)<0?order.length:order.indexOf(a.id))-(order.indexOf(b.id)<0?order.length:order.indexOf(b.id));});
    const globalBooks=Array.isArray(document.world_info_settings?.world_info?.globalSelect)?document.world_info_settings.world_info.globalSelect:[];
    const defaultIds=bindings?.defaultIds||books.filter(book=>globalBooks.includes(book.name)).map(book=>book.id);
    return cleanNativePresetConfig({version:1,...selected,presets:presets.filter(item=>item.id!==selected.id),...(bindings?.taskPresets?{taskPresets:bindings.taskPresets}:{}),worldbooks:{version:1,books,defaultIds,...(bindings?.taskBooks?{taskBooks:bindings.taskBooks}:{}),...(bindings?.sessionBooks?{sessionBooks:bindings.sessionBooks}:{})}});
  }
  async save(value:NativePresetConfig|null,expected:NativePresetConfig|null|undefined):Promise<void>{
    await this.settings.assertCurrent();
    const current=await this.read();
    if(value===null){const restored=await this.settings.api.post('/api/presets/restore',{apiId:'openai',name:'Default'});if(!restored?.isDefault||!restored.preset?.prompts)throw Error('原生默认预设未找到，原资料保留。');const all=[{id:current.id||'default',name:current.name||'默认预设',preset:current.preset},...current.presets||[]],selected=all.find(item=>item.name==='Default')||{id:await identity('np_','Default'),name:'Default'};value={...current,...selected,preset:restored.preset,presets:all.filter(item=>item.id!==selected.id)};}
    const next=cleanNativePresetConfig(value);
    if(expected!==undefined&&JSON.stringify(current)!==JSON.stringify(expected))throw Error('原生预设或世界书已改变，请重新载入编辑器。');
    const items=(config:NativePresetConfig)=>[{id:config.id||'default',name:config.name||'默认预设',preset:config.preset},...config.presets||[]];
    const before=items(current),after=items(next),oldBooks=current.worldbooks?.books||[],newBooks=next.worldbooks?.books||[];
    const files:NativeFileChange[]=[];
    for(const group of [after,newBooks]){for(const item of group)filename(item.name);if(new Set(group.map(item=>item.name)).size!==group.length)throw Error('原生文件名称重复，请为每份预设和世界书使用不同名称。');}
    for(const item of after){filename(item.name);const old=before.find(value=>value.id===item.id);if(!old||old.name!==item.name||JSON.stringify(old.preset)!==JSON.stringify(item.preset)){
      const prior=before.find(value=>value.name===item.name);files.push({family:'presets',name:item.name,...(prior?{before:prior.preset}:{}),after:item.preset});
    }}
    for(const book of newBooks){filename(book.name);const old=oldBooks.find(value=>value.id===book.id);if(!old||old.name!==book.name||JSON.stringify(old.worldbook)!==JSON.stringify(book.worldbook)){
      const prior=oldBooks.find(value=>value.name===book.name);files.push({family:'worldinfo',name:book.name,...(prior?{before:prior.worldbook}:{}),after:book.worldbook});
    }}
    // Deletions require a known edit baseline; initial bootstrap never deletes files.
    if(expected){
      for(const old of items(expected))if(!after.some(item=>item.name===old.name))files.push({family:'presets',name:old.name,before:old.preset});
      for(const old of expected.worldbooks?.books||[])if(!newBooks.some(book=>book.name===old.name))files.push({family:'worldinfo',name:old.name,before:old.worldbook});
    }
    await this.settings.update(scope=>{scope.nativeBindings={presetNames:Object.fromEntries(after.map(item=>[item.id,item.name])),bookNames:Object.fromEntries(newBooks.map(book=>[book.id,book.name])),presetOrder:after.map(item=>item.id),bookOrder:newBooks.map(book=>book.id),defaultIds:[...next.worldbooks?.defaultIds||[]],...(next.taskPresets?{taskPresets:copy(next.taskPresets)}:{}),...(next.worldbooks?.taskBooks?{taskBooks:copy(next.worldbooks.taskBooks)}:{}),...(next.worldbooks?.sessionBooks?{sessionBooks:copy(next.worldbooks.sessionBooks)}:{})};},document=>{
      document.oai_settings={...document.oai_settings,preset_settings_openai:next.name||'默认预设'};
      // Keep original fields and other extensions while selecting global books.
      const names=(next.worldbooks?.defaultIds||[]).map(id=>newBooks.find(book=>book.id===id)!.name);
      document.world_info_settings={...document.world_info_settings,world_info:{...document.world_info_settings?.world_info,globalSelect:names}};
    },files);
  }
}
