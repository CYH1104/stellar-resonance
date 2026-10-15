import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {effectScope,nextTick} from 'vue';
import {useWorkspace} from '../src/app/useWorkspace';
import {IndexedDbRepository} from '../src/storage/repository';
import {HttpGateway} from '../src/gateway/http';
import {backup,defaults,initialState,newSession} from '../src/domain/story';
import type {LocalService,Snapshot} from '../src/domain/contracts';
import {cleanLocalApiCredentials,type LocalApiCredentials} from '../src/storage/apiCredentials';
vi.mock('../src/memory/retrieval',()=>({retrieve:async(items:unknown[])=>items.slice(0,6)}));
const service:LocalService={runtime:'local-card',dataset:'test-world',name:'测试',greeting:[],characters:[],places:[],counts:{characters:0,departments:0,places:0},missing:[],capabilities:{continue:true,keyRequired:true,embeddings:true}};
let scope:ReturnType<typeof effectScope>;
let saved:Snapshot|undefined;
let privateSaved:LocalApiCredentials|undefined;
beforeEach(()=>{
  vi.useFakeTimers();saved=undefined;privateSaved=undefined;scope=effectScope();
  vi.spyOn(IndexedDbRepository.prototype,'read').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'readApiCredentials').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'writeApiCredentials').mockImplementation(async value=>{privateSaved=cleanLocalApiCredentials(value);});
  vi.spyOn(IndexedDbRepository.prototype,'write').mockImplementation(async value=>{saved=JSON.parse(backup(value));});
  vi.spyOn(HttpGateway.prototype,'bootstrap').mockImplementation(async function(this:HttpGateway){this.capabilities=service.capabilities;return service;});
  vi.spyOn(HttpGateway.prototype,'configure').mockResolvedValue({origin:'https://synthetic.example'});
  vi.spyOn(HttpGateway.prototype,'newGame').mockResolvedValue({dataset:service.dataset,opening:'迎新',initial:initialState('玩家')});
});
afterEach(()=>{scope.stop();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});
async function workspace(){const w=scope.run(()=>useWorkspace())!;await vi.waitFor(()=>expect(w.loading.value).toBe(false));return w;}
function fill(w:ReturnType<typeof useWorkspace>,id='main'){
  Object.assign(w.preferences.profiles.find(p=>p.id===id)!,{apiBaseUrl:`https://${id}.synthetic.example/v1`,model:`model-${id}`});w.credentials[id]=`synthetic-key-${id}`;
}
it('未配置不能创建或打开剧情，确认后继续到之前选择的存档',async()=>{
  const w=await workspace();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');expect(w.sessions.value).toHaveLength(0);expect(w.panel.value).toBe('settings');
  const s=newSession('原存档',{name:'玩家',appearance:'',personality:'',background:''},'');w.sessions.value.push(s);w.open(s.id);expect(w.sessionId.value).toBe('');
  fill(w);await w.confirmAllApis();expect(w.apiReady.value).toBe(true);expect(w.enterStory()).toBe(true);expect(w.sessionId.value).toBe(s.id);
  expect(saved?.preferences.storyProfile).toBe('main');expect(JSON.stringify(saved)).not.toContain('synthetic-key');
  w.credentials.main='changed-key';await nextTick();expect(w.apiReady.value).toBe(false);expect(w.panel.value).toBe('settings');
});
it('旧版本没有保存过 Key 时仍保留分工和向量开关，需要首次填写',async()=>{
  const p=defaults();p.vectorEnabled=true;p.storyProfile='aux';
  vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue({version:1,preferences:p,sessions:[]});
  const w=await workspace();expect(w.preferences.vectorEnabled).toBe(true);expect(w.preferences.storyProfile).toBe('aux');expect(w.apiReady.value).toBe(false);expect(w.credentials).toEqual({});
});
it('剧情、每五轮摘要和建议各自调用选择的接口',async()=>{
  const w=await workspace();const storyId=w.addProfile();fill(w);fill(w,'aux');fill(w,storyId);w.preferences.storyProfile=storyId;w.preferences.summaryProfile='aux';w.preferences.suggestionsProfile='main';
  await w.confirmAllApis();expect(w.apiIssues.value).toEqual([]);expect(w.apiReady.value).toBe(true);await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  expect(w.problem.value).toBe('');expect(w.active.value).toBeDefined();
  w.importPreset(JSON.stringify({temperature:0.4,prompts:[{identifier:'main',content:'中文叙事'}]}));
  expect(w.storyProfile.value?.temperature).toBe(0.4);expect(w.preferences.profiles[0].temperature).toBe(0.7);
  const generate=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'delta',text:'本轮正文'};yield {type:'done',outcome:{event:'事件推进',characters:[]}};});
  const utility=vi.spyOn(HttpGateway.prototype,'utility').mockResolvedValue(['建议或摘要']);
  for(let i=0;i<5;i++){await w.generate(`行动 ${i}`);expect(w.problem.value).toBe('');}
  expect(generate).toHaveBeenCalledTimes(5);expect(generate.mock.calls.every(([r,key])=>r.profile.id===storyId&&key===`synthetic-key-${storyId}`)).toBe(true);
  expect(utility.mock.calls.filter(([task])=>task==='summary')).toHaveLength(1);expect(utility.mock.calls.every(([task, ,p,key])=>p.id===(task==='summary'?'aux':'main')&&key==='synthetic-key-'+p.id)).toBe(true);
  w.removeProfile(storyId);expect(w.preferences.storyProfile).toBe('main');
  w.removeProfile('aux');await w.generate('继续');expect(utility.mock.calls.at(-1)?.[2].id).toBe('main');
});
it('开启向量时先要求确认，随后记忆编码使用独立模型并存入本地快照',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  w.preferences.vectorEnabled=true;expect(w.apiReady.value).toBe(false);fill(w,'embed');await w.confirmAllApis();expect(w.apiReady.value).toBe(true);
  await w.saveMemory('需要记住的事件');const embed=vi.spyOn(HttpGateway.prototype,'embed').mockResolvedValue([[1,0.5]]);await w.indexMemories();
  expect(embed.mock.calls[0][0]).toEqual(['需要记住的事件']);expect(embed.mock.calls[0][1].id).toBe('embed');expect(embed.mock.calls[0][2]).toBe('synthetic-key-embed');
  expect(saved?.sessions[0].memories[0].vector?.values).toEqual([1,0.5]);
});

it('保存主副向量 Key 后，重新打开自动恢复各功能选择并重新登记接口，不调用外部模型',async()=>{
  const first=await workspace();fill(first);fill(first,'aux');fill(first,'embed');first.preferences.storyProfile='aux';first.preferences.summaryProfile='aux';first.preferences.suggestionsProfile='main';first.preferences.personaProfile='aux';first.preferences.vectorEnabled=true;await first.confirmAllApis();
  expect(privateSaved?.keys).toEqual({main:'synthetic-key-main',aux:'synthetic-key-aux',embed:'synthetic-key-embed'});expect(Object.keys(privateSaved!.confirmed)).toHaveLength(3);
  expect(JSON.stringify(saved)).not.toContain('synthetic-key');
  vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue(saved);vi.mocked(IndexedDbRepository.prototype.readApiCredentials).mockResolvedValue(privateSaved);
  const models=vi.spyOn(HttpGateway.prototype,'models'),generate=vi.spyOn(HttpGateway.prototype,'generate');vi.mocked(HttpGateway.prototype.configure).mockClear();
  const reopened=await workspace();expect(reopened.apiReady.value).toBe(true);expect([reopened.preferences.storyProfile,reopened.preferences.summaryProfile,reopened.preferences.suggestionsProfile,reopened.preferences.personaProfile]).toEqual(['aux','aux','main','aux']);expect(reopened.credentials.main).toBe('synthetic-key-main');
  expect(HttpGateway.prototype.configure).toHaveBeenCalledTimes(3);expect(models).not.toHaveBeenCalled();expect(generate).not.toHaveBeenCalled();
});
it('建议接口失败时不阻止使用另一接口生成第五轮摘要',async()=>{
  const w=await workspace();fill(w);fill(w,'aux');w.preferences.suggestionsProfile='aux';await w.confirmAllApis();
  await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'测试正文'};yield{type:'done',outcome:{event:'推进',characters:[]}};});
  const utility=vi.spyOn(HttpGateway.prototype,'utility').mockImplementation(async task=>{if(task==='suggestions')throw new Error('synthetic-unavailable');return ['摘要保留'];});
  for(let i=0;i<5;i++)await w.generate('行动 '+i);
  expect(utility.mock.calls.filter(([task])=>task==='summary')).toHaveLength(1);expect(w.active.value?.memories.some(m=>m.kind==='chapter'&&m.text==='摘要保留')).toBe(true);
});
it('关闭保存会擦除持久 Key，当前页面可继续，重新打开不再恢复',async()=>{
  const first=await workspace();fill(first);await first.confirmAllApis();await first.setRememberApiKeys(false);
  expect(privateSaved).toEqual({version:1,remember:false,keys:{},confirmed:{}});expect(first.apiReady.value).toBe(true);
  vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue(saved);vi.mocked(IndexedDbRepository.prototype.readApiCredentials).mockResolvedValue(privateSaved);
  const reopened=await workspace();expect(reopened.rememberApiKeys.value).toBe(false);expect(reopened.credentials).toEqual({});expect(reopened.apiReady.value).toBe(false);
});
it('清除全部 Key 后，自动保存不会把旧凭据写回来',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();w.credentials.main='changed-key';await w.clearApiKeys();await vi.advanceTimersByTimeAsync(600);
  expect(w.credentials).toEqual({});expect(w.apiReady.value).toBe(false);expect(privateSaved?.keys).toEqual({});expect(privateSaved?.confirmed).toEqual({});
});
it('已保存地址或模型与当前配置不同，不自动确认；保存失败不会报告成功',async()=>{
  const first=await workspace();fill(first);await first.confirmAllApis();const previous=structuredClone(privateSaved!);const changed=structuredClone(saved!);changed.preferences.profiles[0].apiBaseUrl='https://changed.example/v1';
  vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue(changed);vi.mocked(IndexedDbRepository.prototype.readApiCredentials).mockResolvedValue(previous);vi.mocked(HttpGateway.prototype.configure).mockClear();
  const reopened=await workspace();expect(reopened.apiReady.value).toBe(false);expect(HttpGateway.prototype.configure).not.toHaveBeenCalled();
  vi.mocked(IndexedDbRepository.prototype.writeApiCredentials).mockRejectedValue(new Error('本机写入失败'));await reopened.setRememberApiKeys(false);
  expect(reopened.problem.value).toBe('本机写入失败');expect(reopened.notice.value).not.toContain('已删除');
});

it('只配主 API 时摘要和建议均使用主 API，未选用副 API 草稿不拦截',async()=>{
  const w=await workspace();fill(w);w.preferences.profiles.find(p=>p.id==='aux')!.apiBaseUrl='https://draft.example/v1';await w.confirmAllApis();expect(w.apiReady.value).toBe(true);
  await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'测试正文'};yield{type:'done',outcome:{event:'推进',characters:[]}};});
  const utility=vi.spyOn(HttpGateway.prototype,'utility').mockResolvedValue(['测试建议摘要']);for(let i=0;i<5;i++)await w.generate('行动 '+i);
  expect(utility.mock.calls.filter(([task])=>task==='summary')).toHaveLength(1);expect(utility.mock.calls.every(([, ,p,key])=>p.id==='main'&&key==='synthetic-key-main')).toBe(true);
});
it('AI 人设填写使用自己的选择，删除副 API 后所有选用它的功能回到主 API',async()=>{
  const w=await workspace();fill(w);fill(w,'aux');w.preferences.personaProfile='aux';await w.confirmAllApis();
  const assist=vi.spyOn(HttpGateway.prototype,'assistPersona').mockResolvedValue({name:'玩家',appearance:'',personality:'',background:''});w.newGameDraft.wish='一个学院新生';await w.assistPersona();
  expect(assist.mock.calls[0][2].id).toBe('aux');expect(assist.mock.calls[0][3]).toBe('synthetic-key-aux');
  w.preferences.storyProfile='aux';w.preferences.summaryProfile='aux';w.preferences.suggestionsProfile='aux';w.removeProfile('aux');
  expect([w.preferences.storyProfile,w.preferences.summaryProfile,w.preferences.suggestionsProfile,w.preferences.personaProfile]).toEqual(['main','main','main','main']);
});

it('新行动只投一次骰子；重试重演保留骰点，关骰后新行动不带骰子事件',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');w.preferences.diceEnabled=true;
  const random=vi.spyOn(crypto,'getRandomValues').mockImplementation(array=>{(array as Uint32Array)[0]=0;return array;});
  const generate=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(r){yield{type:'delta',text:'剧情'};yield{type:'done',outcome:{event:'推进',characters:[],...(r.dice?{diceEvent:{direction:'negative' as const,description:'资料缺页，需要补办'}}:{})}};});vi.spyOn(HttpGateway.prototype,'utility').mockResolvedValue(['建议']);
  await w.generate('第一次行动');expect(w.active.value?.turns[0].dice?.value).toBe(1);expect(w.memories.value[0].text).toContain('资料缺页');
  w.preferences.diceEnabled=false;await w.generate(undefined,0);expect(generate.mock.calls[1][0].dice?.value).toBe(1);expect(random).toHaveBeenCalledTimes(1);
  await w.generate('关闭骰子后的行动');expect(generate.mock.calls[2][0].dice).toBeUndefined();expect(w.active.value?.turns[1].variants[0].outcome?.diceEvent).toBeUndefined();
});

it('三次续写未完成保留正文和原状态，不提交记忆或调用建议摘要',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  expect(w.canContinue.value).toBe(true);const initial=JSON.stringify(w.state.value);const utility=vi.spyOn(HttpGateway.prototype,'utility');
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){
    yield{type:'delta',text:'保留的前半句。'};
    for(let attempt=1;attempt<=3;attempt++){yield{type:'continuation',attempt,maxAttempts:3};expect(w.continuationAttempt.value).toBe(attempt);expect(w.active.value?.turns[0].variants[0].status).toBe('incomplete');}
    throw new Error('已自动续写3次，仍未确认完整结束。');
  });
  await w.generate('行动');const v=w.active.value!.turns[0].variants[0];expect(v.text).toBe('保留的前半句。');expect(v.status).toBe('incomplete');expect(v.outcome).toBeUndefined();expect(JSON.stringify(w.state.value)).toBe(initial);expect(w.memories.value).toHaveLength(0);expect(utility).not.toHaveBeenCalled();expect(w.problem.value).toContain('3次');expect(w.continuationAttempt.value).toBe(0);expect(saved?.sessions[0].turns[0].variants[0].text).toBe(v.text);
});
it('手动续写复用原稿与原骰点，传递断点并且只在完成后记忆一次',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');w.preferences.diceEnabled=true;
  const random=vi.spyOn(crypto,'getRandomValues').mockImplementation(array=>{(array as Uint32Array)[0]=0;return array;});
  const generate=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'已有正文。'};throw new Error('截断');});
  const utility=vi.spyOn(HttpGateway.prototype,'utility').mockResolvedValue(['建议']);await w.generate('原行动');const turn=w.active.value!.turns[0],id=turn.variants[0].id;
  generate.mockImplementation(async function*(r){expect(r.continuation?.partial).toBe('已有正文。');expect(r.generationType).toBe('continue');expect(r.input).toBe('原行动');expect(r.dice?.value).toBe(1);yield{type:'delta',text:'接上后半句。'};yield{type:'done',outcome:{event:'补写结束',characters:[],diceEvent:{direction:'negative',description:'资料缺页，需要补办。'}}};});
  await w.generate(undefined,0,true);expect(w.problem.value).toBe('');expect(turn.variants).toHaveLength(1);expect(turn.variants[0].id).toBe(id);expect(turn.variants[0].text).toBe('已有正文。接上后半句。');expect(turn.variants[0].status).toBe('complete');expect(w.active.value?.turns).toHaveLength(1);expect(random).toHaveBeenCalledTimes(1);expect(w.memories.value).toHaveLength(1);expect(utility).toHaveBeenCalledTimes(1);
});
it('自动续写中主动停止，不接收随后到达的状态或启动辅助任务',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  const utility=vi.spyOn(HttpGateway.prototype,'utility');vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'停止前正文。'};yield{type:'continuation',attempt:1,maxAttempts:3};w.stop();yield{type:'done',outcome:{event:'不应提交',characters:[]}};});
  await w.generate('行动');expect(w.active.value?.turns[0].variants[0].status).toBe('incomplete');expect(w.active.value?.turns[0].variants[0].text).toBe('停止前正文。');expect(w.memories.value).toHaveLength(0);expect(utility).not.toHaveBeenCalled();expect(w.busy.value).toBe(false);
});

it('删除指定存档后重新载入仍不存在，其他存档、预设及 API 凭据保留',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('保留的存档',{name:'玩家',appearance:'',personality:'',background:''},'');const keptId=w.active.value!.id;
  await w.create('要删除的存档',{name:'玩家乙',appearance:'',personality:'',background:''},'');const removedId=w.active.value!.id;
  w.active.value!.turns.push({id:'turn-delete',input:'原行动',selected:0,variants:[{id:'draft-delete',text:'待删除正文',status:'incomplete',createdAt:''}]});w.active.value!.memories.push({id:'memory-delete',kind:'note',text:'待删除记忆',createdAt:'',vector:{model:'test',text:'待删除记忆',values:[1,0]}});
  w.open(keptId);await w.save();const credentials=structuredClone(privateSaved!),preferences=JSON.stringify(saved!.preferences),kept=JSON.stringify(saved!.sessions.find(s=>s.id===keptId));
  expect(await w.deleteSession(removedId)).toBe(true);expect(w.sessionId.value).toBe(keptId);expect(JSON.stringify(saved)).not.toContain('待删除');expect(JSON.stringify(saved!.sessions.find(s=>s.id===keptId))).toBe(kept);expect(JSON.stringify(saved!.preferences)).toBe(preferences);expect(privateSaved).toEqual(credentials);expect(w.credentials.main).toBe('synthetic-key-main');
  vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue(saved);const reopened=await workspace();expect(reopened.sessions.value.map(s=>s.id)).toEqual([keptId]);
});
it('删除正在查看的存档返回列表，后台任务进行中不能删除，最后一份也可以删除',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('唯一存档',{name:'玩家',appearance:'',personality:'',background:''},'');const id=w.active.value!.id;
  w.busy.value=true;expect(await w.deleteSession(id)).toBe(false);w.busy.value=false;w.workingMemory.value=true;expect(await w.deleteSession(id)).toBe(false);w.workingMemory.value=false;
  w.input.value='未发送行动';expect(await w.deleteSession(id)).toBe(true);expect(w.active.value).toBeUndefined();expect(w.sessionId.value).toBe('');expect(w.panel.value).toBe('saves');expect(w.input.value).toBe('');expect(saved!.sessions).toEqual([]);expect(w.notice.value).toContain('已删除存档');
});
it('删除写入失败时保留内存和磁盘中的存档，允许重试且不误报成功',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('不能丢失',{name:'玩家',appearance:'',personality:'',background:''},'');const id=w.active.value!.id;
  vi.mocked(IndexedDbRepository.prototype.write).mockRejectedValueOnce(new Error('合成本地写入失败'));
  expect(await w.deleteSession(id)).toBe(false);expect(w.active.value?.id).toBe(id);expect(saved!.sessions[0].id).toBe(id);expect(w.problem.value).toContain('存档仍保留');expect(w.notice.value).not.toContain('已删除');expect(w.busy.value).toBe(false);
  expect(await w.deleteSession(id)).toBe(true);expect(saved!.sessions).toEqual([]);
});
it('删除期间触发的保存等待删除完成，不能把旧存档写回来；未配置 API 也可删除待打开存档',async()=>{
  const w=await workspace();const s=newSession('待打开存档',{name:'玩家',appearance:'',personality:'',background:''},'');w.sessions.value.push(s);w.open(s.id);expect(w.sessionId.value).toBe('');await w.save();
  let finish!:()=>void;const gate=new Promise<void>(resolve=>{finish=resolve;});const writer=vi.mocked(IndexedDbRepository.prototype.write);writer.mockClear();writer.mockImplementationOnce(async value=>{await gate;saved=JSON.parse(backup(value));});
  const deletion=w.deleteSession(s.id);await vi.waitFor(()=>expect(writer).toHaveBeenCalledTimes(1));expect(w.sessions.value).toHaveLength(1);const save=w.save();await nextTick();expect(writer).toHaveBeenCalledTimes(1);finish();expect(await deletion).toBe(true);await save;
  expect(saved!.sessions).toEqual([]);fill(w);await w.confirmAllApis();w.enterStory();expect(w.sessionId.value).toBe('');expect(w.active.value).toBeUndefined();
});
