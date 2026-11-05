/** Mount the shipped native controls, retaining their PromptManager and samplers. */
export interface NativePresetEditorSession {
  update(preset:Record<string,any>):Promise<void>;
  flush():Record<string,any>;
  disabled(value:boolean):void;
  dispose():void;
}
export interface NativePresetEditor {
  mount(host:HTMLElement,preset:Record<string,any>,changed:(preset:Record<string,any>)=>void,flushDraft:()=>Promise<void>):Promise<NativePresetEditorSession>;
}
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
export function createNativePresetEditor(modules:Record<string,any>):NativePresetEditor {
 let active=false;
 return {async mount(host,preset,changed,flushDraft){
  if(active)throw Error('原生预设编辑器已打开。');active=true;
  try{await modules.csrf?.refresh();}catch(error){active=false;throw error;}
  const {openai,core,utils}=modules,win=modules.window as Window,doc=win.document,frame=win.frameElement as HTMLIFrameElement;
  const manager=modules.context().getPresetManager('openai'),selected=manager.getSelectedPresetName();
  const savedSettings=clone(openai.oai_settings),savedPreset=clone(manager.getPresetList().presets[manager.findPreset(selected)]),savedMain=core.main_api;
  const mainSelect=doc.getElementById('main_api') as HTMLSelectElement,selectedMain=mainSelect.value;
  const frameStyle=frame.style.cssText,frameTitle=frame.title,frameHidden=frame.getAttribute('aria-hidden');
  const frameParent=frame.parentElement!,frameNext=frame.nextSibling;
  const inline=typeof (host as any).moveBefore==='function';
  const promptManager=openai.promptManager,saveService=promptManager.saveServiceSettings,tryGenerate=promptManager.tryGenerate;
  const previousDraftWriter=(win as any).__academyDraftSettingsSave;
  const root=doc.createElement('div');root.id='academy-native-preset-editor';
  const style=doc.createElement('style');style.textContent=`html,body{width:100%!important;height:100%!important;min-height:100%!important;margin:0!important;transform:none!important}body{overflow:hidden!important}body> :not(#academy-native-preset-editor):not(dialog):not(#toast-container){display:none!important}#academy-native-preset-editor{position:fixed;inset:0;overflow:auto;padding:16px;box-sizing:border-box;background:var(--SmartThemeBlurTintColor);color:var(--SmartThemeBodyColor)}#academy-native-preset-editor>#range_block_openai,#academy-native-preset-editor>#openai_settings{display:block!important;width:100%;max-width:none}#academy-native-preset-editor .completion_prompt_manager_header{position:static}#academy-native-preset-editor #completion_prompt_manager_popup{position:fixed;inset:12px;width:auto;max-width:none;max-height:calc(100% - 24px);z-index:10000;overflow:auto}`;
  const moved:{node:HTMLElement;placeholder:Comment}[]=[];
  let original=clone(preset),stamp='',loading=false,disposed=false,tail=Promise.resolve();
  // Reparenting an iframe reloads it in many browsers. Keep the existing native
  // engine in place and align its viewport with the editor's visible rectangle.
  const position=()=>{if(disposed||inline)return;const r=host.getBoundingClientRect();let top=0,left=0,right=innerWidth,bottom=innerHeight;for(let p=host.parentElement;p;p=p.parentElement){const css=getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(css.overflow+css.overflowY+css.overflowX)){const b=p.getBoundingClientRect();top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);left=Math.max(left,b.left);right=Math.min(right,b.right);}}Object.assign(frame.style,{top:r.top+'px',left:r.left+'px',width:r.width+'px',height:r.height+'px',visibility:r.bottom>top&&r.top<bottom&&r.width>0?'visible':'hidden',clipPath:`inset(${Math.max(0,top-r.top)}px ${Math.max(0,r.right-right)}px ${Math.max(0,r.bottom-bottom)}px ${Math.max(0,left-r.left)}px)`});};
  const resize=new ResizeObserver(position);
  const snapshot=()=>({...clone(original),...clone(openai.getChatCompletionPreset())});
  const capture=()=>{utils.cancelDebounce(core.saveSettingsDebounced);if(loading||disposed)return;const value=snapshot(),text=JSON.stringify(value);if(text!==stamp){stamp=text;changed(value);}};
  function cleanup(){
   if(disposed)return;disposed=true;
   doc.removeEventListener('input',input);doc.removeEventListener('change',input);
   window.removeEventListener('scroll',position,true);window.removeEventListener('resize',position);resize.disconnect();
   utils.cancelDebounce(core.saveSettingsDebounced);promptManager.saveServiceSettings=saveService;promptManager.tryGenerate=tryGenerate;
   if(previousDraftWriter===undefined)delete (win as any).__academyDraftSettingsSave;else (win as any).__academyDraftSettingsSave=previousDraftWriter;
   for(const {node,placeholder}of moved)placeholder.replaceWith(node);style.remove();root.remove();
   frame.style.cssText=frameStyle;frame.title=frameTitle;frame.removeAttribute('data-academy-preset-editor');if(frameHidden===null)frame.removeAttribute('aria-hidden');else frame.setAttribute('aria-hidden',frameHidden);
   if(inline)(frameParent as any).moveBefore(frame,frameNext?.parentNode===frameParent?frameNext:null);
   manager.updateList(selected,savedPreset);Object.assign(openai.oai_settings,savedSettings);mainSelect.value=selectedMain;core.changeMainAPI(savedMain);utils.cancelDebounce(core.saveSettingsDebounced);active=false;
  }
  function input(){queueMicrotask(capture);}
  async function load(value:Record<string,any>){
   if(disposed)return;loading=true;
   try{original=clone(value);mainSelect.value='openai';core.changeMainAPI('openai');manager.updateList(selected,clone(value));await openai.getPresetApplicationPromise();promptManager.render(false);stamp=JSON.stringify(snapshot());}
   finally{loading=false;utils.cancelDebounce(core.saveSettingsDebounced);}
  }
  try{
   (win as any).__academyDraftSettingsSave=async()=>{capture();await flushDraft();};
   promptManager.saveServiceSettings=async()=>{capture();};promptManager.tryGenerate=async()=>{};
   await load(preset);
   (win as any).toastr?.remove();
   for(const id of ['completion_prompt_manager','range_block_openai','openai_settings','completion_prompt_manager_popup']){const node=doc.getElementById(id);if(!node)throw Error('酒馆原生预设界面未加载完整。');const placeholder=doc.createComment('native preset editor');node.replaceWith(placeholder);moved.push({node,placeholder});root.append(node);}
   doc.head.append(style);doc.body.append(root);host.style.cssText='height:min(760px,80vh);min-height:420px';
   if(inline){(host as any).moveBefore(frame,null);frame.style.cssText='display:block;width:100%;height:100%;border:0;position:relative;visibility:visible';}
   else{frame.style.cssText='display:block;border:0;position:fixed;z-index:2147483647;visibility:visible';resize.observe(host);window.addEventListener('scroll',position,true);window.addEventListener('resize',position);}
   frame.title='酒馆原生预设编辑器';frame.setAttribute('data-academy-preset-editor','');frame.removeAttribute('aria-hidden');position();
   doc.addEventListener('input',input);doc.addEventListener('change',input);
   return {
    update(value){if(JSON.stringify(value)===stamp)return tail;const next=clone(value);tail=tail.catch(()=>{}).then(()=>load(next));return tail;},
    flush(){capture();return snapshot();},disabled(value){root.inert=value;frame.style.opacity=value?'.55':'1';},
    dispose(){capture();cleanup();},
   };
  }catch(error){cleanup();throw error;}
 }};
}
