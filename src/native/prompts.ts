import type {CompletionMessage} from './completions';

export interface NativePromptContext {
  mainApi:string;chatId?:string;characterId?:number|string;
  name1:string;name2:string;
  chat:Record<string,any>[];chatMetadata:Record<string,any>;
  extensionPrompts:Record<string,any>;
  eventTypes:Record<string,string>;
  eventSource:{on(event:string,listener:(...args:any[])=>void):void;removeListener(event:string,listener:(...args:any[])=>void):void;makeLast?(event:string,listener:(...args:any[])=>void):void};
  setExtensionPrompt(key:string,value:string,position:number,depth:number,scan:boolean,role:number):void;
  generate(type:string,options:Record<string,unknown>,dryRun:boolean):Promise<unknown>;
}
const queues=new WeakMap<object,Promise<unknown>>();
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function replace(target:Record<string,any>,source:Record<string,any>){for(const key of Object.keys(target))delete target[key];Object.assign(target,source);}

/** Assemble with original Generate/PromptManager/macros/world info, without sending or adding messages. */
export class NativePrompts {
  constructor(private context:()=>NativePromptContext){}
  build(history:{role:'user'|'assistant';content:string}[],instruction:string,signal:AbortSignal,type:'normal'|'continue'='normal'):Promise<CompletionMessage[]>{
    const source=this.context().eventSource;
    const task=(queues.get(source)||Promise.resolve()).catch(()=>{}).then(()=>this.assemble(history,instruction,signal,type));
    queues.set(source,task);return task;
  }
  private async assemble(history:{role:'user'|'assistant';content:string}[],instruction:string,signal:AbortSignal,type:'normal'|'continue'){
    signal.throwIfAborted();const context=this.context();
    if(context.mainApi!=='openai'||context.characterId===undefined||!context.chatId)throw Error('原生会话或接口尚未准备好，已停止生成。');
    if(history.some(row=>!['user','assistant'].includes(row.role)||typeof row.content!=='string')||typeof instruction!=='string')throw Error('本次正文上下文不完整。');
    const event=context.eventTypes.GENERATE_AFTER_DATA;if(!event)throw Error('原生提示词事件不可用，请检查原生版本。');
    const chat=context.chat,metadata=context.chatMetadata,previousChat=clone(chat),previousMetadata=clone(metadata),extensions={...context.extensionPrompts};
    const identity=[context.chatId,context.characterId],key='stellar-academy:'+crypto.randomUUID();
    let prompt:CompletionMessage[]|undefined,invalid=false,needsTimedGeneration=['sticky','cooldown'].some(kind=>Object.keys(previousMetadata.timedWorldInfo?.[kind]||{}).length>0);
    const loreEvent=context.eventTypes.WORLDINFO_ENTRIES_LOADED;
    const inspectLore=(groups:Record<string,any[]>)=>{
      // Native dry runs intentionally do not apply sticky/cooldown state. Never
      // silently use a preview as a real generation when those features are enabled.
      if(Object.values(groups||{}).some(rows=>Array.isArray(rows)&&rows.some(row=>row?.disable!==true&&(Number(row?.sticky)>0||Number(row?.cooldown)>0))))needsTimedGeneration=true;
    };
    const receive=(data:any,dryRun:boolean)=>{
      if(dryRun!==true)return;
      if(prompt||!Array.isArray(data?.prompt)||!data.prompt.length){invalid=true;return;}
      prompt=clone(data.prompt);
    };
    context.eventSource.on(event,receive);context.eventSource.makeLast?.(event,receive);
    if(loreEvent)context.eventSource.on(loreEvent,inspectLore);
    let changed=false;
    try{
      chat.splice(0,chat.length,...history.map(row=>({name:row.role==='user'?context.name1:context.name2,is_user:row.role==='user',is_system:false,send_date:'',mes:row.content,extra:{}})));
      // IN_CHAT at depth 0 / SYSTEM, through the native extension prompt API.
      context.setExtensionPrompt(key,instruction,1,0,false,0);
      await context.generate(type,{signal},true);signal.throwIfAborted();
      const current=this.context();changed=current.chat!==chat||current.chatMetadata!==metadata||current.chatId!==identity[0]||current.characterId!==identity[1];
      if(changed)throw Error('原生会话在组装期间改变，已拒绝使用旧上下文。');
      if(needsTimedGeneration)throw Error('世界书跨轮状态还需要完整生成链路，已停止本次请求，原数据保留。');
      if(invalid||!prompt)throw Error('原生提示词组装未完成，未发送模型请求。');
      return prompt;
    }finally{
      context.eventSource.removeListener(event,receive);
      if(loreEvent)context.eventSource.removeListener(loreEvent,inspectLore);
      const current=this.context();changed=current.chat!==chat||current.chatMetadata!==metadata||current.chatId!==identity[0]||current.characterId!==identity[1];
      // Never restore over a different session. The hidden runtime is normally single-owner.
      if(!changed){chat.splice(0,chat.length,...previousChat);replace(metadata,previousMetadata);replace(context.extensionPrompts,extensions);}
      else if(current.extensionPrompts[key])delete current.extensionPrompts[key];
    }
  }
}
