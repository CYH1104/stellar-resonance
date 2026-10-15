/** Only recognized, explicitly delimited model reasoning is removed; story character thoughts remain. */
const names=['think','thinking','think_rules','analysis','reasoning','chain_of_thought','chain-of-thought','cot','scratchpad','internal','thought','thoughts'];
const name='(?:'+names.join('|')+')';
const tag=new RegExp('^<(/?)('+name+')(?:\\s[^<>]*)?\\s*>$','i');
const partial=new RegExp('^</?(?:'+names.flatMap(s=>Array.from({length:s.length},(_,i)=>s.slice(0,i+1))).join('|')+')?$','i');
export class ReasoningFilter {
  private pending='';private stack:string[]=[];private responseStart=false;
  /** A fresh response can restart its own reasoning block instead of closing an earlier cutoff. */
  beginResponse(){this.responseStart=true;}
  get unclosed(){return !!this.stack.length;}
  push(chunk:string):string{
    if(this.pending&&(partial.test(this.pending)||'<!--'.startsWith(this.pending))&&chunk.startsWith('<'))this.pending='';
    this.pending+=chunk;let visible='';
    while(this.pending){
      const start=this.pending.indexOf('<');
      if(start<0){if(this.pending.trim())this.responseStart=false;if(!this.stack.length)visible+=this.pending;this.pending='';break;}
      if(start>0){if(this.pending.slice(0,start).trim())this.responseStart=false;if(!this.stack.length)visible+=this.pending.slice(0,start);this.pending=this.pending.slice(start);}
      if(this.pending.startsWith('<!--')){const close=this.pending.indexOf('-->');if(close<0)break;this.pending=this.pending.slice(close+3);continue;}
      const end=this.pending.indexOf('>');
      if(end<0){if(this.pending.length<=1024)break;if(new RegExp('^</?'+name+'(?:\\s|$)','i').test(this.pending)){this.stack.push('unclosed');this.pending='';break;}if(!this.stack.length)visible+=this.pending[0];this.pending=this.pending.slice(1);continue;}
      const token=this.pending.slice(0,end+1),match=token.match(tag);this.pending=this.pending.slice(end+1);
      if(match){const key=match[2].toLowerCase();if(!match[1]){if(this.responseStart)this.stack=[];this.stack.push(key);}else{const at=this.stack.lastIndexOf(key);if(at>=0)this.stack.length=at;}this.responseStart=false;continue;}
      this.responseStart=false;
      if(!this.stack.length)visible+=token;
    }
    return visible;
  }
  finish():string{const tail=this.pending;if(this.stack.length||tail.startsWith('<!--')||'<!--'.startsWith(tail)||partial.test(tail)||new RegExp('^</?'+name+'(?:\\s|$)','i').test(tail))return '';this.pending='';return tail;}
}
export function stripReasoning(text:string):string{const filter=new ReasoningFilter();return filter.push(text)+filter.finish();}
export function scrubModelData<T>(value:T):T{
  if(typeof value==='string')return stripReasoning(value) as T;
  if(Array.isArray(value))return value.map(scrubModelData) as T;
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['reasoning','reasoning_content','thinking','analysis','cot','thought_signature'].includes(key)).map(([key,item])=>[key,scrubModelData(item)])) as T;
  return value;
}
