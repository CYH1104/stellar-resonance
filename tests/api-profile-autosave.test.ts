import {afterEach,it,expect,vi} from 'vitest';
import {effectScope,reactive,ref} from 'vue';
import {useApiProfileAutoSave} from '../src/app/useApiProfileAutoSave';
import {defaults} from '../src/domain/story';
const scopes:ReturnType<typeof effectScope>[]=[];
afterEach(()=>{scopes.splice(0).forEach(s=>s.stop());vi.useRealTimers();});
function setup(){
 const p=reactive({...defaults().profiles[0],apiBaseUrl:'https://example.com/v1',model:'test-model'}),key=ref('test-key'),blocked=ref(false),confirmed=ref(false);
 const save=vi.fn(async()=>{confirmed.value=true;return true;});
 const scope=effectScope();scopes.push(scope);
 const auto=scope.run(()=>useApiProfileAutoSave(()=>p,()=>key.value,()=>blocked.value,()=>confirmed.value,save,()=>''))!;
 return {p,key,blocked,confirmed,save,auto};
}
it('retries automatically after a busy operation ends without editing the completed fields',async()=>{
 vi.useFakeTimers();const s=setup();s.blocked.value=true;s.p.name='changed';await vi.advanceTimersByTimeAsync(801);
 expect(s.save).not.toHaveBeenCalled();expect(s.auto.status.value).toContain('等待当前操作');
 s.blocked.value=false;await vi.advanceTimersByTimeAsync(801);
 expect(s.save).toHaveBeenCalledTimes(1);expect(s.auto.status.value).toBe('已自动保存');expect(s.auto.lastSaved.value).not.toBe('');
});
it('reports specific invalid hidden parameters instead of asking for completed fields',async()=>{
 const s=setup();s.p.maxTokens=150000;await s.auto.flush();
 expect(s.auto.status.value).toContain('有效的生成参数');expect(s.save).not.toHaveBeenCalled();
 s.p.maxTokens=32000;await s.auto.flush();expect(s.auto.status.value).toBe('已自动保存');
});
it('shows an externally confirmed restored configuration as saved',async()=>{
 const s=setup();s.key.value='';await s.auto.flush();expect(s.auto.status.value).toContain('Key');
 s.key.value='restored';s.auto.cancel();s.confirmed.value=true;expect(s.auto.status.value).toBe('已保存');
});
it('does not mark a rejected server save as incomplete or successful',async()=>{
 const s=setup();s.save.mockImplementation(async()=>false);s.p.model='other';await s.auto.flush();
 expect(s.auto.status.value).toContain('保存失败');expect(s.auto.error.value).toContain('API 保存失败');expect(s.auto.lastSaved.value).toBe('');
});
