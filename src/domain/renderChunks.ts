import {hasRenderableHtml} from './htmlRendering';
/** Commit only closed structural units while streaming. Never run preset regex on a partial unit. */
export function committedRenderText(source:string,streaming=false):string{
 if(!streaming)return source;
 const stack:string[]=[];let safe=0,i=0;
 const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
 while(i<source.length){
  if(source.startsWith('```',i)){
   const line=source.indexOf('\n',i+3);if(line<0)break;
   const close=/^[ \t]*```[ \t]*(?:\r?\n|$)/gm;close.lastIndex=line+1;const end=close.exec(source);if(!end)break;
   i=close.lastIndex;if(!stack.length)safe=i;continue;
  }
  if(source.startsWith('<!--',i)){const end=source.indexOf('-->',i+4);if(end<0)break;i=end+3;continue;}
  if(source[i]==='<'){
   const declaration=source.slice(i).match(/^<!doctype\s[^>]*>/i);if(declaration){i+=declaration[0].length;continue;}
   const tag=source.slice(i).match(/^<(\/?)([\p{L}_][\p{L}\p{N}_:-]*)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/u);
   if(tag){
    const name=tag[2].toLowerCase();i+=tag[0].length;
    if(tag[1]){if(stack.at(-1)!==name)break;stack.pop();}
    else if(!voids.has(name)&&!tag[0].endsWith('/>')){
     if(['script','style','textarea','title'].includes(name)){const close=new RegExp('</'+name+'\\s*>','ig');close.lastIndex=i;const end=close.exec(source);if(!end)break;i=close.lastIndex;}
     else stack.push(name);
    }
    if(!stack.length)safe=i;continue;
   }
   if(/^<\/?[\p{L}_!]/u.test(source.slice(i)))break;
  }
  if(!stack.length&&source.startsWith('\n\n',i))safe=i+2;
  i++;
 }
 return source.slice(0,safe);
}
export interface RenderChunk {kind:'html'|'story';text:string}
/** Each closed HTML fence owns a stable iframe; later fences do not reload earlier ones. */
export function renderChunks(source:string,embedded=false):RenderChunk[]{
 const chunks:RenderChunk[]=[];const fence=/```[ \t]*html[^\n]*\r?\n[\s\S]*?^[ \t]*```[ \t]*(?:\r?\n|$)/gim;let start=0;
 const append=(text:string)=>{if(text.trim())chunks.push({kind:hasRenderableHtml(text,embedded)?'html':'story',text});};
 for(const match of source.matchAll(fence)){append(source.slice(start,match.index));chunks.push({kind:'html',text:match[0].trimEnd()});start=match.index!+match[0].length;}
 append(source.slice(start));return chunks;
}
