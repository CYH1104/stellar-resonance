/**
 * Fact-level knowledge scope. A fact is one stable piece of information with an
 * explicit audience (knownBy, stable role ids). Missing/empty knownBy means
 * "unknown": the fact stays stored but is never treated as known by everyone.
 */
export interface ScopedFact {text:string;knownBy?:string[]}
/** knownBy missing or empty = unknown; scoped audiences must not receive it.
 * 'player' is a UI participant in terminal requests, not a knowledge gate: an NPC's own
 * memory reaches its own chat even when the player never witnessed it. But when the
 * audience contains other characters, every one of them must actually know the fact. */
export function factAudienceCovers(knownBy:string[]|undefined,audience:string[]):boolean{
 if(!audience.length)return true;
 if(!Array.isArray(knownBy)||!knownBy.length)return false;
 const set=new Set(knownBy);
 const effective=audience.length>1?audience.filter(id=>id!=='player'):audience;
 if(!effective.length)return false;
 return effective.every(id=>set.has(id));
}
/** Stable fact id derived from the owning memory, so revisions keep the same identity. */
export function factId(memoryId:string,index:number|string){return memoryId+':fact:'+index;}
/** Narrator-facing label: every fact in shared prose states who knows it, never silently public. */
export function factLabel(knownBy?:string[]){return '（知情：'+(knownBy&&knownBy.length?knownBy.join('、'):'未知')+'）';}
/** Validate model- or archive-provided facts; invalid entries are rejected, never broadened. */
export function cleanFacts(v:unknown,max=16):ScopedFact[]{
 if(v===undefined)return [];
 if(!Array.isArray(v)||v.length>max)throw Error('事实列表格式不正确');
 return v.map(f=>{
  if(!f||typeof f!=='object'||Array.isArray(f))throw Error('事实格式不正确');
  const item=f as Record<string,unknown>;
  if(Object.keys(item).some(k=>!['text','knownBy'].includes(k)))throw Error('事实包含不支持的字段');
  const text=typeof item.text==='string'?item.text.trim():'';
  if(!text||text.length>800)throw Error('事实内容不正确');
  let knownBy:string[]|undefined;
  if(item.knownBy!==undefined){
   if(!Array.isArray(item.knownBy)||item.knownBy.length>50)throw Error('事实知情范围不正确');
   // Ambiguous audiences must fail loudly: silently relaxing ids would hand secrets to the wrong people.
   const ids=item.knownBy.map(id=>{if(typeof id!=='string')throw Error('事实知情范围不正确');const s=id.trim();if(!s||s.length>128)throw Error('事实知情范围不正确');return s;});
   if(new Set(ids).size!==ids.length)throw Error('事实知情范围重复');
   knownBy=ids.length?ids:undefined;
  }
  return {text,...(knownBy?{knownBy}:{})};
 });
}
