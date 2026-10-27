// 牌面刷新：单个日界线 timeout + 局部倒计时。倒计时只在占卜页可见时运行，
// 不每秒检查日期、不写存档、不触发模型。
import {afterEach,expect,it,vi} from 'vitest';
import {createCountdown,countdownText} from '../src/domain/countdown';
import {divinationDay,divinationDeadline} from '../src/domain/divination';

afterEach(()=>vi.useRealTimers());

it('deadline is the next existing Shanghai day boundary, never the device midnight',()=>{
 vi.useFakeTimers();
 // 2026-10-26 23:59 +08:00
 vi.setSystemTime(new Date('2026-10-26T15:59:00Z'));
 expect(divinationDay()).toBe('2026-10-26');
 expect(divinationDeadline()).toBe(Date.parse('2026-10-27T00:00:00+08:00'));
 // At exactly the boundary the next one is one day later.
 vi.setSystemTime(new Date('2026-10-26T16:00:00Z'));
 expect(divinationDay()).toBe('2026-10-27');
 expect(divinationDeadline()).toBe(Date.parse('2026-10-28T00:00:00+08:00'));
});

it('text is derived from seconds and never goes negative',()=>{
 expect(countdownText(5*3600+23*60+18)).toBe('05:23:18');
 expect(countdownText(0)).toBe('00:00:00');
 expect(countdownText(-5)).toBe('00:00:00');
});

it('countdown runs only while visible, updates locally and calibrates exactly once',()=>{
 vi.useFakeTimers();
 vi.setSystemTime(new Date('2026-10-26T15:59:00Z'));
 let expired=0,running=true;const seen:string[]=[];
 const deadline=Date.now()+3000;
 const clock=createCountdown({deadline:()=>deadline,running:()=>running,onTick:value=>seen.push(value.text),onExpire:()=>expired++});
 clock.start();
 expect(vi.getTimerCount()).toBe(1);
 vi.advanceTimersByTime(1000);
 expect(seen.at(-1)).toBe('00:00:02');
 vi.advanceTimersByTime(2000);
 expect(expired).toBe(1);
 // 到 0 后只校准一次，不循环触发
 vi.advanceTimersByTime(6000);
 expect(expired).toBe(1);
 clock.stop();
 expect(vi.getTimerCount()).toBe(0);
});

it('a hidden page holds no ticker at all',()=>{
 vi.useFakeTimers();
 let expired=0;
 const clock=createCountdown({deadline:()=>Date.now()+3000,running:()=>false,onTick:()=>{},onExpire:()=>expired++});
 clock.start();
 expect(vi.getTimerCount()).toBe(0);
 vi.advanceTimersByTime(10000);
 expect(expired).toBe(0);
});
