import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function bundledCharacters(root){
  let raw;try{raw=await readFile(resolve(root,'server/example/academy-characters.json'),'utf8');}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const archive=JSON.parse(raw);if(archive.type!=='academy-character-archive'||archive.version!==1||!Array.isArray(archive.characters)||!archive.characters.length)throw Error('INVALID_CHARACTER_CATALOG');return archive.characters;
}
