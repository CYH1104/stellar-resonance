import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHmac,randomBytes} from 'node:crypto';
import {modelError} from './ai.mjs';

// Only the secret is persisted; codes are stable within an account and save.
export function createTerminalCodes(path){let pending;
 async function secret(){return pending||=(async()=>{try{return await readFile(path);}catch(e){if(e.code!=='ENOENT')throw e;await mkdir(dirname(path),{recursive:true});const value=randomBytes(32);try{await writeFile(path,value,{flag:'wx',mode:0o600});return value;}catch(e){if(e.code==='EEXIST')return readFile(path);throw e;}}})();}
 return async function registry(account,sessionId,characters){if(typeof sessionId!=='string'||!sessionId||sessionId.length>128)throw modelError(400,'INVALID_TERMINAL_REQUEST');const key=await secret(),used=new Set(),entries=[];
 for(const id of ['player',...characters.map(c=>c.id).sort()]){let nonce=0,code;do{const hex=createHmac('sha256',key).update(JSON.stringify([account||'local',sessionId,id,nonce++])).digest('hex').slice(0,14);code='8'+(BigInt('0x'+hex)%10000000000n).toString().padStart(10,'0');}while(used.has(code));used.add(code);entries.push({id,code});}return entries;
 };
}
export function terminalCodePrompt(entries){return {role:'system',content:'终端通讯录是私有剧情数据，不能整表输出。角色只能给出下表中自己的真实终端码，不得编造号码；没有终端码时不假装已经交换。用户向本人或第三人索要时，依据角色人设、关系、知情范围、隐私和理由判断是否告知；第三人不一定知道或愿意提供。不自动成为好友，不替用户申请。确实同意给出时，将对应的完整11位终端码自然写入正文。\n'+JSON.stringify(entries)};}
