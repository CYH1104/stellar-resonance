import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {randomInt,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {cleanTheaterShare} from '../src/domain/theaterShare.ts';
import {modelError} from './ai.mjs';
export function createTheaterShares(directory){
  const file=resolve(directory,'shares.json');let queue=Promise.resolve();const rates=new Map();
  const read=async()=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}};
  return async(action,data,owner)=>{
    const now=Date.now(),rate=rates.get(owner);if(rate&&now-rate.at<60000){if(rate.count>=60)throw modelError(429,'SHARE_RATE_LIMIT');rate.count++;}else{for(const [key,value]of rates)if(now-value.at>=60000)rates.delete(key);rates.set(owner,{at:now,count:1});}
    const run=queue.then(async()=>{
      const all=await read();
      if(action==='lookup'){if(typeof data.code!=='string'||!/^T[A-Za-z0-9]{9}$/.test(data.code)||!Object.hasOwn(all,data.code))throw modelError(404,'SHARE_NOT_FOUND');return {template:cleanTheaterShare(all[data.code].template)};}
      if(Object.values(all).filter(s=>s.owner===owner).length>=200)throw modelError(429,'SHARE_LIMIT');
      let template;try{template=cleanTheaterShare(data.template);}catch{throw modelError(400,'INVALID_SHARE');}
      const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';let code;
      do{code='T'+Array.from({length:9},()=>alphabet[randomInt(alphabet.length)]).join('');}while(Object.hasOwn(all,code));
      all[code]={owner,template,createdAt:new Date().toISOString()};
      await mkdir(directory,{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(all),{mode:0o600});await rename(temp,file);
      return {code};
    });queue=run.catch(()=>{});return run;
  };
}
