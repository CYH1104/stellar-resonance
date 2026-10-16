import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isPlaceholderCharacter} from './placeholders.mjs';
import {bundledCharacters} from './character-catalog.mjs';

export async function loadCard(root){
  let raw;
  try{raw=await readFile(resolve(root,'server/private/extracted-pro.json'),'utf8');}
  catch(error){if(error.code!=='ENOENT')throw error;raw=await readFile(resolve(root,'server/example/feature-demo.json'),'utf8');}
  const card=JSON.parse(raw);if(Array.isArray(card.characters)){card.characters=card.characters.filter(c=>!isPlaceholderCharacter(c));if(!card.characters.length)card.characters=await bundledCharacters(root);}return card;
}
