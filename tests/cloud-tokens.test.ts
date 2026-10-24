import {it,expect,vi,afterEach} from 'vitest';
import {readCloudToken,writeCloudToken} from '../src/storage/cloudTokens';
afterEach(()=>vi.unstubAllGlobals());
it('automatically remembers locally, isolates platform and account, and removes when cleared',()=>{
 const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});
 expect(readCloudToken('github')).toBe('');writeCloudToken('github','synthetic');expect(readCloudToken('github')).toBe('synthetic');expect(readCloudToken('gitee')).toBe('');
 vi.stubGlobal('__ACADEMY_ACCOUNT__',{id:'other'});expect(readCloudToken('github')).toBe('');writeCloudToken('github','other-synthetic');writeCloudToken('github','');expect(readCloudToken('github')).toBe('');
 vi.stubGlobal('__ACADEMY_ACCOUNT__',undefined);expect(readCloudToken('github')).toBe('synthetic');writeCloudToken('github','');expect(readCloudToken('github')).toBe('');expect(data.size).toBe(0);
});
