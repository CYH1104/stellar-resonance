import {exportApiSettings} from '../src/domain/apiTransfer';
import {syncCharacterFacts} from '../src/domain/characterFacts';
import {normalizeMemoryResult} from '../src/domain/memories';
import {newWorldEntry} from '../src/domain/worldbooks';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {effectScope,nextTick} from 'vue';
import {useWorkspace} from '../src/app/useWorkspace';
import {IndexedDbRepository} from '../src/storage/repository';
import {HttpGateway} from '../src/gateway/http';
import {backup,parseBackup,defaults,initialState,newSession,finishVariant} from '../src/domain/story';
import type {LocalService,Snapshot} from '../src/domain/contracts';
import {cleanLocalApiCredentials,type LocalApiCredentials} from '../src/storage/apiCredentials';
vi.mock('../src/memory/retrieval',()=>({retrieve:async(items:unknown[])=>items.slice(0,6)}));
const service:LocalService={runtime:'local-card',dataset:'test-world',name:'测试',greeting:[],characters:[],places:[],counts:{characters:0,departments:0,places:0},missing:[],capabilities:{continue:true,keyRequired:true,embeddings:true}};
let scope:ReturnType<typeof effectScope>;
let saved:Snapshot|undefined;
let privateSaved:LocalApiCredentials|undefined;
beforeEach(()=>{
  vi.spyOn(HttpGateway.prototype,'memory').mockImplementation(async input=>normalizeMemoryResult({participants:[input.after.player.name],time:'未明确',location:'未明确',userActions:[input.input,input.event||'本轮行动'],charActions:[],gains:input.diceEvent?.direction==='positive'?[input.diceEvent.description]:[],losses:input.diceEvent?.direction==='negative'?[input.diceEvent.description]:[],commitments:[],affinityChanges:[]},input));
  vi.useFakeTimers();saved=undefined;privateSaved=undefined;scope=effectScope();
  vi.spyOn(IndexedDbRepository.prototype,'read').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'readApiCredentials').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'writeApiCredentials').mockImplementation(async value=>{privateSaved=cleanLocalApiCredentials(value);});
  vi.spyOn(IndexedDbRepository.prototype,'write').mockImplementation(async value=>{saved=JSON.parse(backup(value));});
  vi.spyOn(HttpGateway.prototype,'bootstrap').mockImplementation(async function(this:HttpGateway){this.capabilities=service.capabilities;return service;});
  vi.spyOn(HttpGateway.prototype,'randomEvent').mockImplementation(async data=>({kind:data.kind,title:'意外来信',description:'一封来历不明的信件等待查看。'}));
  vi.spyOn(HttpGateway.prototype,'embed').mockImplementation(async texts=>texts.map(()=>[1,0.5]));
  vi.spyOn(HttpGateway.prototype,'configure').mockResolvedValue({origin:'https://synthetic.example'});
  vi.spyOn(HttpGateway.prototype,'newGame').mockResolvedValue({dataset:service.dataset,opening:'迎新',initial:initialState('玩家')});
});
afterEach(()=>{scope.stop();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});
async function generateAndWait(w:ReturnType<typeof useWorkspace>,...args:Parameters<ReturnType<typeof useWorkspace>['generate']>){await w.generate(...args);await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));}
async function workspace(memoryInterval=1){const w=scope.run(()=>useWorkspace())!;await vi.waitFor(()=>expect(w.loading.value).toBe(false));w.preferences.memorySummaryInterval=memoryInterval;return w;}
it('automatically saves direct story and terminal changes without a new generation',async()=>{
 const w=await workspace();
 const session=newSession('自动保存',{name:'玩家',appearance:'',background:'',personality:''},'');
 w.sessions.value.push(session);await nextTick();await vi.advanceTimersByTimeAsync(501);
 const active=w.sessions.value[0];active.name='修改后的存档';
 active.terminal={version:1,avatar:'',friends:[],conversations:[],courses:[],scheduleDate:'',rooms:[],bio:'新的简介'};
 await nextTick();expect(w.storageStatus.value).toBe('pending');await vi.advanceTimersByTimeAsync(501);
 expect(saved?.sessions[0].name).toBe('修改后的存档');expect(saved?.sessions[0].terminal?.bio).toBe('新的简介');
 expect(w.storageStatus.value).toBe('saved');expect(w.lastSaved.value).not.toBe('');
});
it('reports save validation failures and retries after fixing the terminal state',async()=>{
 const w=await workspace();w.sessions.value.push(newSession('自动保存',{name:'玩家',appearance:'',background:'',personality:''},''));
 await nextTick();await vi.advanceTimersByTimeAsync(501);
 vi.mocked(IndexedDbRepository.prototype.write).mockImplementationOnce(async value=>{saved=parseBackup(backup(value));});
 w.sessions.value[0].terminal={version:1,avatar:'',friends:[],conversations:[],courses:[],scheduleDate:'',rooms:[],bio:'x'.repeat(161)};
 await nextTick();await vi.advanceTimersByTimeAsync(501);
 expect(w.storageStatus.value).toBe('failed');expect(w.storageError.value).toContain('终端资料');
 w.sessions.value[0].terminal!.bio='修正';await w.save();
 expect(w.storageError.value).toBe('');expect(w.storageStatus.value).toBe('saved');
});
it('keeps newer edits pending when an older save finishes',async()=>{
 const w=await workspace();w.sessions.value.push(newSession('开始',{name:'玩家',appearance:'',background:'',personality:''},''));
 await nextTick();await vi.advanceTimersByTimeAsync(501);
 let release!:()=>void,started!:()=>void;
 const gate=new Promise<void>(resolve=>release=resolve),entered=new Promise<void>(resolve=>started=resolve);
 vi.mocked(IndexedDbRepository.prototype.write).mockImplementationOnce(async value=>{started();await gate;saved=JSON.parse(backup(value));});
 w.sessions.value[0].name='旧内容';const first=w.save();await entered;
 w.sessions.value[0].name='最新内容';await nextTick();release();await first;
 expect(w.storageStatus.value).toBe('pending');await vi.advanceTimersByTimeAsync(501);
 expect(saved?.sessions[0].name).toBe('最新内容');expect(w.storageStatus.value).toBe('saved');
});
it('撤回一轮会还原状态、记忆和论坛并恢复用户输入，草稿覆盖需明确确认，刷新后仍保留',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('撤回',{name:'玩家',appearance:'',background:'',personality:''},'');
 const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(r){yield {type:'delta',text:'回复'+r.input};yield {type:'done',outcome:{event:r.input,characters:[{id:'guide',affinity:r.input==='第一条'?35:45}],forum:[{id:'p',authorName:'路人',content:r.input}]}};});
 await generateAndWait(w,'第一条');await generateAndWait(w,'第二条');const s=w.active.value!,id=s.id,turnId=s.turns[1].id;w.input.value='未发出的草稿';
 expect(await w.withdraw(1)).toBe(false);expect(s.turns).toHaveLength(2);expect(w.input.value).toBe('未发出的草稿');
 expect(await w.withdraw(1,'过时草稿',turnId)).toBe(false);expect(await w.withdraw(1,'未发出的草稿','过时消息')).toBe(false);
 expect(await w.withdraw(1,'未发出的草稿',turnId)).toBe(true);expect(s.turns).toHaveLength(1);expect(w.input.value).toBe('第二条');expect(w.state.value?.characters[0].affinity).toBe(35);expect(w.memories.value).toHaveLength(1);expect(w.forum.value.map(p=>p.content)).toEqual(['第一条']);expect(s.memoryTasks?.find(t=>t.source.sourceTurnId===turnId)?.status).toBe('stale');expect(gen).toHaveBeenCalledTimes(2);expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(2);expect(saved?.sessions[0].draftInput).toBe('第二条');
 vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue(saved);vi.mocked(IndexedDbRepository.prototype.readApiCredentials).mockResolvedValue(privateSaved);const reopened=await workspace();reopened.open(id);expect(reopened.input.value).toBe('第二条');expect(reopened.active.value?.turns).toHaveLength(1);
});
it('撤回保存失败时恢复原对话和草稿，撤回第一轮时回到初始状态且不自动发送',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('保存失败',{name:'玩家',appearance:'',background:'',personality:''},'');const initial=JSON.stringify(w.state.value);
 const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'delta',text:'正文'};yield {type:'done',outcome:{event:'变化',characters:[{id:'guide',affinity:50}]}};});await generateAndWait(w,'原行动');w.input.value='当前草稿';
 vi.mocked(IndexedDbRepository.prototype.write).mockRejectedValueOnce(new Error('存储失败'));expect(await w.withdraw(0,'当前草稿')).toBe(false);expect(w.active.value?.turns).toHaveLength(1);expect(w.input.value).toBe('当前草稿');expect(w.problem.value).toContain('原对话和草稿已恢复');
 expect(await w.withdraw(0,'当前草稿')).toBe(true);expect(w.active.value?.turns).toHaveLength(0);expect(JSON.stringify(w.state.value)).toBe(initial);expect(w.input.value).toBe('原行动');expect(gen).toHaveBeenCalledTimes(1);expect(w.memories.value).toEqual([]);expect(w.forum.value).toEqual([]);
});
it('撤回时仍在运行的记忆请求不能复活已删除轮次或覆盖 stale 状态',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('迟到记忆',{name:'玩家',appearance:'',background:'',personality:''},'');let release!:()=>void;const wait=new Promise<void>(r=>release=r);
 vi.mocked(HttpGateway.prototype.memory).mockImplementation(async input=>{await wait;return normalizeMemoryResult({participants:[input.after.player.name],time:'未明确',location:'未明确',userActions:[input.input],charActions:[],gains:[],losses:[],commitments:[],affinityChanges:[]},input);});
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'delta',text:'正文'};yield {type:'done',outcome:{event:'事件'}};});await w.generate('要撤回的行动');await vi.waitFor(()=>expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(1));expect(await w.withdraw(0)).toBe(true);release();await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));expect(w.active.value?.turns).toHaveLength(0);expect(w.memories.value).toEqual([]);expect(w.active.value?.memoryTasks?.[0].status).toBe('stale');
});
it('补修对照保存到当前稿件，记录实际差异、无变化和失败，续写新稿不继承旧稿对照',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('补修审计',{name:'玩家',appearance:'',background:'',personality:''},'');const s=w.active.value!,v={id:'audit-v',text:'固定正文',status:'incomplete' as const,createdAt:''};s.initial.characters.find(c=>c.id==='guide')!.affinity=35;s.turns.push({id:'audit-t',input:'行动',selected:0,variants:[v]});finishVariant(s,0,v,{event:'原事件'});
 const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'done',outcome:{event:'补全',characters:[{id:'guide',affinity:45}],stateUpdate:{status:'updated',received:true,storyComplete:true,codes:['STATE_FIELD_SKIPPED']}}};});await w.repairState(0);
 let audit=s.turns[0].variants[0].repairAudit!;expect(audit.variantId).toBe('audit-v');expect(audit.changes).toContainEqual({path:'/characters/guide/affinity',before:35,after:45});expect(audit.codes).toContain('STATE_FIELD_SKIPPED');expect(saved?.sessions[0].turns[0].variants[0].repairAudit).toEqual(audit);
 await w.repairState(0);audit=s.turns[0].variants[0].repairAudit!;expect(audit.changes).toEqual([]);
 gen.mockImplementation(async function*(){throw Error('接口失败');});await w.repairState(0);expect(s.turns[0].variants[0].repairAudit).toMatchObject({problem:'接口失败',changes:[]});expect(w.state.value?.characters[0].affinity).toBe(45);
 gen.mockImplementation(async function*(){yield {type:'delta',text:'续写'};yield {type:'done',outcome:{event:'续写',characters:[{id:'guide',affinity:45}]}};});await generateAndWait(w,undefined,0,true);expect(s.turns[0].variants).toHaveLength(2);expect(s.turns[0].variants[0].repairAudit?.variantId).toBe('audit-v');expect(s.turns[0].variants[1].repairAudit).toBeUndefined();
});
it('默认逐轮生成记忆，旧的10轮设置导入后也迁移成1轮',async()=>{
 expect(defaults().memorySummaryInterval).toBe(1);
 const {cleanPreferences}=await import('../src/domain/story');expect(cleanPreferences({...defaults(),memorySummaryInterval:10}).memorySummaryInterval).toBe(1);
 const w=await workspace(1);fill(w);w.preferences.vectorEnabled=true;await w.confirmAllApis();await w.create('逐轮',{name:'玩家',appearance:'',personality:'',background:''},'');
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'delta',text:'本轮完整正文'};yield {type:'done',outcome:{event:'推进'}};});
 await generateAndWait(w,'第一轮');expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(1);expect(w.pendingMemoryCount.value).toBe(0);expect(w.memories.value[0].vector?.values).toEqual([1,.5]);
});
it('一轮整理失败不能卡住下一轮，失败项保留手动重试且不自动反复付费',async()=>{
 const w=await workspace(1);fill(w);await w.confirmAllApis();await w.create('失败隔离',{name:'玩家',appearance:'',personality:'',background:''},'');
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'delta',text:'完整正文'};yield {type:'done',outcome:{event:'推进'}};});
 vi.mocked(HttpGateway.prototype.memory).mockRejectedValueOnce(new Error('第一轮失败'));
 await generateAndWait(w,'第一轮');await generateAndWait(w,'第二轮');
 expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(2);expect(w.pendingMemoryCount.value).toBe(1);expect(w.memories.value.find(m=>m.sourceTurn===w.active.value!.turns[1].id)?.status).toBe('ready');
});
it('连续九轮各整理一次，不等待第十轮且不调用批量接口或独立建议接口',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('调用计数',{name:'玩家',appearance:'',personality:'',background:''},'');
 const batch=vi.spyOn(HttpGateway.prototype,'memoryBatch'),utility=vi.spyOn(HttpGateway.prototype,'utility');
 const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'正文。'};yield{type:'done',outcome:{event:'推进',characters:[],suggestions:['观察','询问']}};});
 for(let i=0;i<9;i++)await generateAndWait(w,'行动'+i);
 expect(gen).toHaveBeenCalledTimes(9);expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(9);expect(batch).not.toHaveBeenCalled();expect(utility).not.toHaveBeenCalled();expect(w.effectiveMemoryCount.value).toBe(9);expect(w.pendingMemoryCount.value).toBe(0);expect(saved?.sessions[0].turns).toHaveLength(9);
});
it('运行中残留的旧累计设置也不能让自动队列继续等批次',async()=>{
 const w=await workspace(3);fill(w);await w.confirmAllApis();await w.create('旧设置',{name:'玩家',appearance:'',personality:'',background:''},'');
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'正文。'};yield{type:'done',outcome:{event:'推进'}};});
 const batch=vi.spyOn(HttpGateway.prototype,'memoryBatch');
 for(let i=0;i<6;i++){await generateAndWait(w,'行动'+i);expect(w.effectiveMemoryCount.value).toBe(i+1);}
 expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(6);expect(batch).not.toHaveBeenCalled();
});
it('失败记忆只在手动补记时重试，不阻断后续回合或丢失正文',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('失败',{name:'玩家',appearance:'',personality:'',background:''},'');
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'保存正文。'};yield{type:'done',outcome:{event:'推进'}};});
 vi.mocked(HttpGateway.prototype.memory).mockRejectedValueOnce(new Error('失败'));
 await generateAndWait(w,'一');await generateAndWait(w,'二');await generateAndWait(w,'三');
 expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(3);expect(w.pendingMemoryCount.value).toBe(1);expect(saved?.sessions[0].turns).toHaveLength(3);
 await w.retryMemory();expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(4);expect(w.pendingMemoryCount.value).toBe(0);
});
it('高轮数仍直接携带最近12轮原文，向量召回的旧记忆不会替换这段历史',async()=>{
 const w=await workspace();fill(w);w.preferences.vectorEnabled=true;await w.confirmAllApis();await w.create('长对话',{name:'玩家',appearance:'',personality:'',background:''},'');
 const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(r){yield{type:'delta',text:'原文-'+r.input};yield{type:'done',outcome:{event:'事件-'+r.input}};});
 for(let i=0;i<15;i++)await generateAndWait(w,'ROUND-'+i);
 const request=gen.mock.calls[14][0];expect(request.historyStart).toBe(2);expect(request.history).toHaveLength(24);expect(request.history[0].content).toBe('ROUND-2');expect(request.history.at(-1)?.content).toBe('原文-ROUND-13');expect(request.history.map(m=>m.content)).not.toContain('ROUND-1');expect(request.memories.length).toBeGreaterThan(0);expect(request.memories.length).toBeLessThanOrEqual(8);expect(w.pendingMemoryCount.value).toBe(0);expect(w.memories.value.every(m=>!!m.vector)).toBe(true);
});
it('随机事件跟随主 API 时不单独准备候选，接受后随主剧情一次生成',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('随机调用',{name:'玩家',appearance:'',personality:'',background:''},'');w.preferences.diceEnabled=true;vi.spyOn(crypto,'getRandomValues').mockImplementation(a=>{(a as Uint32Array)[0]=0;return a;});
 const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(r){yield{type:'delta',text:'正文事件。'};yield{type:'done',outcome:{event:'发生事件',characters:[],diceEvent:{direction:'negative',description:'局部停电'}}};});await generateAndWait(w,'行动');expect(HttpGateway.prototype.randomEvent).not.toHaveBeenCalled();await w.decideRandomEvent(0,true);expect(gen).toHaveBeenCalledTimes(1);expect(gen.mock.calls[0][0].specialEvent?.kind).toBe('突发事件');expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(1);
});
it('完整回复可以续写，原完整稿保留，失败也不会覆盖原稿',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('续写测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  const generate=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'delta',text:'原完整正文。'};yield {type:'done',outcome:{event:'原事件',characters:[]}};});
  await generateAndWait(w,'观察周围');const original=structuredClone(JSON.parse(JSON.stringify(w.active.value!.turns[0].variants[0])));
  generate.mockImplementationOnce(async function*(request){expect(request.continuation?.partial).toBe('原完整正文。');expect(request.generationType).toBe('continue');yield {type:'delta',text:'接着发生的新情节。'};yield {type:'done',outcome:{event:'续写事件',characters:[]}};});
  await generateAndWait(w,undefined,0,true);
  const turn=w.active.value!.turns[0];expect(turn.variants).toHaveLength(2);expect(turn.variants[0]).toEqual(original);expect(turn.variants[1].text).toBe('原完整正文。接着发生的新情节。');expect(turn.variants[1].status).toBe('complete');expect(w.problem.value).toBe('');
  generate.mockImplementationOnce(async function*(){yield {type:'delta',text:'未完成的延伸'};throw Error('合成连接中断');});
  await generateAndWait(w,undefined,0,true);expect(turn.variants).toHaveLength(3);expect(turn.variants[0]).toEqual(original);expect(turn.variants[1].status).toBe('complete');expect(turn.variants[2].status).toBe('incomplete');expect(w.problem.value).toContain('中断');
});
function fill(w:ReturnType<typeof useWorkspace>,id='main'){
  if(id==='main')fill(w,'embed');
  Object.assign(w.preferences.profiles.find(p=>p.id===id)!,{apiBaseUrl:`https://${id}.synthetic.example/v1`,model:`model-${id}`});w.credentials[id]=`synthetic-key-${id}`;
}
it('补全漏名单时保留本轮已经到场的角色，不回退到本轮开始前的空名单',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('补修名单',{name:'玩家',appearance:'',personality:'',background:''},'');
 for(const actor of w.active.value!.initial.characters)actor.present=false;
 const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'引导员走进房间。'};yield{type:'done',outcome:{event:'引导员到场',characters:[{id:'guide',present:true,affinity:5}]}};});
 await generateAndWait(w,'等待');expect(w.state.value!.characters.find(c=>c.id==='guide')?.present).toBe(true);
 gen.mockImplementationOnce(async function*(){yield{type:'done',outcome:{event:'补全',characters:[{id:'guide',present:false}],stateUpdate:{status:'partial',received:true,storyComplete:true,codes:['STATE_ROSTER_RETAINED']}}};});
 await w.repairState(0);
 expect(w.problem.value).toBe('');
 expect(w.state.value!.characters.find(c=>c.id==='guide')).toMatchObject({present:true,affinity:5});
 expect(w.active.value!.turns[0].variants[0].text).toBe('引导员走进房间。');expect(gen).toHaveBeenCalledTimes(2);
});
it('作者资料投影改变时已有摘要保留手动复核，不为历史摘要自动产生额外模型调用',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('作者资料更新',{name:'玩家',appearance:'',personality:'',background:''},'');
 const s=w.active.value!;s.initial.characters[0].identity='旧设定';
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'完整正文。'};yield{type:'done',outcome:{event:'正常交流'}};});
 await generateAndWait(w,'第一轮');expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(1);const text=w.memories.value[0].text;
 syncCharacterFacts(s,service.dataset,[{id:'guide',primaryGender:'男',identity:'作者修正后的学生身份'}]);
 await generateAndWait(w,'第二轮');expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(2);expect(s.memories[0].text).toBe(text);expect(s.memories[0].status).toBe('ready');
});
it('旧摘要指纹仍有效但缺少来源时，单条补记恢复来源，不重复调用文字模型',async()=>{
 const w=await workspace(1);fill(w);await w.confirmAllApis();await w.create('来源恢复',{name:'玩家',appearance:'',personality:'',background:''},'');
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'delta',text:'完成正文'};yield {type:'done',outcome:{event:'见面'}};});
 await generateAndWait(w,'行动');const s=w.active.value!,m=w.memories.value[0];s.memoryEngine='candidate';delete m.source;
 expect(w.pendingMemoryCount.value).toBe(1);const calls=vi.mocked(HttpGateway.prototype.memory).mock.calls.length;
 await w.retryMemory(m.id);expect(w.memories.value[0].source).toMatchObject({sourceVariantId:s.turns[0].variants[0].id});expect(w.pendingMemoryCount.value).toBe(0);expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(calls);
});
it('从学院重新打开当前存档和切换存档各自恢复输入草稿，不串到新的会话',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('甲',{name:'甲',appearance:'',personality:'',background:''},'');const a=w.sessionId.value;w.input.value='甲的草稿';
 w.open(a);expect(w.input.value).toBe('甲的草稿');await w.create('乙',{name:'乙',appearance:'',personality:'',background:''},'');const b=w.sessionId.value;expect(w.input.value).toBe('');w.input.value='乙的草稿';
 w.open(a);expect(w.input.value).toBe('甲的草稿');w.home();expect(w.input.value).toBe('');w.open(b);expect(w.input.value).toBe('乙的草稿');w.open(a);expect(w.input.value).toBe('甲的草稿');
});
it('后台补充的固定char性别同步到旧存档，玩家自定义性别保持原值',async()=>{
 const session=newSession('旧存档',{name:'我的user',primaryGender:'自定义',appearance:'',personality:'',background:''},'');session.sourceDataset=service.dataset;session.initial.characters=[{id:'one',name:'角色一',present:false}];
 vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue({version:1,preferences:defaults(),sessions:[session]});
 vi.mocked(HttpGateway.prototype.bootstrap).mockResolvedValueOnce({...service,characterFacts:[{id:'one',primaryGender:'女'}]});
 const w=await workspace();expect(w.sessions.value[0].initial.characters[0].primaryGender).toBe('女');expect(w.sessions.value[0].persona.primaryGender).toBe('自定义');
});
it('测活无需确认配置，使用选定主副或向量接口，不改变功能路由和已确认状态',async()=>{
  const w=await workspace();fill(w);fill(w,'aux');fill(w,'embed');const signal=new AbortController().signal;
  const probe=vi.spyOn(HttpGateway.prototype,'probe').mockResolvedValue({kind:'text',durationMs:10,visibleChars:2});
  for(const id of ['main','aux','embed'])await w.testProfile(w.preferences.profiles.find(p=>p.id===id)!,id==='embed',signal);
  expect(probe.mock.calls.map(([p,key,kind])=>[p.id,key,kind])).toEqual([['main','synthetic-key-main','text'],['aux','synthetic-key-aux','text'],['embed','synthetic-key-embed','embedding']]);
  expect(w.connectionReady(w.preferences.profiles[0])).toBe(false);expect(w.preferences.storyProfile).toBe('main');expect(w.apiReady.value).toBe(false);
});
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
it('建议随正文返回，显式设置间隔1轮时通过所选记忆接口整理',async()=>{
  const w=await workspace(1);const storyId=w.addProfile();fill(w);fill(w,'aux');fill(w,storyId);w.preferences.storyProfile=storyId;w.preferences.summaryProfile='aux';w.preferences.suggestionsProfile='main';
  await w.confirmAllApis();expect(w.apiIssues.value).toEqual([]);expect(w.apiReady.value).toBe(true);await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  expect(w.problem.value).toBe('');expect(w.active.value).toBeDefined();
  w.importPreset(JSON.stringify({temperature:0.4,prompts:[{identifier:'main',content:'中文叙事'}]}));
  expect(w.storyProfile.value?.temperature).toBe(0.4);expect(w.preferences.profiles[0].temperature).toBe(0.7);
  const generate=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'delta',text:'本轮正文'};yield {type:'done',outcome:{event:'事件推进',characters:[],suggestions:['查看告示牌','向值班员询问']}};});
  const utility=vi.spyOn(HttpGateway.prototype,'utility').mockResolvedValue(['建议或摘要']);
  for(let i=0;i<5;i++){await generateAndWait(w,`行动 ${i}`);expect(w.problem.value).toBe('');expect(w.active.value?.suggestions).toEqual(['查看告示牌','向值班员询问']);}
  expect(saved?.sessions[0].turns[0].variants[0].outcome?.suggestions).toEqual(['查看告示牌','向值班员询问']);
  expect(generate).toHaveBeenCalledTimes(5);expect(generate.mock.calls.every(([r,key])=>r.profile.id===storyId&&key===`synthetic-key-${storyId}`)).toBe(true);
  expect(utility).not.toHaveBeenCalled();expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(5);expect(vi.mocked(HttpGateway.prototype.memory).mock.calls.every(([,p,key])=>p.id==='aux'&&key==='synthetic-key-aux')).toBe(true);
  w.removeProfile(storyId);expect(w.preferences.storyProfile).toBe('main');
  w.removeProfile('aux');for(let i=5;i<10;i++)await generateAndWait(w,'继续 '+i);expect(utility).not.toHaveBeenCalled();expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(10);expect(vi.mocked(HttpGateway.prototype.memory).mock.calls.at(-1)?.[1].id).toBe('main');
});
it('开启向量时先要求确认，随后记忆编码使用独立模型并存入本地快照',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  w.preferences.vectorEnabled=false;expect(w.preferences.vectorEnabled).toBe(false);w.preferences.vectorEnabled=true;w.credentials.embed='changed-key';expect(w.apiReady.value).toBe(false);fill(w,'embed');await w.confirmAllApis();expect(w.apiReady.value).toBe(true);
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
it('模型漏写建议时不额外补写、不保留上轮建议，逐轮记忆仍正常生成',async()=>{
  const w=await workspace(1);fill(w);fill(w,'aux');w.preferences.suggestionsProfile='aux';await w.confirmAllApis();
  await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'测试正文'};yield{type:'done',outcome:{event:'推进',characters:[]}};});
  const utility=vi.spyOn(HttpGateway.prototype,'utility').mockImplementation(async task=>{if(task==='suggestions')throw new Error('synthetic-unavailable');return ['摘要保留'];});
  w.active.value!.suggestions=['过时建议'];
  for(let i=0;i<5;i++){await generateAndWait(w,'行动 '+i);expect(w.active.value?.suggestions).toEqual([]);expect(w.problem.value).toBe('');}
  expect(utility).not.toHaveBeenCalled();expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(5);expect(w.active.value?.memories.filter(m=>m.kind==='event'&&m.status==='ready')).toHaveLength(5);expect(w.active.value?.memories.some(m=>m.kind==='chapter')).toBe(false);
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
  const reopened=await workspace();expect(reopened.apiReady.value).toBe(false);expect(vi.mocked(HttpGateway.prototype.configure).mock.calls.map(([p])=>p.id)).toEqual([]);
  vi.mocked(IndexedDbRepository.prototype.writeApiCredentials).mockRejectedValue(new Error('本机写入失败'));await reopened.setRememberApiKeys(false);
  expect(reopened.problem.value).toBe('本机写入失败');expect(reopened.notice.value).not.toContain('已删除');
});

it('只配主 API 时摘要和建议均使用主 API，未选用副 API 草稿不拦截',async()=>{
  const w=await workspace(1);fill(w);w.preferences.profiles.find(p=>p.id==='aux')!.apiBaseUrl='https://draft.example/v1';await w.confirmAllApis();expect(w.apiReady.value).toBe(true);
  await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'测试正文'};yield{type:'done',outcome:{event:'推进',characters:[]}};});
  const utility=vi.spyOn(HttpGateway.prototype,'utility').mockResolvedValue(['测试建议摘要']);for(let i=0;i<5;i++)await generateAndWait(w,'行动 '+i);
  expect(utility).not.toHaveBeenCalled();expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(5);expect(vi.mocked(HttpGateway.prototype.memory).mock.calls.every(([,p,key])=>p.id==='main'&&key==='synthetic-key-main')).toBe(true);
});
it('AI 人设填写使用自己的选择，删除副 API 后所有选用它的功能回到主 API',async()=>{
  const w=await workspace();fill(w);fill(w,'aux');w.preferences.personaProfile='aux';await w.confirmAllApis();
  const assist=vi.spyOn(HttpGateway.prototype,'assistPersona').mockResolvedValue({name:'玩家',appearance:'',personality:'',background:''});w.newGameDraft.wish='一个学院新生';await w.assistPersona();
  expect(assist.mock.calls[0][2].id).toBe('aux');expect(assist.mock.calls[0][3]).toBe('synthetic-key-aux');
  w.preferences.storyProfile='aux';w.preferences.summaryProfile='aux';w.preferences.suggestionsProfile='aux';w.removeProfile('aux');
  expect([w.preferences.storyProfile,w.preferences.summaryProfile,w.preferences.suggestionsProfile,w.preferences.personaProfile]).toEqual(['main','main','main','main']);
});

it('命中后自动投骰并一次生成；重演保留骰点，关闭后新行动不带事件',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');w.preferences.diceEnabled=true;
  const random=vi.spyOn(crypto,'getRandomValues').mockImplementation(array=>{(array as Uint32Array)[0]=0;return array;});
  const generate=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(r){yield{type:'delta',text:'剧情'};yield{type:'done',outcome:{event:'推进',characters:[],...(r.dice?{diceEvent:{direction:'negative' as const,description:'资料缺页，需要补办'}}:{})}};});vi.spyOn(HttpGateway.prototype,'utility').mockResolvedValue(['建议']);
  await generateAndWait(w,'第一次行动');expect(generate).toHaveBeenCalledTimes(1);expect(w.active.value?.turns[0].variants).toHaveLength(1);expect(w.active.value?.turns[0].randomEvent?.status).toBe('accepted');expect(generate.mock.calls[0][0].specialEvent?.title).toBe('突发事件');expect(w.active.value?.turns[0].dice?.value).toBe(1);expect(w.memories.value[0].text).toContain('资料缺页');
  w.preferences.diceEnabled=false;await generateAndWait(w,undefined,0);expect(generate.mock.calls[1][0].dice?.value).toBe(1);expect(random).toHaveBeenCalledTimes(3);
  await generateAndWait(w,'关闭骰子后的行动');expect(generate.mock.calls[2][0].dice).toBeUndefined();expect(w.active.value?.turns[1].variants[0].outcome?.diceEvent).toBeUndefined();
});

it('未命中不请求事件；明确配置副接口时命中后自动衔接正文',async()=>{
  const w=await workspace();fill(w);fill(w,'aux');w.preferences.diceEnabled=true;w.preferences.randomEventProfile='aux';await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  let value=50;const rng=vi.spyOn(crypto,'getRandomValues').mockImplementation(a=>{(a as Uint32Array)[0]=value;return a;});
  const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'正常正文'};yield{type:'done',outcome:{event:'正常推进',characters:[]}};});vi.spyOn(HttpGateway.prototype,'utility').mockResolvedValue(['建议']);
  await generateAndWait(w,'未命中');expect(HttpGateway.prototype.randomEvent).not.toHaveBeenCalled();expect(gen).toHaveBeenCalledTimes(1);expect(gen.mock.calls[0][0].dice).toBeUndefined();
  value=0;await generateAndWait(w,'命中');expect(HttpGateway.prototype.randomEvent).toHaveBeenCalledTimes(1);expect(vi.mocked(HttpGateway.prototype.randomEvent).mock.calls[0][1].id).toBe('aux');expect(vi.mocked(HttpGateway.prototype.randomEvent).mock.calls[0][0].history.map(m=>m.content)).toEqual(['未命中','正常正文']);expect(gen).toHaveBeenCalledTimes(2);expect(gen.mock.calls[1][0].specialEvent?.title).toBe('意外来信');expect(gen.mock.calls[1][0].dice?.value).toBe(1);expect(gen.mock.calls[1][0].generationType).toBe('normal');expect(rng).toHaveBeenCalledTimes(4);await w.decideRandomEvent(1,true);expect(gen).toHaveBeenCalledTimes(2);
});
it('候选失败可同类重试或跳过，不重新抽概率，不提前生成正文',async()=>{
  const w=await workspace();fill(w);fill(w,'aux');w.preferences.randomEventProfile='aux';await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');w.preferences.diceEnabled=true;
  const rng=vi.spyOn(crypto,'getRandomValues').mockImplementation(a=>{(a as Uint32Array)[0]=2;return a;});vi.mocked(HttpGateway.prototype.randomEvent).mockRejectedValue(new Error('候选请求失败'));
  const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'正常正文'};yield{type:'done',outcome:{event:'正常推进',characters:[]}};});vi.spyOn(HttpGateway.prototype,'utility').mockResolvedValue(['建议']);
  await generateAndWait(w,'行动');expect(w.problem.value).toContain('候选请求失败');expect(w.active.value!.turns[0].randomEvent).toEqual({status:'failed',kind:'危机事件'});expect(gen).not.toHaveBeenCalled();await generateAndWait(w,undefined,0);expect(HttpGateway.prototype.randomEvent).toHaveBeenCalledTimes(2);expect(rng).toHaveBeenCalledTimes(2);
  await w.decideRandomEvent(0,false);expect(gen).toHaveBeenCalledTimes(1);expect(gen.mock.calls[0][0].dice).toBeUndefined();expect(w.active.value!.turns[0].randomEvent?.status).toBe('skipped');
});
it('刷新恢复旧版待选事件，继续时自动投骰，连续点击不重掷',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');w.preferences.diceEnabled=true;
  const rng=vi.spyOn(crypto,'getRandomValues').mockImplementation(a=>{(a as Uint32Array)[0]=0;return a;});await generateAndWait(w,'行动');const savedPending=structuredClone(saved!);const oldTurn=savedPending.sessions[0].turns[0];oldTurn.randomEvent={status:'pending',proposal:{kind:'突发事件',title:'突发事件',description:'旧版候选'}};delete oldTurn.dice;oldTurn.variants=[];oldTurn.selected=0;const eventCalls=vi.mocked(HttpGateway.prototype.randomEvent).mock.calls.length;
  vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue(savedPending);vi.mocked(IndexedDbRepository.prototype.readApiCredentials).mockResolvedValue(privateSaved);const reopened=await workspace();expect(reopened.active.value).toBeUndefined();reopened.open(savedPending.sessions[0].id);expect(reopened.pendingRandomEvent.value).toBe(true);
  // Reload does not automatically call a model or draw again.
  expect(HttpGateway.prototype.randomEvent).toHaveBeenCalledTimes(eventCalls);expect(rng).toHaveBeenCalledTimes(3);
  const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'负面正文'};yield{type:'done',outcome:{event:'不利推进',characters:[],diceEvent:{direction:'negative',description:'来信带来坏消息'}}};});vi.spyOn(HttpGateway.prototype,'utility').mockResolvedValue(['建议']);await Promise.all([reopened.generate(undefined,0),reopened.generate(undefined,0)]);expect(gen).toHaveBeenCalledTimes(1);expect(rng).toHaveBeenCalledTimes(4);expect(gen.mock.calls[0][0].specialEvent?.title).toBe('突发事件');
});

it('三次续写未完成保留正文和原状态，不提交记忆或调用建议摘要',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  expect(w.canContinue.value).toBe(true);const initial=JSON.stringify(w.state.value);const utility=vi.spyOn(HttpGateway.prototype,'utility');
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){
    yield{type:'delta',text:'保留的前半句。'};
    for(let attempt=1;attempt<=3;attempt++){yield{type:'continuation',attempt,maxAttempts:3};expect(w.continuationAttempt.value).toBe(attempt);expect(w.active.value?.turns[0].variants[0].status).toBe('incomplete');}
    throw new Error('已自动续写3次，仍未确认完整结束。');
  });
  await generateAndWait(w,'行动');const v=w.active.value!.turns[0].variants[0];expect(v.text).toBe('保留的前半句。');expect(v.status).toBe('incomplete');expect(v.outcome).toBeUndefined();expect(JSON.stringify(w.state.value)).toBe(initial);expect(w.memories.value).toHaveLength(0);expect(utility).not.toHaveBeenCalled();expect(w.problem.value).toContain('3次');expect(w.continuationAttempt.value).toBe(0);expect(saved?.sessions[0].turns[0].variants[0].text).toBe(v.text);
});
it('手动续写复用原稿与原骰点，传递断点并且只在完成后记忆一次',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');w.preferences.diceEnabled=true;
  const random=vi.spyOn(crypto,'getRandomValues').mockImplementation(array=>{(array as Uint32Array)[0]=0;return array;});
  const generate=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'已有正文。'};throw new Error('截断');});
  const utility=vi.spyOn(HttpGateway.prototype,'utility').mockResolvedValue(['建议']);await generateAndWait(w,'原行动');await w.decideRandomEvent(0,true);const turn=w.active.value!.turns[0],id=turn.variants[0].id;
  generate.mockImplementation(async function*(r){expect(r.continuation?.partial).toBe('已有正文。');expect(r.generationType).toBe('continue');expect(r.input).toBe('原行动');expect(r.dice).toBeUndefined();yield{type:'delta',text:'接上后半句。'};yield{type:'done',outcome:{event:'补写结束',characters:[]}};});
  await generateAndWait(w,undefined,0,true);expect(w.problem.value).toBe('');expect(turn.variants).toHaveLength(1);expect(turn.variants[0].id).toBe(id);expect(turn.variants[0].text).toBe('已有正文。接上后半句。');expect(turn.variants[0].status).toBe('complete');expect(w.active.value?.turns).toHaveLength(1);expect(random).toHaveBeenCalledTimes(3);expect(w.memories.value).toHaveLength(1);expect(utility).not.toHaveBeenCalled();
});
it('自动续写中主动停止，不接收随后到达的状态或启动辅助任务',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  const utility=vi.spyOn(HttpGateway.prototype,'utility');vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'停止前正文。'};yield{type:'continuation',attempt:1,maxAttempts:3};w.stop();yield{type:'done',outcome:{event:'不应提交',characters:[]}};});
  await generateAndWait(w,'行动');expect(w.active.value?.turns[0].variants[0].status).toBe('incomplete');expect(w.active.value?.turns[0].variants[0].text).toBe('停止前正文。');expect(w.memories.value).toHaveLength(0);expect(utility).not.toHaveBeenCalled();expect(w.busy.value).toBe(false);
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
it('旧失败稿只补状态时保持原稿、骰点和正文，完成后仅提交一次记忆',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('补修测试',{name:'玩家',appearance:'',personality:'',background:''},'');w.preferences.diceEnabled=true;const random=vi.spyOn(crypto,'getRandomValues').mockImplementation(array=>{(array as Uint32Array)[0]=0;return array;});
  const generate=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'完整正文，资料缺页需要补办。'};throw Error('旧版状态校验失败');});const utility=vi.spyOn(HttpGateway.prototype,'utility').mockResolvedValue(['建议']);await generateAndWait(w,'原行动');await w.decideRandomEvent(0,true);const v=w.active.value!.turns[0].variants[0],id=v.id,text=v.text;
  generate.mockImplementation(async function*(r){expect(r.continuation).toEqual({partial:text,mode:'state'});expect(r.dice).toBeUndefined();expect(w.repairingState.value).toBe(true);yield{type:'delta',text:'不能追加的新剧情'};yield{type:'done',outcome:{event:'补齐状态',characters:[]}};});
  await w.repairState(0);expect(w.problem.value).toBe('');expect(v.text).toBe(text);expect(v.id).toBe(id);expect(v.status).toBe('complete');expect(w.active.value!.turns[0].variants).toHaveLength(1);expect(random).toHaveBeenCalledTimes(3);expect(w.memories.value).toHaveLength(1);expect(utility).toHaveBeenCalledTimes(0);expect(w.repairingState.value).toBe(false);
});
it('自动补修进度不提交状态，失败后保留正文、旧状态和可重试的稿件',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('失败补修',{name:'玩家',appearance:'',personality:'',background:''},'');const initial=JSON.stringify(w.state.value);const utility=vi.spyOn(HttpGateway.prototype,'utility');
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'先保留这段正文。'};for(let attempt=1;attempt<=3;attempt++){yield{type:'repair',attempt,maxAttempts:3,reason:'论坛数据格式错误'};expect(w.repairingState.value).toBe(true);expect(w.continuationAttempt.value).toBe(attempt);expect(w.memories.value).toHaveLength(0);}throw Error('补修失败：论坛数据格式错误');});
  await generateAndWait(w,'行动');expect(w.active.value!.turns[0].variants[0].text).toBe('先保留这段正文。');expect(w.active.value!.turns[0].variants[0].status).toBe('incomplete');expect(JSON.stringify(w.state.value)).toBe(initial);expect(utility).not.toHaveBeenCalled();expect(w.problem.value).toContain('论坛');expect(w.repairingState.value).toBe(false);
});
it('实际预设入口保存独立参数，复制与重开保留，切换不改模型设置，固定条目不可删',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();w.importPreset(JSON.stringify({name:'预设甲',temperature:0.2,openai_max_tokens:2100,prompts:[{identifier:'main',content:'正文要求'}]}));const first=w.currentPreset.value;expect(w.storyProfile.value?.temperature).toBe(0.2);expect(w.preferences.profiles[0].temperature).toBe(0.7);
  w.importPreset(JSON.stringify({name:'预设乙',temperature:1.1,openai_max_tokens:5100,prompts:[{identifier:'main',content:'另一份要求'}]}));const second=w.currentPreset.value;expect(w.storyProfile.value?.maxTokens).toBe(5100);w.preferences.activePreset=first;expect(w.storyProfile.value?.maxTokens).toBe(2100);
  const id=w.presetEntries.value[0].id;w.removePresetEntry(id);expect(w.presetEntries.value[0].id).toBe(id);w.duplicatePresetSet();expect(w.currentPreset.value).not.toBe(first);expect(w.presetParameters.value.temperature).toBe(0.2);w.presetParameters.value.temperature=0.5;w.preferences.activePreset=first;expect(w.storyProfile.value?.temperature).toBe(0.2);
  await w.save();vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue(saved);const reopened=await workspace();reopened.preferences.activePreset=second;expect(reopened.storyProfile.value?.temperature).toBe(1.1);expect(reopened.preferences.profiles[0].temperature).toBe(0.7);
});
it('预设正则随复制和浏览器备份保留，删除预设不删除其他预设的规则',async()=>{
  const w=await workspace();w.importPreset(JSON.stringify({prompts:[{identifier:'main',content:'正文'}],extensions:{regex_scripts:[{id:'r',scriptName:'显示',findRegex:'正文',replaceString:'<b>正文</b>',placement:[2],markdownOnly:true}]}}));
  const original=w.currentPreset.value;expect(w.preferences.regexRules).toHaveLength(1);
  w.duplicatePresetSet();const duplicate=w.currentPreset.value;expect(duplicate).not.toBe(original);expect(w.preferences.regexRules).toHaveLength(2);
  expect(w.preferences.regexRules?.find(r=>r.setId===duplicate)?.replaceString).toBe('<b>正文</b>');
  await w.save();expect(saved?.preferences.regexRules).toHaveLength(2);
  w.removePresetSet();expect(w.preferences.regexRules).toHaveLength(1);expect(w.preferences.regexRules?.[0].setId).toBe(original);
});
it('新版论坛一次请求五条回复，绑定同一用户评论且重试不重复追加',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('论坛多回复',{name:'玩家',appearance:'',personality:'',background:''},'');
 const session=w.active.value!,v={id:'batch-v',text:'正文',status:'incomplete' as const,createdAt:''};session.turns.push({id:'batch-t',input:'行动',variants:[v],selected:0});finishVariant(session,0,v,{event:'事件',forum:[{id:'p',authorName:'楼主',content:'训练讨论',comments:[{id:'c',authorName:'路人甲',content:'我也去'}]}]});
 const key=w.forum.value[0].key,before=JSON.stringify(w.state.value);w.preferences.forumReplyEnabled=true;await nextTick();
 const replies=Array.from({length:5},(_,i)=>({authorId:'npc'+i,authorName:'公开发言人'+i,content:'不同回应'+i}));const reply=vi.spyOn(HttpGateway.prototype,'forumReply').mockResolvedValue(replies);
 await w.replyToForum(key,'陆离怎么看？');const list=session.forumActivity![key].replies;expect(list).toHaveLength(6);expect(list.filter(r=>r.kind==='ai').every(r=>r.replyTo===list[0].id)).toBe(true);expect(reply.mock.calls[0][0].minReplies).toBe(5);expect(JSON.stringify(w.state.value)).toBe(before);
 await w.retryForumReply(key,list[0].id);expect(reply).toHaveBeenCalledTimes(1);expect(list).toHaveLength(6);
});
it('论坛AI回复默认关闭不请求，开启后只用指定副API；混合评论可备份且不改变主线状态',async()=>{
  const w=await workspace();fill(w);fill(w,'aux');await w.confirmAllApis();await w.create('论坛',{name:'玩家',appearance:'',personality:'',background:''},'');
  const session=w.active.value!,v={id:'v',text:'正文',status:'incomplete' as const,createdAt:''};session.turns.push({id:'t',input:'行动',variants:[v],selected:0});finishVariant(session,0,v,{event:'事件',forum:[{id:'post',authorName:'路人',content:'食堂上新了'}]});
  const key=w.forum.value[0].key,before=JSON.stringify(w.state.value),reply=vi.spyOn(HttpGateway.prototype,'forumReply').mockResolvedValue({authorId:'guide',authorName:'角色甲',content:'我推荐面条。'});
  expect(w.preferences.forumReplyEnabled).toBe(false);await w.replyToForum(key,'第一条评论');expect(reply).not.toHaveBeenCalled();
  w.preferences.forumReplyEnabled=true;w.preferences.forumReplyProfile='aux';await nextTick();await w.replyToForum(key,'哪道菜好吃？');
  expect(reply).toHaveBeenCalledTimes(1);expect(reply.mock.calls[0][1].id).toBe('aux');expect(reply.mock.calls[0][2]).toBe('synthetic-key-aux');expect(session.forumActivity?.[key].replies.at(-1)).toMatchObject({kind:'ai',authorName:'角色甲',text:'我推荐面条。'});expect(JSON.stringify(w.state.value)).toBe(before);
  await w.save();const restored=JSON.parse(backup(saved!));expect(restored.sessions[0].forumActivity[key].replies.at(-1).replyTo).toBe(session.forumActivity?.[key].replies.at(-2)?.id);expect(restored.preferences.forumReplyProfile).toBe('aux');
});
it('论坛AI失败仍保留用户评论，不重复发送；关闭开关会取消进行中的回复',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('论坛失败',{name:'玩家',appearance:'',personality:'',background:''},'');
  const session=w.active.value!,v={id:'v',text:'正文',status:'incomplete' as const,createdAt:''};session.turns.push({id:'t',input:'行动',variants:[v],selected:0});finishVariant(session,0,v,{event:'事件',forum:[{id:'post',authorName:'路人',content:'动态'}]});const key=w.forum.value[0].key;
  w.preferences.forumReplyEnabled=true;await nextTick();const reply=vi.spyOn(HttpGateway.prototype,'forumReply').mockRejectedValue(new Error('接口失败'));expect(await w.replyToForum(key,'保留评论')).toBe(true);expect(session.forumActivity?.[key].replies).toHaveLength(1);expect(w.forumReplyError.value).toContain('已保留');
  reply.mockImplementation(async(_input,_profile,_key,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('stop','AbortError')),{once:true})));
  const pending=w.replyToForum(key,'第二条');await vi.waitFor(()=>expect(w.workingForumReply.value).toBe(key));w.preferences.forumReplyEnabled=false;await nextTick();await pending;expect(w.workingForumReply.value).toBe('');expect(session.forumActivity?.[key].replies).toHaveLength(2);
});
it('原评论可手动重试AI，重复提示仅一次，不重发评论或生成重复回复',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('重试论坛',{name:'玩家',appearance:'',personality:'',background:''},'');
  const session=w.active.value!,v={id:'v',text:'正文',status:'incomplete' as const,createdAt:''};session.turns.push({id:'t',input:'行动',variants:[v],selected:0});finishVariant(session,0,v,{event:'推进',forum:[{id:'p',authorName:'路人',content:'动态'}]});const key=w.forum.value[0].key;w.preferences.forumReplyEnabled=true;await nextTick();
  const reply=vi.spyOn(HttpGateway.prototype,'forumReply').mockRejectedValue(new Error('格式不正确，你的评论已保留。'));await w.replyToForum(key,'我的评论');expect(w.forumReplyError.value.match(/你的评论已保留/g)).toHaveLength(1);const parent=session.forumActivity![key].replies[0];
  reply.mockResolvedValue({authorId:'guide',authorName:'角色甲',content:'收到你的评论。'});await w.retryForumReply(key,parent.id);expect(session.forumActivity![key].replies).toHaveLength(2);expect(reply.mock.calls[1][0].comments.at(-1)?.content).toBe('我的评论');expect(w.forumReplyError.value).toBe('');await w.retryForumReply(key,parent.id);expect(reply).toHaveBeenCalledTimes(2);expect(session.forumActivity![key].replies).toHaveLength(2);
  w.preferences.forumReplyEnabled=false;await nextTick();await w.retryForumReply(key,'unknown');expect(reply).toHaveBeenCalledTimes(2);
});
it('布局修改通过现有自动保存恢复，重设不修改剧情和API',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();w.preferences.layout={left:320,right:400,panels:{player:{height:240},'theater-1':{width:310,height:420}}};await vi.advanceTimersByTimeAsync(650);expect(saved?.preferences.layout).toEqual(w.preferences.layout);vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue(saved);const reopened=await workspace();expect(reopened.preferences.layout).toEqual(w.preferences.layout);expect(reopened.sessions.value).toEqual([]);expect(reopened.preferences.profiles[0].model).toBe('model-main');
});
it('补全旧精神体日记时替换旧动作片段，保留主线正文和已有论坛',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('旧日记',{name:'玩家',appearance:'',personality:'',background:'',spiritAnimal:'白猫'},'');w.preferences.theaters![3]={slot:4,enabled:true,kind:'custom',title:'精神体日记',templateId:'spirit',instruction:'写第一人称日记'};
  const session=w.active.value!,v={id:'v',text:'固定正文。',status:'incomplete' as const,createdAt:''};session.turns.push({id:'t',input:'行动',variants:[v],selected:0});finishVariant(session,0,v,{event:'原事件',forum:[{id:'post',authorName:'路人',content:'原帖'}],theaters:[{slot:4,kind:'custom',title:'精神体日记',content:'白猫甩了甩尾巴。'}]});
  vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'done',outcome:{event:'新摘要不替换',characters:[],theaters:[{slot:4,kind:'custom',title:'精神体日记',content:'今天我偷偷留了半块鱼干。',diary:{ownerId:'player',ownerName:'玩家',spiritAnimal:'白猫',title:'半块鱼干',content:'今天我偷偷留了半块鱼干。'}}]}};});await w.repairState(0);expect(w.problem.value).toBe('');expect(v.text).toBe('固定正文。');expect(w.forum.value[0].content).toBe('原帖');expect(w.theaters.value.find(s=>s.slot===4)?.diary?.title).toBe('半块鱼干');expect(w.memories.value).toHaveLength(1);
});
it('已完成旧回合可补全状态和小剧场，保留正文论坛及失败时的有效状态，不重复记忆或调用建议',async()=>{
  const w=await workspace();fill(w);await w.confirmAllApis();await w.create('旧回合补全',{name:'玩家',appearance:'',personality:'',background:''},'');const session=w.active.value!,v={id:'v',text:'固定正文。',status:'incomplete' as const,createdAt:''};session.turns.push({id:'t',input:'行动',variants:[v],selected:0});
  finishVariant(session,0,v,{event:'原事件',forum:[{id:'original',authorName:'路人',content:'保留原帖'}]});const utility=vi.spyOn(HttpGateway.prototype,'utility');
  const generate=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(r){expect(r.continuation?.mode).toBe('state');yield {type:'delta',text:'不能加入正文'};yield {type:'done',outcome:{event:'不替换原事件',characters:[{id:'guide',affinity:45,spiritThought:'想打招呼'}],forum:[{id:'changed',authorName:'路人',content:'不替换原帖'}],theaters:[{slot:2,kind:'group',title:'群聊',content:'独立对话'}]}};});
  await w.repairState(0);expect(w.problem.value).toBe('');expect(v.text).toBe('固定正文。');expect(w.forum.value[0].content).toBe('保留原帖');expect(w.state.value?.characters[0].affinity).toBe(45);expect(w.memories.value).toHaveLength(1);expect(w.theaters.value).toHaveLength(1);expect(utility).not.toHaveBeenCalled();
  const before=JSON.stringify(w.state.value);generate.mockImplementation(async function*(){throw new Error('补全失败');});await w.repairState(0);expect(JSON.stringify(w.state.value)).toBe(before);expect(w.active.value!.turns[0].variants[0].status).toBe('complete');expect(w.memories.value).toHaveLength(1);
});

it('显式间隔1轮时记忆使用副API并建索引，下一轮带人物检索和约定',async()=>{
 const w=await workspace(1);fill(w);w.preferences.vectorEnabled=true;fill(w,'aux');fill(w,'embed');w.preferences.summaryProfile='aux';w.preferences.vectorEnabled=true;await w.confirmAllApis();await w.create('记忆',{name:'玩家',appearance:'',personality:'',background:''},'');
 const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'前文'.repeat(600)+'最后获得一份地图。'};yield{type:'done',outcome:{event:'获得地图',characters:[]}};});
 vi.mocked(HttpGateway.prototype.memory).mockImplementation(async input=>normalizeMemoryResult({participants:['玩家','向导'],time:'578.09.01',location:'报到台',userActions:['收到地图'],charActions:[{name:'向导',actions:['交付地图']}],gains:['地图'],losses:[],commitments:input.priorCommitments.length?[]:[{id:'new',participants:['玩家','向导'],content:'明天一起去图书馆',deadline:'明天',status:'open'}],affinityChanges:[]},input));
 const embed=vi.spyOn(HttpGateway.prototype,'embed').mockImplementation(async texts=>texts.map(()=>[1,0]));const utility=vi.spyOn(HttpGateway.prototype,'utility');
 await generateAndWait(w,'找向导');expect(embed).toHaveBeenCalledTimes(1);expect(w.pendingMemoryCount.value).toBe(0);expect(w.memories.value[0].record?.gains).toEqual(['地图']);expect(w.vectorStatus(w.memories.value[0])).toBe('已建索引');
 await generateAndWait(w,'之前那件事');expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(2);expect(vi.mocked(HttpGateway.prototype.memory).mock.calls[0][0].story).toContain('最后获得一份地图');expect(vi.mocked(HttpGateway.prototype.memory).mock.calls.every(([,p,key])=>p.id==='aux'&&key==='synthetic-key-aux')).toBe(true);
 expect(embed).toHaveBeenCalledTimes(3);expect(embed.mock.calls[1][0][0]).toContain('相关人物');expect(gen.mock.calls[1][0].memories.some(t=>t.includes('明天一起去图书馆'))).toBe(true);expect(gen.mock.calls[1][0].memories.some(t=>t.includes('获得：地图'))).toBe(true);expect(utility).not.toHaveBeenCalled();expect(saved?.sessions[0].memories.filter(m=>m.record)).toHaveLength(2);
});
it('记忆接口失败保留完整正文与待补记任务，单独重试只更新原记忆一次',async()=>{
 const w=await workspace(1);fill(w);await w.confirmAllApis();await w.create('补记',{name:'玩家',appearance:'',personality:'',background:''},'');
 const generate=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'正文已经完成。'};yield{type:'done',outcome:{event:'发生事件',characters:[]}};});const normal=vi.mocked(HttpGateway.prototype.memory).getMockImplementation()!;vi.mocked(HttpGateway.prototype.memory).mockRejectedValueOnce(new Error('记忆服务暂不可用'));
 await generateAndWait(w,'行动');const m=w.memories.value[0];expect(w.active.value?.turns[0].variants[0].status).toBe('complete');expect(m.status).toBe('failed');expect(w.pendingMemoryCount.value).toBe(1);expect(w.active.value?.memoryTasks?.[0].status).toBe('failed');expect(w.active.value?.memoryTasks?.[0].error).toContain('正文已保留');
 vi.mocked(HttpGateway.prototype.memory).mockImplementation(normal);await w.retryMemory(m.id);expect(generate).toHaveBeenCalledTimes(1);expect(w.memories.value).toHaveLength(1);expect(w.memories.value[0].id).toBe(m.id);expect(w.memories.value[0].status).toBe('ready');expect(w.pendingMemoryCount.value).toBe(0);
});
it('向量失败不撤销文字记忆，重新建立索引不再次调用记忆或剧情API',async()=>{
 const w=await workspace(1);fill(w);fill(w,'embed');w.preferences.vectorEnabled=true;await w.confirmAllApis();await w.create('索引',{name:'玩家',appearance:'',personality:'',background:''},'');
 const generate=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'获得一份资料。'};yield{type:'done',outcome:{event:'获得资料',characters:[]}};});const embed=vi.spyOn(HttpGateway.prototype,'embed').mockRejectedValue(new Error('向量离线'));
 await generateAndWait(w,'领取资料');const m=w.memories.value[0];expect(m.status).toBe('ready');expect(m.record).toBeDefined();expect(w.vectorStatus(m)).toBe('索引失败');expect(saved?.sessions[0].memories[0].record).toBeDefined();
 embed.mockResolvedValue([[1,0]]);await w.indexMemories();expect(w.vectorStatus(m)).toBe('已建索引');expect(generate).toHaveBeenCalledTimes(1);expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(1);
});
it('停止记忆整理会保留待补记任务，迟到结果不会提交或重新生成正文',async()=>{
 const w=await workspace(1);fill(w);await w.confirmAllApis();await w.create('停止',{name:'玩家',appearance:'',personality:'',background:''},'');
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'正文。'};yield{type:'done',outcome:{event:'完成',characters:[]}};});const normal=vi.mocked(HttpGateway.prototype.memory).getMockImplementation()!;let release:()=>void=()=>{};
 vi.mocked(HttpGateway.prototype.memory).mockImplementation(async (...args)=>{await new Promise<void>(resolve=>release=resolve);return normal(...args.slice(0,3) as [any,any,string],new AbortController().signal);});
 const task=w.generate('行动');await vi.waitFor(()=>expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(1));w.stopMemory();release();await task;await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));expect(w.active.value?.turns[0].variants[0].status).toBe('complete');expect(w.memories.value[0].status).toBe('pending');expect(w.memories.value[0].record).toBeUndefined();expect(saved?.sessions[0].memories[0].status).toBe('pending');
});
it('旧记忆补记读取完整原问答且按回合传递约定，打开存档不自动调用模型',async()=>{
 const session=newSession('旧存档',{name:'玩家',appearance:'',personality:'',background:''},'');session.sourceDataset=service.dataset;
 for(let i=0;i<2;i++){const v={id:'old-v'+i,text:'正文'.repeat(300)+'末尾重要结果'+i,status:'incomplete' as const,createdAt:''};session.turns.push({id:'old-t'+i,input:'原行动'+i,variants:[v],selected:0});finishVariant(session,i,v,{event:'原事件'+i});delete session.memories[i].status;delete session.memories[i].sourceFingerprint;session.memories[i].text='损坏的旧摘要<Slate>标签</Slate>';}
 vi.mocked(IndexedDbRepository.prototype.read).mockResolvedValue({version:1,sessions:[session],preferences:defaults()});const w=await workspace();expect(HttpGateway.prototype.memory).not.toHaveBeenCalled();fill(w);await w.confirmAllApis();w.open(session.id);expect(w.pendingMemoryCount.value).toBe(2);
 vi.mocked(HttpGateway.prototype.memory).mockImplementation(async input=>normalizeMemoryResult({participants:['玩家'],time:'未明确',location:'未明确',userActions:[input.input],charActions:[],gains:[],losses:[],commitments:input.priorCommitments.length?[]:[{id:'new',participants:['玩家'],content:'明天报到',deadline:'明天',status:'open'}],affinityChanges:[]},input));
 await w.retryMemory(w.memories.value[0].id);await w.retryMemory(w.memories.value[1].id);expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(2);expect(vi.mocked(HttpGateway.prototype.memory).mock.calls[0][0].story).toContain('末尾重要结果0');expect(vi.mocked(HttpGateway.prototype.memory).mock.calls[1][0].priorCommitments[0].content).toBe('明天报到');expect(w.memories.value.every(m=>m.status==='ready'&&!m.text.includes('<Slate>'))).toBe(true);expect(w.memories.value).toHaveLength(2);
});
it('补修状态未改变记忆事实时不重复整理已保存的记忆',async()=>{
 const w=await workspace(1);fill(w);await w.confirmAllApis();await w.create('补修',{name:'玩家',appearance:'',personality:'',background:''},'');const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'固定正文。'};yield{type:'done',outcome:{event:'同一事件',characters:[]}};});await generateAndWait(w,'行动');const id=w.memories.value[0].id;
 gen.mockImplementation(async function*(){yield{type:'done',outcome:{event:'同一事件',characters:[]}};});await w.repairState(0);expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(1);expect(w.memories.value).toHaveLength(1);expect(w.memories.value[0].id).toBe(id);expect(w.memories.value[0].status).toBe('ready');
});
it('补全替换旧的空群聊，并保留本轮已有的有效角色状态',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('修复群聊',{name:'玩家',appearance:'',background:'',personality:''},'');
 const s=w.active.value!;s.initial.characters[0].identity='学生会 会长';const v={id:'v',text:'已经完成的正文。',status:'incomplete' as const,createdAt:''};s.turns.push({id:'t',input:'行动',selected:0,variants:[v]});
 finishVariant(s,0,v,{event:'原事件',characters:[{id:'guide',present:true,affinity:42,identity:'学生会 会长'}],theaters:[{slot:2,kind:'group',title:'群聊',content:'旧说明，没有群聊消息'}]});
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'done',outcome:{event:'补齐',characters:[{id:'guide',present:true}],theaters:[{slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'同学',content:'新群聊消息'}]}]}};});
 await w.repairState(0);expect(w.problem.value).toBe('');expect(w.theaters.value[0].messages?.[0].content).toBe('新群聊消息');expect(w.state.value?.characters[0].affinity).toBe(42);expect(w.state.value?.characters[0].identity).toBe('学生会 会长');expect(v.text).toBe('已经完成的正文。');
});

it('世界书导入绑定新游戏、每轮仅注入命中条目且不增加额外模型调用',async()=>{
 const w=await workspace(1);fill(w);await w.confirmAllApis();
 w.importUserWorldbook(JSON.stringify({entries:{0:{key:['学院'],content:'这是测试学院的公开补充。'},1:{key:['别的地点'],content:'本轮不该发送'}}}),'用户世界书.json');
 expect(w.preferences.worldbooks).toHaveLength(1);expect(w.boundWorldbookIds.value).toHaveLength(1);
 await w.create('世界书测试',{name:'玩家',appearance:'',personality:'',background:''},'');expect(w.active.value?.worldbookIds).toEqual(w.preferences.defaultWorldbookIds);
 const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'你走进学院。'};yield{type:'done',outcome:{event:'进入学院',characters:[]}};});
 await generateAndWait(w,'走进学院');expect(gen).toHaveBeenCalledTimes(1);expect(gen.mock.calls[0][0].worldInfo?.map(e=>e.content)).toEqual(['这是测试学院的公开补充。']);expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(1);
 w.bindWorldbook(w.worldbooks.value[0].id,false);await generateAndWait(w,'观察学院');expect(gen.mock.calls[1][0].worldInfo).toEqual([]);expect(w.preferences.defaultWorldbookIds).toHaveLength(1);
});
it('条目验证失败不会清除错误或覆盖原书，删除书时解除所有绑定',async()=>{
 const w=await workspace();w.addWorldbook();const b=w.worldbooks.value[0];
 w.saveWorldEntry(b.id,{...newWorldEntry('invalid'),depth:-1});expect(w.problem.value).toContain('世界书');expect(w.worldbooks.value[0].entries).toHaveLength(0);
 w.removeWorldbook(b.id);expect(w.worldbooks.value).toEqual([]);expect(w.boundWorldbookIds.value).toEqual([]);
});

it('变量提示词随剧情发送，旧副API配置不再传递第二份凭据',async()=>{const w=await workspace();fill(w);fill(w,'aux');w.preferences.stateProfile='aux';await w.confirmAllApis();await w.create('状态路由',{name:'玩家',appearance:'',personality:'',background:''},'');const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'正文。'};yield{type:'done',outcome:{event:'推进',characters:[]}};});await generateAndWait(w,'观察');expect(gen.mock.calls[0]).toHaveLength(3);w.preferences.stateProfile='main';await generateAndWait(w,'继续');expect(gen.mock.calls[1]).toHaveLength(3);});
it('switching reading panels while generating does not abort the request or change its target archive',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('后台生成',{name:'玩家',appearance:'',personality:'',background:''},'');const session=w.active.value!;let release!:()=>void;const gate=new Promise<void>(r=>release=r);let signal:AbortSignal|undefined;
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(_r,_key,s){signal=s;yield {type:'delta',text:'前半段。'};await gate;yield {type:'delta',text:'后半段。'};yield {type:'done',outcome:{event:'已生成',characters:[]}};});const job=w.generate('继续');await vi.waitFor(()=>expect(session.turns[0]?.variants[0]?.text).toBe('前半段。'));w.panel.value='memory';await nextTick();expect(signal?.aborted).toBe(false);w.panel.value='settings';await nextTick();expect(w.busy.value).toBe(true);expect(w.active.value?.id).toBe(session.id);release();await job;expect(session.turns[0].variants[0].text).toBe('前半段。后半段。');expect(session.turns[0].variants[0].status).toBe('complete');expect(w.panel.value).toBe('settings');
});
it('state repair retains each completed side scene only in its own slot',async()=>{const w=await workspace();fill(w);await w.confirmAllApis();await w.create('分栏补全',{name:'玩家',appearance:'',personality:'',background:''},'');w.preferences.theaters![3]={slot:4,kind:'custom',enabled:true,title:'访谈',instruction:'访谈'};const s=w.active.value!,v={id:'v',text:'主线。',status:'incomplete' as const,createdAt:''};s.turns.push({id:'t',input:'行动',selected:0,variants:[v]});finishVariant(s,0,v,{event:'原事件',theaters:[{slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'甲',content:'群聊独有内容'}]},{slot:4,kind:'custom',title:'访谈',content:'访谈独有内容'}]});vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'done',outcome:{event:'补全',theaters:[{slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'甲',content:'新群聊'}]},{slot:4,kind:'custom',title:'访谈',content:'新访谈'}]}};});await w.repairState(0);expect(w.problem.value).toBe('');expect(w.theaters.value).toHaveLength(2);expect(w.theaters.value.find(t=>t.slot===2)?.messages?.[0].content).toBe('群聊独有内容');expect(w.theaters.value.find(t=>t.slot===4)?.content).toBe('访谈独有内容');});

it('记忆页统计只计有效逐轮记录，删除后显示占位并可在该条补记，正常记忆不补写',async()=>{
 const w=await workspace(1);fill(w);await w.confirmAllApis();await w.create('统计',{name:'玩家',appearance:'',personality:'',background:''},'');
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'你观察接待站。'};yield{type:'done',outcome:{event:'观察接待站',characters:[]}};});
 await generateAndWait(w,'观察');await generateAndWait(w,'等待');expect(w.chatRoundCount.value).toBe(2);expect(w.effectiveMemoryCount.value).toBe(2);expect(w.missingVectorCount.value).toBe(0);
 const first=w.memoryEntries.value[0];expect(w.memoryNeedsRepair(first)).toBe(false);const calls=vi.mocked(HttpGateway.prototype.memory).mock.calls.length;await w.retryMemory(first.id);expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(calls);
 w.removeMemory(first.id);expect(w.effectiveMemoryCount.value).toBe(1);expect(w.pendingMemoryCount.value).toBe(1);const missing=w.memoryEntries.value[0];expect(missing.id).toBe('missing:'+first.sourceTurn);expect(w.memoryNeedsRepair(missing)).toBe(true);
 await w.retryMemory(missing.id);expect(w.effectiveMemoryCount.value).toBe(2);expect(w.pendingMemoryCount.value).toBe(0);expect(w.memoryEntries.value.some(m=>m.id.startsWith('missing:'))).toBe(false);
 w.preferences.vectorEnabled=false;expect(w.preferences.vectorEnabled).toBe(false);
});
it('API 设置导入仅替换接口，清除确认状态，保存 Key 而不请求模型',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();const before=JSON.stringify(w.preferences.presets);
 const p=defaults();p.profiles[0].name='导入的主 API';p.profiles[0].apiBaseUrl='https://import.synthetic.example';p.profiles[0].model='imported';p.summaryProfile='aux';
 const configure=vi.mocked(HttpGateway.prototype.configure);configure.mockClear();
 expect(await w.importApiConfiguration(exportApiSettings(p,{main:'imported-synthetic-key'},true))).toBe(true);
 expect(w.preferences.profiles[0].name).toBe('导入的主 API');expect(w.credentials.main).toBe('imported-synthetic-key');expect(w.connectionReady(w.preferences.profiles[0])).toBe(false);
 expect(JSON.stringify(w.preferences.presets)).toBe(before);expect(privateSaved?.keys.main).toBe('imported-synthetic-key');expect(configure).not.toHaveBeenCalled();
 const previous=JSON.stringify(w.preferences);expect(await w.importApiConfiguration('{broken')).toBe(false);expect(JSON.stringify(w.preferences)).toBe(previous);
});
it('不含 Key 的导入只保留相同 ID 和地址的凭据，新增地址不复用旧 Key',async()=>{
 const w=await workspace();fill(w);const p=structuredClone(JSON.parse(JSON.stringify(w.preferences)));
 expect(await w.importApiConfiguration(exportApiSettings(p,{}))).toBe(true);expect(w.credentials.main).toBe('synthetic-key-main');
 p.profiles[0].apiBaseUrl='https://other.synthetic.example';expect(await w.importApiConfiguration(exportApiSettings(p,{}))).toBe(true);expect(w.credentials.main).toBeUndefined();
});

it('获取模型、测活和剧情连接失败统一进入运行日志，重复失败仍记录',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('日志',{name:'玩家',appearance:'',personality:'',background:''},'');
 vi.spyOn(HttpGateway.prototype,'models').mockRejectedValue(new Error('无法连接模型服务'));
 vi.spyOn(HttpGateway.prototype,'probe').mockRejectedValue(new Error('模型测试超时'));
 const signal=new AbortController().signal;
 for(let i=0;i<2;i++)await expect(w.fetchModels(w.preferences.profiles[0],signal)).rejects.toThrow('无法连接');
 await expect(w.testProfile(w.preferences.profiles[0],false,signal)).rejects.toThrow('超时');
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){throw Error('无法连接模型服务，请检查地址及网络。');});
 await generateAndWait(w,'观察');
 await vi.waitFor(()=>expect(w.formatErrors.entries.value.filter(e=>e.kind==='runtime')).toHaveLength(4));
 expect(w.formatErrors.entries.value.filter(e=>e.code==='获取模型')).toHaveLength(2);
 expect(w.formatErrors.entries.value.some(e=>e.raw.includes('请检查地址及网络'))).toBe(true);
 expect(JSON.stringify(w.formatErrors.entries.value)).not.toContain('synthetic-key');
});

it('后台记忆不占用剧情输入，同一来源只整理一次，新轮次排队后继续处理',async()=>{
 const w=await workspace(1);fill(w);await w.useMainForAll();await w.confirmAllApis();await w.create('后台',{name:'玩家',appearance:'',personality:'',background:''},'');
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'正文已完成。'};yield{type:'done',outcome:{event:'推进',characters:[]}};});
 const normal=vi.mocked(HttpGateway.prototype.memory).getMockImplementation()!;let release=()=>{};vi.mocked(HttpGateway.prototype.memory).mockImplementationOnce(async(...args)=>{await new Promise<void>(r=>release=r);return normal(...args);});
 await w.generate('第一轮');await vi.waitFor(()=>expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(1));expect(w.busy.value).toBe(false);expect(w.workingMemory.value).toBe(true);
 await w.generate('第二轮');expect(w.active.value?.turns).toHaveLength(2);expect(w.busy.value).toBe(false);release();await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));
 expect(HttpGateway.prototype.memory).toHaveBeenCalledTimes(2);expect(w.active.value?.memoryTasks?.map(t=>t.status)).toEqual(['ready','ready']);expect(w.effectiveMemoryCount.value).toBe(2);expect(HttpGateway.prototype.embed).not.toHaveBeenCalled();expect(vi.mocked(HttpGateway.prototype.memory).mock.calls.every(([,p])=>p.id==='main')).toBe(true);
});
it('记忆提交保存失败保留待重试任务，不将未保存记录当作有效事实',async()=>{
 const w=await workspace(1);fill(w);await w.confirmAllApis();await w.create('写入失败',{name:'玩家',appearance:'',personality:'',background:''},'');
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield{type:'delta',text:'正文仍保留。'};yield{type:'done',outcome:{event:'推进',characters:[]}};});
 vi.mocked(IndexedDbRepository.prototype.write).mockImplementation(async value=>{if(value.sessions[0]?.memories.some(m=>m.record))throw Error('模拟磁盘写入失败');saved=JSON.parse(backup(value));});
 await generateAndWait(w,'观察');expect(w.active.value?.turns[0].variants[0].status).toBe('complete');expect(w.effectiveMemoryCount.value).toBe(0);expect(w.active.value?.memoryTasks?.[0].status).toBe('failed');
 vi.mocked(IndexedDbRepository.prototype.write).mockImplementation(async value=>{saved=JSON.parse(backup(value));});await w.retryMemory();expect(w.effectiveMemoryCount.value).toBe(1);expect(w.active.value?.memoryTasks?.[0].status).toBe('ready');
});

it('每次生成结束记录独立变量快照，失败也记录且不误报应用',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('日志',{name:'玩家',appearance:'',background:'',personality:''},'');
 const gen=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'delta',text:'正文'};yield {type:'done',outcome:{event:'交谈',characters:[{id:'guide',affinity:35}]}};});
 await generateAndWait(w,'行动');const completed=w.formatErrors.entries.value.find(e=>e.code==='GENERATION_COMPLETE')!;
 expect(completed.variantId).toBe(w.active.value!.turns[0].variants[0].id);expect(completed.variables?.changes.some(c=>c.path.includes('affinity')&&c.after==='35')).toBe(true);
 const frozen=JSON.stringify(completed.variables);gen.mockImplementation(async function*(){throw Error('synthetic failure');});await generateAndWait(w,'失败行动');
 const failed=w.formatErrors.entries.value.find(e=>e.code==='GENERATION_INCOMPLETE')!;expect(failed.variables?.applied).toBe(false);expect(failed.variables?.total).toBe(0);expect(JSON.stringify(completed.variables)).toBe(frozen);expect(gen).toHaveBeenCalledTimes(2);
});

it('向量模型列表携带用途过滤标记，文字模型列表保留原行为',async()=>{
 const w=await workspace(),models=vi.spyOn(HttpGateway.prototype,'models').mockResolvedValue(['BAAI/bge-m3']),signal=new AbortController().signal,p=w.preferences.profiles[0];
 await w.fetchModels(p,signal,'embedding');expect(models.mock.calls[0][3]).toBe('embedding');
 await w.fetchModels(p,signal);expect(models.mock.calls[1][3]).toBeUndefined();
});

it('回溯保存失败恢复全部记录，成功仅删除目标轮起内容且保留草稿',async()=>{
 const w=await workspace();fill(w);await w.confirmAllApis();await w.create('回溯测试',{name:'玩家',appearance:'',background:'',personality:''},'');
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'delta',text:'正文'};yield {type:'done',outcome:{event:'变化',characters:[{id:'guide',affinity:40}]}};});
 await generateAndWait(w,'第一轮');await generateAndWait(w,'第二轮');w.input.value='保留草稿';await nextTick();const prior=JSON.stringify(w.active.value);
 vi.mocked(IndexedDbRepository.prototype.write).mockRejectedValueOnce(new Error('存储故障'));await w.rewind(1);expect(JSON.stringify(w.active.value)).toBe(prior);expect(w.problem.value).toContain('原对话和记录已恢复');expect(w.input.value).toBe('保留草稿');
 await w.rewind(1);expect(w.active.value!.turns).toHaveLength(1);expect(w.input.value).toBe('保留草稿');expect(saved!.sessions[0].turns).toHaveLength(1);expect(w.problem.value).toBe('');
});
