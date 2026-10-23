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
export function terminalCodePrompt(entries,actors=[],stateEnabled=true){return {role:'system',content:'终端通讯录是当前会话的私有剧情数据，不能整表输出。不使用服务器随机号或账号号。角色ID绑定MVU变量 /custom/终端码/{角色ID}，玩家ID为player。已绑定号码必须保持不变，正文、MVU、终端查找必须一致。尚未绑定时，只有正文真实给出完整11位数字号码且明确归属时，才在本次正文同一次结构化输出中绑定对应ID；不从举例、猜测、小剧场、论坛或错误号码绑定，不将他人号码绑给玩家。号码可以为任意11位数字，同会话不能重复；不同会话各自独立。未知号码保留空值。索要号码时按人设、关系、知情范围和隐私判断是否告知；确实同意才把完整号码写入正文并绑定。不自动成为好友，不替用户申请。'+(stateEnabled?'复用既有SR_STATE.customUpdates，path为对应终端码路径，action=set,value为正文中的号码，reason说明归属；已有绑定用keep。不新增输出块。':'即使人物变量关闭，也将终端码绑定写入随本次正文输出的同一个UpdateVariable/JSONPatch块，op=replace或add；与时间地点合并，不能重复输出块。')+'\n已绑定：'+JSON.stringify(entries)+'\n可用角色ID与姓名：'+JSON.stringify([{id:'player',name:'当前玩家'},...actors.map(({id,name})=>({id,name}))])};}
