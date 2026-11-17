import {it,expect} from 'vitest';
import {terminalMessageBubbles} from '../src/app/terminalMessageBubbles';
import {messagePage} from '../src/domain/terminalLedger';
import type {TerminalMessage} from '../src/domain/personalTerminal';
const reply:TerminalMessage={id:'reply',sender:'npc',displayName:'同伴',text:'第一段。\r\n\r\n第二段第一行。\r\n第二行。\r\n \r\n\r\n第三段。',at:'10:30',source:'story'};
it('projects one private reply into ordered bubbles without changing its stored identity or metadata',()=>{
 const before=JSON.stringify(reply),rows=terminalMessageBubbles([reply],true);
 expect(rows.map(r=>r.text)).toEqual(['第一段。','第二段第一行。\r\n第二行。','第三段。']);
 expect(new Set(rows.map(r=>r.bubbleKey)).size).toBe(3);
 for(const row of rows)expect(row).toMatchObject({id:'reply',sender:'npc',displayName:'同伴',at:'10:30',source:'story'});
 expect(JSON.stringify(reply)).toBe(before);
 expect(terminalMessageBubbles([reply],true).map(r=>r.bubbleKey)).toEqual(rows.map(r=>r.bubbleKey));
});
it('keeps player messages, group chats and single line breaks together',()=>{
 expect(terminalMessageBubbles([{...reply,sender:'player'}],true)).toHaveLength(1);
 expect(terminalMessageBubbles([reply],false)).toHaveLength(1);
 expect(terminalMessageBubbles([{...reply,text:'第一行\n第二行'}],true)).toHaveLength(1);
 expect(terminalMessageBubbles([{...reply,text:'\n\n'}],true)).toHaveLength(1);
});
it('splits after pagination so a stored reply never straddles history pages',()=>{
 const messages=Array.from({length:60},(_,i)=>({...reply,id:'r'+i}));
 const page=messagePage(messages,0),rows=terminalMessageBubbles(page,true);
 expect(rows).toHaveLength(page.length*3);
 expect(rows.map(r=>r.id).filter((id,i,all)=>i===0||id!==all[i-1])).toEqual(page.map(m=>m.id));
 expect(messages).toHaveLength(60);
});
