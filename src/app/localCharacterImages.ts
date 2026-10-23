import {ref} from 'vue';
import {accountStorage,accountDatabase} from '../storage/accountScope';
import {cleanCharacterImages,type CharacterImage} from '../domain/characterImages';
export const localImageRevision=ref(0);
const cache=new Map<string,Record<string,CharacterImage>>();
function images(){const scope=accountDatabase('character-images');if(!cache.has(scope)){let value={};try{value=cleanCharacterImages(JSON.parse(accountStorage.getItem('character-images')||'{}'));}catch{}cache.set(scope,value);}return cache.get(scope)!;}
export function localCharacterImage(id:string):CharacterImage|undefined{void localImageRevision.value;return images()[id];}
export function saveLocalCharacterImage(id:string,value:CharacterImage){const next=cleanCharacterImages({...images(),[id]:value});accountStorage.setItem('character-images',JSON.stringify(next));cache.set(accountDatabase('character-images'),next);localImageRevision.value++;}
