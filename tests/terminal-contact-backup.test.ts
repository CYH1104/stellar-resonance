import {it,expect} from 'vitest';
import {newSession,defaults,finishVariant,backup,parseBackup} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {applyTerminalBatch} from '../src/domain/terminalMain';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
it('validates custom-contact identities in terminal outcomes during completion and local/cloud import',()=>{
 const s=newSession('自定义联系人',{name:'用户',appearance:'',background:'',personality:''},'');s.terminal=emptyTerminal();s.terminal.contacts=[{id:'contact-custom',name:'自定义哥哥',present:false}];s.terminal.friends=[{id:'contact-custom',status:'accepted',reply:'好',note:''}];const v={id:'v',text:'正文',status:'incomplete' as const,createdAt:'now'};s.turns=[{id:'t',input:'问候哥哥',selected:0,variants:[v]}];
 const outcome={event:'问候',terminal:{protocolVersion:2 as const,groups:[],privateMessages:[{id:'contact-custom',text:'记得吃饭。',topic:'近况'}],friendRequests:[]}};finishVariant(s,0,v,outcome);expect(applyTerminalBatch(s,outcome.terminal,0)).toBe(true);
 const value={version:1 as const,sessions:[s],preferences:defaults()};for(const restored of [parseBackup(backup(value)),parseCloudSave(createCloudSave(value,defaults())).snapshot])expect(restored.sessions[0].terminal!.conversations[0].messages[0].text).toBe('记得吃饭。');
});
