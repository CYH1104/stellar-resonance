export function spiritAnimalOf(character){
  if(typeof character.spiritAnimal==='string'&&character.spiritAnimal.trim())return character.spiritAnimal.trim();
  return typeof character.str==='string'?character.str.match(/精神体\s*[:：]?\s*([^·\n]+)/)?.[1]?.trim():undefined;
}
export function mentalPowerLevelOf(c){if(typeof c.mentalPowerLevel==='string'&&c.mentalPowerLevel.trim())return c.mentalPowerLevel.trim();return typeof c.str==='string'?c.str.match(/精神力(?:等级)?\s*[:：]?\s*([^·\n，,；;]+)/)?.[1]?.trim():undefined;}
export function publicActor(c){const spiritAnimal=spiritAnimalOf(c),mentalPowerLevel=mentalPowerLevelOf(c);return {id:c.id,name:c.name,...(mentalPowerLevel?{mentalPowerLevel}:{}),...(c.sex?{secondaryGender:c.sex}:{}),...(c.primaryGender?{primaryGender:c.primaryGender}:{}),...(spiritAnimal?{spiritAnimal}:{}),present:false};}
