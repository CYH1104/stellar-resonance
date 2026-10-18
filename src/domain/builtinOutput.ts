import {stripReasoning} from './reasoning';
export interface BuiltinBlock {title:string;text:string;kind:'status'|'theater'|'choices'|'collapsed'}
/** Presentation only: imported markup never becomes DOM, scripts or authoritative MVU data. */
export function builtinOutput(raw:string,streaming=false){
 const blocks:BuiltinBlock[]=[];
 const plain=(text:string)=>text.replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,'').replace(/<!doctype[^>]*>/gi,'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(?:p|div|li|section|tr|h[1-6])\s*>/gi,'\n').replace(/<\/?([a-z_][\w:.-]*)(?:\s[^<>]*|\s*\/?)>/gi,(tag,name)=>/^(?:html|head|body|div|span|p|section|article|table|tbody|thead|tr|td|th|details|summary|li|ul|ol|h[1-6]|b|strong|i|em|content|maintext|story|正文|writing_interlude|glass_status|sidestory)$/i.test(name)?'':tag).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\n{3,}/g,'\n\n').trim();
 let text=stripReasoning(raw).replace(/<(status|SR_STATE|UpdateVariable|choices|forum|theater)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,'').replace(/<\/?(?:SR_DONE|done)\s*\/?>/gi,'');
 if(streaming)text=text.replace(/<[^>]*$/,'').replace(/(?:^|\n)[ \t]*`{1,3}(?:[a-z]*)?$/i,'');
 // Balanced details blocks; do not consume unrelated text after an unclosed block.
 const tokens=/<\/?details\b[^>]*>/gi;let depth=0,start=0;const ranges:{start:number;end:number;body:string}[]=[];
 for(const match of text.matchAll(tokens)){if(!match[0].startsWith('</')){if(depth++===0)start=match.index!;}else if(depth&&--depth===0)ranges.push({start,end:match.index!+match[0].length,body:text.slice(start,match.index!+match[0].length)});}
 if(streaming&&depth)text=text.slice(0,start);
 for(const range of ranges.reverse()){
  const summary=range.body.match(/<summary\b[^>]*>([\s\S]*?)<\/summary\s*>/i);if(!summary)continue;
  const title=plain(summary[1]),body=plain(range.body.replace(summary[0],'').replace(/^<details\b[^>]*>|<\/details\s*>$/gi,''));
  // A title is not permission to expose hidden planning or deliberation.
  if(!/思考|思维|推理|草稿|审计|自检|规划|thinking|reasoning|draft|audit|planning/i.test(title))blocks.unshift({title,text:body,kind:/小剧场/.test(title)?'theater':/行动选项/.test(title)?'choices':'collapsed'});
  text=text.slice(0,range.start)+text.slice(range.end);
 }
 text=text.replace(/<(glass_status|writing_interlude|sidestory)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi,(_,tag:string,body:string)=>{blocks.push({kind:tag.toLowerCase()==='glass_status'?'status':tag.toLowerCase()==='sidestory'?'theater':'collapsed',title:tag.toLowerCase()==='glass_status'?'状态':tag.toLowerCase()==='sidestory'?'小剧场':'插叙',text:plain(body).replace(/\[([^|\]\n]+)\|([^\]\n]*)\]/g,'$1：$2\n')});return '';});
 // Remove fence delimiters only. Their contents remain readable through the built-in renderer.
 text=text.replace(/^[ \t]*```[^\r\n]*$/gm,'');
 return {prose:plain(text),blocks};
}
