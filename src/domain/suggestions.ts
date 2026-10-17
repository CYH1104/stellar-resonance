import {stripReasoning} from './reasoning.ts';
import {displayText} from './storyMarkup.ts';
/** Suggestions are optional UI choices, never a reason to retry an otherwise valid story. */
export function cleanSuggestions(value:unknown):string[]{
  if(typeof value==='string'){const source=value;try{value=JSON.parse(source);}catch{value=source.split(/\r?\n/);}}
  if(!Array.isArray(value))return [];
  const result:string[]=[];
  for(const item of value){
    const candidate=typeof item==='string'?item:item&&typeof item==='object'?(item.text??item.label??item.content):undefined;
    if(typeof candidate!=='string')continue;
    const text=displayText(stripReasoning(candidate)).trim();
    if(!text||text.length>200||result.includes(text))continue;
    result.push(text);if(result.length===4)break;
  }
  return result;
}
