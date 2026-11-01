import type {WorkspacePorts} from '../app/workspacePorts';
import {sessionNativeApi} from './api';
import {NativeSettings} from './settings';
import {NativeCredentials} from './credentials';
import {NativePresets} from './presets';
import {NativePersonaLibrary} from './personas';
import {NativeWorkspaceRepository} from './repository';
import {NativeAccountStorage} from './accountStorage';
import {NativeCompletions} from './completions';
import {NativePipeline} from './pipeline';
import {NativeGateway} from './gateway';
import {guardNativeWrites} from './runtimeGuard';
import {nativeDigestFallback} from './digest';
import {addNativePreset} from '../domain/nativePreset';
type NativeWindow=Window&typeof globalThis&{__academyModules?:Record<string,any>;__academyReady?:boolean;SillyTavern?:any};
const moduleScript=`const context=window.SillyTavern.getContext();context.eventSource.on(context.eventTypes.APP_READY,()=>window.__academyReady=true);window.__academyModules={core:await import('/script.js'),openai:await import('/scripts/openai.js'),wi:await import('/scripts/world-info.js'),authors:await import('/scripts/authors-note.js'),regex:await import('/scripts/extensions/regex/engine.js'),power:await import('/scripts/power-user.js'),utils:await import('/scripts/utils.js'),extensions:await import('/scripts/extensions.js'),lib:await import('/lib.js'),window,context:()=>window.SillyTavern.getContext()};`;
/** The original document paints first; native UI runs invisibly as the request engine. */
async function engine(){
  const frame=document.createElement('iframe');frame.title='学院原生请求引擎';frame.setAttribute('aria-hidden','true');frame.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;top:-10000px;border:0;visibility:hidden';
  let loaded=false;frame.addEventListener('load',()=>{loaded=true;const host=frame.contentWindow as NativeWindow;if(!host?.document.querySelector('script[type="module"]'))return;guardNativeWrites(host);const script=host.document.createElement('script');script.type='module';script.textContent=moduleScript;host.document.body.append(script);});
  frame.src='/native-engine/';document.body.append(frame);
  const start=Date.now();
  while(Date.now()-start<180000){const host=frame.contentWindow as NativeWindow;if(loaded&&host.location.pathname==='/login')throw Error('账号会话已失效，请重新登录。');if(host?.__academyModules&&host.__academyReady)return host.__academyModules;
    // Only the native first-run naming prompt is resolved from the logged-in identity.
    const dialog=host?.document.querySelector('dialog[open]');if(dialog&&(dialog.querySelector('.onboarding')||/what.?s your name|你的名字|您的名字/i.test(dialog.textContent||''))){const input=dialog.querySelector('textarea.popup-input') as HTMLTextAreaElement|null;if(input){input.value=(window as any).__ACADEMY_ACCOUNT__?.email||'学院学员';(dialog.querySelector('.popup-button-ok') as HTMLElement)?.click();}}
    await new Promise(resolve=>setTimeout(resolve,100));
  }throw Error('原生引擎未能就绪，请检查网络后重新载入；已有资料保留。');
}
export async function connectNativeFrontend():Promise<WorkspacePorts>{
  const api=sessionNativeApi(),settings=new NativeSettings(api);await settings.ensure();
  const initial=(window as any).__ACADEMY_ACCOUNT_STORAGE__;if(!initial||typeof initial!=='object')throw Error('原生账号界面设置未加载。');
  const accountStorage=new NativeAccountStorage(settings,initial);(window as any).__ACADEMY_NATIVE_CONTEXT__.accountStorage=accountStorage;(window as any).academyStorage=accountStorage;
  await accountStorage.initialize();
  const modules=await engine();
  // Native helpers provide SHA-256 and UUID on HTTP deployments too.
  if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>{const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');}});
  nativeDigestFallback(bytes=>modules.lib.sha256.arrayBuffer(bytes));
  const credentials=new NativeCredentials(settings),presets=new NativePresets(settings),personas=new NativePersonaLibrary(settings);
  if(!settings.current().preferences&&!settings.current().nativeBindings){const existing=await presets.read();if(existing.name==='Default'&&Number(existing.preset.openai_max_context)<=4095){const names=new Set([existing.name,...existing.presets?.map(p=>p.name)||[]]);let name='学院原生输出',suffix=1;while(names.has(name))name='学院原生输出 '+suffix++;const next=addNativePreset(existing,{...existing.preset,openai_max_context:128000,openai_max_tokens:32000},name);await presets.save(next,existing);}}
  const repository=new NativeWorkspaceRepository(settings,credentials,presets,async archive=>{await accountStorage.flush();const {applyWorkspaceArchive}=await import('../storage/workspaceArchive');return applyWorkspaceArchive(archive,'replace');});
  const completions=new NativeCompletions(()=>modules.context(),credentials),pipeline=new NativePipeline(async()=>modules);
  const gateway=new NativeGateway(api,presets,repository,credentials,completions,pipeline);
  // Repository writes and exports must await synchronous UI setting changes.
  const write=repository.write.bind(repository);repository.write=async(...args)=>{await accountStorage.flush();return write(...args);};
  window.addEventListener('beforeunload',()=>{void accountStorage.flush().catch(()=>{});});
  return {repository,gateway,personas,accountStorage};
}
