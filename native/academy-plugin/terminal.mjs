import {randomUUID} from 'node:crypto';
import {terminalPlan,terminalFollowupPlan,parseTerminalResult} from '../../server/personal-terminal.mjs';

const fail=(status,code)=>Object.assign(Error(code),{status,code});
/** Feature protocol only. Model requests and persistence remain native. */
export function terminalPlans({clock=Date.now,maxPending=64}={}){
  const pending=new Map();
  function prune(){for(const [id,entry]of pending)if(entry.expires<=clock())pending.delete(id);}
  function put(owner,plan,source){prune();if(pending.size>=maxPending)throw fail(429,'NATIVE_TASK_BUSY');const id=randomUUID();pending.set(id,{owner,plan,source,expires:clock()+750000,attempts:0});return {token:id,messages:plan.messages};}
  return {
    plan(owner,input){
      if(!owner||!input||typeof input!=='object'||JSON.stringify(input).length>2000000||'key' in input||'profile' in input)throw fail(400,'INVALID_TERMINAL_REQUEST');
      // The caller supplies its selected save's scoped state, including custom NPCs.
      // No global player persona, unrelated save, author card or server profile is consulted.
      const source={card:{characters:[]},input:JSON.parse(JSON.stringify(input))};
      return put(owner,terminalPlan(source.card,source.input),source);
    },
    finish(owner,token,text){
      prune();const entry=pending.get(token);
      if(!entry||entry.owner!==owner)throw fail(404,'NATIVE_TASK_EXPIRED');
      if(typeof text!=='string'||text.length>400000)throw fail(400,'INVALID_TERMINAL_RESULT');
      if(++entry.attempts>2){pending.delete(token);throw fail(409,'NATIVE_TASK_ATTEMPTS_EXHAUSTED');}
      let result;
      try{
        result=parseTerminalResult(text,entry.plan);
      }catch(error){
        if(error?.retryable&&entry.attempts<2)return {ok:false,error:{code:'INVALID_TERMINAL_RESULT',reason:/^[A-Z_]{1,100}$/.test(error.reason||'')?error.reason:'RESULT_FORMAT_INVALID',retryable:true}};
        pending.delete(token);return {ok:false,error:{code:'INVALID_TERMINAL_RESULT',reason:/^[A-Z_]{1,100}$/.test(error?.reason||'')?error.reason:'RESULT_FORMAT_INVALID',retryable:false}};
      }
      pending.delete(token);
      if(entry.plan.task==='react'){
        const review=terminalFollowupPlan(entry.source.card,entry.source.input,'review',{command:entry.source.input.input,result});
        return {ok:true,result,review:put(owner,review,entry.source)};
      }
      return {ok:true,result};
    },
    cancel(owner,token){const entry=pending.get(token);if(entry?.owner===owner)pending.delete(token);},
    get size(){prune();return pending.size;},
  };
}
