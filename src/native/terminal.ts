import type {Profile} from '../domain/contracts';
import {NativeApi} from './api';
import {NativeCompletions,NativeCompletionError,type CompletionMessage} from './completions';
interface Plan {token:string;messages:CompletionMessage[]}
const base='/api/plugins/academy-compat/terminal/';
const rawText=(values:string[])=>{const text=values.join('\n\n');return text.length>48000?text.slice(0,47960)+'\n…[运行日志原文已截断]':text;};
function plan(value:any):Plan{
  if(!value||typeof value.token!=='string'||!value.token||!Array.isArray(value.messages)||!value.messages.length)throw Error('终端任务未准备完成，原记录已保留。');
  return value;
}
/** Original academy task validation + native SDK, with one bounded format correction. */
export class NativeTerminal {
  constructor(private api:NativeApi,private completions:NativeCompletions){}
  async run(input:unknown,profile:Profile,key:string,signal:AbortSignal,preset?:Record<string,any>){
    signal=AbortSignal.any([signal,AbortSignal.timeout(600000)]);
    if(!input||typeof input!=='object'||Array.isArray(input))throw new NativeCompletionError('INVALID_TERMINAL_REQUEST','终端请求不完整，请检查参与角色和输入。');
    input=JSON.parse(JSON.stringify(input));profile={...profile};preset=preset?JSON.parse(JSON.stringify(preset)):undefined;
    signal.throwIfAborted();const prepared=plan(await this.api.post(base+'plan',{input},signal));
    let active=prepared.token;
    const raw:string[]=[];
    const finish=async(current:Plan)=>{
      let messages=current.messages;
      for(let attempt=0;attempt<2;attempt++){
        signal.throwIfAborted();const response=await this.completions.complete(messages,profile,key,signal,preset);raw.push(response.text);
        const checked=await this.api.post(base+'finish',{token:current.token,text:response.text},signal);
        if(checked?.ok===true&&checked.result&&typeof checked.result==='object')return checked;
        const error=checked?.error;
        if(attempt===0&&error?.retryable===true&&typeof error.reason==='string'&&/^[A-Z_]{1,100}$/.test(error.reason)){
          messages=[...current.messages,{role:'assistant',content:response.text},{role:'user',content:`回复格式未通过（${error.reason}）。使用同一组已锁定的目标和全部规则，只返回所需的合法 JSON；不要重新抽签，不要揭露匿名身份。`}];
          continue;
        }
        throw new NativeCompletionError('INVALID_TERMINAL_RESULT','角色回复格式未通过检查，当前记录已保留，可重试。',rawText(raw));
      }
      throw Error('终端任务没有返回有效结果。');
    };
    try{
      const checked=await finish(prepared);
      if(checked.review){const review=plan(checked.review);active=review.token;await finish(review);}
      signal.throwIfAborted();return {...checked.result,raw:rawText(raw)};
    }finally{void this.api.post(base+'cancel',{token:active}).catch(()=>{});}
  }
}
