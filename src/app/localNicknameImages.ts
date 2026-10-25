import {ref} from 'vue';
import {normalizeActorName} from '../domain/dynamicActors';
import {accountStorage} from '../storage/accountScope';
import {imageUrl} from '../domain/characterImages';
const revision=ref(0);
function read():Record<string,string>{try{const value=JSON.parse(accountStorage.getItem('terminal-nickname-images')||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
export function nicknameImages(){void revision.value;return read();}
export function refreshNicknameImages(){revision.value++;}
export function nicknameImage(name:string){const key=name.trim(),value=nicknameImages();if(typeof value[key]==='string'){try{return imageUrl(value[key]);}catch{return '';}}const normalized=normalizeActorName(key);if(!normalized)return '';const matches=Object.keys(value).filter(candidate=>normalizeActorName(candidate)===normalized&&typeof value[candidate]==='string'&&value[candidate]);if(matches.length!==1)return '';try{return imageUrl(value[matches[0]]);}catch{return '';}}
export function saveNicknameImage(name:string,url:string){name=name.trim();if(!name||name.length>80||['__proto__','constructor','prototype'].includes(name))throw Error('请填写80字以内的昵称。');const value=read();if(url.trim())value[name]=imageUrl(url);else delete value[name];accountStorage.setItem('terminal-nickname-images',JSON.stringify(value));revision.value++;}

export function resetNicknameImages(){accountStorage.removeItem('terminal-nickname-images');revision.value++;}
