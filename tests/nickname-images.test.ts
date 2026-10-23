import {it,expect,vi,afterEach} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {saveNicknameImage,nicknameImage} from '../src/app/localNicknameImages';
import CharacterAvatar from '../src/components/CharacterAvatar.vue';
import {newSession,defaults,backup} from '../src/domain/story';
import type {ViewModel} from '../src/app/useWorkspace';
afterEach(()=>vi.unstubAllGlobals());
it('binds optional image URLs to names only in local display, including unknown speakers',async()=>{const storage=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v)});const session=newSession('test',{name:'我',appearance:'',personality:'',background:''},'');session.initial.characters=[{id:'npc',name:'哥哥',present:false}];const preferences=defaults();const w={active:session,state:session.initial,preferences} as ViewModel;const before=backup({version:1,preferences,sessions:[session]});saveNicknameImage(' 哥哥 ','https://example.test/avatar.png');expect(nicknameImage('哥哥')).toContain('avatar.png');const html=await renderToString(createSSRApp(CharacterAvatar,{w,id:'npc'}));expect(html).toContain('avatar.png');const unknown=await renderToString(createSSRApp(CharacterAvatar,{w,id:'story-unknown',nickname:'哥哥'}));expect(unknown).toContain('avatar.png');expect(backup({version:1,preferences,sessions:[session]})).toBe(before);expect(JSON.stringify(session)).not.toContain('avatar.png');expect(()=>saveNicknameImage('哥哥','javascript:bad')).toThrow();saveNicknameImage('哥哥','');expect(nicknameImage('哥哥')).toBe('');expect(await renderToString(createSSRApp(CharacterAvatar,{w,id:'npc'}))).not.toContain('avatar.png');});
