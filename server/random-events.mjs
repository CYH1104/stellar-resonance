import {internalPrompt} from './internal-prompts.mjs';
import {modelError} from './ai.mjs';
import {normalizePersona} from '../src/domain/persona.ts';
import {cleanSpecialEvent,specialEventKinds} from '../src/domain/randomEvents.ts';
import {stripReasoning,scrubModelData} from '../src/domain/reasoning.ts';
export function randomEventMessages(card,data){
  if(!specialEventKinds.includes(data.kind)||typeof data.input!=='string'||!data.input.trim()||data.input.length>16000||!Array.isArray(data.history)||data.history.length>12||data.history.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>12000)||!Array.isArray(data.presentCharacterIds)||data.presentCharacterIds.some(id=>!card.characters.some(c=>c.id===id)))throw modelError(400,'INVALID_RANDOM_EVENT');
  let persona;try{persona=normalizePersona(data.persona);}catch{throw modelError(400,'INVALID_PERSONA');}
  return [{role:'system',content:internalPrompt("random-events.1")},
    {role:'system',content:internalPrompt("random-events.2")+JSON.stringify({world:card.world,characters:card.characters.map(c=>({id:c.id,name:c.name}))})},
    {role:'user',content:JSON.stringify({kind:data.kind,persona,input:data.input,presentCharacterIds:data.presentCharacterIds,history:data.history.map(m=>({role:m.role,content:m.role==='assistant'?stripReasoning(m.content):m.content}))})}];
}
export function parseRandomEvent(content,kind){try{const source=stripReasoning(content).trim().replace(/^```(?:json)?\s*\n?/i,'').replace(/\n?```\s*$/,'');const raw=scrubModelData(JSON.parse(source));if(!raw||Array.isArray(raw)||Object.keys(raw).some(k=>!['title','description'].includes(k)))throw Error();return cleanSpecialEvent({kind,...raw});}catch{throw modelError(502,'INVALID_RANDOM_EVENT_RESULT');}}
