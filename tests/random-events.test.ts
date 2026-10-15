import {afterEach,expect,it,vi} from 'vitest';
import {drawSpecialEvent,specialEventKinds,cleanRandomEventGate,cleanSpecialEvent} from '../src/domain/randomEvents';
import {backup,defaults,newSession,parseBackup,editMessage} from '../src/domain/story';
import {requiredApis,migrateApiSettings} from '../src/domain/apis';
afterEach(()=>vi.restoreAllMocks());
const proposal={kind:'奇遇事件' as const,title:'来信',description:'一封来信等待查看。'};
const dice={value:100,grade:'大吉',rulesVersion:'d100-v1' as const};
it('50%边界及五种类别独立均匀，未命中不抽类别',()=>{
  let values:number[]=[];const rng=vi.spyOn(crypto,'getRandomValues').mockImplementation(a=>{(a as Uint32Array)[0]=values.shift()!;return a;});
  const hits:string[]=[];for(let i=0;i<100;i++){values=[i,i%5];const before=rng.mock.calls.length;const kind=drawSpecialEvent();expect(rng.mock.calls.length-before).toBe(i<50?2:1);if(kind)hits.push(kind);}
  expect(hits).toHaveLength(50);for(const kind of specialEventKinds)expect(hits.filter(x=>x===kind)).toHaveLength(10);
  values=[0xffffffff,50];expect(drawSpecialEvent()).toBeUndefined();expect(values).toHaveLength(0);
});
it('候选清理隐藏推理，拒绝无效类别、空内容和附加指令字段',()=>{
  expect(cleanSpecialEvent({...proposal,title:'<think>隐藏</think>来信'})).toEqual(proposal);
  for(const invalid of [{...proposal,kind:'随便'},{...proposal,title:''},{...proposal,description:'x'.repeat(1201)},{...proposal,script:'x'}])expect(()=>cleanSpecialEvent(invalid)).toThrow();
});
it('存档恢复待选事件，接受必须有骰点，待定不能夹带正文或后续回合',()=>{
  const session=newSession('事件',{name:'玩家',appearance:'',personality:'',background:''},'');session.turns.push({id:'t',input:'行动',randomEvent:{status:'pending',proposal},variants:[],selected:0});
  const snapshot={version:1 as const,preferences:defaults(),sessions:[session]};expect(parseBackup(backup(snapshot)).sessions[0].turns[0].randomEvent).toEqual({status:'pending',proposal});
  expect(cleanRandomEventGate({status:'accepted',proposal},dice)).toEqual({status:'accepted',proposal});expect(cleanRandomEventGate(undefined,dice)).toBeUndefined();
  for(const status of ['pending','declined','none','preparing'])expect(()=>cleanRandomEventGate({status,proposal,kind:proposal.kind},dice)).toThrow();
  expect(()=>cleanRandomEventGate({status:'accepted',proposal})).toThrow();
  session.turns[0].variants.push({id:'v',text:'提前生成了正文',status:'incomplete',createdAt:''});expect(()=>parseBackup(backup(snapshot))).toThrow('待决定');
  session.turns[0].variants=[];session.turns.push({id:'later',input:'绕过',variants:[],selected:0});expect(()=>parseBackup(backup(snapshot))).toThrow('待决定');
});
it('修改待选回合输入后重新写同类候选，不重新抽概率',()=>{
  const session=newSession('事件',{name:'玩家',appearance:'',personality:'',background:''},'');session.turns.push({id:'t',input:'旧行动',randomEvent:{status:'pending',proposal},variants:[],selected:0});editMessage(session,0,'user','新行动');expect(session.turns[0].randomEvent).toEqual({status:'preparing',kind:'奇遇事件'});
});
it('随机事件接口只在开启时要求配置，迁移默认主API，不允许向量接口',()=>{
  const p=defaults();p.randomEventProfile='aux';expect(requiredApis(p).map(p=>p.id)).toEqual(['main']);p.diceEnabled=true;expect(requiredApis(p).map(p=>p.id)).toEqual(['main','aux']);delete p.randomEventProfile;expect(migrateApiSettings(p).randomEventProfile).toBe('main');p.randomEventProfile='embed';expect(()=>migrateApiSettings(p)).toThrow('随机事件');
});
