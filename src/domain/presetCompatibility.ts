import type {Preset} from './contracts';
export const compatibilityCategories={beautify:'状态栏／美化',choices:'行动选项',theater:'小剧场／社交动态',summary:'摘要',format:'输出格式'};
export type CompatibilityCategory=keyof typeof compatibilityCategories;
export interface PresetCompatibility {verdict:'disabled'|'review';categories:CompatibilityCategory[];reason:string;originalEnabled:boolean;restored?:boolean}
const protectedTitle=/别动|勿动|不要动|必开|不可改|不要改|字数|防截断|don't touch|do not edit|\brequired\b|must keep|\block\b|word\s*count|anti[- ]?truncation/i;
const writing=/文风|语气|句式|描写|人称|视角|八股|禁词|对白|白描|创作核心|责编|\btone\b|\bprose\b|writing\s*style|style\s*guide|\bpov\b|point\s*of\s*view|\bperspective\b|banned\s*words/i;
const categories=(s:string):CompatibilityCategory[]=>{
 const out:CompatibilityCategory[]=[];
 if(/状态栏|状态姬|信息面板|美化|前端|status\s*bar|\bstatusbar\b|\bhud\b|stat\s*block|\bwidget\b/i.test(s))out.push('beautify');
 if(/行动选项|快速回复|选项|quick[- ]?repl(?:y|ies)|action\s*options?|suggested\s*(?:actions?|responses?|replies)/i.test(s))out.push('choices');
 if(/小剧场|番外|论坛|群聊|微博|弹幕|作家对话|双语对话|side[- ]?stor(?:y|ies)|\binterlude\b|\bomake\b|bonus\s*scene|group\s*chat|social\s*feed/i.test(s))out.push('theater');
 if(/摘要|伏笔|小总结|大总结|剧情概要|\bsummary\b|\brecap\b|story\s*so\s*far/i.test(s))out.push('summary');
 return out;
};
const outputInstruction=/输出|返回|生成|附加|末尾|包裹|格式|必须|要求|\b(?:output|render|append|wrap|respond|provide|include)\b/i;
function separator(name:string){return name.match(/^\s*[—\-=~_]{2,}\s*(.*?)\s*[—\-=~_]{2,}\s*$/u)?.[1]?.trim().toLowerCase();}
/** Runs once on import, in prompt_order. Never runs on each generation or edits. */
export function detectPresetCompatibility(entries:Preset[],preserve=false){
 let section='',sectionCats:CompatibilityCategory[]=[];let sectionProtected=false;
 for(const p of entries){
  const sep=separator(p.name);let inherited=sectionCats,protectedSection=sectionProtected;
  if(sep!==undefined){
   const closes=sep===section||/^(?:end|结束)$/i.test(sep)||/结束|\bend\b/i.test(sep);
   if(closes){section='';sectionCats=[];sectionProtected=false;}
   else {section=sep;sectionProtected=/文风|写作|破限|cot|思维|必开|writing|style|jailbreak/i.test(sep);sectionCats=/部件|components?|modules?/i.test(sep)?[]:categories(sep);inherited=sectionCats;protectedSection=sectionProtected;}
  }
  if(p.compatibility||p.marker||p.included===false||protectedTitle.test(p.name)||!p.content.trim()&&sep===undefined)continue;
  const titleCats=categories(p.name),bodyCats=categories(p.content),cats=[...new Set([...inherited,...titleCats,...bodyCats])];
  const format=/<[\p{L}_][\p{L}\p{N}_:-]*(?=[\s/>])[^>]*>|```|\b\d+\s*(?:options?|choices?)\b/iu.test(p.content);
  const writes=outputInstruction.test(p.content);
  if(!cats.length){if(format&&writes)cats.push('format');else continue;}
  const negative=protectedSection||writing.test(p.name+'\n'+p.content.slice(0,600));
  const strong=!negative&&(inherited.length>0||titleCats.length>0&&writes&&format||bodyCats.length>0&&writes&&format);
  // Mere tags, a content wrapper, an example or a story mention cannot justify disabling.
  const disable=strong&&!cats.every(c=>c==='format')&&(p.content.length>=20||inherited.length>0);
  p.compatibility={verdict:disable&&!preserve?'disabled':'review',categories:cats,reason:negative?'含写作规则或保护分组，仅提醒':disable?'与内置模块重复的输出要求':'可能包含自定义输出格式，请核查',originalEnabled:p.enabled};
  if(disable&&!preserve)p.enabled=false;
 }
 return entries;
}
export function restorePresetCompatibility(entries:Preset[],category?:CompatibilityCategory){
 for(const p of entries){const c=p.compatibility;if(c?.verdict==='disabled'&&!c.restored&&(!category||c.categories.includes(category))){p.enabled=c.originalEnabled;c.restored=true;}}
}
/** Explicit import review: disabledIndices explicitly closes candidates; all other candidates are enabled. */
export function confirmPresetCompatibility(entries:Preset[],disabledIndices:number[]){
 const selected=new Set(disabledIndices);
 entries.forEach((p,index)=>{const c=p.compatibility;if(!c)return;
  p.enabled=!selected.has(index);
  c.verdict=selected.has(index)?'disabled':'review';
  c.restored=!selected.has(index);
 });
}
export function cleanPresetCompatibility(value:unknown):PresetCompatibility|undefined{
 if(value===undefined)return;
 const c=value as PresetCompatibility;
 if(!c||!['disabled','review'].includes(c.verdict)||!Array.isArray(c.categories)||!c.categories.length||c.categories.length>5||c.categories.some(k=>!Object.hasOwn(compatibilityCategories,k))||typeof c.reason!=='string'||c.reason.length>300||typeof c.originalEnabled!=='boolean'||c.restored!==undefined&&typeof c.restored!=='boolean')throw Error('预设兼容记录不正确');
 return {verdict:c.verdict,categories:[...c.categories],reason:c.reason,originalEnabled:c.originalEnabled,...(c.restored!==undefined?{restored:c.restored}:{})};
}
