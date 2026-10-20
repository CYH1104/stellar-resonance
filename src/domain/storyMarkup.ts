import {stripReasoning} from './reasoning.ts';

/** Text-only inline styling: never interpret model text as HTML. */
export function storyInline(text:string){
 const parts:{text:string;strong:boolean;dialogue:boolean}[]=[],quotes:string[]=[];let strong=false,offset=0;
 const append=(value:string,dialogue=quotes.length>0)=>{if(value)parts.push({text:value,strong,dialogue});};
 for(const m of text.matchAll(/\*\*|__|[“”「」『』"]/g)){
  append(text.slice(offset,m.index));const token=m[0];offset=m.index!+token.length;
  if(token==='**'||token==='__'){if(strong||text.indexOf(token,offset)>=0)strong=!strong;else append(token);continue;}
  const end:Record<string,string>={'“':'”','「':'」','『':'』'};
  if(quotes.at(-1)===token){append(token,true);quotes.pop();}else if(end[token]||token==='"'){quotes.push(end[token]||token);append(token,true);}else append(token);
 }
 append(text.slice(offset));return parts;
}

export interface SceneSlate {sceneNo?:string;title?:string;englishTitle?:string;quote?:string;location?:string;time?:string}
export type StoryBlock={kind:'text';text:string}|{kind:'slate';scene:SceneSlate}|{kind:'pending'};
const fields:Record<string,keyof SceneSlate>={scene_no:'sceneNo',scene_title:'title',en_title:'englishTitle',quote:'quote',location:'location',ti:'time'};
const wrappers=['顶栏','DRAFTING','DRAFTINKG','content','dream_plot','dream_body','dream_after_format','maintext','story','正文'];
export function displayText(source:string):string{
  return source.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`|\b[A-Za-z]:\\[^\s]+|https?:\/\/[^\s]+)/g).map((part,i)=>i%2?part:part.replace(/\\{1,4}r\\{1,4}n|\\{1,4}n/g,'\n')).join('');
}
export function unwrapStoryTags(source:string,streaming=false):string{
  let text=displayText(source).replace(/^[\t ]*\[(?:USER|CHAR)\s*\/\s*(?:player|world-card)\s*\/[^\]\r\n]{0,200}\][\t ]*(?:\r?\n|$)/gm,'').replace(/<\/?(?:顶栏|DRAFTIN(?:K)?G|content|dream_plot|dream_body|dream_after_format|maintext|story|正文)\s*>/gi,'').replace(/<br\s*\/?\s*>/gi,'\n');
  if(streaming){const at=text.lastIndexOf('<'),tail=text.slice(at).toLowerCase();if(at>=0&&wrappers.some(name=>['<'+name.toLowerCase()+'>','</'+name.toLowerCase()+'>'].some(tag=>tag.startsWith(tail))))text=text.slice(0,at);}
  if(streaming){const lines=text.split('\n');if(/^\[(?:C(?:H(?:A(?:R)?)?)?|U(?:S(?:E(?:R)?)?)?)(?:\s*\/[^\]]*)?$/.test(lines.at(-1)?.trim()||''))lines.pop();text=lines.join('\n');}
  return text;
}

function sceneFrom(source:string):SceneSlate|undefined{
  if(source.length>16000)return;
  const scene:SceneSlate={};let rest=source;
  while(rest.trim()){
    const field=rest.match(/^\s*<(Scene_NO|Scene_Title|EN_Title|Quote|Location|Ti)\s*>([\s\S]*?)<\/\1\s*>/i);
    if(!field)return;
    const key=fields[field[1].toLowerCase()];if(key in scene)return;
    scene[key]=field[2].trim();rest=rest.slice(field[0].length);
  }
  return Object.values(scene).some(value=>value?.trim())?scene:undefined;
}

/** Recognize a small display vocabulary; model output is never interpreted as executable HTML. */
export function storyBlocks(source:string,streaming=false):StoryBlock[]{
  const text=unwrapStoryTags(stripReasoning(source),streaming),blocks:StoryBlock[]=[];let offset=0;
  const append=(value:string)=>{if(value.trim())blocks.push({kind:'text',text:value});};
  const open=/<Slate\s*>/ig;let match:RegExpExecArray|null;
  while((match=open.exec(text))){
    append(text.slice(offset,match.index));
    const close=/<\/Slate\s*>/ig;close.lastIndex=open.lastIndex;const end=close.exec(text);
    if(!end){if(streaming)blocks.push({kind:'pending'});else append(text.slice(match.index));return blocks;}
    const full=text.slice(match.index,close.lastIndex),scene=sceneFrom(text.slice(open.lastIndex,end.index));
    if(scene)blocks.push({kind:'slate',scene});else append(full);
    offset=close.lastIndex;open.lastIndex=offset;
  }
  let tail=text.slice(offset);
  if(streaming){const start=tail.lastIndexOf('<');if(start>=0&&'<slate>'.startsWith(tail.slice(start).toLowerCase())){append(tail.slice(0,start));blocks.push({kind:'pending'});return blocks;}}
  append(tail);return blocks;
}
