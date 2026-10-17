import {stripReasoning} from './reasoning.ts';

export interface SceneSlate {sceneNo?:string;title?:string;englishTitle?:string;quote?:string;location?:string;time?:string}
export type StoryBlock={kind:'text';text:string}|{kind:'slate';scene:SceneSlate}|{kind:'pending'};
const fields:Record<string,keyof SceneSlate>={scene_no:'sceneNo',scene_title:'title',en_title:'englishTitle',quote:'quote',location:'location',ti:'time'};
const wrappers=['顶栏','DRAFTING','DRAFTINKG','content'];
export function unwrapStoryTags(source:string,streaming=false):string{
  let text=source.replace(/<\/?(?:顶栏|DRAFTIN(?:K)?G|content)\s*>/gi,'');
  if(streaming){const at=text.lastIndexOf('<'),tail=text.slice(at).toLowerCase();if(at>=0&&wrappers.some(name=>['<'+name.toLowerCase()+'>','</'+name.toLowerCase()+'>'].some(tag=>tag.startsWith(tail))))text=text.slice(0,at);}
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
