import {separateIdentityAbility} from './identityAbility.ts';
import type { Persona } from './contracts';
import {readPersonaExtra} from './personaExtras.ts';

export const personaLimits = {ability:2000,spiritName:100,spiritAppearance:1500,spiritPersonality:1500,spiritAbility:2000,mentalPowerLevel:100,name:80,identity:200,appearance:500,primaryGender:100,secondaryGender:100,personality:1500,background:3000,spiritAnimal:1500,other:3000,pairingPreference:100,rawText:60000} as const;
export function blankPersona():Persona {return {ability:'',spiritName:'',spiritAppearance:'',spiritPersonality:'',spiritAbility:'',mentalPowerLevel:'',name:'',identity:'',appearance:'',primaryGender:'',secondaryGender:'',personality:'',background:'',spiritAnimal:'',other:'',pairingPreference:''};}
export function normalizePersona(value:unknown,requireName=true):Persona {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(personaLimits,k)))throw new Error('人设表格包含不支持的字段');
  const result=blankPersona();
  for(const [field,max] of Object.entries(personaLimits)){
    const key=field as keyof typeof personaLimits, text=(value as Record<string,unknown>)[key];
    if(key==='rawText'&&text===undefined)continue;
    if(text!==undefined&&(typeof text!=='string'||text.length>max))throw new Error('人设字段格式或长度不正确');
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

