/** Only recognized, explicitly delimited model reasoning is removed; story character thoughts remain. */
const names=['think','thinking','think_rules','analysis','reasoning','chain_of_thought','chain-of-thought','cot','scratchpad','internal','thought','thoughts','ink','preparation','draft'];
export class ReasoningFilter {
  private pending='';private stack:string[]=[];private responseStart=false;
  private name:string;private tag:RegExp;private partial:RegExp;
  constructor(extraNames:string[]=[]){
    if(!Array.isArray(extraNames)||extraNames.length>64||extraNames.some(n=>typeof n!=='string'||!/^[\p{L}_][\p{L}\p{N}_:-]{0,63}$/u.test(n)))throw Error('辅助标签配置不正确');
    const all=[...new Set([...names,...extraNames.map(n=>n.toLowerCase())])],escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    this.name='(?:'+all.map(escape).join('|')+')';
    this.tag=new RegExp('^<(/?)('+this.name+')(?:\\s[\\s\\S]*?)?\\s*(/?)>$','iu');
    this.partial=new RegExp('^</?(?:'+all.flatMap(s=>Array.from({length:s.length},(_,i)=>escape(s.slice(0,i+1)))).join('|')+')?$','iu');
  }
  /** A fresh response can restart its own reasoning block instead of closing an earlier cutoff. */
  beginResponse(){this.responseStart=true;}
  get unclosed(){return !!this.stack.length;}
  push(chunk:string):string{
    if(this.pending&&(this.partial.test(this.pending)||'<!--'.startsWith(this.pending))&&chunk.startsWith('<'))this.pending='';
    this.pending+=chunk;let visible='';
    while(this.pending){
      const start=this.pending.indexOf('<');
      if(start<0){if(this.pending.trim())this.responseStart=false;if(!this.stack.length)visible+=this.pending;this.pending='';break;}
      if(start>0){if(this.pending.slice(0,start).trim())this.responseStart=false;if(!this.stack.length)visible+=this.pending.slice(0,start);this.pending=this.pending.slice(start);}
      if(this.pending.startsWith('<!--')){const close=this.pending.indexOf('-->');if(close<0)break;this.pending=this.pending.slice(close+3);continue;}
      let end=-1,quote='';for(let i=1;i<this.pending.length;i++){const c=this.pending[i];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>'){end=i;break;}}
      if(end<0){if(this.pending.length<=4096)break;if(new RegExp('^</?'+this.name+'(?:\\s|/|$)','iu').test(this.pending)){this.stack.push('unclosed');this.pending='';break;}if(!this.stack.length)visible+=this.pending[0];this.pending=this.pending.slice(1);continue;}
      const token=this.pending.slice(0,end+1),match=token.match(this.tag);this.pending=this.pending.slice(end+1);
      if(match){const key=match[2].toLowerCase();if(!match[1]&&!match[3]&&!/\/\s*>$/.test(token)){if(this.responseStart)this.stack=[];this.stack.push(key);}else if(match[1]){const at=this.stack.lastIndexOf(key);if(at>=0)this.stack.length=at;}this.responseStart=false;continue;}
      this.responseStart=false;
      if(!this.stack.length)visible+=token;
    }
    return visible;
  }
  finish():string{const tail=this.pending;if(this.stack.length||tail.startsWith('<!--')||'<!--'.startsWith(tail)||this.partial.test(tail)||new RegExp('^</?'+this.name+'(?:\\s|/|$)','iu').test(tail))return '';this.pending='';return tail;}
}
export function stripReasoning(text:string,extraNames:string[]=[]):string{const filter=new ReasoningFilter(extraNames);return filter.push(text)+filter.finish();}
export function scrubModelData<T>(value:T):T{
  if(typeof value==='string')return stripReasoning(value) as T;
  if(Array.isArray(value))return value.map(scrubModelData) as T;
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['reasoning','reasoning_content','thinking','analysis','cot','thought_signature'].includes(key)).map(([key,item])=>[key,scrubModelData(item)])) as T;
  return value;
}
