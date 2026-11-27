import {describe,it,expect} from 'vitest';
import {reactive} from 'vue';
import {newSession,stateAt,statesAt,copy} from '../src/domain/story';
import {replayIssues} from '../src/domain/stateReplay';

function fixture(){
 const s=newSession('快照回归',{name:'玩家',appearance:'',personality:'',background:''},'开场');
 s.initial.characters=[{id:'a',name:'同学',present:true,affinity:1}];
 for(let i=0;i<8;i++)s.turns.push({id:'t'+i,input:'继续',selected:0,variants:[{id:'v'+i,text:'正文',status:'complete',createdAt:'now',outcome:{event:'事件'+i,characters:[{id:'a',affinity:i+2}]}}]});
 return s;
}
describe('window replay snapshots',()=>{
 it('matches individual replays across invalid rounds, incomplete replies and manual state overrides',()=>{
  const s=fixture();s.turns[2].variants[0].outcome!.characters![0].affinity=999;
  s.turns[4].variants[0].status='incomplete';
  s.turns[6].variants[0].mvuOverride=[{op:'replace',path:'/player/name',value:'更名'}];
  const points=[8,0,3,5,6,7,8],snapshots=statesAt(s,points);
  for(const n of points)expect(snapshots.get(n)).toEqual(stateAt(copy(s),n));
  expect(replayIssues(s).some(e=>e.turnId==='t2')).toBe(true);
  snapshots.get(3)!.characters[0].name='外部修改';
  expect(snapshots.get(5)!.characters[0].name).toBe('同学');expect(s.initial.characters[0].name).toBe('同学');
 });
 it('observes branch changes, edits, rewinds and imports without stale cross-call caching',()=>{
  const s=reactive(fixture());const old=statesAt(s,[8]).get(8);
  s.turns[7].variants.push({...s.turns[7].variants[0],id:'branch',outcome:{event:'分支',characters:[{id:'a',affinity:42}]}});s.turns[7].selected=1;
  expect(statesAt(s,[8]).get(8)).toEqual(stateAt(s));expect(statesAt(s,[8]).get(8)).not.toEqual(old);
  s.turns[7].variants[1].outcome!.characters![0].affinity=43;expect(statesAt(s,[8]).get(8)!.characters[0].affinity).toBe(43);
  s.turns.splice(4);expect(statesAt(s,[4]).get(4)).toEqual(stateAt(s));s.initial.characters[0].name='导入后的角色';expect(statesAt(s,[4]).get(4)!.characters[0].name).toBe('导入后的角色');
 });
 it('rejects invalid boundaries and avoids initializing an empty window',()=>{
  const s=fixture();expect(statesAt(s,[]).size).toBe(0);for(const n of [-1,0.5,9,NaN])expect(()=>statesAt(s,[n])).toThrow('状态快照位置无效');
 });
});
