import type {TerminalAnchor} from './terminalLedger';

export interface SettlementTalk {
 version:1;
 status:'pending'|'ready'|'failed';
 lines:{id:string;text:string}[];
 error?:string;
}
export const pendingSettlementTalk=():SettlementTalk=>({version:1,status:'pending',lines:[]});
export function validateSettlementTalk(value:unknown,ids:string[],complete:boolean):asserts value is SettlementTalk|undefined {
 if(value===undefined)return;
 const v=value as SettlementTalk;
 if(!complete||!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['version','status','lines','error'].includes(k))||v.version!==1||!['pending','ready','failed'].includes(v.status)||!Array.isArray(v.lines))throw Error('小局结算发言不正确');
 const npcs=ids.filter(id=>id!=='player');
 if(v.status==='ready'?(v.lines.length!==npcs.length||new Set(v.lines.map(l=>l?.id)).size!==npcs.length):v.lines.length!==0)throw Error('小局结算发言不完整');
 for(const line of v.lines)if(!line||Object.keys(line).some(k=>!['id','text'].includes(k))||!npcs.includes(line.id)||typeof line.text!=='string'||!line.text.trim()||line.text.length>160||/[<>\u0000-\u001f]/.test(line.text))throw Error('小局结算发言不正确');
 if(v.error!==undefined&&(v.status!=='failed'||typeof v.error!=='string'||v.error.length>300))throw Error('小局结算发言状态不正确');
}
export interface ScoredRoundBase {number:number;anchor?:TerminalAnchor;archived?:boolean;replies?:{id:string;text:string}[];dialogueVersion?:1;settlementTalk?:SettlementTalk}
