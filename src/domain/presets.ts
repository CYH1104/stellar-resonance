import {importRegexRules,injectsHtml,type RegexRule} from './regex.ts';
import type {Preset,Profile} from './contracts';
import {cleanPromptGroup,importPromptGroups,exportPromptGroups,restoreKnownPromptGroups} from './promptGroups.ts';
import {detectPresetCompatibility,cleanPresetCompatibility} from './presetCompatibility.ts';
import {cleanOutputParsing,type OutputParsing} from './outputParsing.ts';
export const presetTailIdentifier='academy_preset_tail';
export const isPresetTail=(p:Preset)=>p.identifier===presetTailIdentifier;
export function blankPresetTail(id:string,name:string):Preset{return {id:crypto.randomUUID(),setId:id,setName:name,identifier:presetTailIdentifier,name:'预设尾部',role:'user',content:'',enabled:false,included:true,position:'after',marker:false};}
export function updatePresetTail(entries:Preset[],id:string,name:string,patch:Partial<Pick<Preset,'enabled'|'role'|'content'>>){const found=entries.find(p=>setId(p)===id&&isPresetTail(p)),value=cleanPreset({...found||blankPresetTail(id,name),...patch,position:'after',marker:false,included:true,group:null});if(found){Object.assign(found,value);return found;}entries.push(value);return value;}
export const pinnedPromptIds=['main','nsfw','jailbreak','chatHistory','worldInfoBefore','worldInfoAfter','personaDescription','charDescription','charPersonality','scenario','dialogueExamples','enhanceDefinitions',presetTailIdentifier];
export const promptTriggers=[{value:'normal',label:'正常回复'},{value:'continue',label:'续写'},{value:'regenerate',label:'重演／重试'},{value:'swipe',label:'切换生成'},{value:'impersonate',label:'代写玩家'},{value:'quiet',label:'后台生成'}];
export function newPresetEntries(id:string,name:string):Preset[]{
  const labels:Record<string,string>={main:'主提示词',nsfw:'辅助提示词',jailbreak:'历史后提示词',chatHistory:'聊天历史',worldInfoBefore:'服务器世界资料（前）',worldInfoAfter:'服务器世界资料（后）',personaDescription:'玩家人设',charDescription:'角色设定',charPersonality:'角色性格',scenario:'当前场景',dialogueExamples:'对话示例',enhanceDefinitions:'补充设定提示'};
  const order=['main','worldInfoBefore','personaDescription','charDescription','charPersonality','scenario','enhanceDefinitions','nsfw','worldInfoAfter','dialogueExamples','chatHistory','jailbreak'];
  return order.map(identifier=>({id:crypto.randomUUID(),setId:id,setName:name,identifier,name:labels[identifier],role:'system',content:identifier==='main'?'使用清晰中文叙事，停在需要玩家选择的地方。':'',enabled:identifier!=='enhanceDefinitions',included:true,marker:!['main','nsfw','jailbreak','enhanceDefinitions'].includes(identifier),position:identifier==='jailbreak'?'after':'before',depth:4,order:100}));
}
export const samplingFields=[['temperature',0,2],['maxTokens',1,32000],['topP',0,1],['frequencyPenalty',-2,2],['presencePenalty',-2,2]] as const;
export function cleanSampling(value:unknown):Partial<Profile>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('预设采样参数不正确');const out:Partial<Profile>={};
  for(const [key,min,max]of samplingFields){const n=(value as any)[key];if(n===undefined)continue;if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max||key==='maxTokens'&&!Number.isInteger(n))throw new Error('预设采样参数不正确');out[key]=n;}return out;
}
export function cleanPresetParameters(value:unknown):Record<string,Partial<Profile>>{
  if(value===undefined)return {};if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>500)throw new Error('预设参数集合不正确');
  return Object.fromEntries(Object.entries(value).map(([key,v])=>{if(['__proto__','constructor','prototype'].includes(key))throw new Error('预设标识不正确');return[key,cleanSampling(v)];}));
}
export function reorderPresetEntries(entries:Preset[],from:number,to:number){
  const out=[...entries];if(from<0||to<0||from>=out.length||to>=out.length)return out;const [p]=out.splice(from,1);out.splice(to,0,p);
  const history=out.findIndex(p=>p.identifier==='chatHistory');if(history>=0)for(const [i,p]of out.entries())if(p.position!=='in-chat')p.position=i>history?'after':'before';return out;
}
export const setId=(p:Preset)=>p.setId||'legacy';
export function presetGroups(list:Preset[]){return [...new Map(list.map(p=>[setId(p),{id:setId(p),name:p.setName||'原有预设'}])).values()];}
export function activePromptEntries(entries:Preset[],generationType='normal'){return entries.filter(p=>p.enabled&&p.content.trim()&&(isPresetTail(p)||p.included!==false&&p.group?.enabled!==false&&!p.marker&&(!p.triggers?.length||p.triggers.includes(generationType))));}
export function cleanPreset(p:Preset):Preset{
  if(!p||typeof p.id!=='string'||typeof p.name!=='string'||typeof p.content!=='string'||typeof p.enabled!=='boolean')throw new Error('预设条目格式不正确');
  if(p.role!==undefined&&!['system','user','assistant'].includes(p.role)||p.position!==undefined&&!['before','after','in-chat'].includes(p.position))throw new Error('预设角色或位置不正确');
  const out:Preset={id:p.id,name:p.name,content:p.content,enabled:p.enabled};
  if(p.compatibility!==undefined)out.compatibility=cleanPresetCompatibility(p.compatibility);
  if(p.group!==undefined)out.group=cleanPromptGroup(p.group);
  for(const key of ['setId','setName','identifier'] as const)if(p[key]!==undefined){if(typeof p[key]!=='string'||p[key]!.length>200)throw new Error('预设标识不正确');out[key]=p[key];}
  if(p.role)out.role=p.role;if(p.position)out.position=p.position;
  for(const key of ['depth','order'] as const)if(p[key]!==undefined){if(!Number.isInteger(p[key])||p[key]!<0||p[key]!>10000)throw new Error('预设注入深度或顺序不正确');out[key]=p[key];}
  if(p.marker!==undefined){if(typeof p.marker!=='boolean')throw new Error('预设标记不正确');out.marker=p.marker;}
  if(p.included!==undefined){if(typeof p.included!=='boolean')throw new Error('预设列表状态不正确');out.included=p.included;}
  if(p.triggers!==undefined){if(!Array.isArray(p.triggers)||p.triggers.some(n=>!['normal','continue','impersonate','swipe','regenerate','quiet'].includes(n)))throw new Error('预设触发类型不正确');out.triggers=[...p.triggers];}
  if(isPresetTail(out)){out.position='after';out.marker=false;out.included=true;out.group=null;delete out.triggers;}
  return out;
}
export function importTavernPreset(text:string,filename='导入预设',options:{preserveOutputs?:boolean}={}){
  let raw:any;try{raw=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('预设不是有效的 JSON 文件');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('不是支持的预设文件');
  const id=crypto.randomUUID(),name=(typeof raw.name==='string'?raw.name:filename.replace(/\.json$/i,'')).slice(0,180),warnings:string[]=[];
  let prompts:any[],order:any[]=[];
  if(Array.isArray(raw.prompts)){
    prompts=raw.prompts;
    const groups=Array.isArray(raw.prompt_order)?raw.prompt_order:[];
    const chosen=groups.find((g:any)=>g.character_id===100001)||groups[0];order=Array.isArray(chosen?.order)?chosen.order:[];
    if(groups.length>1)warnings.push('使用酒馆默认角色的排序分组；其他角色专用排序未应用。');
  }else if(typeof raw.content==='string')prompts=[raw];
  else if(typeof raw.system_prompt==='string'||typeof raw.jailbreak_prompt==='string'){
    prompts=[{name:'系统提示词',content:raw.system_prompt||'',identifier:'main'},{name:'后置提示词',content:raw.jailbreak_prompt||'',identifier:'jailbreak'}];warnings.push('已提取文本补全预设中的提示词；专属上下文模板未执行。');
  }else throw new Error('文件中没有酒馆 prompts 条目或可导入的文字预设');
  if(!prompts.length)throw new Error('预设的 prompts 列表为空，没有可导入的提示词');
  const importedGroups=importPromptGroups(raw.extensions?.baibaiToolkit?.presetPromptGroups);
  const injectionOrder=(p:any)=>typeof p?.injection_order==='number'&&Number.isFinite(p.injection_order)?p.injection_order:100;
  const compactOrder=prompts.some((p:any)=>!Number.isInteger(injectionOrder(p))||injectionOrder(p)<0||injectionOrder(p)>10000);
  const orderRanks=[...new Set<number>(prompts.map(injectionOrder))].sort((a,b)=>a-b);
  if(compactOrder)warnings.push('超范围的酒馆注入顺序已按相对大小压缩，原先后关系保留。');
  const identifiers=new Set<string>();let modelRoleCount=0;
  const entries=prompts.map((p:any,i:number)=>{
    if(!p||typeof p!=='object')throw new Error('酒馆提示词条目格式不正确');
    const identifier=typeof p.identifier==='string'?p.identifier:`entry-${i}`;
    if(identifiers.has(identifier))throw new Error('酒馆预设包含重复条目标识');identifiers.add(identifier);
    if(p.content!==undefined&&typeof p.content!=='string')throw new Error('提示词内容必须是文字');
    const record=order.find(o=>o.identifier===identifier),hasOrder=order.length>0,historyIndex=order.findIndex(o=>o.identifier==='chatHistory'),entryIndex=order.findIndex(o=>o.identifier===identifier);
    // Gemini-style model turns have the same message role as assistant turns.
    const role=p.role==='model'?'assistant':p.role||'system';
    if(p.role==='model')modelRoleCount++;
    const depth=Number(p.injection_depth??4),safeDepth=Number.isFinite(depth)?Math.max(0,Math.min(10000,Math.trunc(depth))):4;
    if(p.injection_depth!==undefined&&p.injection_depth!==safeDepth)warnings.push('条目“'+(p.name||identifier)+'”的注入深度已转换为支持的范围。');
    const item=cleanPreset({id:crypto.randomUUID(),setId:id,setName:name,identifier,name:typeof p.name==='string'?p.name:identifier,content:p.content||'',enabled:hasOrder?record?.enabled===true:p.enabled!==false,role,marker:p.marker===true,position:p.injection_position===1?'in-chat':historyIndex>=0&&entryIndex>=0?(entryIndex>historyIndex?'after':'before'):identifier==='jailbreak'?'after':'before',depth:safeDepth,order:compactOrder?orderRanks.indexOf(injectionOrder(p)):injectionOrder(p),...(Array.isArray(p.injection_trigger)?{triggers:p.injection_trigger}:{})});
    if(p.academy_compatibility!==undefined)item.compatibility=cleanPresetCompatibility(p.academy_compatibility);
    if(importedGroups.has(identifier))item.group=importedGroups.get(identifier);
    if(hasOrder&&!record)item.included=false;return item;
  });
  if(modelRoleCount)warnings.push(`已将 ${modelRoleCount} 条 model 消息角色转换为 assistant；提示词、启停和位置保留。`);
  // prompt_order is the execution order, not merely the enabled flags. Keep library
  // entries absent from it at the end without enabling or losing their source text.
  if(order.length){const ranks=new Map(order.map((p:any,i:number)=>[p.identifier,i]));entries.sort((a,b)=>(ranks.get(a.identifier)??Number.MAX_SAFE_INTEGER)-(ranks.get(b.identifier)??Number.MAX_SAFE_INTEGER));}
  restoreKnownPromptGroups(entries);
  detectPresetCompatibility(entries,options.preserveOutputs!==false);
  const closed=entries.filter(p=>p.compatibility?.verdict==='disabled'&&p.compatibility.originalEnabled),review=entries.filter(p=>p.compatibility?.verdict==='review');
  if(closed.length)warnings.push(`已关闭 ${closed.length} 条重复输出提示词：${closed.map(p=>p.name).join('、')}。原文保留，可在兼容检测中恢复。`);
  if(review.length)warnings.push(`另有 ${review.length} 条可能涉及自定义输出格式或写作规则，未自动关闭，请在兼容检测中核查。`);
  const parameters:Partial<Profile>={};
  for(const [source,target,min,max] of [['temperature','temperature',0,2],['openai_max_tokens','maxTokens',1,32000],['top_p','topP',0,1],['frequency_penalty','frequencyPenalty',-2,2],['presence_penalty','presencePenalty',-2,2]] as const){if(raw[source]!==undefined){if(typeof raw[source]==='number'&&Number.isFinite(raw[source])&&raw[source]>=min&&raw[source]<=max&&(target!=='maxTokens'||Number.isInteger(raw[source])))parameters[target]=raw[source];else warnings.push(`${source} 超出支持范围，未应用。`);}}
  if(entries.some(p=>p.marker))warnings.push('角色、世界资料和聊天历史占位条目由服务器统一提供；不能借此移除服务器必需设定。');
  if(entries.some(p=>/\{\{(?!(?:user|char|persona|charIfNotGroup)\}\})/i.test(p.content)))warnings.push('支持姓名／人设、setvar/getvar/addvar 文本变量、random、lastUserMessage、换行与注释宏；其他扩展宏与脚本不执行。变量仅在本次请求内生效。');
  if(raw.extensions)warnings.push('支持导入提示词分组的名称、归属、开关与折叠状态；正则导入聊天顶栏“正则”；其余扩展脚本不执行。');
  const special=['top_k','top_a','min_p','repetition_penalty','seed','reasoning_effort','openai_max_context','continue_prefill','assistant_prefill','squash_system_messages'].filter(key=>raw[key]!==undefined);if(special.length)warnings.push(`供应商专属或尚未接入的设置未执行：${special.join('、')}。`);
  const accepted=['name','prompts','prompt_order','content','enabled','system_prompt','jailbreak_prompt','temperature','openai_max_tokens','top_p','frequency_penalty','presence_penalty'];
  const other=Object.keys(raw).filter(key=>!accepted.includes(key)&&!special.includes(key)&&/^[a-z][a-z0-9_]{0,64}$/i.test(key)&&!/(?:key|token|url|proxy|password|secret|header)/i.test(key));if(other.length)warnings.push(`其他未执行的酒馆选项：${other.slice(0,12).join('、')}${other.length>12?` 等${other.length}项`:''}。`);
  warnings.push('模型思维链强制隐藏；导入的思考展示选项不能覆盖此规则。');
  warnings.push('仅应用提示词及受支持的采样参数；文件中的服务地址、模型与凭据不会导入。');
  const outputParsing=cleanOutputParsing(raw.extensions?.academy_output_parser);
  const regexRules=importRegexRules(raw,id);if(regexRules.length)warnings.push(`已导入 ${regexRules.length} 条正则，可在聊天顶栏“正则”中编辑和开关。显示侧 HTML 注入规则停用，使用内置渲染；提示词侧规则保留。`);return {id,name,entries,parameters,warnings,regexRules,outputParsing};
}
export function exportTavernPreset(entries:Preset[],profile:Profile,regexRules:RegexRule[]=[],outputParsing?:OutputParsing){
  const anchor=entries.find(p=>p.identifier==='chatHistory')||{id:'chatHistory',identifier:'chatHistory',name:'Chat History',content:'',enabled:true,marker:true} as Preset;
  const sorted=[...entries.filter(p=>!isPresetTail(p)),...entries.filter(isPresetTail)];
  const prompts=[...sorted,...(entries.includes(anchor)?[]:[anchor])];
  const historyIndex=entries.indexOf(anchor);
  const beforeHistory=(p:Preset)=>p.position!=='after'&&(p.position!=='in-chat'||historyIndex<0||entries.indexOf(p)<historyIndex);
  const listed=sorted.filter(p=>p.included!==false&&p!==anchor);
  const ordered=[...listed.filter(p=>!isPresetTail(p)&&beforeHistory(p)),...(anchor.included!==false?[anchor]:[]),...listed.filter(p=>!isPresetTail(p)&&!beforeHistory(p)),...listed.filter(isPresetTail)];
  const grouping=exportPromptGroups(entries);
  return JSON.stringify({extensions:{academy_output_parser:cleanOutputParsing(outputParsing),...(grouping?{baibaiToolkit:{presetPromptGroups:grouping}}:{}),...(regexRules.length?{regex_scripts:regexRules.map(({setId,...rule})=>rule)}:{})},name:entries[0]?.setName||'群星共振预设',temperature:profile.temperature,openai_max_tokens:profile.maxTokens,top_p:profile.topP??1,frequency_penalty:profile.frequencyPenalty??0,presence_penalty:profile.presencePenalty??0,prompts:prompts.map(p=>({identifier:p.identifier||p.id,name:p.name,role:p.role||'system',content:p.content,marker:!!p.marker,injection_position:p.position==='in-chat'?1:0,injection_depth:p.depth??4,injection_order:p.order??100,...(p.compatibility?{academy_compatibility:{...p.compatibility,...(p.compatibility.verdict==='disabled'&&p.enabled?{restored:true}:{})}}:{}),...(p.triggers?{injection_trigger:p.triggers}:{})})),prompt_order:[{character_id:100001,order:ordered.map(p=>({identifier:p.identifier||p.id,enabled:p.enabled}))}]},null,2);
}
