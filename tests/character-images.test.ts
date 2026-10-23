import {it,expect} from 'vitest';
import {majorCharacter,cleanCharacterImages,imageUrl} from '../src/domain/characterImages';
import {defaults,backup,parseBackup,newSession} from '../src/domain/story';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import CharacterAvatar from '../src/components/CharacterAvatar.vue';
import CharacterImageEditor from '../src/components/CharacterImageEditor.vue';
import type {ViewModel} from '../src/app/useWorkspace';
it('only exposes image editing for canonical major actors and uses the same URL in chat',async()=>{
 const w={localService:{characters:[{id:'main',name:'秦凛'},{id:'extra',name:'路人学生'}]},preferences:{characterImages:{main:{no:'01',url:'https://example.test/custom.webp',scale:2,x:10,y:0}}}} as unknown as ViewModel;
 const avatar=await renderToString(createSSRApp(CharacterAvatar,{w,id:'main'}));expect(avatar).toContain('custom.webp');expect(avatar).toContain('scale(2)');
 const editor=await renderToString(createSSRApp(CharacterImageEditor,{w,id:'main'}));expect(editor).toContain('恢复默认图片');expect(editor).toContain('立即保存');
 expect(await renderToString(createSSRApp(CharacterImageEditor,{w,id:'extra'}))).not.toContain('上传图片');
 expect(await renderToString(createSSRApp(CharacterAvatar,{w,id:'extra'}))).not.toContain('<img');
});
it('shares major card defaults and persists separate avatar framing through a BOM-prefixed backup',()=>{
 const card=majorCharacter('秦 凛')!;expect(card.no).toBe('01');expect(majorCharacter('路人学生')).toBeUndefined();
 const preferences=defaults();preferences.characterImages={'stable-actor-id':{no:card.no,url:'https://example.test/image.webp',scale:2,x:12,y:-30}};
 const session=newSession('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
 const restored=parseBackup('\uFEFF'+backup({version:1,preferences,sessions:[session]}));
 expect(restored.preferences.characterImages).toEqual(preferences.characterImages);
 expect(JSON.stringify(restored.sessions[0])).not.toContain('image.webp');
 delete preferences.characterImages['stable-actor-id'];expect(cleanCharacterImages(preferences.characterImages)).toEqual({});
});
it('rejects executable URLs, credentials, unknown cards and invalid crop coordinates',()=>{
 for(const url of ['javascript:alert(1)','data:image/svg+xml;base64,AAA','https://user:password@example.test/img'])expect(()=>imageUrl(url)).toThrow();
 for(const patch of [{no:'99'},{scale:0},{x:Infinity},{y:101}])expect(()=>cleanCharacterImages({actor:{no:'01',url:'',scale:1,x:0,y:0,...patch}})).toThrow();
 expect(imageUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
});

it('uses server card image defaults and restores them after a local-only override',async()=>{
 const storage=new Map<string,string>();const previous=globalThis.localStorage;Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v)}});
 try{const {saveLocalCharacterImage}=await import('../src/app/localCharacterImages');const w={localService:{majorCharacters:[{id:'server-image',name:'秦凛',img:'https://example.test/server-default.webp'}]},preferences:{}} as unknown as ViewModel;
 expect(await renderToString(createSSRApp(CharacterAvatar,{w,id:'server-image'}))).toContain('server-default.webp');
 saveLocalCharacterImage('server-image',{no:'01',url:'https://example.test/local.webp',scale:2,x:0,y:0});expect(await renderToString(createSSRApp(CharacterAvatar,{w,id:'server-image'}))).toContain('local.webp');expect(w.preferences.characterImages).toBeUndefined();expect([...storage.values()].join('')).toContain('local.webp');
 saveLocalCharacterImage('server-image',{no:'01',url:'',scale:1,x:0,y:0});expect(await renderToString(createSSRApp(CharacterAvatar,{w,id:'server-image'}))).toContain('server-default.webp');
 }finally{Object.defineProperty(globalThis,'localStorage',{configurable:true,value:previous});}
});
it('saves and reimports a persona with a long identity without losing its text',()=>{
 const identity='这是玩家的人设身份。'.repeat(100);const session=newSession('长身份',{name:'玩家',identity,appearance:'',personality:'',background:''},'');session.initial.player.identity=identity;
 const restored=parseBackup(backup({version:1,preferences:defaults(),sessions:[session]}));expect(restored.sessions[0].initial.player.identity).toBe(identity);expect(restored.sessions[0].persona.identity).toBe(identity);
});
