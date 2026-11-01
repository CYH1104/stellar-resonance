import {it,expect} from 'vitest';
import {NativeProtocolStream} from '../src/native/protocolStream';
import {guardNativeWrites} from '../src/native/runtimeGuard';
import {newSession,finishVariant,backup,parseBackup,defaults} from '../src/domain/story';
import {blankPersona} from '../src/domain/persona';
import {emptyNativeEffects,nativeWorldCheckpoint,nativeWorldSeed,cleanNativeWorldCheckpoint} from '../src/domain/nativeWorldState';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {cleanBackupArchive} from '../src/domain/backupArchive';
import {cleanNativeWorldbook,cleanNativeWorldbooks} from '../src/domain/nativeWorldbooks';
it('preserves native worldbook libraries larger than the old list and entry limits',()=>{
 const entries=Object.fromEntries(Array.from({length:2100},(_,uid)=>[uid,{uid,content:uid===0?'长'.repeat(210000):'条目',key:[],constant:true,disable:false}]));
 expect(Object.keys(cleanNativeWorldbook({entries}).entries)).toHaveLength(2100);
 const books=Array.from({length:24},(_,n)=>({id:'book'+n,name:'书'+n,worldbook:{entries:{0:{uid:0,content:'设定',key:[]}}}}));expect(cleanNativeWorldbooks({version:1,books,defaultIds:books.map(b=>b.id)}).books).toHaveLength(24);
});
it('never exposes reserved state, theater or reasoning fragments at any stream boundary',()=>{
 const raw='<think>private reasoning</think><Slate><Scene_Title>回廊</Scene_Title></Slate>正文第一段。<SR_STATE>{"event":"HIDDEN"}</SR_STATE><theater slot="3">HIDDEN THEATER</theater><SR_DONE>';
 for(const width of [1,2,3,7,raw.length]){const decoder=new NativeProtocolStream();let text='';for(let i=0;i<raw.length;i+=width)text+=decoder.push(raw.slice(i,i+width));expect(text).toBe('<Slate><Scene_Title>回廊</Scene_Title></Slate>正文第一段。');expect(decoder.raw).toBe(raw);}
 const broken=new NativeProtocolStream();expect(broken.push('正文<theater slot="3"')).toBe('正文');expect(broken.push('>SECRET')).toBe('');
});
it('keeps native macro variables tied to the accepted branch through all backup formats',()=>{
 const session=newSession('原生状态',{...blankPersona(),name:'用户'},'开场');const variant:import('../src/domain/contracts').Variant={id:'v1',text:'已完成正文',status:'incomplete',createdAt:'2026-10-31'};session.turns.push({id:'t1',input:'前进',variants:[variant],selected:0});finishVariant(session,0,variant,{event:'进入回廊'});
 variant.nativeWorldInfo=nativeWorldCheckpoint(session,0,variant,emptyNativeEffects(),{variables:{round:1,nested:{value:'记住'}},globals:{counter:2}});
 const snapshot={version:1 as const,sessions:[session],preferences:defaults(),archive:{version:1 as const,uiSettings:{'academy:brightness':'0.8'}}};
 for(const restored of [parseBackup(backup(snapshot)),parseCloudSave(createCloudSave(snapshot,snapshot.preferences)).snapshot]){expect(nativeWorldSeed(restored.sessions[0],1).variables).toEqual({round:1,nested:{value:'记住'}});expect(nativeWorldSeed(restored.sessions[0],1).globals).toEqual({counter:2});expect(restored.archive?.uiSettings).toEqual(snapshot.archive.uiSettings);}
 session.turns[0].input+='修改';expect(nativeWorldSeed(session,1).variables).toBeUndefined();
 expect(()=>cleanNativeWorldCheckpoint({...variant.nativeWorldInfo,futureState:1})).toThrow();
});
it('excludes repository tokens and embedded UI media from cloud archives, and preserves URL settings',()=>{
 expect(()=>cleanBackupArchive({version:1,uiSettings:{'cloud-token:gitee':'PRIVATE'}})).toThrow();
 const archive={version:1 as const,uiSettings:{'academy:brightness':'0.9','interstellarPRO:academy:portrait':'"data:image/png;base64,AAAA"','interstellarPRO:mapImg:v1':'"https://example.com/map.png"'}};
 const cloud=parseCloudSave(createCloudSave({version:1,sessions:[],preferences:defaults(),archive},defaults()));expect(cloud.snapshot.archive?.uiSettings).toEqual({'academy:brightness':'0.9','interstellarPRO:mapImg:v1':'"https://example.com/map.png"'});
});
it('prevents hidden native autosaves while allowing original reads and SDK generation',async()=>{
 const calls:string[]=[];const original=async(input:any)=>{calls.push(String(input));return new Response('{}',{headers:{'Content-Type':'application/json'}});};const host={location:{href:'http://127.0.0.1:8997/native-engine/',origin:'http://127.0.0.1:8997'},fetch:original,Response} as unknown as Window&typeof globalThis;
 const release=guardNativeWrites(host);expect((await host.fetch('/api/settings/save',{method:'POST'})).status).toBe(409);expect((await host.fetch('/api/chats/save',{method:'POST'})).status).toBe(409);
 expect((await host.fetch('/api/worldinfo/get',{method:'POST'})).status).toBe(200);expect((await host.fetch('/api/backends/chat-completions/generate',{method:'POST'})).status).toBe(200);expect(calls).toHaveLength(2);release();expect(host.fetch).toBe(original);
});
