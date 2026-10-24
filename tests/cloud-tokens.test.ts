import {it,expect,vi,afterEach} from 'vitest';
import {readCloudToken,writeCloudToken} from '../src/storage/cloudTokens';
import {createCloudSave} from '../src/domain/cloudBackup';
import {newSession,defaults} from '../src/domain/story';
afterEach(()=>vi.unstubAllGlobals());
function storage(){const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});return data;}
it('automatically remembers locally, isolates platform and account, and removes when cleared',()=>{
 const data=storage();
 expect(readCloudToken('github')).toBe('');writeCloudToken('github','synthetic');expect(readCloudToken('github')).toBe('synthetic');expect(readCloudToken('gitee')).toBe('');
 vi.stubGlobal('__ACADEMY_ACCOUNT__',{id:'other'});expect(readCloudToken('github')).toBe('');writeCloudToken('github','other-synthetic');writeCloudToken('github','');expect(readCloudToken('github')).toBe('');
 vi.stubGlobal('__ACADEMY_ACCOUNT__',undefined);expect(readCloudToken('github')).toBe('synthetic');writeCloudToken('github','');expect(readCloudToken('github')).toBe('');expect(data.size).toBe(0);
});
it('never embeds the local cloud token in backups or generated saves',()=>{
 storage();writeCloudToken('gitee','synthetic-cloud-token');const session=newSession('备份',{name:'玩家',appearance:'',personality:'',background:''},'');const text=createCloudSave(session,defaults());expect(readCloudToken('gitee')).toBe('synthetic-cloud-token');expect(text).not.toContain('synthetic-cloud-token');expect(text).not.toContain('cloud-token');
});
