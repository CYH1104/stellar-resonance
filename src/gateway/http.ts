import {openGenerationStream,responseMetadata} from './generationResponse';
const upstreamStatusLabel=(v:{upstreamStatus?:unknown})=>Number.isInteger(v.upstreamStatus)&&Number(v.upstreamStatus)>=100&&Number(v.upstreamStatus)<=599?' 上游 HTTP 状态：'+v.upstreamStatus+'。':'';
import {attachHttpNotice,modelRequestContext,modelRequestFailure,reportHttpFailure,taskLabel,upstreamStatus} from './requestFailure';
import {cleanDiagnostic} from '../domain/diagnostics';
import {validateMemoryRecord,type MemoryRequest} from '../domain/memories';
import type { Gateway, GenerateEvent, GenerateRequest, LocalService, Outcome, Persona, Profile, WorldState } from '../domain/contracts';
import {cleanSpecialEvent,type SpecialEventKind,type SpecialEvent} from '../domain/randomEvents';
import { normalizePersona } from '../domain/persona';
import {cleanNativePresetConfig,type NativePresetConfig} from '../domain/nativePreset';
const apiMessages:Record<string,string>={API_ORIGIN_NOT_ALLOWED:'此接口域名或端口未获管理员允许，请联系管理员添加。',API_POLICY_UNAVAILABLE:'服务器接口白名单无法读取，请联系管理员。',INVALID_MEMORY_REQUEST:'本轮记忆输入不完整或超过长度限制，正文已保留。',INVALID_MEMORY_RESULT:'记忆接口返回格式不正确，正文已保留，可单独补记。',PLAYER_SPIRIT_THOUGHT_MISSING:'AI 未生成本轮的玩家精神体 OS。正文已保留，状态未更新；可点击继续续写补齐。',AUTO_CONTINUE_LIMIT:'已自动续写3次，仍未确认完整结束。正文已保留，状态未更新；可点击“继续续写”或重试。',MODEL_RESPONSE_INCOMPLETE:'回复尚未完整结束，已保留正文。',INVALID_COMPLETION_MARKER:'模型的结束标记不符合要求，已保留正文，状态未更新。',INVALID_CONTINUATION:'当前没有可续写的正文，或正文超过长度限制。',INVALID_DICE:'骰点或吉凶判定不一致，请刷新后重试。',DICE_EVENT_MISSING:'模型没有返回本轮骰子事件，正文已保留为未完成稿；请重试。',DICE_EVENT_MISMATCH:'骰子事件与本轮吉凶不一致，未提交新状态；请重试。',DICE_EVENT_UNEXPECTED:'本轮未开启骰子，模型却返回骰子事件；未提交新状态。',INVALID_EMBEDDING_REQUEST:'向量文本为空或超过接口批次／长度限制，请缩短文本后重试。',INVALID_EMBEDDING_RESPONSE:'向量模型返回的数量、维度或数值不正确，请检查向量模型。',EMBEDDING_NOT_SUPPORTED:'该地址不支持 embeddings，请使用支持向量编码的接口和模型。',PRESET_CONTEXT_TOO_LARGE:'当前启用的预设文字超过30万字，请关闭不需要的条目；已导入的文件内容仍保留。',MODEL_TIMEOUT:'本轮生成超时，已保留正文和上一轮状态，可重试。',MODEL_NOT_CONFIGURED:'请先在模型设置确认要使用的服务地址和模型。',MODEL_KEY_REQUIRED:'请填写 API Key，并确认此接口配置。',INVALID_MODEL_URL:'接口地址须为 HTTPS 基础地址（本地模型可用 HTTP），不能包含凭据或查询参数。',INVALID_MODEL_PROFILE:'请检查模型名、Temperature 和输出长度。',MODEL_UNREACHABLE:'无法连接模型服务，请检查地址及网络。',UPSTREAM_AUTH:'模型服务拒绝凭据，请检查 Key。',UPSTREAM_RATE_LIMIT:'模型服务限流，请稍后重试。',UPSTREAM_REJECTED:'模型服务拒绝请求，请检查模型名和参数。',MODEL_STATE_MISSING:'剧情未包含完整状态结果，已保留正文，未更新在场角色。',INVALID_MODEL_STATE:'模型状态格式不合要求，原有状态保留。',UNKNOWN_MODEL_CHARACTER:'模型返回了未登记角色，原有状态保留。',MODEL_STREAM_INTERRUPTED:'模型流中断，已保留正文。',CAST_IS_AI_CONTROLLED:'在场角色由 AI 根据剧情判断，请刷新新版页面。'};
Object.assign(apiMessages,{MODEL_OUTPUT_LIMIT:'模型达到本次输出 Token 上限，正文可能尚未完整。已收到的内容保留，可提高输出上限或继续续写。',MODEL_REFUSAL:'模型拒绝回答或触发内容过滤。已收到的内容保留，请检查中转站请求记录。',INVALID_TERMINAL_REQUEST:'终端请求不完整，请检查参与角色和输入。',INVALID_DIVINATION_SCOPE:'占卜的解读对象与知情范围不一致，已锁定牌面保留，可重试解读或刷新后重试。',INVALID_TERMINAL_RESULT:'角色回复格式未通过检查，当前记录已保留，请重试。',PROMPT_DISCLOSURE_REQUEST_BLOCKED:'请求涉及提取服务器内置提示词，已拒绝生成。',SHARE_NOT_FOUND:'分享码不存在，请检查大小写及是否来自同一服务器。',INVALID_SHARE:'分享模板格式不正确。',SHARE_LIMIT:'分享模板数量已达上限。',SHARE_RATE_LIMIT:'分享操作过于频繁，请一分钟后重试。',
  INVALID_FORUM_THREAD_RESULT:'论坛回复不足5条、遗漏必需发言人或格式不正确，你的评论已保留，可手动重试。',
  MODEL_FANFIC_TOO_SHORT:'同人文不足800字，正文已保留，可补全小剧场。',MODEL_FANFIC_UNFINISHED:'同人文尚未确认完整结尾，正文已保留，可补全小剧场。',MODEL_DIARY_UNFINISHED:'精神体日记缺少结尾署名或故事日期，正文已保留，可补全小剧场。',MODEL_DIARY_TOO_SHORT:'精神体日记不足200字，正文已保留，可补全小剧场。',
  INVALID_WORLD_INFO:'世界书触发内容或插入设置不正确，请检查世界书页面。',
  REQUEST_TOO_LARGE:'本轮请求内容过多，请减少世界书预算或关闭不需要的预设条目后重试。',
  MODEL_REASONING_UNCLOSED:'模型返回了未闭合的思考标签，后面的内容无法安全区分为正文，已停止。请关闭预设中要求输出思考标签的条目后重试；不会显示思维链。',
  STATE_FORMAT_INVALID:'正文已保留，但本次状态格式未通过。可检查状态与格式接口，再手动补修；不会自动重复调用。',
  MODEL_REASONING_ONLY:'中转站返回了推理内容，但没有可展示的正文。请提高最大输出 Token 或检查模型／预设；不会显示思维链。',
  MODEL_NO_VISIBLE_CONTENT:'中转站有返回内容，但只有隐藏内容，没有可展示的正文。请检查预设的输出格式。',
  MODEL_EMPTY_RESPONSE:'中转站结束了回复，但没有返回正文。请检查所选模型是否支持 OpenAI chat/completions 及其输出长度。',
  MODEL_STORY_EMPTY:'模型仅返回了状态数据，没有剧情正文；原有状态保留。',
  INVALID_MODEL_RESPONSE:'中转站返回格式不兼容，未取得正文。请检查 API 地址是否以 /v1 结尾，以及是否支持 OpenAI chat/completions。',
  UPSTREAM_FAILED:'模型服务在回复流内报告失败，请检查中转站请求记录或稍后重试。',
  CHARACTER_AFFINITY_MISSING:'AI 未返回在场角色的有效好感度。',CHARACTER_SPIRIT_THOUGHT_MISSING:'AI 未生成在场角色的精神体 OS。',MODEL_THEATERS_MISSING:'AI 漏写了已开启的小剧场或内容为空。',
  INVALID_FORUM_REPLY:'论坛帖子或评论内容不正确。',INVALID_FORUM_REPLY_RESULT:'AI 的论坛回复为空、被截断或格式无法识别，可以重试回复。',
  INVALID_RANDOM_EVENT:'随机事件请求格式不正确。',INVALID_RANDOM_EVENT_RESULT:'事件模型未返回有效候选，可重试或跳过本轮事件。',SPECIAL_EVENT_ROLL_REQUIRED:'接受随机事件后必须先掷骰，才能生成正文。',
  STATE_REPAIR_LIMIT:'自动补修后状态仍未通过。正文已保留，状态未更新；正文已完整时可点击“补修状态”再次尝试。',
  MODEL_STATE_JSON_INVALID:'隐藏状态的 JSON 格式错误。',MODEL_STATE_FIELDS_INVALID:'隐藏状态包含当前不支持的字段。',
  MODEL_STATE_ROSTER_INVALID:'在场角色名单缺失、重复或格式错误。',MODEL_STATE_EVENT_INVALID:'本轮事件摘要缺失、为空或超过500字。',
  MODEL_STATE_CHARACTERS_INVALID:'角色状态中的 ID、字段类型或长度不符合要求。',MODEL_STATE_PLAYER_INVALID:'玩家状态的字段类型或长度不符合要求。',
  MODEL_STATE_DIARY_INVALID:'精神体日记缺少完整日记、第一人称叙述或已知精神体作者。',
  MODEL_STATE_FORUM_INVALID:'论坛帖子或评论缺少字段、重复编号或格式错误。',MODEL_STATE_THEATERS_INVALID:'小剧场、群聊消息或同人文配对数据格式错误。',
  TERMINAL_DISABLED:'当前版本未启用手机终端功能。'
});
export class HttpGateway implements Gateway {
  constructor(private nativePreset?:()=>NativePresetConfig|null|undefined){}
  async readNativePreset(){return (await this.post('native-config',{action:'read'})).json() as Promise<{preset:Record<string,any>;defaultPreset:Record<string,any>}>;}
  // Upstream errors are mapped to public messages, never displayed verbatim.
  capabilities:{continue:boolean;keyRequired?:boolean;embeddings?:boolean;terminal?:boolean;channel?:string;native?:boolean} = { continue: false, keyRequired:true, terminal:true };
  async bootstrap():Promise<LocalService|undefined>{const response=await fetch('/api/bootstrap',{credentials:'same-origin'});if(response.status===404)return; if(!response.ok){const failure=new Error('无法连接本机后台');attachHttpNotice(failure,reportHttpFailure({status:response.status,task:'连接后台',message:failure.message}));throw failure;} const value=await response.json() as LocalService;if(value.runtime!=='local-card'||!Array.isArray(value.characters)||!Array.isArray(value.places)||!Array.isArray(value.greeting))throw new Error('本机资料接口格式不正确');this.capabilities=value.capabilities;return value;}
  async terminal(input:unknown,profile:Profile,key:string,signal:AbortSignal):Promise<any>{return(await this.post('personal-terminal',{...(input as object),profile,key},signal)).json();}
  async createTheaterShare(template:unknown):Promise<{code:string}>{return (await this.post('theater-shares',{template})).json();}
  async lookupTheaterShare(code:string):Promise<{template:unknown}>{return (await this.post('theater-shares/lookup',{code})).json();}
  async configure(profile:Profile,signal?:AbortSignal):Promise<{origin:string}>{return(await this.post('connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl},signal,modelRequestContext({profile},'connection'))).json();}
  async models(apiBaseUrl:string,key:string,signal:AbortSignal,kind?:'embedding'):Promise<string[]>{const data=await(await this.post('models',{apiBaseUrl,key,...(kind?{kind}:{})},signal)).json();if(!Array.isArray(data.models)||data.models.some((id:unknown)=>typeof id!=='string'||!id.trim()||id.length>150))throw new Error('模型列表格式不正确，请检查接口配置并刷新模型列表。');return data.models;}
  async probe(profile:Profile,key:string,kind:'text'|'embedding',signal:AbortSignal):Promise<{kind:string;durationMs:number;visibleChars?:number;dimensions?:number}>{const value=await(await this.post('probe',{profile,key,kind},signal)).json();if(!value||value.kind!==kind||!Number.isFinite(value.durationMs)||value.durationMs<0||!Number.isInteger(kind==='text'?value.visibleChars:value.dimensions)||(kind==='text'?value.visibleChars:value.dimensions)<1)throw new Error('测活结果格式不正确，请重启本机后台并刷新页面。');return value;}
  async newGame(persona:Persona):Promise<{dataset:string;opening:string;initial:WorldState}>{return (await this.post('new-game',{persona})).json();}
  async assistPersona(wish:string,draft:Persona,profile:Profile,key:string,signal:AbortSignal):Promise<Persona>{const data=await(await this.post('persona',{wish,draft,profile,key},signal)).json();try{return normalizePersona(data.persona);}catch{throw new Error('AI 返回的人设格式不正确，现有表格未修改。');}}
  async place(id:string):Promise<{id:string;name:string;description:string}>{return (await this.post('place',{id})).json();}
  private async post(path: string, body: unknown, signal?: AbortSignal,contextOverride?:string): Promise<Response> {
    if(this.capabilities.native&&['generate','memory','personal-terminal','persona','random-event','forum-reply','utility','probe'].includes(path)){
      const value=this.nativePreset?.();if(!value)throw Error('请先在预设页面载入并保存原生预设。');
      body={...(body as object),nativePreset:cleanNativePresetConfig(value)};
    }
    const context=contextOverride??modelRequestContext(body,path),started=Date.now();
    try{
    const response=await fetch(`/api/${path}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'manual',signal}).catch(error=>{if(signal?.aborted)throw error;throw new Error('无法连接本机后台。请使用“启动预览.bat”启动服务，然后刷新网页。');});
    if(response.type==='opaqueredirect'||response.redirected||response.status>=300&&response.status<400){void response.body?.cancel().catch(()=>{});throw new Error('生成或配置接口发生重定向，请检查登录会话和服务器API路由。'+responseMetadata(response));}
    if(!response.ok){let code='',detail='',raw='',reason='',upstream:number|undefined;try{const value=await response.json() as {code?:unknown;upstreamStatus?:unknown;raw?:unknown;reason?:unknown};detail=upstreamStatusLabel(value);upstream=upstreamStatus(value.upstreamStatus);if(typeof value.code==='string')code=value.code;if(typeof value.raw==='string')raw=value.raw.slice(0,48000);if(typeof value.reason==='string'&&/^[A-Z_]{1,80}$/.test(value.reason))reason=value.reason;}catch{}const personaErrors:Record<string,string>={PLAYER_NAME_REQUIRED:'请填写玩家姓名后再开始。',INVALID_PERSONA:'人设表格的内容或长度不正确，请检查后重试。',INVALID_PERSONA_WISH:'请用不超过3000字描述想玩的人设。',INVALID_PERSONA_RESULT:'AI 返回的人设格式不正确，现有表格未修改，可以重试。',MODEL_LIST_NOT_SUPPORTED:'该服务不支持获取模型列表，请检查接口配置并刷新模型列表。',INVALID_MODEL_LIST:'服务返回的模型列表格式不正确，请检查接口配置并刷新模型列表。',MODEL_LIST_TOO_LARGE:'模型列表过大，请检查接口配置并刷新模型列表。',MODEL_LIST_FAILED:'获取模型列表失败，请检查地址；也可手动填写模型名。'};const failure=new Error((personaErrors[code]||apiMessages[code]||(response.status===404?'服务器接口尚未接通。':response.status===501?'此模型功能尚未配置。':response.status===401||response.status===403?'本机会话已失效，请刷新页面后重新确认接口。':`接口请求失败（${response.status}），请重试。`))+detail+(reason?'；错误类型：'+reason:''));if(raw)(failure as Error&{raw?:string}).raw=raw;attachHttpNotice(failure,reportHttpFailure({status:response.status,...(upstream!==undefined?{upstreamStatus:upstream}:{}),code,task:taskLabel(path),message:[failure.message,context,`已等待：${((Date.now()-started)/1000).toFixed(1)} 秒`].filter(Boolean).join('\n')}));throw failure;}
    return response;
    }catch(error){const failure=modelRequestFailure(error,context,Date.now()-started);if(typeof (error as {raw?:unknown})?.raw==='string'&&failure&&typeof failure==='object')(failure as {raw?:string}).raw=(error as {raw:string}).raw;throw failure;}
  }
  async authorize(invite: string, signal?: AbortSignal): Promise<void> { const response=await this.post('access',{invite},signal);if(response.status!==204){const data=await response.json() as {capabilities?:{continue?:boolean}};this.capabilities.continue=data.capabilities?.continue===true;} }
  async *generate(request: GenerateRequest, key: string, signal: AbortSignal): AsyncIterable<GenerateEvent> {
    const context=modelRequestContext({profile:{...request.profile},key},'generate'),started=Date.now();
    const response=await this.post('generate',{...request,key,singleStateCall:true,captureFormatErrors:true},signal);
    const {reader,prefix,decoder}=await openGenerationStream(response,code=>Object.hasOwn(apiMessages,code)?apiMessages[code]:undefined).catch(error=>{throw modelRequestFailure(error,context,Date.now()-started);});
    let buffer=prefix.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'), finished=false;
    try {
      while(true) {
        const next=buffer.includes('\n\n')?{done:false,value:undefined}:await reader.read(); buffer += decoder.decode(next.value,{stream:!next.done}); buffer=buffer.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
        if(next.done&&buffer.trim())buffer+='\n\n';
        let end: number;
        while((end=buffer.indexOf('\n\n'))>=0) {
          const block=buffer.slice(0,end); buffer=buffer.slice(end+2);
          const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
          if(!data) continue;
          let event:Record<string,unknown>;
          try {event=JSON.parse(data) as Record<string,unknown>;}catch{throw new Error('流式数据格式不正确');}
          if(event.type==='developer-trace'&&event.trace&&typeof event.trace==='object'){const t=event.trace as import('../domain/contracts').DeveloperTrace;if(['request','complete'].includes(t.stage)&&typeof t.model==='string'&&Number.isFinite(t.elapsedMs)&&Array.isArray(t.messages)&&t.messages.length<=10000&&t.messages.every(m=>Number.isInteger(m.index)&&['system','user','assistant'].includes(m.role)&&Number.isFinite(m.characters)))yield {type:'developer-trace',trace:t};}
          else if(event.type==='format-error'&&typeof event.raw==='string'&&event.raw.length<=400000&&typeof event.code==='string'&&/^[A-Z_]{1,100}$/.test(event.code)){yield {type:'format-error',raw:event.raw,code:event.code};}
          else if(event.type==='diagnostic'){const safe=cleanDiagnostic(event.diagnostic);if(safe)yield {type:'diagnostic',diagnostic:safe};}
          else if(event.type==='progress'&&['waiting','hidden','receiving'].includes(String(event.phase)))yield {type:'progress',phase:event.phase as 'waiting'|'hidden'|'receiving'};
          else if(event.type==='delta' && typeof event.text==='string') yield {type:'delta',text:event.text};
          else if(event.type==='continuation'&&Number.isInteger(event.attempt)&&Number(event.attempt)>=1&&Number(event.attempt)<=3&&event.maxAttempts===3)yield {type:'continuation',attempt:Number(event.attempt),maxAttempts:3};
          else if(event.type==='repair'&&Number.isInteger(event.attempt)&&Number(event.attempt)>=1&&Number(event.attempt)<=3&&event.maxAttempts===3)yield {type:'repair',attempt:Number(event.attempt),maxAttempts:3,reason:apiMessages[String(event.code)]||'隐藏状态数据未通过检查。'};
          else if(event.type==='done') {finished=true;const raw=typeof event.raw==='string'&&event.raw.length<=200000?event.raw:undefined;yield {type:'done',outcome:event.outcome as Outcome,...(raw!==undefined?{raw}:{})};return;}
          else if(event.type==='error') {const failure=new Error((apiMessages[String(event.code)]||'生成接口报告错误，请重试。')+upstreamStatusLabel(event)+(['STATE_REPAIR_LIMIT','STATE_FORMAT_INVALID'].includes(String(event.code))&&apiMessages[String(event.reasonCode)]?' 原因：'+apiMessages[String(event.reasonCode)]:''));attachHttpNotice(failure,reportHttpFailure({status:response.status,...(event.upstreamStatus!==undefined?{upstreamStatus:upstreamStatus(event.upstreamStatus)}:{}),code:String(event.code),task:taskLabel('generate'),message:[failure.message,context,`已等待：${((Date.now()-started)/1000).toFixed(1)} 秒`].filter(Boolean).join('\n')}));throw failure;}
        }
        if(next.done) break;
        if(buffer.length>1024*1024) throw new Error('流式分片超过允许大小');
      }
      if(!finished) throw new Error('回复流已中断，保留已收到的内容。');
    } catch(error){throw modelRequestFailure(error,context,Date.now()-started);} finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  }
  async randomEvent(input:{instruction?:string;kind:SpecialEventKind;persona:Persona;input:string;history:{role:'user'|'assistant';content:string}[];presentCharacterIds:string[]},profile:Profile,key:string,signal:AbortSignal):Promise<SpecialEvent>{return cleanSpecialEvent(await(await this.post('random-event',{...input,profile,key},signal)).json());}
  async forumReply(input:{persona?:Persona;state?:WorldState;userName:string;post:{authorName:string;content:string};comments:{authorName:string;content:string}[];minReplies?:5;participantNames?:string[]},profile:Profile,key:string,signal:AbortSignal):Promise<{authorId:string;authorName:string;content:string}|{authorId:string;authorName:string;content:string}[]>{const data=await(await this.post('forum-reply',{...input,profile,key},signal)).json();const valid=(r:any)=>r&&typeof r.authorId==='string'&&typeof r.authorName==='string'&&typeof r.content==='string'&&!!r.content.trim();if(input.minReplies===5){if(!Array.isArray(data?.replies)||data.replies.length<5||data.replies.length>50||!data.replies.every(valid))throw new Error('论坛回复不足5条或格式不正确，你的评论已保留，可重试。');return data.replies;}if(!valid(data))throw new Error('论坛回复格式不正确，你的评论已保留。');return data;}

  async memoryBatch(rounds:MemoryRequest[],profile:Profile,key:string,signal:AbortSignal){const data=await(await this.post('memory',{rounds,profile,key},signal)).json();if(!Array.isArray(data.records)||data.records.length!==rounds.length)throw new Error('批量记忆返回不完整');return data.records.map(validateMemoryRecord);}
  async memory(input:MemoryRequest,profile:Profile,key:string,signal:AbortSignal){const data=await(await this.post('memory',{...input,profile,key},signal)).json();return validateMemoryRecord(data.record);}
  async utility(task: 'summary'|'suggestions', texts: string[], profile: Profile, key: string, signal: AbortSignal): Promise<string[]> {
    const response=await this.post('utility',{task,texts,profile,key},signal); const json=await response.json() as {items:unknown};
    if(!Array.isArray(json.items)||json.items.some(x=>typeof x!=='string')) throw new Error('辅助模型返回格式不正确');
    return json.items.slice(0,4);
  }
  async embed(texts: string[], profile: Profile, key: string, signal: AbortSignal): Promise<number[][]> {
    const response=await this.post('embeddings',{texts,profile,key},signal); const json=await response.json() as {vectors:unknown};
    if(!Array.isArray(json.vectors)||json.vectors.length!==texts.length||json.vectors.some(v=>!Array.isArray(v)||!v.length||v.length>8192||v.some(x=>typeof x!=='number'||!Number.isFinite(x)))) throw new Error('向量接口返回格式不正确');
    return json.vectors as number[][];
  }
}
