import type {ForumEntry,ForumPost,Session} from './contracts';
/** Local defaults: no model request and no random value on render. */
export const forumLikeBands={character:[10000,20000],popular:[3000,8000],official:[1000,2500],ordinary:[10,200]} as const;
const normalize=(text:string)=>text.normalize('NFKC').replace(/\s+/gu,'');
export function forumLikeCategory(session:Session,post:ForumPost):keyof typeof forumLikeBands{
  const author=normalize(post.authorName);
  const actors=session.initial.characters;
  if(actors.some(a=>a.name&&normalize(a.name)===author))return 'character';
  if(/官方|教务|校方|管理处|公告|通知中心|后勤|服务提醒/u.test(author)||/官方|公告|通知|服务提醒/u.test(post.type||''))return 'official';
  if(/同人|爆料|吃瓜|八卦|fanfic/iu.test([post.type,post.topic,post.content].filter(Boolean).join(' ')))return 'popular';
  return 'ordinary';
}
export function forumBaseLikes(session:Session,post:ForumPost,key:string){
  const [min,max]=forumLikeBands[forumLikeCategory(session,post)];
  let hash=2166136261;for(const char of key+'\0'+post.authorName+'\0'+post.content)hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return min+(hash>>>0)%(max-min+1);
}
const valid=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=1e9;
export function forumLikeCount(session:Session,post:ForumEntry){
  const reaction=session.forumActivity?.[post.key];
  return (valid(reaction?.baseLikes)?reaction.baseLikes:forumBaseLikes(session,post,post.key))+(reaction?.liked?1:0);
}
/** Called at load/commit, never during a computed render. Existing comments stay branch-local. */
export function prepareForumLikes(session:Session){
  const reactions=session.forumActivity||={};let count=Object.keys(reactions).length;
  for(const turn of session.turns)for(const variant of turn.variants){
    if(variant.status!=='complete')continue;
    for(const post of variant.outcome?.forum||[]){
      const key=`forum/${variant.id}/${post.id}`;
      if(!reactions[key]){if(count>=10000)continue;reactions[key]={liked:false,replies:[]};count++;}
      if(!valid(reactions[key].baseLikes))reactions[key].baseLikes=forumBaseLikes(session,post,key);
    }
  }
}
