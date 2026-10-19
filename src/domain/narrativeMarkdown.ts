export interface InlineSpan {kind:'text'|'strong'|'em'|'code';text:string}
/** A small text-only vocabulary. Never interprets HTML, links, scripts or attributes. */
export function inlineMarkdown(text:string):InlineSpan[]{
 const spans:InlineSpan[]=[];let offset=0;
 for(const match of text.matchAll(/(\*\*|__|`|\*)([^\n]+?)\1/g)){
  if(match.index!>offset)spans.push({kind:'text',text:text.slice(offset,match.index)});
  spans.push({kind:match[1]==='`'?'code':match[1]==='*'?'em':'strong',text:match[2]});offset=match.index!+match[0].length;
 }
 if(offset<text.length)spans.push({kind:'text',text:text.slice(offset)});
 return spans;
}
export function narrativeLines(text:string){
 return text.split(/\r?\n/).map(line=>{
  if(/^\s{0,3}(?:\*\s*){3,}$|^\s{0,3}(?:-\s*){3,}$|^\s{0,3}(?:_\s*){3,}$/.test(line))return {kind:'rule' as const,spans:[]};
  const heading=line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
  return {kind:heading?'heading' as const:'line' as const,spans:inlineMarkdown(heading?.[1]||line)};
 });
}
