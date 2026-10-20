import {it,expect} from 'vitest';
import {newSession,finishVariant,visibleForum,replyForum,addForumAIReplies,backup,parseBackup,defaults} from '../src/domain/story';
it('five replies save atomically, survive backup and never duplicate on repeated delivery',()=>{
 const s=newSession('论坛',{name:'玩家',appearance:'',personality:'',background:''},'');
 const v={id:'v',text:'正文',status:'incomplete' as const,createdAt:''};s.turns.push({id:'t',input:'行动',variants:[v],selected:0});finishVariant(s,0,v,{event:'事件',forum:[{id:'post',authorName:'楼主',content:'公开动态'}]});
 const key=visibleForum(s)[0].key,parent=replyForum(s,key,'陆离怎么看？');
 const replies=Array.from({length:5},(_,i)=>({authorId:'npc'+i,authorName:'发言人'+i,content:'回应'+i}));
 expect(()=>addForumAIReplies(s,key,parent,[...replies.slice(0,4),{...replies[4],content:''}])).toThrow();expect(s.forumActivity![key].replies).toHaveLength(1);
 addForumAIReplies(s,key,parent,replies);addForumAIReplies(s,key,parent,replies);expect(s.forumActivity![key].replies).toHaveLength(6);
 expect(parseBackup(backup({version:1,preferences:defaults(),sessions:[s]})).sessions[0].forumActivity![key].replies.filter(r=>r.replyTo===parent)).toHaveLength(5);
});
