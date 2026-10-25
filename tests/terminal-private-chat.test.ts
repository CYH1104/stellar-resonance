import {expect,it} from 'vitest';
import {newSession} from '../src/domain/story';
import {emptyTerminal,type TerminalConversation} from '../src/domain/personalTerminal';
import {terminalAnchor,terminalPrivateChats,terminalPrivateChatLimits,syncTerminalMemoryNotes,recordTerminalChat} from '../src/domain/terminalLedger';
import {terminalMainContext,cleanTerminalMainContext} from '../src/domain/terminalMain';

function session(){
 const s=newSession('私聊验收',{name:'玩家',appearance:'',personality:'',background:''},'开场');
 s.terminal=emptyTerminal();
 s.initial.characters=[{id:'guide',name:'向导',present:false},{id:'other',name:'旁观者',present:false}];
 s.turns=[{id:'t1',input:'继续',selected:0,variants:[{id:'v1',text:'正文',status:'complete',createdAt:'now',outcome:{event:'验收'}}]}];
 return s;
}
function chat(id:string,title:string,id2:string,texts:{sender:string;text:string;at?:string;archived?:boolean;anchor?:any}[]):TerminalConversation{
 return {id,title,group:false,members:[id2],announcement:'',messages:texts.map((m,i)=>({id:id+'-m'+i,sender:m.sender,text:m.text,at:m.at||new Date(2026,0,1,i).toISOString(),...(m.archived?{archived:true}:{}),...(m.anchor?{anchor:m.anchor}:{})})),unread:0,origin:'manual',joined:true};
}
it('derives only active one-to-one chats with player, character and main-model private messages',()=>{
 const s=session(),anchor=terminalAnchor(s);
 s.terminal!.conversations=[
  chat('p1','向导','guide',[{sender:'player',text:'周六带你去观星台。',anchor},{sender:'guide',text:'我会带星图。',anchor},{sender:'guide',text:'主模型主动私聊。',anchor}]),
  chat('p2','旁观者','other',[{sender:'other',text:'已归档的旧私聊。',archived:true},{sender:'player',text:'也不该出现。',archived:true}]),
  {id:'g1',title:'群聊',group:true,members:['guide','other'],announcement:'',messages:[{id:'gm',sender:'guide',text:'群消息。',at:'2026-01-01T00:00:00.000Z'}],unread:0},
 ];
 const result=terminalPrivateChats(s);
 expect(result).toHaveLength(1);
 expect(result[0]).toMatchObject({participantId:'guide',participantName:'向导',knownBy:['player','guide'],source:'terminal.conversations/p1'});
 expect(result[0].messages.map(m=>m.text)).toEqual(['周六带你去观星台。','我会带星图。','主模型主动私聊。']);
 expect(JSON.stringify(result)).not.toContain('旁观者');
});
it('isolates inactive variants and future turns from private chat facts',()=>{
 const s=session(),a1=terminalAnchor(s);
 s.terminal!.conversations=[chat('p1','向导','guide',[{sender:'guide',text:'旧分支的秘密。',anchor:a1}])];
 s.turns[0].variants.push({...s.turns[0].variants[0],id:'v2',text:'另一分支。'});
 s.turns[0].selected=1;
 expect(terminalPrivateChats(s)).toEqual([]);
 s.turns[0].selected=0;
 expect(terminalPrivateChats(s)[0].messages[0].text).toBe('旧分支的秘密。');
 s.turns.push({id:'t2',input:'未来',selected:0,variants:[{id:'v2',text:'未来正文',status:'complete',createdAt:'now',outcome:{event:'未来'}}]});
 const futureAnchor=terminalAnchor(s);
 s.terminal!.conversations[0].messages.push({id:'future',sender:'guide',text:'未来轮次的私聊。',at:'2026-01-02T00:00:00.000Z',anchor:futureAnchor});
 expect(terminalPrivateChats(s,1)[0].messages.map(m=>m.text)).toEqual(['旧分支的秘密。']);
});
it('keeps a named older participant under the chat budget instead of only taking the latest eight',()=>{
 const s=session();
 s.terminal!.conversations=Array.from({length:9},(_,i)=>chat('p'+i,i===0?'陆离':'角色'+i,`npc${i}`,[{sender:'player',text:'约定'+i,at:new Date(2026,0,i+1).toISOString()}]));
 const result=terminalPrivateChats(s,s.turns.length,'去找陆离确认旧约定');
 expect(result).toHaveLength(terminalPrivateChatLimits.chats);
 expect(result.map(r=>r.participantName)).toContain('陆离');
 expect(result[0].participantName).toBe('陆离');
});
it('marks truncation and keeps the total private-chat budget bounded',()=>{
 const s=session();
 s.terminal!.conversations=[chat('p1','向导','guide',Array.from({length:12},(_,i)=>({sender:i%2?'guide':'player',text:'第'+i+'条'+'长'.repeat(1000),at:new Date(2026,0,1,i).toISOString()})) )];
 const result=terminalPrivateChats(s);
 const texts=result[0].messages.map(m=>m.text);
 expect(result[0].truncated).toBe(true);
 expect(texts.some(t=>t.endsWith('…（已截断）'))).toBe(true);
 expect(texts.every(t=>t.length<=terminalPrivateChatLimits.messageChars+8)).toBe(true);
 expect(texts.join('').length).toBeLessThanOrEqual(terminalPrivateChatLimits.totalChars);
});
it('attaches only recorded earlier topics with their source and never fabricates one',()=>{
 const s=session(),anchor=terminalAnchor(s);
 s.terminal!.conversations=[chat('p1','向导','guide',[{sender:'guide',text:'最近一句。',anchor}])];
 expect(terminalPrivateChats(s)[0].earlierTopic).toBeUndefined();
 recordTerminalChat(s.terminal!,anchor,{id:'p1',title:'向导',group:false},['玩家','向导'],'旧约定：周六观星台，带星图');
 syncTerminalMemoryNotes(s);
 const result=terminalPrivateChats(s)[0];
 expect(result.earlierTopic?.text).toContain('周六观星台');
 expect(result.earlierTopic?.source).toMatch(/^terminal\.memories\//);
});
it('validates private chat shape before use and rejects mismatched senders or knowledge scopes',()=>{
 const s=session(),anchor=terminalAnchor(s);
 s.terminal!.conversations=[chat('p1','向导','guide',[{sender:'player',text:'我说。',anchor},{sender:'guide',text:'他说。',anchor}])];
 const context=terminalMainContext(s);
 expect(context.privateChats).toHaveLength(1);
 expect(()=>cleanTerminalMainContext(context,[{id:'guide'},{id:'other'}])).not.toThrow();
 const cases=[
  (c:any)=>{c.privateChats[0].messages[0].sender='other';},
  (c:any)=>{c.privateChats[0].knownBy=['player','other'];},
  (c:any)=>{c.privateChats[0].messages=Array.from({length:13},()=>({sender:'guide',text:'消息'}));},
  (c:any)=>{c.privateChats[0].messages[0].text='长'.repeat(900);},
  (c:any)=>{c.privateChats[0].source='elsewhere';},
 ];
 for(const mutate of cases){const bad=structuredClone(context);mutate(bad);expect(()=>cleanTerminalMainContext(bad,[{id:'guide'},{id:'other'}])).toThrow();}
 expect(()=>cleanTerminalMainContext({...context,privateChats:undefined},[{id:'guide'},{id:'other'}])).not.toThrow();
});
it('derives private chats from legacy saves that only have conversations',()=>{
 const s=session();
 s.terminal!.conversations=[chat('p1','向导','guide',[{sender:'player',text:'旧存档私聊。'},{sender:'guide',text:'仍能提取。'}])];
 const context=terminalMainContext(s);
 expect(context.privateChats?.[0]).toMatchObject({participantId:'guide',messages:[{text:'旧存档私聊。'},{text:'仍能提取。'}]});
});
