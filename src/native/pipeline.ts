import type {CompletionMessage} from './completions';
import {archiveWorldEffects,runtimeWorldEffects,type NativeBookName} from './worldEffects';
import type {NativeTimedEffects} from '../domain/nativeWorldState';
import {guardNativeWrites} from './runtimeGuard';
export interface NativePipelineInput {
  history:{role:'user'|'assistant';content:string}[];instruction:string;user:string;persona:string;
  preset:{name:string;data:Record<string,any>};books:NativeBookName[];selectedBooks:string[];
  effects:NativeTimedEffects;variables?:Record<string,any>;globals?:Record<string,any>;profile?:{model:string;maxTokens:number;temperature:number};anonymous?:boolean;type?:'normal'|'continue'|'regenerate';
  scopedBooks?:{name:string;worldbook:Record<string,any>}[];
}
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const replace=(target:Record<string,any>,source:Record<string,any>)=>{for(const key of Object.keys(target))delete target[key];Object.assign(target,source);};
const presetFailure=(code:string,message:string)=>Object.assign(Error(message),{code});
const tails=new WeakMap<object,Promise<unknown>>();
/** Original native functions compose and scan once; temporary state is restored before a model call. */
export class NativePipeline {
  constructor(private modules:()=>Promise<Record<string,any>>){}
  async prepare(input:NativePipelineInput,signal:AbortSignal):Promise<{messages:CompletionMessage[];effects:NativeTimedEffects;variables:Record<string,any>;globals:Record<string,any>}>{
    const modules=await this.modules(),key=modules.core.eventSource;
    const task=(tails.get(key)||Promise.resolve()).catch(()=>{}).then(()=>this.run(modules,clone(input),signal));tails.set(key,task);return task;
  }
  private async run(m:Record<string,any>,input:NativePipelineInput,signal:AbortSignal){
    signal.throwIfAborted();const {core,openai,wi,authors,regex,power,utils}=m;
    const context=m.context(),chat=core.chat,metadata=core.chat_metadata,extensions=core.extension_prompts;
    const character=core.characters[core.this_chid];
    const selector=(m.window?.document?.getElementById('main_api') as HTMLSelectElement|undefined);
    const old={selectedMain:selector?.value,error:openai.promptManager?.error,main:core.main_api,chat:clone(chat),metadata:clone(metadata),extensions:{...extensions},settings:clone(openai.oai_settings),power:clone(power.power_user),user:core.name1,char:core.name2,books:[...wi.selected_world_info],world:clone(wi.world_info),character:character?clone(character):undefined,globals:m.extensions.extension_settings.variables?.global};
    const cache=new Map<string,any>();
    const releaseWrites=guardNativeWrites(m.window||globalThis);
    const manager=context.getPresetManager('openai'),selected=manager.getSelectedPresetName();
    try{
      if(selector)selector.value='openai';core.changeMainAPI('openai');
      manager.updateList(input.preset.name,clone(input.preset.data));await openai.getPresetApplicationPromise();
      if(input.profile)Object.assign(openai.oai_settings,{chat_completion_source:'custom',custom_model:input.profile.model,openai_max_tokens:input.profile.maxTokens,temp_openai:input.profile.temperature});
      // Native UI clamps presets to its formerly selected provider's model.
      // This request has its own custom model; retain the saved native context.
      if(Number.isFinite(input.preset.data.openai_max_context))openai.oai_settings.openai_max_context=input.preset.data.openai_max_context;
      const contractTokens=input.instruction?await context.getTokenCountAsync(input.instruction):0;
      const limit=Number(openai.oai_settings.openai_max_context);
      if(!Number.isFinite(limit)||limit<=contractTokens)throw presetFailure('NATIVE_PRESET_CONTEXT_INSUFFICIENT','原生预设的上下文长度不足以容纳本次任务格式，请检查“上下文 Token”；本次没有发送模型请求。');
      openai.oai_settings.openai_max_context=limit-contractTokens;
      core.setUserName(input.user,{toastPersonaNameChange:false});core.setCharacterName(input.anonymous?'终端角色':'学院叙事');
      power.power_user.persona_description=input.persona;
      power.power_user.persona_description_lorebook='';replace(metadata,{});
      if(character)replace(character,{name:core.name2,avatar:character.avatar,chat:character.chat,description:'',personality:'',scenario:'',first_mes:'',mes_example:'',data:{name:core.name2,description:'',personality:'',scenario:'',first_mes:'',mes_example:'',extensions:{}}});
      if(m.extensions.extension_settings.variables)m.extensions.extension_settings.variables.global=input.anonymous?{}:clone(input.globals||{});
      metadata.variables=clone(input.variables||{});metadata.timedWorldInfo=runtimeWorldEffects(input.effects,input.books);
      wi.selected_world_info.splice(0,wi.selected_world_info.length,...input.selectedBooks);wi.world_info.globalSelect=[...input.selectedBooks];
      for(const book of input.scopedBooks||[]){cache.set(book.name,wi.worldInfoCache.has(book.name)?wi.worldInfoCache.get(book.name):undefined);wi.worldInfoCache.set(book.name,clone(book.worldbook));}
      for(const name of Object.keys(extensions))if(name.startsWith('customDepthWI')||name.startsWith('customWIOutlet')||name==='DEPTH_PROMPT'||name==='PERSONA_DESCRIPTION')delete extensions[name];
      chat.splice(0,chat.length,...input.history.map(row=>({name:row.role==='user'?input.user:core.name2,mes:row.content,is_user:row.role==='user',is_system:false,send_date:'',extra:{}})));
      const fields=core.getCharacterCardFields();
      if(input.anonymous){fields.description='';fields.personality='';fields.scenario='';fields.system='';fields.jailbreak='';fields.mesExamples='';fields.charDepthPrompt='';fields.creatorNotes='';}
      authors.setFloatingPrompt();
      if(fields.charDepthPrompt){const depth=character?.data?.extensions?.depth_prompt;core.setExtensionPrompt('DEPTH_PROMPT',fields.charDepthPrompt,1,depth?.depth||4,true,depth?.role||0);}
      delete extensions['stellar-academy-contract'];
      const rows=chat.filter((row:any)=>!row.is_system).map((row:any,index:number)=>({...row,mes:regex.getRegexedString(core.substituteParams(row.mes),row.is_user?1:2,{isPrompt:true,depth:chat.length-index-1})}));
      const scan=rows.map((row:any)=>wi.world_info_include_names?`${row.name}: ${row.mes}`:row.mes).reverse();
      const lore=await wi.getWorldInfoPrompt(scan,core.getMaxContextSize(),false,{trigger:input.type||'normal',personaDescription:input.persona,characterDescription:fields.description,characterPersonality:fields.personality,characterDepthPrompt:fields.charDepthPrompt,scenario:fields.scenario,creatorNotes:fields.creatorNotes});
      for(const entry of lore.worldInfoDepth||[])core.setExtensionPrompt('customDepthWI_'+entry.depth+'_'+entry.role,entry.entries.join('\n'),1,entry.depth,false,entry.role);
      for(const [name,entries]of Object.entries(lore.outletEntries||{}))core.setExtensionPrompt('customWIOutlet_'+name,(entries as string[]).join('\n'),-1,0);
      const examples=core.parseMesExamples(fields.mesExamples,false);
      for(const entry of lore.worldInfoExamples||[]){const lines=core.parseMesExamples(core.baseChatReplace(entry.content),false);entry.position===0?examples.unshift(...lines):examples.push(...lines);}
      // Same persona placements used by original Generate.
      const position=power.power_user.persona_description_position;
      if((position===2||position===3)&&authors.shouldWIAddPrompt){const note=extensions[authors.NOTE_MODULE_NAME];if(note)core.setExtensionPrompt(authors.NOTE_MODULE_NAME,position===2?input.persona+'\n'+note.value:note.value+'\n'+input.persona,note.position,note.depth,note.scan,note.role);}
      if(position===4)core.setExtensionPrompt('PERSONA_DESCRIPTION',input.persona,1,power.power_user.persona_description_depth,true,power.power_user.persona_description_role);
      if(openai.promptManager)openai.promptManager.error='';
      const [messages]=await openai.prepareOpenAIMessages({name2:core.name2,charDescription:fields.description,charPersonality:fields.personality,scenario:fields.scenario,worldInfoBefore:lore.worldInfoBefore,worldInfoAfter:lore.worldInfoAfter,extensionPrompts:extensions,bias:'',type:input.type||'normal',quietPrompt:'',cyclePrompt:'',systemPromptOverride:fields.system,jailbreakPromptOverride:fields.jailbreak,messages:openai.setOpenAIMessages(rows),messageExamples:openai.setOpenAIMessageExamples(examples)},false);
      signal.throwIfAborted();if(openai.promptManager?.error||!Array.isArray(messages)||!messages.length)throw presetFailure('NATIVE_PRESET_COMPILE_INVALID','原生提示词未完整组装，请检查上下文长度和预设条目；本次没有发送模型请求。');
      // Reserve the contract before native budgeting, then anchor it after all
      // native prompt-order rules. Keep original assistant prefills at the end.
      if(input.instruction){let at=messages.length;while(at>0&&messages[at-1].role==='assistant')at--;messages.splice(at,0,{role:'system',content:input.instruction});}
      return {messages:clone(messages),effects:archiveWorldEffects(metadata.timedWorldInfo,input.books),variables:clone(metadata.variables||{}),globals:clone(m.extensions.extension_settings.variables?.global||{})};
    }finally{
      try{chat.splice(0,chat.length,...old.chat);replace(metadata,old.metadata);replace(extensions,old.extensions);replace(power.power_user,old.power);
      if(character&&old.character)replace(character,old.character);
      if(m.extensions.extension_settings.variables)m.extensions.extension_settings.variables.global=old.globals;
      for(const [name,previous]of cache)previous===undefined?wi.worldInfoCache.delete(name):wi.worldInfoCache.set(name,previous);
      core.setUserName(old.user,{toastPersonaNameChange:false});core.setCharacterName(old.char);wi.selected_world_info.splice(0,wi.selected_world_info.length,...old.books);replace(wi.world_info,old.world);
      if(manager.findPreset(selected)!==undefined)await manager.selectPreset(manager.findPreset(selected));if(selector&&old.selectedMain!==undefined)selector.value=old.selectedMain;core.changeMainAPI(old.main);replace(openai.oai_settings,old.settings);if(openai.promptManager)openai.promptManager.error=old.error;
      }finally{utils.cancelDebounce(core.saveSettingsDebounced);utils.cancelDebounce(core.saveMetadataDebounced);releaseWrites();}
    }
  }
}
