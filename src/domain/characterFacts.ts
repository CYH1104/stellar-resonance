import type {Session} from './contracts';
export interface CharacterFact {id:string;primaryGender:string}
/** Author-supplied NPC facts belong to their source card, never to the player's persona. */
export function syncCharacterFacts(session:Session,dataset:string,facts:CharacterFact[]=[]){
  if(!session.sourceDataset||session.sourceDataset!==dataset)return;
  const byId=new Map(facts.filter(f=>typeof f.id==='string'&&typeof f.primaryGender==='string'&&f.primaryGender.trim()&&f.primaryGender.length<=100).map(f=>[f.id,f.primaryGender]));
  for(const actor of session.initial.characters){const gender=byId.get(actor.id);if(gender)actor.primaryGender=gender;}
  for(const turn of session.turns)for(const variant of turn.variants)for(const patch of variant.outcome?.characters||[]){const gender=byId.get(patch.id);if(gender&&patch.primaryGender!==undefined)patch.primaryGender=gender;}
}
