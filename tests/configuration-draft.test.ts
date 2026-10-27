import {it,expect,vi,afterEach} from 'vitest';
import {effectScope,reactive,nextTick} from 'vue';
import {useConfigurationDraft} from '../src/app/useConfigurationDraft';
import {defaults,copy,newSession} from '../src/domain/story';
import type {ViewModel} from '../src/app/useWorkspace';
const scopes:ReturnType<typeof effectScope>[]=[];
afterEach(()=>{for(const scope of scopes)scope.stop();scopes.length=0;vi.unstubAllGlobals();});
function setup(){
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const p=defaults(),session=newSession('草稿隔离',{name:'用户',appearance:'',background:'',personality:''},'');
 const base=reactive({preferences:p,credentials:{main:'saved-key'},rememberApiKeys:true,sessions:[session],active:session,loading:false,backupWorking:false,problem:'',notice:'',fetchModels:vi.fn().mockResolvedValue([]),testProfile:vi.fn(),connectionReady:()=>true,
 commitConfiguration:vi.fn(async(next,keys,remember,bindings=[])=>{Object.assign(base.preferences,copy(next));for(const k of Object.keys(base.credentials))delete base.credentials[k as 'main'];Object.assign(base.credentials,copy(keys));base.rememberApiKeys=remember;for(const b of bindings as any[])base.sessions.find(s=>s.id===b.id)!.worldbookIds=copy(b.ids);})}) as unknown as ViewModel;
 const scope=effectScope();scopes.push(scope);const draft=scope.run(()=>useConfigurationDraft(base))!;return {base,draft};
}
it('typing API keys, preset text and settings stays isolated; testing uses only the explicit draft',async()=>{
 const {base,draft}=setup(),original=copy(base.preferences);draft.view.preferences.profiles[0].model='draft-model';draft.view.preferences.presets[0].content='未确认提示词';draft.view.preferences.vectorEnabled=!original.vectorEnabled;draft.view.credentials.main='draft-key';
 expect(base.preferences).toEqual(original);expect(base.credentials.main).toBe('saved-key');expect(draft.dirty.value).toBe(true);await draft.view.fetchModels(draft.view.preferences.profiles[0],new AbortController().signal);
 expect(base.fetchModels).toHaveBeenLastCalledWith(draft.view.preferences.profiles[0],expect.any(AbortSignal),undefined,'draft-key');expect(base.commitConfiguration).not.toHaveBeenCalled();await draft.discard();expect(draft.dirty.value).toBe(false);expect(draft.view.credentials.main).toBe('saved-key');
});
it('failed explicit saves retain all draft data and retry without activating it',async()=>{
 const {base,draft}=setup(),original=copy(base.preferences);draft.view.preferences.profiles[0].model='';draft.view.preferences.presets[0].content='草稿';draft.view.credentials.main='new-key';vi.mocked(base.commitConfiguration).mockRejectedValueOnce(Error('空间不足'));
 expect(await draft.save()).toBe(false);expect(base.preferences).toEqual(original);expect(base.credentials.main).toBe('saved-key');expect(draft.view.preferences.presets[0].content).toBe('草稿');expect(draft.error.value).toBe('空间不足');
 expect(await draft.save()).toBe(true);expect(base.preferences.profiles[0].model).toBe('');expect(base.credentials.main).toBe('new-key');expect(draft.dirty.value).toBe(false);
});
it('saving one profile cannot save another unfinished setting and does not silently overwrite concurrent changes',async()=>{
 const {base,draft}=setup(),original=base.preferences.presets[0].content;draft.view.preferences.presets[0].content='未确认的另一个编辑';draft.view.preferences.profiles[0].model='profile-only';draft.view.credentials.main='new-key';
 expect(await draft.view.connectProfile(draft.view.preferences.profiles[0])).toBe(true);expect(base.preferences.profiles[0].model).toBe('profile-only');expect(base.preferences.presets[0].content).toBe(original);expect(draft.dirty.value).toBe(true);
 base.preferences.presets[0].content='外部已确认修改';expect(await draft.save()).toBe(false);expect(base.preferences.presets[0].content).toBe('外部已确认修改');
});
it('worldbook membership edits stay in the draft and are committed with configuration',async()=>{
 const {base,draft}=setup();draft.view.addWorldbook();const id=draft.view.currentWorldbook!.id;
 expect(base.preferences.worldbooks).toHaveLength(0);expect(base.active!.worldbookIds||[]).toEqual([]);expect(draft.view.boundWorldbookIds).toContain(id);
 expect(await draft.save()).toBe(true);await nextTick();expect(base.preferences.worldbooks).toHaveLength(1);expect(base.active!.worldbookIds).toContain(id);
});
it('flushes registered preset/worldbook editors before collecting the saved snapshot',async()=>{
 const {base,draft}=setup();let pending=true;
 draft.registerEditor('test-preset',{dirty:()=>pending,save:async()=>{draft.view.preferences.presets[0].content='本次输入的预设';pending=false;},discard:async()=>{pending=false;}});
 expect(await draft.save()).toBe(true);
 expect(base.preferences.presets[0].content).toBe('本次输入的预设');
 expect(draft.dirty.value).toBe(false);
});
