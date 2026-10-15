import {afterEach,expect,it,vi} from 'vitest';
import {useWorkspace} from '../src/app/useWorkspace';
import {IndexedDbRepository} from '../src/storage/repository';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('酒馆 prompts 与 prompt_order 能通过实际导入入口，不再报三个字段限制',()=>{
  vi.spyOn(IndexedDbRepository.prototype,'read').mockResolvedValue(undefined);
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:404})));
  const w=useWorkspace();
  w.importPreset(JSON.stringify({name:'测试酒馆预设',temperature:0.8,prompts:[{identifier:'main',name:'主提示词',role:'system',content:'使用中文叙事'}],prompt_order:[{character_id:100001,order:[{identifier:'main',enabled:true}]}]}));
  expect(w.problem.value).toBe('');
});
it('实际导入入口接收 model 别名，保留停用行且不留下非法本地角色',()=>{
  vi.spyOn(IndexedDbRepository.prototype,'read').mockResolvedValue(undefined);
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:404})));
  const w=useWorkspace();w.importPreset(JSON.stringify({prompts:[{identifier:'response',role:'model',content:'模型消息',enabled:false}]}));
  expect(w.problem.value).toBe('');expect(w.presetEntries.value).toHaveLength(1);expect(w.presetEntries.value[0]).toMatchObject({role:'assistant',enabled:false});
});
