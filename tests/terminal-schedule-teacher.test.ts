import {expect,it} from 'vitest';
import {cleanTerminalBatch} from '../src/domain/terminalMain';
import {newSession,backup,parseBackup,defaults} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
const course={title:'指挥研讨',day:5,time:'14:00',end:'16:00',place:'模拟舱',teacherId:'player',preparation:'准备分层课目'};
it('automatic terminal schedules accept player teaching and round-trip existing backup fields',()=>{
 const warnings:string[]=[];
 const batch=cleanTerminalBatch({groups:[],privateMessages:[],friendRequests:[],courses:[course]},[{id:'npc'}],undefined,c=>warnings.push(c));
 expect(batch.courses?.[0]).toMatchObject(course);expect(warnings).toEqual([]);
 const s=newSession('授课',{name:'教官',appearance:'',personality:'',background:''},'');s.terminal=emptyTerminal();s.terminal.courses=batch.courses!;
 const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()}));
 expect(restored.sessions[0].terminal!.courses).toEqual(batch.courses);
});
it('automatic schedules still reject unknown teachers and preserve player restrictions on NPC messages',()=>{
 const warnings:string[]=[];
 const batch=cleanTerminalBatch({groups:[],friendRequests:[],privateMessages:[{id:'player',text:'不允许替玩家发言',topic:''}],courses:[{...course,teacherId:'outsider'}]},[{id:'npc'}],undefined,c=>warnings.push(c));
 expect(batch.courses).toBeUndefined();expect(batch.privateMessages).toEqual([]);expect(warnings).toContain('STATE_TERMINAL_COURSES_RETAINED');
});
