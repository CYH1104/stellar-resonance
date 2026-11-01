import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {buildMessages,buildPersonaMessages,parsePersonaResult,StoryDecoder} from '../../server/ai.mjs';
import {memoryMessages,parseMemoryResult} from '../../server/memory.mjs';
import {batchMemoryMessages,parseBatchMemoryResult} from '../../server/memory-batch.mjs';
import {randomEventMessages,parseRandomEvent} from '../../server/random-events.mjs';
import {forumReplyMessages,parseForumReply,forumThreadMessages,parseForumThread} from '../../server/forum.mjs';
import {internalPrompt} from '../../server/internal-prompts.mjs';
import {publicActor,identityOf,abilityOf,mentalPowerLevelOf} from '../../server/card.mjs';
import {cardWithEditor,validateEditorData,publicCards} from '../../server/editor-store.mjs';
import {normalizePersona} from '../../src/domain/persona.ts';
import {nativeTaskActors,nativeTaskProjection} from '../../server/native-task-context.mjs';
const fail=(code,status=400)=>Object.assign(Error(code),{code,status});
const copy=v=>JSON.parse(JSON.stringify(v));
/** Read-only author assets. Never substitute an example world when configuration is absent. */
export async function academyCatalog(directory=process.env.ACADEMY_AUTHOR_DATA){
  if(!directory)throw fail('ACADEMY_AUTHOR_DATA_REQUIRED',503);
  const base=JSON.parse(await readFile(resolve(directory,'extracted-pro.json'),'utf8'));
  const editor=validateEditorData(JSON.parse(await readFile(resolve(directory,'editor-data.json'),'utf8')));
  const card=cardWithEditor(base,editor);
  if(!Array.isArray(card.characters)||!Array.isArray(card.places)||!Array.isArray(card.world?.entries))throw fail('ACADEMY_AUTHOR_DATA_INVALID',503);
  const dataset=`world-card-v1-pro-${base.source.sha256.slice(0,16)}`;
  const capabilities={continue:true,keyRequired:true,embeddings:true,terminal:true,channel:'native',native:true};
  return {card,editor,dataset,public:{runtime:'local-card',dataset,name:'星穹学院',narratorName:card.world.name||'星穹学院',greeting:card.world.greeting,capabilities,characters:[],majorCharacters:card.characters.map(({id,name,img})=>({id,name,...(img?{img}:{})})),characterFacts:card.characters.map(c=>({id:c.id,primaryGender:c.primaryGender||'',identity:identityOf(c)||'',ability:abilityOf(c)||'',mentalPowerLevel:mentalPowerLevelOf(c)||''})),places:card.places.map(({id,name,area,px,py})=>({id,name,area,px,py})),counts:{characters:card.characters.length,places:card.places.length,departments:card.world.departments?.length||0},missing:base.missing||[]}};
}
/** Only academy output contracts live here. All model calls use the original native SDK. */
export function academyTasks(catalog,{clock=Date.now}={}){
  const pending=new Map();
  const prune=()=>{for(const [id,row]of pending)if(row.expires<clock())pending.delete(id);};
  function scopedCard(input){const known=catalog.card.characters;const custom=nativeTaskActors(input).filter(c=>!known.some(k=>k.id===c.id));return {...catalog.card,characters:[...known,...custom]};}
  function put(owner,task,input,messages,context={}){
    prune();if(pending.size>=128)throw fail('NATIVE_TASK_BUSY',429);
    const token=randomUUID();pending.set(token,{owner,task,input,messages,context,expires:clock()+750000});
    return {token,messages,projection:nativeTaskProjection(input),actors:nativeTaskActors(input),...(task==='story'?{requestId:context.requestId}:{})};
  }
  return {
    catalog:()=>copy(catalog.public),
    cards:()=>({revision:createHash('sha256').update(JSON.stringify(catalog.editor)).digest('hex'),characters:publicCards(catalog.editor)}),
    map:()=>({map:catalog.editor.mapAssets||{}}),
    newGame(persona){persona=normalizePersona(persona);const player={id:'player',name:persona.name,present:true};for(const k of ['spiritAnimal','identity','ability','mentalPowerLevel','primaryGender','secondaryGender'])if(persona[k])player[k]=persona[k];return {dataset:catalog.dataset,opening:catalog.card.world.greeting.join('\n'),presenceStatus:'awaiting-ai',initial:{player,characters:catalog.card.characters.map(publicActor)}};},
    place(id){const place=catalog.card.places.find(p=>p.id===id);if(!place)throw fail('PLACE_NOT_FOUND',404);return copy(place);},
    preparation(owner,token){prune();const row=pending.get(token);if(!row||row.owner!==owner)throw fail('NATIVE_TASK_EXPIRED',404);return copy({input:row.input,messages:row.messages,task:row.task});},
    plan(owner,task,input){
      if(!owner||!input||typeof input!=='object'||JSON.stringify(input).length>4000000||'key'in input||'profile'in input)throw fail('INVALID_NATIVE_TASK');
      input=copy(input);const source=scopedCard(input),card={...source,world:{...source.world,entries:[]}};
      if(task==='story'){
        // Deliberately empty legacy prompt/lore inputs: only the established feature protocol is reused.
        const business=buildMessages({...card,world:{...card.world,entries:[]}},{...input,history:[],opening:'',presets:[],promptEntries:[],worldInfo:[]});
        const messages=business.messages.filter(m=>m.role==='system');
        return put(owner,task,input,messages,{...business,messages:undefined});
      }
      if(task==='persona')return put(owner,task,input,buildPersonaMessages(card,input.wish,input.draft));
      if(task==='random-event')return put(owner,task,input,randomEventMessages(card,input));
      if(task==='forum-reply'){const plan=input.minReplies===5?forumThreadMessages(card,input):forumReplyMessages(card,input);return put(owner,task,input,plan.messages,plan);}
      if(task==='memory'){const plan=input.rounds?batchMemoryMessages(input.rounds):memoryMessages(input);return put(owner,task,input,plan.messages,plan);}
      if(task==='utility'){
        if(!['summary','suggestions'].includes(input.task)||!Array.isArray(input.texts)||input.texts.length>10||input.texts.some(t=>typeof t!=='string'||t.length>100000))throw fail('INVALID_UTILITY');
        return put(owner,task,input,[{role:'system',content:internalPrompt(input.task==='summary'?'app.2':'app.1')},{role:'user',content:JSON.stringify(input.texts)}]);
      }
      throw fail('INVALID_NATIVE_TASK');
    },
    finish(owner,token,text){
      prune();const row=pending.get(token);if(!row||row.owner!==owner)throw fail('NATIVE_TASK_EXPIRED',404);
      pending.delete(token);if(typeof text!=='string'||!text.trim()||text.length>400000)throw fail('INVALID_MODEL_RESPONSE',502);
      const {task,input,context}=row;
      if(task==='story'){
        const decoder=new StoryDecoder();decoder.push(text);if(!decoder.hasCompletionMarker())throw fail('MODEL_RESPONSE_INCOMPLETE',502);
        const warnings=[];const outcome=decoder.finish(context.card,context.state,{singleStateCall:true,requestId:context.requestId,stateEnabled:input.stateEnabled!==false,theaterSettings:context.theaterSettings,dice:context.dice,suggestionsEnabled:input.suggestionsEnabled!==false,validationWarnings:warnings});
        if(outcome.stateUpdate?.storyComplete!==true)throw fail('MODEL_RESPONSE_INCOMPLETE',502);
        return {outcome,warnings};
      }
      if(task==='persona')return {persona:parsePersonaResult(text)};
      if(task==='random-event')return parseRandomEvent(text,input.kind);
      if(task==='forum-reply')return input.minReplies===5?parseForumThread(text,context):parseForumReply(text,context.speaker);
      if(task==='memory')return input.rounds?{records:parseBatchMemoryResult(text,context.inputs)}:{record:parseMemoryResult(text,context.input)};
      return {items:input.task==='summary'?[text.trim()]:text.split('\n').map(s=>s.replace(/^\s*[-*\d.、)]+\s*/,'').trim()).filter(Boolean).slice(0,4)};
    },
    cancel(owner,token){if(pending.get(token)?.owner===owner)pending.delete(token);},
  };
}
