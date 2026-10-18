import {afterEach,it,expect,vi} from 'vitest';
import {runRegex} from '../src/domain/regexRunner';
import {applyRegexRules,cleanRegexRules} from '../src/domain/regex';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const rules=cleanRegexRules([{id:'r',scriptName:'替换',findRegex:'/原文/g',replaceString:'展示',placement:[2],markdownOnly:true}]);
it('executes transformations off-thread and terminates the worker after completion',async()=>{
 let terminated=false;
 vi.stubGlobal('Worker',class{onmessage?:Function;onerror?:Function;postMessage(d:any){Promise.resolve().then(()=>this.onmessage?.({data:applyRegexRules(d.text,d.rules,d.context)}));}terminate(){terminated=true;}});
 expect((await runRegex('原文',rules,{placement:2,scope:'display'})).text).toBe('展示');expect(terminated).toBe(true);
});
it('times out a stalled worker, preserves original text, and reports the failure',async()=>{
 vi.useFakeTimers();let terminated=false;
 vi.stubGlobal('Worker',class{postMessage(){}terminate(){terminated=true;}});
 const pending=runRegex('原文',rules,{placement:2,scope:'display'});await vi.advanceTimersByTimeAsync(10001);
 const result=await pending;expect(result.text).toBe('原文');expect(result.errors[0]).toContain('超时');expect(terminated).toBe(true);
});
it('worker startup does not consume regex execution time and a stalled later rule preserves completed rendering',async()=>{
 vi.useFakeTimers();let worker:any;
 vi.stubGlobal('Worker',class{onmessage?:Function;postMessage(){worker=this;}terminate(){}});
 const pending=runRegex('原文',rules,{placement:2,scope:'display'});
 await vi.advanceTimersByTimeAsync(2000);
 worker.onmessage({data:{type:'progress',text:'已完成的卡片',errors:[],ruleName:'慢规则'}});
 await vi.advanceTimersByTimeAsync(1501);
 const result=await pending;expect(result.text).toBe('已完成的卡片');expect(result.errors[0]).toContain('慢规则');
});
it('abort cancels pending work without a late replacement',async()=>{
 let terminated=false;vi.stubGlobal('Worker',class{postMessage(){}terminate(){terminated=true;}});
 const controller=new AbortController(),pending=runRegex('原文',rules,{placement:2,scope:'display'},controller.signal);controller.abort();
 await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(terminated).toBe(true);
});
