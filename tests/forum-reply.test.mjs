import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forumReplyMessages,parseForumReply} from '../server/forum.mjs';
const card={characters:[{id:'one',name:'甲',intro:'synthetic-private-character'}]};
const input={userName:'玩家',post:{authorName:'路人',content:'今天食堂上新了'},comments:[{authorName:'玩家',content:'哪一道最好吃？'}]};
test('compatible forum outputs accept plain replies and common reply fields, while the server still owns authorship',()=>{
  const speaker={authorId:'one',authorName:'甲'};
  for(const content of ['我推荐新出的面。','```text\n我推荐新出的面。\n```','```json\n{"content":"我推荐新出的面。"}```','{"reply":"我推荐新出的面。"}','{"message":{"content":"我推荐新出的面。"}}','{"authorName":"不采用的名字","content":"我推荐新出的面。"}'])assert.deepEqual(parseForumReply(content,speaker),{...speaker,content:'我推荐新出的面。'});
});
test('server chooses a random char or ordinary NPC and includes only the public thread plus that speaker setting',()=>{
  const a=forumReplyMessages(card,input,()=>0),b=forumReplyMessages(card,input,()=>1);
  assert.equal(a.speaker.authorId,'one');assert.equal(b.speaker.authorId,'npc-campus');assert.equal(a.messages.at(-1).role,'user');assert.ok(!JSON.stringify(b.messages).includes('synthetic-private-character'));
  assert.equal(JSON.parse(a.messages.at(-1).content).comments[0].content,'哪一道最好吃？');
});
test('reply output cannot replace the server-selected author, inject state or reveal explicit reasoning',()=>{
  const {speaker}=forumReplyMessages(card,input,()=>0);
  assert.deepEqual(parseForumReply('<think>synthetic-secret</think>{"content":"我推荐新出的面。"}',speaker),{authorId:'one',authorName:'甲',content:'我推荐新出的面。'});
  for(const content of ['{"content":""}','{"content":"回复","affinity":99}','```json\nnot json\n```','{"content":"截断','<think>只有思考</think>','<SR_STATE>{"affinity":99}</SR_STATE>'])assert.throws(()=>parseForumReply(content,speaker),{code:'INVALID_FORUM_REPLY_RESULT'});
  assert.throws(()=>forumReplyMessages(card,{...input,comments:[]}),{code:'INVALID_FORUM_REPLY'});
});
