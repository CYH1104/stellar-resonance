import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forumThreadMessages,parseForumThread} from '../server/forum.mjs';
const card={world:{entries:[]},characters:[{id:'lu',name:'陆离'},{id:'lin',name:'林陈'}]};
const data={userName:'玩家',post:{authorName:'楼主',content:'讨论训练安排'},comments:[{authorName:'路人甲',content:'我也去训练'},{authorName:'玩家',content:'陆离和林陈怎么看？'}],minReplies:5};
test('thread roster preserves poster and previous NPCs, and requires named chars',()=>{
 const plan=forumThreadMessages(card,data);
 assert.ok(plan.speakers.some(s=>s.authorName==='楼主'));assert.ok(plan.speakers.some(s=>s.authorName==='路人甲'));
 assert.ok(plan.requiredIds.includes('lu'));assert.ok(plan.requiredIds.includes('lin'));
 assert.ok(!plan.speakers.some(s=>s.authorName==='玩家'));
 const ids=plan.requiredIds;const replies=Array.from({length:Math.max(5,ids.length)},(_,i)=>({authorId:ids[i%ids.length],content:'公开回应'+i}));
 const out=parseForumThread(JSON.stringify({replies}),plan);assert.ok(out.replies.length>=5);assert.equal(out.replies.find(r=>r.authorId==='lu').authorName,'陆离');
});
test('short, duplicate, unknown-author, missing-required and truncated batches never become success',()=>{
 const plan=forumThreadMessages(card,data),ids=plan.requiredIds;
 const replies=Array.from({length:Math.max(5,ids.length)},(_,i)=>({authorId:ids[i%ids.length],content:'公开回应'+i}));
 for(const broken of [replies.slice(0,4),[...replies.slice(0,4),replies[0]],replies.map(r=>({...r,authorId:'invented'})),replies.map(r=>({...r,authorId:ids[0]}))])assert.throws(()=>parseForumThread(JSON.stringify({replies:broken}),plan));
 assert.throws(()=>parseForumThread('{"replies":[',plan));
});
