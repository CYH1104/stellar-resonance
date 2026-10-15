import {PersonaLibrary,type PersonaFile} from './personaLibrary';
const key='academy:master-image-file';
export function applyPersonaMedia(file:PersonaFile){
  try{
    if(file.useAsHomeImage&&file.portrait){localStorage.setItem(key,file.id);window.dispatchEvent(new CustomEvent('academy:persona-image',{detail:{image:file.portrait}}));}
    else if(localStorage.getItem(key)===file.id){localStorage.removeItem(key);window.dispatchEvent(new CustomEvent('academy:persona-image',{detail:{image:null}}));}
  }catch{throw Error('主页图片设置未能保存，请重试。');}
}
export async function restorePersonaMedia(){try{const id=localStorage.getItem(key);if(!id)return;const file=(await new PersonaLibrary().list()).find(file=>file.id===id);if(file?.useAsHomeImage&&file.portrait)applyPersonaMedia(file);else localStorage.removeItem(key);}catch{}}
