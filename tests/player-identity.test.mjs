import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playerIdentityContext} from '../server/player-identity.mjs';
import {forumThreadMessages} from '../server/forum.mjs';
test('generic identity reference carries full principal or external persona without assuming school membership',()=>{
 for(const identity of ['校长','校外维修工程师']){const context=playerIdentityContext({characters:[{id:'teacher',name:'教师',identity:'教官'}]},{persona:{name:'玩家',identity,background:'与卫锋曾共事',other:'秘密身份不公开',rawText:'完整原文'},state:{characters:[{id:'teacher',relationship:'曾经同事'}]}}).content;
 for(const text of [identity,'与卫锋曾共事','秘密身份不公开','完整原文','曾经同事','Never assume USER is a student','Do not initialize or increase affinity','System knowledge is not public knowledge'])assert.ok(context.includes(text),text);}
});
test('forum thread receives persona as reference context and keeps unknown identity explicit for old clients',()=>{
 const card={characters:[{id:'a',name:'角色',identity:'教师'}],world:{entries:[]}},data={userName:'玩家',persona:{name:'玩家',identity:'校外医生',background:'受邀访问'},post:{authorName:'角色',content:'今天的校园新闻'},comments:[{authorName:'玩家',content:'你好'}],minReplies:5};
 const plan=forumThreadMessages(card,data);assert.ok(plan.messages.some(m=>m.role==='system'&&m.content.includes('校外医生')&&m.content.includes('受邀访问')));
 assert.ok(playerIdentityContext(card,{}).content.includes('Not provided; do not infer identity from username.'));
});
