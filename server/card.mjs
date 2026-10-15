export function spiritAnimalOf(character){
  if(typeof character.spiritAnimal==='string'&&character.spiritAnimal.trim())return character.spiritAnimal.trim();
  return typeof character.str==='string'?character.str.match(/精神体\s*[:：]?\s*([^·\n]+)/)?.[1]?.trim():undefined;
}
export function publicActor(c){const spiritAnimal=spiritAnimalOf(c);return {id:c.id,name:c.name,...(c.sex?{secondaryGender:c.sex}:{}),...(c.primaryGender?{primaryGender:c.primaryGender}:{}),...(spiritAnimal?{spiritAnimal}:{}),present:false};}
