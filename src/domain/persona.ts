import {separateIdentityAbility} from './identityAbility.ts';
import type { Persona } from './contracts';
import {readPersonaExtra} from './personaExtras.ts';

export const personaLimits = {ability:Infinity,spiritName:Infinity,spiritAppearance:Infinity,spiritPersonality:Infinity,spiritAbility:Infinity,mentalPowerLevel:Infinity,name:Infinity,identity:Infinity,appearance:Infinity,primaryGender:Infinity,secondaryGender:Infinity,personality:Infinity,background:Infinity,spiritAnimal:Infinity,other:Infinity,pairingPreference:Infinity,rawText:Infinity} as const;
export function blankPersona():Persona {return {ability:'',spiritName:'',spiritAppearance:'',spiritPersonality:'',spiritAbility:'',mentalPowerLevel:'',name:'',identity:'',appearance:'',primaryGender:'',secondaryGender:'',personality:'',background:'',spiritAnimal:'',other:'',pairingPreference:''};}
export function normalizePersona(value:unknown,requireName=true):Persona {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(personaLimits,k)))throw new Error('人设表格包含不支持的字段');
  const result=blankPersona();
  for(const field of Object.keys(personaLimits)){
    const key=field as keyof typeof personaLimits, text=(value as Record<string,unknown>)[key];
    if(key==='rawText'&&text===undefined)continue;
    if(text!==undefined&&typeof text!=='string')throw new Error('人设字段格式不正确');
    result[key]=typeof text==='string'?text.trim():'';
  }
  if((value as any).mentalPowerLevel===undefined)result.mentalPowerLevel=readPersonaExtra(result.other,'精神力等级').trim();
  if(requireName&&!result.name)throw new Error('请填写玩家姓名后再开始');
  return separateIdentityAbility(result);
}
/** Fill blanks only, including when the player edited the form while a request was pending. */
export function mergePersonaDraft(current:Persona,generated:unknown):Persona {
  const draft=normalizePersona(current,false),suggestion=normalizePersona(generated);
  for(const field of Object.keys(personaLimits) as (keyof typeof personaLimits)[])if(!draft[field])draft[field]=suggestion[field]??'';
  return draft;
}

