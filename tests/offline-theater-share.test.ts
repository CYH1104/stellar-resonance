import {afterEach,expect,it,vi} from 'vitest';
import {gcm} from '@noble/ciphers/aes.js';
import {encodeOfflineTheaterShare,decodeOfflineTheaterShare,maxOfflineShareLength,offlineShareHeader} from '../src/domain/offlineTheaterShare';
const template={version:1,title:'中文小剧场',kind:'custom',instruction:'对话与剧情\n<div style="color:red">只是模板文字</div>'};
afterEach(()=>vi.unstubAllGlobals());
const b64=(v:Uint8Array)=>btoa(String.fromCharCode(...v)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function forged(value:unknown){const key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));return [offlineShareHeader,b64(key),b64(iv),b64(gcm(key,iv,new TextEncoder().encode(offlineShareHeader)).encrypt(new TextEncoder().encode(JSON.stringify(value))))].join('.');}
it('generates random offline codes and round-trips UTF-8 without fetch or crypto.subtle',()=>{
 const rng=globalThis.crypto.getRandomValues.bind(globalThis.crypto);vi.stubGlobal('crypto',{getRandomValues:rng});const fetch=vi.fn(()=>{throw Error('offline');});vi.stubGlobal('fetch',fetch);
 const a=encodeOfflineTheaterShare({...template,charId:'private',enabled:true,slot:9,key:'private-key',content:'private-story'}),b=encodeOfflineTheaterShare(template);
 expect(a).not.toBe(b);expect(a).toMatch(/^ST1\.A256GCM\./);expect(decodeOfflineTheaterShare(a)).toEqual(template);expect(decodeOfflineTheaterShare(b)).toEqual(template);expect(fetch).not.toHaveBeenCalled();
});
it('is interoperable with native AES-256-GCM using the exact header as AAD',async()=>{
 const code=encodeOfflineTheaterShare(template),parts=code.split('.'),bytes=(s:string)=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('raw',bytes(parts[2]!),{name:'AES-GCM'},false,['decrypt']);
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(parts[3]!),additionalData:new TextEncoder().encode(offlineShareHeader),tagLength:128},key,bytes(parts[4]!));
 expect(JSON.parse(new TextDecoder().decode(plain))).toEqual(template);
});
it('rejects damaged, oversized, unknown and malformed codes without accepting private fields',()=>{
 const code=encodeOfflineTheaterShare(template),parts=code.split('.');parts[4]=(parts[4]![0]==='A'?'B':'A')+parts[4]!.slice(1);
 for(const value of [parts.join('.'),code.replace('ST1','ST2'),code.replace('A256GCM','EXEC'),code.split('.').slice(0,4).join('.'),code+'.extra','x'.repeat(maxOfflineShareLength+1),forged({...template,key:'secret'}),forged({...template,title:''}),forged({...template,version:2}),forged({...template,kind:'forum'})])expect(()=>decodeOfflineTheaterShare(value)).toThrow();
 expect(()=>encodeOfflineTheaterShare({...template,instruction:'x'.repeat(4001)})).toThrow();
});
