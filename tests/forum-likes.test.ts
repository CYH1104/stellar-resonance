import {it,expect} from 'vitest';
import {newSession,finishVariant,visibleForum,likeForum,replyForum,selectVariant,backup,parseBackup,defaults} from '../src/domain/story';
import {forumLikeCount,forumLikeCategory} from '../src/domain/forumLikes';
it('赞数分档遵守作者和内容要求，刷新、切回原稿和取消点赞均稳定，评论不串稿',()=>{
 const s=newSession('论坛',{name:'玩家',appearance:'',background:'',personality:''},'');
 const posts=[{id:'p0',authorName:'路人',content:'今天有点困'},{id:'p1',authorName:'学院官方',content:'通知'},{id:'p2',authorName:'路人乙',type:'同人文',content:'一段同人故事'},{id:'p3',authorName:'样例引导员',content:'晚上好'}];
 const v={id:'va',text:'正文',status:'incomplete' as const,createdAt:''};s.turns=[{id:'t',input:'观察',selected:0,variants:[v]}];finishVariant(s,0,v,{event:'论坛',forum:posts});
 const entries=[...visibleForum(s)].sort((a,b)=>a.id.localeCompare(b.id)),counts=entries.map(p=>forumLikeCount(s,p));
 expect(counts[0]).toBeLessThan(counts[1]);expect(counts[1]).toBeLessThan(counts[2]);expect(counts[2]).toBeLessThan(counts[3]);expect(forumLikeCategory(s,posts[2])).toBe('popular');
 const key=entries[0].key;likeForum(s,key);replyForum(s,key,'这条是甲稿的评论');expect(forumLikeCount(s,entries[0])).toBe(counts[0]+1);
 const vb={id:'vb',text:'乙稿',status:'incomplete' as const,createdAt:''};s.turns[0].variants.push(vb);finishVariant(s,0,vb,{event:'另一稿',forum:[{...posts[0],content:'完全不同的帖子'}]});selectVariant(s,0,1);
 expect(s.forumActivity?.[visibleForum(s)[0].key]?.liked).toBe(false);expect(s.forumActivity?.[visibleForum(s)[0].key]?.replies).toEqual([]);
 selectVariant(s,0,0);expect(forumLikeCount(s,visibleForum(s).find(p=>p.id==='p0')!)).toBe(counts[0]+1);
 const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];const p=visibleForum(restored).find(p=>p.id==='p0')!;expect(forumLikeCount(restored,p)).toBe(counts[0]+1);likeForum(restored,p.key);expect(forumLikeCount(restored,p)).toBe(counts[0]);expect(restored.forumActivity?.[p.key]?.replies[0].text).toContain('甲稿');
});
