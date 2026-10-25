import {normalizeActorName} from '../domain/dynamicActors';
/** Resolve a terminal contact to one unambiguous built-in image entry; never create story facts. */
export function contactCharacterId(rows:readonly {id:string;name:string}[],id:string,name:string):string|undefined{
 if(!id.startsWith('contact-'))return rows.find(a=>a.id===id)?.id;
 const key=normalizeActorName(name);if(!key)return;
 const matches=rows.filter(a=>normalizeActorName(a.name)===key);
 return matches.length===1?matches[0].id:undefined;
}
