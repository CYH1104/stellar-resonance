import {accountStorage} from './accountScope';
import {PersonaLibrary,type PersonaFile} from './personaLibrary';
const key='academy:master-image-file';
export function applyPersonaMedia(file:PersonaFile){
  try{
    if(file.useAsHomeImage&&file.portrait){accountStorage.setItem(key,file.id);window.dispatchEvent(new CustomEvent('academy:persona-image',{detail:{image:file.portrait}}));}
    else if(accountStorage.getItem(key)===file.id){accountStorage.removeItem(key);window.dispatchEvent(new CustomEvent('academy:persona-image',{detail:{image:null}}));}
  }catch{throw Error('主页图片设置未能保存，请重试。');}
}
export async function restorePersonaMedia(){try{const id=accountStorage.getItem(key);if(!id)return;const file=(await new PersonaLibrary().list()).find(file=>file.id===id);if(file?.useAsHomeImage&&file.portrait)applyPersonaMedia(file);else accountStorage.removeItem(key);}catch{}}

