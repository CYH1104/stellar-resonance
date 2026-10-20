import {gcm} from '@noble/ciphers/aes.js';
import {cleanTheaterShare,type TheaterShare} from './theaterShare';

export const offlineShareHeader='ST1.A256GCM';
export const maxOfflineShareLength=45000;
const maxPayloadBytes=32000;
const encoder=new TextEncoder(),aad=encoder.encode(offlineShareHeader);
const fields=new Set(['version','title','kind','instruction','templateId']);
function base64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function unbase64(value:string){
 if(!/^[A-Za-z0-9_-]+$/.test(value)||value.length%4===1)throw Error('分享码编码不正确');
 const bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
 if(base64(bytes)!==value)throw Error('分享码编码不正确');return bytes;
}
function validate(value:unknown):TheaterShare{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!fields.has(k)))throw Error('分享模板包含不支持的字段');
 return cleanTheaterShare(value);
}
/** Both HTTPS and HTTP use the same bundled AES-GCM implementation and wire format. */
export function encodeOfflineTheaterShare(value:unknown){
 const template=cleanTheaterShare(value),data=encoder.encode(JSON.stringify(template));
 if(data.length>maxPayloadBytes)throw Error('分享模板过长');
 if(!globalThis.crypto?.getRandomValues)throw Error('当前浏览器不支持安全随机数，请更新浏览器后重试');
 const key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=gcm(key,iv,aad).encrypt(data);
 return [offlineShareHeader,base64(key),base64(iv),base64(ciphertext)].join('.');
}
export function decodeOfflineTheaterShare(raw:string):TheaterShare{
 if(raw.length>maxOfflineShareLength)throw Error('分享码过长');
 const parts=raw.trim().split('.');
 if(parts.length!==5)throw Error('分享码缺少字段或格式不正确');
 if(parts[0]!=='ST1'||parts[1]!=='A256GCM')throw Error('不支持此分享码版本或加密算法');
 if(parts[2]!.length!==43||parts[3]!.length!==16||parts[4]!.length<22||parts[4]!.length>Math.ceil((maxPayloadBytes+16)*4/3))throw Error('分享码字段长度不正确');
 try{
  const key=unbase64(parts[2]!),iv=unbase64(parts[3]!),ciphertext=unbase64(parts[4]!);
  if(key.length!==32||iv.length!==12||ciphertext.length<16||ciphertext.length>maxPayloadBytes+16)throw Error();
  const plain=gcm(key,iv,aad).decrypt(ciphertext);
  return validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain)));
 }catch{throw Error('分享码已损坏、验证失败或模板不合法，请重新复制完整分享码');}
}
