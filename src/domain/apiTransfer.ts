import type {Preferences,Profile} from './contracts';
import {apiFieldIssues,migrateApiSettings} from './apis';

const routeFields=['stateProfile','mainProfile','auxiliaryProfile','embeddingProfile','storyProfile','summaryProfile','suggestionsProfile','personaProfile','terminalProfile','randomEventProfile','forumReplyProfile'] as const;
const flags=['vectorEnabled','diceEnabled','forumReplyEnabled'] as const;
const profileFields=['id','name','providerId','model','apiBaseUrl','temperature','maxTokens','topP','frequencyPenalty','presencePenalty'] as const;
export type ApiConfiguration=Pick<Preferences,typeof routeFields[number]|typeof flags[number]|'profiles'|'auxiliaryProfiles'>;
export interface ApiTransfer {format:'stellar-api-settings';version:1;configuration:ApiConfiguration;keys?:Record<string,string>}
const validId=(id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.length<=128&&!['__proto__','constructor','prototype'].includes(id);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const invalid=()=>new Error('API 设置文件格式不正确，请使用本页面导出的 JSON 文件。');

export function exportApiSettings(p:Preferences,credentials:Record<string,string>,includeKeys=false):string{
 const normalized=migrateApiSettings(p);
 const configuration=Object.fromEntries([...routeFields,...flags,'auxiliaryProfiles'].map(k=>[k,normalized[k as keyof Preferences]])) as unknown as ApiConfiguration;
 configuration.profiles=normalized.profiles.map(p=>Object.fromEntries(profileFields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])) as unknown as Profile);
 const result:ApiTransfer={format:'stellar-api-settings',version:1,configuration};
 if(includeKeys)result.keys=Object.fromEntries(configuration.profiles.filter(p=>!!credentials[p.id]).map(p=>[p.id,credentials[p.id]]));
 return JSON.stringify(result,null,2);
}

export function parseApiSettings(text:string):ApiTransfer{
 if(text.length>1024*1024)throw new Error('API 设置文件最多1MB。');
 let raw:unknown;try{raw=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw invalid();}
 if(!object(raw)||raw.format!=='stellar-api-settings'||raw.version!==1||!object(raw.configuration))throw invalid();
 const c=raw.configuration;
 if(!Array.isArray(c.profiles)||c.profiles.length<2||c.profiles.length>30)throw invalid();
 const profiles=c.profiles.map((p:unknown)=>{
  if(!object(p)||!validId(p.id)||typeof p.name!=='string'||p.name.length>200||typeof p.providerId!=='string'||p.providerId.length>200||typeof p.model!=='string'||p.model.length>150||p.apiBaseUrl!==undefined&&(typeof p.apiBaseUrl!=='string'||p.apiBaseUrl.length>2000))throw invalid();
  const profile=Object.fromEntries(profileFields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])) as unknown as Profile;
  // Blank optional connections can be transferred; malformed addresses and parameters cannot.
  if(apiFieldIssues(profile,'transfer-validation').some(issue=>issue.includes('参数')||profile.apiBaseUrl?.trim()&&issue.includes('地址')))throw invalid();
  return profile;
 });
 const ids=new Set(profiles.map(p=>p.id));
 if(ids.size!==profiles.length||!validId(c.mainProfile)||!validId(c.embeddingProfile)||c.mainProfile===c.embeddingProfile||!ids.has(c.mainProfile)||!ids.has(c.embeddingProfile)||!Array.isArray(c.auxiliaryProfiles))throw invalid();
 const auxiliary=c.auxiliaryProfiles;
 if(auxiliary.some(id=>!validId(id)||!ids.has(id)||id===c.mainProfile||id===c.embeddingProfile)||new Set(auxiliary).size!==auxiliary.length||profiles.length!==auxiliary.length+2)throw invalid();
 for(const k of routeFields)if(c[k]!==undefined&&(!validId(c[k])||!ids.has(c[k] as string)))throw invalid();
 for(const k of flags)if(typeof c[k]!=='boolean')throw invalid();
 const picked=Object.fromEntries([...routeFields,...flags].filter(k=>c[k]!==undefined).map(k=>[k,c[k]]));
 let normalized:Preferences;try{normalized=migrateApiSettings({...picked,profiles,auxiliaryProfiles:auxiliary} as Preferences);}catch{throw invalid();}
 const configuration=Object.fromEntries([...routeFields,...flags,'auxiliaryProfiles'].map(k=>[k,normalized[k as keyof Preferences]])) as unknown as ApiConfiguration;
 configuration.profiles=profiles;
 let keys:Record<string,string>|undefined;
 if(raw.keys!==undefined){if(!object(raw.keys)||Object.keys(raw.keys).length>30)throw invalid();keys=Object.fromEntries(Object.entries(raw.keys).map(([id,key])=>{if(!validId(id)||!ids.has(id)||typeof key!=='string'||key.length>8192)throw invalid();return[id,key];}));}
 return{format:'stellar-api-settings',version:1,configuration,...(keys?{keys}:{})};
}
