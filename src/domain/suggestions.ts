import {stripReasoning} from './reasoning.ts';
/** Suggestions are optional UI choices, never a reason to retry an otherwise valid story. */
export function cleanSuggestions(value:unknown):string[]{
  if(!Array.isArray(value))return [];
  const result:string[]=[];
  for(const item of value){
    if(typeof item!=='string')continue;
    const text=stripReasoning(item).trim();
    if(!text||text.length>200||result.includes(text))continue;
    result.push(text);if(result.length===4)break;
  }
  return result;
}
