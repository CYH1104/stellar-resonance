import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {createCloudSave,parseCloudSave,mergeCloudSession} from '../src/domain/cloudBackup';
import {newSession,defaults,copy} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {IndexedDbRepository} from '../src/storage/repository';
const persona={name:'测试玩家',appearance:'',personality:'',background:''};
it('backs up complete story and terminal records but excludes embedded media and API configuration',()=>{
 const s=newSession('测试',persona,'开场');s.terminal=emptyTerminal();s.terminal.avatar='data:image/png;base64,PRIVATE_IMAGE_BYTES';s.terminal.bio='保留简介';s.memories=[{id:'memory',text:'记忆',kind:'note',createdAt:new Date().toISOString()}];s.initial.variables={图片:'<img src="data:image/png;base64,SECRET_BYTES">',链接:'https://example.org/picture.png'};
 const prefs=defaults();prefs.profiles[0].apiBaseUrl='https://private-api.example';prefs.profiles[0].model='PRIVATE_MODEL';
 const text=createCloudSave(s,prefs,{甲:'https://example.org/a.png',乙:'data:image/png;base64,NO'});
 expect(text).not.toMatch(/PRIVATE_IMAGE_BYTES|SECRET_BYTES|private-api|PRIVATE_MODEL|base64|data:image/);const cloud=parseCloudSave(text);expect(cloud.snapshot.sessions[0].memories[0].text).toBe('记忆');expect(cloud.snapshot.sessions[0].terminal!.bio).toBe('保留简介');expect(cloud.nicknameImages).toEqual({甲:'https://example.org/a.png'});expect(s.terminal.avatar).toContain('PRIVATE_IMAGE_BYTES');
});
it('keeps remote avatar links and preserves local avatar bytes when restoring a backup without an image',()=>{
 const s=newSession('测试',persona,'');s.terminal=emptyTerminal();s.terminal.avatar='https://example.org/avatar.png';const text=createCloudSave(s,defaults());expect(parseCloudSave(text).snapshot.sessions[0].terminal!.avatar).toBe(s.terminal.avatar);
 const incoming=copy(s);incoming.id='other';incoming.terminal!.avatar='';s.terminal.avatar='data:image/png;base64,LOCAL';const merged=mergeCloudSession(s,incoming);expect(merged.id).toBe(s.id);expect(merged.terminal!.avatar).toContain('LOCAL');expect(incoming.terminal!.avatar).toBe('');
});
it('accepts all sessions and retains workspace preferences while rejecting corrupt schemas',()=>{
 const s=newSession('测试',persona,'');const value=JSON.parse(createCloudSave(s,defaults()));value.snapshot.sessions.push({...copy(s),id:'another'});expect(parseCloudSave(JSON.stringify(value)).snapshot.sessions).toHaveLength(2);value.snapshot.sessions=[];expect(parseCloudSave(JSON.stringify(value)).snapshot.sessions).toHaveLength(0);expect(()=>parseCloudSave('{"schema":"unknown"}')).toThrow();
});
it('atomically stores a recovery snapshot with replacement while preserving other sessions and credentials',async()=>{
 const db=new IndexedDbRepository('cloud-'+crypto.randomUUID());const old=newSession('覆盖前',persona,''),other=newSession('其他存档',persona,'');const initial={version:1 as const,sessions:[old,other],preferences:defaults()};await db.write(initial);await db.writeApiCredentials({version:1,remember:true,keys:{main:'LOCAL_KEY'},confirmed:{}});
 const next=copy(initial);next.sessions[0].name='云端内容';await db.write(next,old.id);expect((await db.read())!.sessions.map(s=>s.name)).toEqual(['云端内容','其他存档']);expect((await db.readCloudRecovery(old.id))!.sessions[0].name).toBe('覆盖前');expect((await db.readApiCredentials())!.keys.main).toBe('LOCAL_KEY');
 const stale=new IndexedDbRepository('same-'+crypto.randomUUID()),name=(stale as any).name;await stale.write(initial);const newer=new IndexedDbRepository(name);await newer.read();await newer.write(next);await expect(stale.write(initial,old.id)).rejects.toThrow('其他页面修改');expect(await stale.readCloudRecovery(old.id)).toBeUndefined();expect((await newer.read())!.sessions[0].name).toBe('云端内容');
});

it('backs up every session and all unbound worldbooks and presets',()=>{const preferences=defaults();const sessions=[newSession('一',persona,''),newSession('二',persona,'')];const cloud=parseCloudSave(createCloudSave({version:1,sessions,preferences},preferences));expect(cloud.snapshot.sessions.map(s=>s.name)).toEqual(['一','二']);expect(cloud.snapshot.preferences.presets).toEqual(preferences.presets);expect(cloud.snapshot.preferences.worldbooks).toEqual(preferences.worldbooks);});

it('roundtrips a full backup above the former 20 MB limit including local persistence',async()=>{const session=newSession('大存档',persona,'甲'.repeat(7*1024*1024));const text=createCloudSave(session,defaults());expect(new TextEncoder().encode(text).length).toBeGreaterThan(20*1024*1024);const restored=parseCloudSave(text);const db=new IndexedDbRepository('large-'+crypto.randomUUID());await db.write(restored.snapshot);expect((await db.read())!.sessions[0].opening.length).toBe(session.opening.length);},20000);
it('strips local group avatar bytes from cloud backup and restores them by group id',()=>{
 const s=newSession('群头像',persona,'');s.terminal=emptyTerminal();s.terminal.conversations=[{id:'g1',title:'群一',group:true,members:['a'],announcement:'',messages:[],unread:0,avatar:'data:image/webp;base64,GROUP_BYTES'},{id:'g2',title:'群二',group:true,members:['a'],announcement:'',messages:[],unread:0,avatar:'https://example.org/group.png'}];
 const text=createCloudSave(s,defaults());expect(text).not.toContain('GROUP_BYTES');const incoming=parseCloudSave(text).snapshot.sessions[0];incoming.id=s.id;expect(incoming.terminal!.conversations[0].avatar).toBe('');const merged=mergeCloudSession(s,incoming);expect(merged.terminal!.conversations[0].avatar).toContain('GROUP_BYTES');expect(merged.terminal!.conversations[1].avatar).toBe('https://example.org/group.png');
});
