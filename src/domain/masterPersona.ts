import type {Persona} from './contracts';
import {readPersonaExtra} from './personaExtras';
export const masterPersonaKey='academy:master-persona:v1';
export function masterPersonaSummary(persona:Persona){
  const field=(labels:string[])=>{for(const line of (persona.rawText||'').split('\n')){const clean=line.replace(/^\s*[-*#>]+\s*/,'').replace(/\*\*/g,'').trim();for(const label of labels){const match=clean.match(new RegExp('^'+label+'\\s*[:：]\\s*(.*)$'));if(match)return match[1].trim();}}return '';};
  return {name:persona.name.trim(),department:persona.identity!==undefined?persona.identity.trim():field(['学院','院系','所属院系','学院派系']),spiritLevel:persona.mentalPowerLevel?.trim()||(persona.other!==undefined?readPersonaExtra(persona.other,'精神力等级'):field(['精神力等级','精神力']))};
}
export function setMasterPersona(persona:Persona){const detail=masterPersonaSummary(persona);try{localStorage.setItem(masterPersonaKey,JSON.stringify(detail));}catch{}window.dispatchEvent(new CustomEvent('academy:master-persona',{detail}));}

