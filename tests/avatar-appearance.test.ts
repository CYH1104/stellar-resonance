import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import UserAvatar from '../src/components/UserAvatar.vue';
import PersonaImageEditor from '../src/components/PersonaImageEditor.vue';
import {avatarAppearanceStyle,cleanAvatarAppearance} from '../src/domain/avatarAppearance';
import {PersonaLibrary} from '../src/storage/personaLibrary';
import {blankPersona} from '../src/domain/persona';

it('old archives retain medium circular avatars; invalid settings safely fall back',()=>{
 expect(cleanAvatarAppearance()).toEqual({size:'medium',shape:'circle'});
 expect(cleanAvatarAppearance({size:'invalid',shape:'triangle'} as any)).toEqual({size:'medium',shape:'circle'});
 expect(avatarAppearanceStyle()).toMatchObject({width:'96px',height:'96px',borderRadius:'50%'});
});
it('all nine choices render, with rectangular proportions and no image required',async()=>{
 for(const size of ['small','medium','large'] as const)for(const shape of ['square','circle','rectangle'] as const){
  const style=avatarAppearanceStyle({size,shape}),html=await renderToString(createSSRApp(UserAvatar,{name:'测试玩家',appearance:{size,shape}}));
  expect(html).toContain('测');expect(html).toContain(`width:${style.width}`);expect(html).toContain(`height:${style.height}`);
  expect(parseInt(style.height)).toBe(shape==='rectangle'?Math.round(parseInt(style.width)*1.4):parseInt(style.width));
  expect(style.borderRadius).toBe(shape==='circle'?'50%':'0');
 }
 const editor=await renderToString(createSSRApp(PersonaImageEditor));for(const option of ['小','中','大','正方形','圆形','长方形（竖向）'])expect(editor).toContain(`>${option}</option>`);
});
it('avatar appearance persists independently per persona, without entering model persona',async()=>{
 const db=new PersonaLibrary(),base={name:'用户',persona:{...blankPersona(),name:'用户'},updatedAt:'2026-10-21'};
 await db.save({...base,id:'avatar-a',avatarAppearance:{size:'large',shape:'rectangle'}});await db.save({...base,id:'avatar-b',avatarAppearance:{size:'small',shape:'square'}});
 const saved=await new PersonaLibrary().list();expect(saved.find(f=>f.id==='avatar-a')?.avatarAppearance).toEqual({size:'large',shape:'rectangle'});expect(saved.find(f=>f.id==='avatar-b')?.avatarAppearance).toEqual({size:'small',shape:'square'});expect(saved.find(f=>f.id==='avatar-a')?.persona).not.toHaveProperty('avatarAppearance');
 await db.remove('avatar-a');await db.remove('avatar-b');
});
