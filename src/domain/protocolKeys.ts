/** Normalize only known protocol keys. Never alter user content, IDs, paths or arbitrary custom keys. */
export function normalizeProtocolKeys<T>(value:T,known:readonly string[],warn?:(code:string)=>void):T {
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const allowed=new Set(known),entries=new Map<string,unknown>(),conflicts=new Set<string>();
 for(const [original,item]of Object.entries(value)){
  const candidate=original.replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').trim();
  const key=allowed.has(candidate)?candidate:original;
  if(key!==original)warn?.('STATE_FIELD_NORMALIZED');
  if(conflicts.has(key))continue;
  if(entries.has(key)&&JSON.stringify(entries.get(key))!==JSON.stringify(item)){entries.delete(key);conflicts.add(key);warn?.('STATE_FIELD_CONFLICT');}
  else entries.set(key,item);
 }
 return Object.fromEntries(entries) as T;
}
