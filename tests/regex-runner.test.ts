import {afterEach,it,expect,vi} from 'vitest';
import {runRegex,preloadRegexWorker,disposeRegexWorker} from '../src/domain/regexRunner';
import {applyRegexRules,cleanRegexRules} from '../src/domain/regex';
afterEach(()=>{disposeRegexWorker();vi.useRealTimers();vi.unstubAllGlobals();});
const rules=cleanRegexRules([{id:'r',scriptName:'替换',findRegex:'/原文/g',replaceString:'展示',placement:[2],markdownOnly:true}]);
const context={placement:2,scope:'display' as const};
it('preloads and reuses one worker, serializing simultaneous replacements',async()=>{
 let created=0,terminated=0;
 vi.stubGlobal('Worker',class{
  onmessage?:Function;onerror?:Function;
  constructor(){created++;queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));}
  postMessage(d:any){queueMicrotask(()=>this.onmessage?.({data:applyRegexRules(d.text,d.rules,d.context)}));}
  terminate(){terminated++;}
 });
 expect(await preloadRegexWorker()).toBe(true);
 const results=await Promise.all([runRegex('原文一',rules,context),runRegex('原文二',rules,context)]);
 expect(results.map(r=>r.text)).toEqual(['展示一','展示二']);expect(created).toBe(1);expect(terminated).toBe(0);
 disposeRegexWorker();expect(terminated).toBe(1);
});
it('startup timeout retains original text and allows a fresh worker next time',async()=>{
 vi.useFakeTimers();let created=0,terminated=0;
 vi.stubGlobal('Worker',class{constructor(){created++;}postMessage(){}terminate(){terminated++;}});
 const pending=runRegex('原文',rules,context);await vi.advanceTimersByTimeAsync(10001);
 expect(await pending).toMatchObject({text:'原文',errors:[expect.stringContaining('超时')]});expect(terminated).toBe(1);
 const retry=preloadRegexWorker();expect(created).toBe(2);await vi.advanceTimersByTimeAsync(10001);expect(await retry).toBe(false);
});
it('execution timeout preserves completed replacements and rebuilds the worker',async()=>{
 vi.useFakeTimers();let worker:any,terminated=false;
 vi.stubGlobal('Worker',class{
  onmessage?:Function;
  constructor(){worker=this;queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));}
  postMessage(){this.onmessage?.({data:{type:'progress',text:'已完成的卡片',errors:[],ruleName:'慢规则'}});}
  terminate(){terminated=true;}
 });
 const pending=runRegex('原文',rules,context);await vi.advanceTimersByTimeAsync(1501);
 expect(await pending).toMatchObject({text:'已完成的卡片',errors:[expect.stringContaining('慢规则')]});expect(terminated).toBe(true);expect(worker).toBeTruthy();
});
it('abort rejects active work and does not corrupt queued replacements',async()=>{
 let terminated=0;
 vi.stubGlobal('Worker',class{
  onmessage?:Function;
  constructor(){queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));}
  postMessage(){}terminate(){terminated++;}
 });
 await preloadRegexWorker();const controller=new AbortController();
 const pending=runRegex('原文',rules,context,controller.signal);
 await Promise.resolve();await Promise.resolve();controller.abort();
 await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(terminated).toBe(1);
});
it('worker creation failure preserves original text',async()=>{
 vi.stubGlobal('Worker',class{constructor(){throw Error('blocked');}});
 expect(await runRegex('原文',rules,context)).toMatchObject({text:'原文',errors:[expect.stringContaining('启动失败')]});
});
