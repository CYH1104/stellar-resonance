import {ref} from 'vue';
import {accountStorage} from '../storage/accountScope';
import {imageUrl} from '../domain/characterImages';
const revision=ref(0);
function read():Record<string,string>{try{const value=JSON.parse(accountStorage.getItem('terminal-nickname-images')||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
export function nicknameImages(){void revision.value;return read();}
export function nicknameImage(name:string){const value=nicknameImages()[name.trim()];if(typeof value!=='string')return '';try{return imageUrl(value);}catch{return '';}}
export function saveNicknameImage(name:string,url:string){name=name.trim();if(!name||name.length>80||['__proto__','constructor','prototype'].includes(name))throw Error('请填写80字以内的昵称。');const value=read();if(url.trim())value[name]=imageUrl(url);else delete value[name];accountStorage.setItem('terminal-nickname-images',JSON.stringify(value));revision.value++;}
