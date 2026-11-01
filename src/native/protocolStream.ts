import {ReasoningFilter} from '../domain/reasoning';
const controls=['attitudes','SR_STATE','status','choices','forum','theater','UpdateVariable'];
/** Business markup only; transport streaming is handled by the original native SDK. */
export class NativeProtocolStream {
  private reasoning=new ReasoningFilter();private pending='';private control='';raw='';
  push(chunk:string){this.raw+=chunk;if(this.raw.length>400000)throw Error('本轮回复超过允许大小，已保留正文。');this.pending+=this.reasoning.push(chunk);let result='';
    while(this.pending){
      const match=/<\s*(\/?)\s*([\w-]+)\b[^>]*>/i.exec(this.pending);
      if(!match){const at=this.pending.lastIndexOf('<');const tail=at>=0?this.pending.slice(at):'';const partial=at>=0&&(['SR_DONE','done',...controls].some(n=>('<'+n).toLowerCase().startsWith(tail.toLowerCase())||('</'+n).toLowerCase().startsWith(tail.toLowerCase()))||/^<\s*\/?\s*(?:sr_done|done|attitudes|sr_state|status|choices|forum|theater|updatevariable)(?:\s[^>]*)?$/i.test(tail));const keep=partial?at:this.pending.length;if(!this.control)result+=this.pending.slice(0,keep);this.pending=this.pending.slice(keep);break;}
      const name=match[2].toLowerCase(),reserved=controls.some(n=>n.toLowerCase()===name),end=['sr_done','done'].includes(name);
      if(!this.control)result+=this.pending.slice(0,match.index);
      if(reserved){if(match[1]){if(this.control===name)this.control='';}else this.control=name;}
      else if(!this.control&&!end)result+=match[0];
      this.pending=this.pending.slice(match.index+match[0].length);
    }return result;
  }
}
