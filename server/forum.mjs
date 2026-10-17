import {activeWorldEntries} from './editor-store.mjs';
import {internalPrompt} from './internal-prompts.mjs';
import {randomInt} from 'node:crypto';
import {modelError} from './ai.mjs';
import {scrubModelData,stripReasoning} from '../src/domain/reasoning.ts';
const text=(value,max)=>typeof value==='string'&&!!value.trim()&&value.length<=max;

export function forumReplyMessages(card,data,pick=randomInt){
  if(!text(data.userName,80)||!data.post||!text(data.post.authorName,80)||!text(data.post.content,3000)||!Array.isArray(data.comments)||!data.comments.length||data.comments.length>12||data.comments.some(c=>!c||!text(c.authorName,80)||!text(c.content,1000)))throw modelError(400,'INVALID_FORUM_REPLY');
  const index=pick(card.characters.length+1),character=card.characters[index];
  const speaker=character?{authorId:character.id,authorName:character.name}:{authorId:'npc-campus',authorName:'校园路人'};
  const messages=[{role:'system',content:internalPrompt("forum.1")},
    {role:'system',content:internalPrompt("forum.2")+JSON.stringify(character?{speaker,worldbookEntries:activeWorldEntries(card.world?.entries||[],{input:data.comments.map(c=>c.content).join('\n'),history:[]}).map(e=>e.content)}:{speaker,description:internalPrompt("forum.3")})},
    {role:'user',content:JSON.stringify({userName:data.userName,post:{authorName:data.post.authorName,content:data.post.content},comments:data.comments.map(c=>({authorName:c.authorName,content:c.content}))})}];
  return {speaker,messages};
}
export function parseForumReply(content,speaker){
  try{
    let source=stripReasoning(content).trim();const fence=source.match(/^```(json|text|plaintext)?[ \t]*(?:\r?\n)?([\s\S]*?)```$/i);const jsonFence=fence?.[1]?.toLowerCase()==='json';if(fence)source=fence[2].trim();
    let reply;
    // Models may send a public sentence instead of the requested envelope. Never render malformed JSON as prose.
    if(jsonFence||/^[{\["`]/.test(source)){
      const raw=scrubModelData(JSON.parse(source));
      if(typeof raw==='string')reply=raw;
      else if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).filter(k=>!['author','authorName','name','role'].includes(k)).length===1){
        if(Object.keys(raw).some(k=>!['content','reply','text','message','author','authorName','name','role'].includes(k)))throw Error();
        if('content' in raw)reply=raw.content;else if('reply' in raw)reply=raw.reply;else if('text' in raw)reply=raw.text;
        else if(raw.message&&typeof raw.message==='object'&&Object.keys(raw.message).length===1)reply=raw.message.content;
      }
    }else reply=source;
    if(!text(reply,1000)||/<\/?(?:SR_STATE|SR_DONE|UpdateVariable|stat_data)\b/i.test(reply))throw Error();
    return {...speaker,content:reply.trim()};
  }
  catch{throw modelError(502,'INVALID_FORUM_REPLY_RESULT');}
}
