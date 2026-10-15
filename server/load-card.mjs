import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export async function loadCard(root){
  let raw;
  try{raw=await readFile(resolve(root,'server/private/extracted-pro.json'),'utf8');}
  catch(error){if(error.code!=='ENOENT')throw error;raw=await readFile(resolve(root,'server/example/feature-demo.json'),'utf8');}
  return JSON.parse(raw);
}
