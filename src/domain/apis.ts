import type {Preferences,Profile} from './contracts';
import {samplingFields} from './presets.ts';
export const textApiTasks=[
  {key:'story',field:'storyProfile',label:'剧情',hint:'合并发送正文、变量更新、全部已开启小剧场和快捷回复的提示词，统一由剧情模型输出。'},
  {key:'summary',field:'summaryProfile',label:'逐轮记忆整理',hint:'每轮正文完成后立即整理记忆，成功后按设置建立向量索引。'},
  {key:'terminal',field:'terminalProfile',label:'终端 API',hint:'私聊、群聊、剧情群资料、课程提取和国王游戏使用的接口。发送好友申请使用副 API（优先已选的终端副 API，否则使用首个副 API）。'},
  {key:'persona',field:'personaProfile',label:'AI 帮我写人设',hint:'新游戏的人设辅助填写。'},
] as const;
export type TextApiTask=typeof textApiTasks[number]['key'];

/** Migrate legacy role selectors without dropping an existing API configuration. */
export function migrateApiSettings(p:Preferences):Preferences{
  const profiles=p.profiles.map(profile=>({...profile}));
  if(p.auxiliaryProfiles===undefined)for(const profile of profiles)if(!profile.apiBaseUrl&&['story-model','utility-model','embedding-model'].includes(profile.model))profile.model='';
  if(p.mainProfile===p.embeddingProfile){
    const original=profiles.find(profile=>profile.id===p.embeddingProfile);if(!original)throw new Error('向量 API 引用不正确');
    let id=`${original.id}-embedding`;while(profiles.some(profile=>profile.id===id))id+='-1';
    profiles.push({...original,id,name:'向量 API'});p={...p,embeddingProfile:id};
  }
  const eligible=profiles.filter(profile=>profile.id!==p.mainProfile&&profile.id!==p.embeddingProfile).map(profile=>profile.id);
  const auxiliaryProfiles=p.auxiliaryProfiles??[...new Set([p.auxiliaryProfile,...eligible])].filter(id=>eligible.includes(id));
  if(!Array.isArray(auxiliaryProfiles)||new Set(auxiliaryProfiles).size!==auxiliaryProfiles.length||auxiliaryProfiles.some(id=>!eligible.includes(id)))throw new Error('副 API 引用不正确');
  // 终端是独立可选功能：缺省不写入终端接口，也不回退主 API。
  const routes=Object.fromEntries(textApiTasks.filter(task=>task.key!=='terminal').map(task=>{const id=p[task.field]??p.mainProfile;if(![p.mainProfile,...auxiliaryProfiles].includes(id))throw new Error(`${task.label} API 引用不正确`);return[task.field,id];}));
  if(p.terminalProfile!==undefined&&![p.mainProfile,...auxiliaryProfiles].includes(p.terminalProfile))throw new Error('终端 API 引用不正确');
  const terminalProfile=p.terminalProfile;
  const forumReplyProfile=p.forumReplyProfile??p.mainProfile;if(![p.mainProfile,...auxiliaryProfiles].includes(forumReplyProfile))throw new Error('论坛回复 API 引用不正确');
  const randomEventProfile=p.randomEventProfile??p.mainProfile;if(![p.mainProfile,...auxiliaryProfiles].includes(randomEventProfile))throw new Error('随机事件 API 引用不正确');
  // 终端通讯与正文彻底分开：只有用户明确选过终端 API 才视为已配置。
  // 旧存档若从未选过，缺省不启用终端，也不会在请求时回退主 API。
  const terminalConfigured=typeof p.terminalProfile==='string'&&profiles.some(profile=>profile.id===p.terminalProfile);
  return {...p,diceEnabled:false,stateProfile:(routes.storyProfile||p.mainProfile) as string,memorySummaryInterval:1,stateEnabled:p.stateEnabled!==false,randomEventProbability:Number.isFinite(p.randomEventProbability)?Math.max(0,Math.min(100,p.randomEventProbability!)):30,vectorEnabled:p.vectorEnabled===true,...routes,suggestionsProfile:p.suggestionsProfile??p.mainProfile,randomEventProfile,forumReplyEnabled:p.forumReplyEnabled===true,forumReplyProfile,terminalProfile,terminalEnabled:typeof p.terminalEnabled==='boolean'?p.terminalEnabled:terminalConfigured,terminalOrder:p.terminalOrder==='terminal-first'?'terminal-first':'story-first',profiles,auxiliaryProfiles:[...auxiliaryProfiles],auxiliaryProfile:auxiliaryProfiles[0]||p.mainProfile};
}
export function auxiliaryApis(p:Preferences){return(p.auxiliaryProfiles||[]).map(id=>p.profiles.find(profile=>profile.id===id)).filter((profile):profile is Profile=>!!profile);}
/** Explicit task route. The terminal never falls back to the main API: a task
 * without a user-selected profile is simply unconfigured. */
export function taskApi(p:Preferences,task:TextApiTask|'suggestions'){const field=textApiTasks.find(t=>t.key===(task==='suggestions'?'story':task))!.field;const id=p[field];if(task==='terminal')return id?p.profiles.find(profile=>profile.id===id):undefined;return p.profiles.find(profile=>profile.id===(id||p.mainProfile));}
export function storyApi(p:Preferences){const base=taskApi(p,'story'),params=p.presetParameters?.[p.activePreset||'legacy'];return base&&params?{...base,...Object.fromEntries(samplingFields.filter(([key])=>params[key]!==undefined).map(([key])=>[key,params[key]]))}:base;}
/** Interfaces the prose path cannot work without. The terminal is deliberately absent: it is an
 * optional feature with its own gate (terminalApiIssues), so a broken phone interface can never
 * block the story, even when the user switched the phone on with an old backup. */
export function requiredApis(p:Preferences){const ids=new Set([p.mainProfile,...textApiTasks.filter(task=>task.key!=='terminal').map(task=>p[task.field]||p.mainProfile),...(p.vectorEnabled?[p.embeddingProfile]:[]),...(p.diceEnabled?[p.randomEventProfile||p.mainProfile]:[]),...(p.forumReplyEnabled?[p.forumReplyProfile||p.mainProfile]:[])]);return p.profiles.filter(profile=>ids.has(profile.id));}
export function apiFieldIssues(profile:Profile,key=''){
  const missing:string[]=[];
  if(!profile.apiBaseUrl?.trim())missing.push('API 地址');else try{const u=new URL(profile.apiBaseUrl);if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))missing.push('有效的 HTTPS／本机 HTTP 地址');}catch{missing.push('有效的 API 地址');}
  if(!profile.model.trim()||profile.model.length>150)missing.push('模型名称');if(!key.trim()||key.length>8192)missing.push('Key');
  if(!Number.isFinite(profile.temperature)||profile.temperature<0||profile.temperature>2||!Number.isInteger(profile.maxTokens)||profile.maxTokens<1||profile.maxTokens>32000)missing.push('有效的生成参数');
  for(const [field,min,max] of [['topP',0,1],['frequencyPenalty',-2,2],['presencePenalty',-2,2]] as const)if(profile[field]!==undefined&&(!Number.isFinite(profile[field])||profile[field]!<min||profile[field]!>max)){missing.push('有效的采样参数');break;}
  return missing;
}
export function apiConfigurationIssues(p:Preferences,credentials:Record<string,string>,confirmed:(profile:Profile)=>boolean){
  const issues:string[]=[];
  if(!p.profiles.some(profile=>profile.id===p.mainProfile))issues.push('缺少主 API');
  // 终端是可选功能：正文生成不依赖终端 API，配置问题只在开启终端时单独检查。
  for(const task of textApiTasks)if(task.key!=='terminal'&&(!taskApi(p,task.key)||![p.mainProfile,...(p.auxiliaryProfiles||[])].includes(p[task.field]||p.mainProfile)))issues.push(`请为${task.label}选择主 API 或副 API`);
  if(p.vectorEnabled&&!p.profiles.some(profile=>profile.id===p.embeddingProfile))issues.push('缺少向量 API');
  for(const profile of requiredApis(p)){const role=profile.id===p.mainProfile?'主 API':profile.id===p.embeddingProfile?'向量 API':'副 API';const missing=apiFieldIssues(profile,credentials[profile.id]);if(missing.length)issues.push(`${role}「${profile.name}」需要填写：${missing.join('、')}`);else if(!confirmed(profile))issues.push(`${role}「${profile.name}」尚未确认当前配置`);}
  const story=storyApi(p);if(story&&apiFieldIssues(story,credentials[story.id]).some(s=>s.includes('参数')))issues.push('当前预设的采样参数不正确，请到预设页面检查。');
  return issues;
}
/** Gate for turning the phone on: an explicit, complete and confirmed terminal API.
 * It never falls back to the main profile. */
export function terminalApiIssues(p:Preferences,credentials:Record<string,string>,confirmed:(profile:Profile)=>boolean){
  const issues:string[]=[];
  if(!p.terminalProfile)issues.push('请先为终端 API 选择一个接口，再开启手机。');
  const profile=taskApi(p,'terminal');
  if(p.terminalProfile&&!profile){issues.push('终端 API 引用不正确，请重新选择。');return issues;}
  if(!profile)return issues;
  const role=profile.id===p.mainProfile?'主 API':profile.id===p.embeddingProfile?'向量 API':'副 API';
  const missing=apiFieldIssues(profile,credentials[profile.id]);
  if(missing.length)issues.push(`终端 ${role}「${profile.name}」需要填写：${missing.join('、')}`);
  else if(!confirmed(profile))issues.push(`终端 ${role}「${profile.name}」尚未确认当前配置。`);
  return issues;
}
