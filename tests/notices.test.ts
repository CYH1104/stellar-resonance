import {afterEach,expect,it,vi} from 'vitest';
import {notices,showNotice,dismissNotice,noticeDuration} from '../src/app/notices';
afterEach(()=>{for(const n of [...notices])dismissNotice(n.id);vi.useRealTimers();});
it('deduplicates shared and local errors and expires all notice kinds with one duration',()=>{
 vi.useFakeTimers();const a=showNotice('保存失败',true);expect(showNotice('保存失败',true)).toBe(a);showNotice('API 已保存');expect(notices).toHaveLength(2);
 vi.advanceTimersByTime(noticeDuration-1);expect(notices).toHaveLength(2);vi.advanceTimersByTime(1);expect(notices).toHaveLength(0);
});
it('closing an older notice leaves newer notices and their lifetimes intact',()=>{
 vi.useFakeTimers();const first=showNotice('旧提示')!;vi.advanceTimersByTime(1000);showNotice('新提示');dismissNotice(first);vi.advanceTimersByTime(7000);expect(notices.map(n=>n.message)).toEqual(['新提示']);vi.advanceTimersByTime(1000);expect(notices).toHaveLength(0);
});
it('keeps a bounded stack instead of covering messages with each other',()=>{vi.useFakeTimers();for(let i=0;i<5;i++)showNotice(String(i));expect(notices.map(n=>n.message)).toEqual(['2','3','4']);});
