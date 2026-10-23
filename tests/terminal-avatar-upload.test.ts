import {it,expect,vi,afterEach} from 'vitest';
import {terminalAvatarImage} from '../src/app/terminalAvatarImage';import {newSession,defaults,backup,parseBackup} from '../src/domain/story';import {emptyTerminal} from '../src/domain/personalTerminal';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
const data='data:image/png;base64,aGVsbG8=';
it('falls back when bitmap decoding fails, accepts missing mobile MIME, resizes and survives save export/import',async()=>{
 vi.stubGlobal('createImageBitmap',vi.fn().mockRejectedValue(Error('unsupported')));const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:local-avatar');
 class LocalImage{naturalWidth=1000;naturalHeight=2000;onload?:()=>void;onerror?:()=>void;set src(v:string){queueMicrotask(()=>this.onload?.());}}vi.stubGlobal('Image',LocalImage);
 const draw=vi.fn(),canvas={width:0,height:0,getContext:()=>({drawImage:draw}),toDataURL:()=>data};vi.stubGlobal('document',{createElement:()=>canvas});
 const avatar=await terminalAvatarImage(new File(['test'],'portrait.JPG',{type:''}));expect(avatar).toBe(data);expect(canvas.width).toBe(200);expect(canvas.height).toBe(400);expect(revoke).toHaveBeenCalledWith('blob:local-avatar');
 const s=newSession('头像',{name:'我',appearance:'',personality:'',background:''},'');s.terminal=emptyTerminal();s.terminal.avatar=avatar;s.terminal.avatarView={scale:1,x:0,y:0};const restored=parseBackup(backup({version:1,preferences:defaults(),sessions:[s]})).sessions[0];expect(restored.terminal!.avatar).toBe(data);
});
it('releases fallback URL on unreadable image and rejects invalid files before decoding',async()=>{
 vi.stubGlobal('createImageBitmap',undefined);const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:bad');class BadImage{onerror?:()=>void;set src(v:string){queueMicrotask(()=>this.onerror?.());}}vi.stubGlobal('Image',BadImage);
 await expect(terminalAvatarImage(new File(['bad'],'bad.png',{type:'image/png'}))).rejects.toThrow('无法读取');expect(revoke).toHaveBeenCalledWith('blob:bad');await expect(terminalAvatarImage(new File(['bad'],'bad.txt',{type:'text/plain'}))).rejects.toThrow('图片文件');
});
