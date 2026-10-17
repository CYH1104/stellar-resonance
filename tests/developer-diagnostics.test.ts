import {it,expect} from 'vitest';
import {cleanDiagnostic} from '../src/domain/diagnostics';
import {developerDiagnostics as d,lockDiagnostics,recordDiagnostic,createDeveloperLock,verifyDeveloperLock} from '../src/app/developerDiagnostics';
it('本机密令加盐哈希，不保存明文；错密令不能解锁',async()=>{
 const password='test-only-phrase',lock=await createDeveloperLock(password);expect(JSON.stringify(lock)).not.toContain(password);expect(await verifyDeveloperLock(password,lock)).toBe(true);expect(await verifyDeveloperLock('wrong-password',lock)).toBe(false);expect((await createDeveloperLock(password)).hash).not.toBe(lock.hash);
});
it('诊断采用元数据白名单，锁定不记录；锁定清空且最多20条',()=>{
 const raw={kind:'state-json',attempt:1,stage:'rejected',code:'MODEL_STATE_JSON_INVALID',format:'invalid',offset:32,line:3,column:4,raw:'synthetic-secret',key:'secret-key',reasoning:'hidden reasoning',message:'private error',finishReason:'secret-finish'};
 const safe=cleanDiagnostic(raw);expect(safe).toMatchObject({offset:32,line:3,column:4});expect(JSON.stringify(safe)).not.toMatch(/synthetic|secret|hidden|private/);
 lockDiagnostics();recordDiagnostic(raw);expect(d.entries).toHaveLength(0);d.unlocked=true;for(let i=0;i<25;i++)recordDiagnostic(raw);expect(d.entries).toHaveLength(20);expect(JSON.stringify(d.entries)).not.toContain('secret');lockDiagnostics();expect(d.entries).toEqual([]);expect(d.unlocked).toBe(false);
});
