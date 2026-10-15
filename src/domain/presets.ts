import type {Preset,Profile} from './contracts';
export const setId=(p:Preset)=>p.setId||'legacy';
export function presetGroups(list:Preset[]){return [...new Map(list.map(p=>[setId(p),{id:setId(p),name:p.setName||'原有预设'}])).values()];}
export function activePromptEntries(entries:Preset[],generationType='normal'){return entries.filter(p=>p.enabled&&!p.marker&&p.content.trim()&&(!p.triggers?.length||p.triggers.includes(generationType)));}
export function cleanPreset(p:Preset):Preset{
  if(!p||typeof p.id!=='string'||typeof p.name!=='string'||typeof p.content!=='string'||p.content.length>50000||typeof p.enabled!=='boolean')throw new Error('预设条目格式不正确');
  if(p.role!==undefined&&!['system','user','assistant'].includes(p.role)||p.position!==undefined&&!['before','after','in-chat'].includes(p.position))throw new Error('预设角色或位置不正确');
  const out:Preset={id:p.id,name:p.name,content:p.content,enabled:p.enabled};
  for(const key of ['setId','setName','identifier'] as const)if(p[key]!==undefined){if(typeof p[key]!=='string'||p[key]!.length>200)throw new Error('预设标识不正确');out[key]=p[key];}
  if(p.role)out.role=p.role;if(p.position)out.position=p.position;
  for(const key of ['depth','order'] as const)if(p[key]!==undefined){if(!Number.isInteger(p[key])||p[key]!<0||p[key]!>10000)throw new Error('预设注入深度或顺序不正确');out[key]=p[key];}
  if(p.marker!==undefined){if(typeof p.marker!=='boolean')throw new Error('预设标记不正确');out.marker=p.marker;}
  if(p.triggers!==undefined){if(!Array.isArray(p.triggers)||p.triggers.some(n=>!['normal','continue','impersonate','swipe','regenerate','quiet'].includes(n)))throw new Error('预设触发类型不正确');out.triggers=[...p.triggers];}
  return out;
}
export function importTavernPreset(text:string,filename='导入预设'){
  if(new TextEncoder().encode(text).length>5*1024*1024)throw new Error('预设文件最多5MB');
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
    const item=cleanPreset({id:crypto.randomUUID(),setId:id,setName:name,identifier,name:typeof p.name==='string'?p.name:identifier,content:p.content||'',enabled:hasOrder?record?.enabled===true:p.enabled!==false,role,marker:p.marker===true,position:p.injection_position===1?'in-chat':identifier==='jailbreak'||historyIndex>=0&&entryIndex>historyIndex?'after':'before',depth:p.injection_depth??4,order:p.injection_order??100,...(Array.isArray(p.injection_trigger)?{triggers:p.injection_trigger}:{})});
    return item;
  });
  if(modelRoleCount)warnings.push(`已将 ${modelRoleCount} 条 model 消息角色转换为 assistant；提示词、启停和位置保留。`);
  entries.sort((a,b)=>{const ai=order.findIndex(o=>o.identifier===a.identifier),bi=order.findIndex(o=>o.identifier===b.identifier);return(ai<0?9999:ai)-(bi<0?9999:bi);});
  const parameters:Partial<Profile>={};
  for(const [source,target,min,max] of [['temperature','temperature',0,2],['openai_max_tokens','maxTokens',1,32000],['top_p','topP',0,1],['frequency_penalty','frequencyPenalty',-2,2],['presence_penalty','presencePenalty',-2,2]] as const){if(raw[source]!==undefined){if(typeof raw[source]==='number'&&Number.isFinite(raw[source])&&raw[source]>=min&&raw[source]<=max&&(target!=='maxTokens'||Number.isInteger(raw[source])))parameters[target]=raw[source];else warnings.push(`${source} 超出支持范围，未应用。`);}}
  if(entries.some(p=>p.marker))warnings.push('角色、世界资料和聊天历史占位条目由服务器统一提供；不能借此移除服务器必需设定。');
  if(entries.some(p=>/\{\{(?!user\}\}|char\}\})/.test(p.content)))warnings.push('仅替换 {{user}}、{{char}}；复杂宏和脚本不会执行，使用前请检查对应条目。');
  if(raw.extensions)warnings.push('预设扩展、脚本和正则未导入或执行。');
  warnings.push('仅应用提示词及受支持的采样参数；文件中的服务地址、模型与凭据不会导入。');
  return {id,name,entries,parameters,warnings};
}
export function exportTavernPreset(entries:Preset[],profile:Profile){
  const anchor=entries.find(p=>p.identifier==='chatHistory')||{id:'chatHistory',identifier:'chatHistory',name:'Chat History',content:'',enabled:true,marker:true} as Preset;
  const prompts=[...entries,...(entries.includes(anchor)?[]:[anchor])];
  const ordered=[...entries.filter(p=>p!==anchor&&p.position!=='after'),anchor,...entries.filter(p=>p!==anchor&&p.position==='after')];
  return JSON.stringify({name:entries[0]?.setName||'群星共振预设',temperature:profile.temperature,openai_max_tokens:profile.maxTokens,top_p:profile.topP??1,frequency_penalty:profile.frequencyPenalty??0,presence_penalty:profile.presencePenalty??0,prompts:prompts.map(p=>({identifier:p.identifier||p.id,name:p.name,role:p.role||'system',content:p.content,marker:!!p.marker,injection_position:p.position==='in-chat'?1:0,injection_depth:p.depth??4,injection_order:p.order??100,...(p.triggers?{injection_trigger:p.triggers}:{})})),prompt_order:[{character_id:100001,order:ordered.map(p=>({identifier:p.identifier||p.id,enabled:p.enabled}))}]},null,2);
}
