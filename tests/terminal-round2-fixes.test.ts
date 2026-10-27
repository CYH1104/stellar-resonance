// 第二轮返工的关键回归：真实生成的消息必须能完整备份；续写复用已提交事实；
// 回退触发轮后该轮通讯与其派生记忆、课表、任务不再进入当前剧情与模型输入。
// 用真实 useWorkspace、真实请求组装和真实存档编解码，只把网关调用换成记录器。
vi.mock('../src/memory/retrieval',()=>({retrieve:async(items:unknown[])=>items.slice(0,6)}));
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {effectScope} from 'vue';
import {useWorkspace} from '../src/app/useWorkspace';
import {IndexedDbRepository} from '../src/storage/repository';
import {HttpGateway} from '../src/gateway/http';
import {newSession,initialState,defaults,backup,parseBackup,truncate} from '../src/domain/story';
import {normalizeMemoryResult} from '../src/domain/memories';
import {emptyTerminal,validateTerminal} from '../src/domain/personalTerminal';
import {terminalAnchor,terminalMessageVisible,terminalRecall} from '../src/domain/terminalLedger';
import {terminalCommittedFacts} from '../src/domain/terminalAuto';
import {terminalMainContext} from '../src/domain/terminalMain';
import {snapshotRows,rowsSnapshot} from '../src/storage/recordSnapshot';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {IDBFactory} from 'fake-indexeddb';
import type {LocalService} from '../src/domain/contracts';

const baseService={runtime:'local-card' as const,dataset:'test-world',name:'测试',greeting:[],characters:[],places:[],counts:{characters:0,departments:0,places:0},missing:[]};
let scope:ReturnType<typeof effectScope>;
function service():LocalService{return {...baseService,capabilities:{continue:true,keyRequired:true,embeddings:true,terminal:true,channel:'test'}};}
beforeEach(()=>{
 scope=effectScope();
 vi.spyOn(IndexedDbRepository.prototype,'read').mockResolvedValue(undefined);
 vi.spyOn(IndexedDbRepository.prototype,'readEditorDrafts').mockResolvedValue({});
 vi.spyOn(IndexedDbRepository.prototype,'writeEditorDraft').mockResolvedValue();
 vi.spyOn(IndexedDbRepository.prototype,'hasInterruptedRestore').mockResolvedValue(false);
 vi.spyOn(IndexedDbRepository.prototype,'readApiCredentials').mockResolvedValue(undefined);
 vi.spyOn(IndexedDbRepository.prototype,'writeApiCredentials').mockResolvedValue();
 vi.spyOn(IndexedDbRepository.prototype,'writeInputDraft').mockResolvedValue();
 vi.spyOn(IndexedDbRepository.prototype,'writeConfiguration').mockResolvedValue();
 vi.spyOn(IndexedDbRepository.prototype,'write').mockResolvedValue();
 vi.spyOn(HttpGateway.prototype,'bootstrap').mockImplementation(async function(this:HttpGateway){const value=service();this.capabilities=value.capabilities;return value;});
 vi.spyOn(HttpGateway.prototype,'configure').mockResolvedValue({origin:'https://synthetic.example'});
 vi.spyOn(HttpGateway.prototype,'newGame').mockResolvedValue({dataset:'test-world',opening:'迎新',initial:initialState('玩家')});
 vi.spyOn(HttpGateway.prototype,'embed').mockImplementation(async texts=>texts.map(()=>[1,0.5]));
 vi.spyOn(HttpGateway.prototype,'memory').mockImplementation(async input=>normalizeMemoryResult({participants:[input.after.player.name],time:'未明确',location:'未明确',userActions:[input.input],charActions:[],gains:[],losses:[],commitments:[],affinityChanges:[]},input));
});
afterEach(()=>{scope.stop();vi.restoreAllMocks();vi.unstubAllGlobals();});
function fill(w:ReturnType<typeof useWorkspace>,id='main'){
 if(id==='main')fill(w,'embed');
 Object.assign(w.preferences.profiles.find(p=>p.id===id)!,{apiBaseUrl:`https://${id}.synthetic.example/v1`,model:`model-${id}`});
 w.credentials[id]=`synthetic-key-${id}`;
}
async function workspace(){
 const w=scope.run(()=>useWorkspace())!;
 await vi.waitFor(()=>expect(w.loading.value).toBe(false));
 fill(w);fill(w,'aux');await w.confirmAllApis();
 const session=newSession('返工存档',{name:'玩家',appearance:'',personality:'',background:''},'');
 session.sourceDataset='test-world';
 session.initial.characters=[{id:'a',name:'甲',present:true},{id:'b',name:'乙',present:true}];
 session.terminal=emptyTerminal();
 w.sessions.value.push(session);w.sessionId.value=session.id;
 return {w,session};
}
async function enabled(){
 const value=await workspace();
 value.w.preferences.terminalProfile='aux';
 await value.w.connectProfile(value.w.preferences.profiles.find(p=>p.id==='aux')!);
 expect(await value.w.setTerminalEnabled(true)).toBe(true);
 return value;
}
/** A realistic batch built from the request's own frozen context: a new round may only create
 * the reserved group ids, a later round may only talk in the groups the context already lists. */
function batchFor(ctx:any,tag:string){
 const ids:string[]=ctx.initialized?ctx.groups.slice(0,2).map((g:any)=>g.id):ctx.newGroupIds.slice(0,2);
 const withPrivate=(ctx.privateRecipientIds||[]).includes('b');
 return {
  protocolVersion:2,
  groups:ids.map((id:string,i:number)=>({id,title:'群'+i,members:['a','b'],ownerId:'a',adminIds:[],announcement:'',topic:`${tag}话题`,messages:[{id:'a',text:`${tag}群${i}消息一`},{id:'b',text:`${tag}群${i}消息二`},{id:'a',text:`${tag}群${i}消息三`},{id:'b',text:`${tag}群${i}消息四`}]})),
  privateMessages:withPrivate?[{id:'b',text:`${tag}私聊内容`,topic:`${tag}私聊话题`}]:[],
  friendRequests:ctx.allowSocial?[{id:'b',reason:'想加你好友',source:'群里看到你的号码'}]:[],
  courses:[{title:`${tag}星图学`,day:1,time:'08:00',end:'09:30',place:'A101',teacherId:'a',preparation:'预习'}]
 };
}
function recordRounds(onBatch?:(ctx:any,tag:string)=>void){
 let round=0;
 vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'delta',text:'正文内容'};yield {type:'done',outcome:{event:'走进教室'}};});
 vi.spyOn(HttpGateway.prototype,'terminal').mockImplementation(async function(input:any){
  const tag=`第${++round}轮`;const ctx=input.context.mainContext;
  const batch=batchFor({...ctx,allowSocial:ctx.allowSocial},tag);onBatch?.(ctx,tag);return batch;
 });
}

it('terminal rounds from both orders, later turns and private chats survive every backup path',async()=>{
 const {w,session}=await enabled();
 // A real one-to-one conversation makes the private recipient known to the planner.
 session.terminal!.conversations.push({id:'private-b',title:'乙',members:['b'],group:false,announcement:'',messages:[],unread:0,origin:'manual',joined:true});
 recordRounds();
 await w.generate('行动一');
 await w.setTerminalOrder('terminal-first');
 await w.generate('行动二');
 const messages=session.terminal!.conversations.flatMap(c=>c.messages);
 expect(messages.length).toBe(18);
 expect(messages.some(m=>m.source&&m.source.length>128)).toBe(true);
 for(const m of messages){expect(m.id.length).toBeLessThanOrEqual(128);expect(m.sender).toBeTruthy();}
 expect(new Set(messages.map(m=>m.id)).size).toBe(messages.length);
 expect(messages.some(m=>session.terminal!.conversations.find(c=>c.messages.includes(m))!.group===false)).toBe(true);
 expect(session.terminal!.courses[0].title).toContain('第2轮');
 // 本机保存走的是同一个校验入口，必须在落盘前就通过。
 expect(()=>validateTerminal(session.terminal!)).not.toThrow();
 // 本地下载 → 导入
 const snapshot={version:1 as const,sessions:[session],preferences:w.preferences};
 const text=backup(snapshot);
 expect(text).not.toContain('synthetic-key');
 const restored=parseBackup(text).sessions[0];
 expect(restored.terminal!.conversations.flatMap(c=>c.messages).length).toBe(messages.length);
 // 云端上传 → 下载（排除本地图片；远程链接与文本保留）
 session.terminal!.avatar='data:image/png;base64,AAAA';
 const cloud=createCloudSave(snapshot,w.preferences);
 expect(cloud).not.toContain('synthetic-key');
 const cloudSnapshot=parseCloudSave(cloud).snapshot;
 expect(cloudSnapshot.sessions[0].terminal!.avatar).toBe('');
 expect(cloudSnapshot.sessions[0].terminal!.conversations.flatMap(c=>c.messages).length).toBe(messages.length);
 // 本机 IndexedDB 分片存储 → 读取（覆盖前恢复副本走的同一套记录）
 const rows=snapshotRows({version:1,preferences:w.preferences,sessions:[session]});
 const rowsBack=rowsSnapshot(rows)!;
 expect(rowsBack.sessions[0].terminal!.conversations.flatMap(c=>c.messages).map(m=>m.id)).toEqual(messages.map(m=>m.id));
 expect(rowsBack.sessions[0].terminal!.courses[0].title).toContain('第2轮');
});

it('continuing a terminal-first turn reuses the facts stored in the save',async()=>{
 const {w,session}=await enabled();await w.setTerminalOrder('terminal-first');
 recordRounds();
 await w.generate('行动');
 const facts=terminalCommittedFacts(session,0);
 expect(facts).toContain('第1轮群0消息一');
 // 页面重载：事实随任务写入存档，不依赖内存变量。
 const restored=parseBackup(backup({version:1,sessions:[session],preferences:w.preferences})).sessions[0];
 expect(restored.terminal!.jobs?.some(j=>j.turnId===restored.turns[0].id&&j.facts===facts)).toBe(true);
 expect(terminalCommittedFacts(restored,0)).toBe(facts);
 const terminalCalls=vi.mocked(HttpGateway.prototype.terminal).mock.calls.length;
 await w.generate(undefined,0,true);
 expect(vi.mocked(HttpGateway.prototype.terminal).mock.calls.length).toBe(terminalCalls);
});

it('rewinding a later terminal-first round hides its messages, memory, timetable and orphaned job',async()=>{
 const {w,session}=await enabled();await w.setTerminalOrder('terminal-first');
 recordRounds();
 await w.generate('行动一');
 await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));
 await w.generate('行动二');
 await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));
 const all=session.terminal!.conversations.flatMap(c=>c.messages);
 expect(all.filter(m=>terminalMessageVisible(session,m))).toHaveLength(16);
 const secondTurn=session.turns[1];
 const secondTurnMessages=all.filter(m=>m.origin?.turnId===secondTurn.id);
 expect(secondTurnMessages).toHaveLength(8);
 const secondTurnIds=new Set(secondTurnMessages.map(m=>m.id));
 const job=session.terminal!.jobs!.find(j=>j.turnId===secondTurn.id&&j.mode==='terminal-first')!;
 await w.rewind(1);
 expect(session.turns).toHaveLength(1);
 expect(all.filter(m=>terminalMessageVisible(session,m))).toHaveLength(8);
 expect(all.filter(m=>secondTurnIds.has(m.id)).some(m=>terminalMessageVisible(session,m))).toBe(false);
 // 记录仍在存档里，只是不进当前剧情与模型输入。
 expect(all).toHaveLength(16);
 expect(terminalRecall(session).join('')).not.toContain('第2轮话题');
 expect(terminalRecall(session).join('')).toContain('第1轮话题');
 expect(JSON.stringify(terminalMainContext(session).groups)).not.toContain('第2轮群0消息一');
 expect(terminalMainContext(session).courses).toHaveLength(0);
 expect(session.terminal!.courses[0].title).toContain('第2轮');
 expect(await w.retryTerminalJob(job.id)).toBe(false);
 // 回退后的新行动重新可见，旧轮不会借新轮复活。
 await w.generate('新行动');
 await vi.waitFor(()=>expect(w.workingMemory.value).toBe(false));
 const after=session.terminal!.conversations.flatMap(c=>c.messages);
 expect(after.filter(m=>terminalMessageVisible(session,m))).toHaveLength(16);
 expect(after.filter(m=>secondTurnIds.has(m.id)).some(m=>terminalMessageVisible(session,m))).toBe(false);
 expect(after.filter(m=>m.origin?.turnId===session.turns[1].id)).toHaveLength(8);
 // 回到开头：首轮创建的群、课表与消息一起退出当前剧情，但记录仍在存档中。
 await w.rewind(0);
 expect(session.terminal!.conversations.length).toBeGreaterThan(0);
 expect(session.terminal!.conversations.flatMap(c=>c.messages).filter(m=>terminalMessageVisible(session,m))).toHaveLength(0);
 expect(terminalMainContext(session).groups).toHaveLength(0);
 expect(terminalMainContext(session).courses).toHaveLength(0);
});

it('editing the triggering input hides that round without deleting the record',async()=>{
 const {w,session}=await enabled();await w.setTerminalOrder('terminal-first');
 recordRounds();
 await w.generate('行动');
 let all=session.terminal!.conversations.flatMap(c=>c.messages);
 expect(all.filter(m=>terminalMessageVisible(session,m))).toHaveLength(8);
 await w.edit(0,'user','改过的行动');
 all=session.terminal!.conversations.flatMap(c=>c.messages);
 expect(all.filter(m=>terminalMessageVisible(session,m))).toHaveLength(0);
 expect(all).toHaveLength(8);
});

it('real generated terminal messages also survive the pre-restore recovery copy',async()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());
 const {w,session}=await enabled();await w.setTerminalOrder('terminal-first');
 recordRounds();
 await w.generate('行动');
 const repo=new IndexedDbRepository('round2-recovery-'+crypto.randomUUID());
 // read() is mocked in this suite, so mirror the revision a freshly loaded empty database has.
 (repo as unknown as {revision:number}).revision=0;
 await repo.prepareCloudRecovery({version:1,sessions:[session],preferences:w.preferences});
 const recovered=await repo.readCloudRecovery('workspace');
 expect(recovered!.sessions[0].terminal!.conversations.flatMap(c=>c.messages).map(m=>m.id)).toEqual(session.terminal!.conversations.flatMap(c=>c.messages).map(m=>m.id));
});

it('legacy long ids and anchor-only messages still import and display',()=>{
 const s=newSession('旧档',{name:'玩家',appearance:'',personality:'',background:''},'');
 s.terminal=emptyTerminal();
 const anchor=terminalAnchor(s,0);
 const longSource=`auto:auto:${crypto.randomUUID()}:terminal-first:${crypto.randomUUID()}:${crypto.randomUUID()}:8:${crypto.randomUUID()}:0`;
 expect(longSource.length).toBeGreaterThan(128);
 s.terminal.conversations.push({id:'g1',title:'旧群',members:['a'],group:true,announcement:'',unread:0,joined:true,messages:[
  {id:longSource,source:longSource,sender:'a',displayName:'甲',text:'旧的长 id 消息',at:'2026-01-01T00:00:00.000Z',anchor,knownBy:['player','a']},
  {id:'old-short',sender:'a',displayName:'甲',text:'旧的短 id 消息',at:'2026-01-01T00:00:00.000Z',anchor,knownBy:['player','a']}
 ]});
 const value={version:1 as const,sessions:[s],preferences:defaults()};
 const restored=parseBackup(backup(value)).sessions[0];
 const messages=restored.terminal!.conversations[0].messages;
 expect(messages.map(m=>m.text)).toEqual(['旧的长 id 消息','旧的短 id 消息']);
 expect(messages.every(m=>terminalMessageVisible(restored,m))).toBe(true);
 // 旧锚点没有 origin：仍按原来的锚点规则显示，不因新增字段被隐藏或清洗。
 truncate(restored,0);
 expect(messages.every(m=>terminalMessageVisible(restored,m))).toBe(true);
 expect(parseCloudSave(createCloudSave(value,defaults())).snapshot.sessions[0].terminal!.conversations[0].messages).toHaveLength(2);
});
