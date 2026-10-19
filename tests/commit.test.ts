import {it,expect} from 'vitest';
import {commit,planGroups} from '../src/domain/commit';
import {initialState} from '../src/domain/story';
import type {MvuOperation} from '../src/domain/mvu';

const state=()=>initialState('玩家');
it('keeps valid actors and rejects only the failing actor group',()=>{
  const before=state();
  const ops:MvuOperation[]=[
    {op:'delta',path:'/characters/guide/affinity',value:5},
    {op:'replace',path:'/characters/engineer/affinity',value:999},
    {op:'add',path:'/characters/guide/relationship',value:'同伴'},
  ];
  const result=commit(before,ops);
  expect(result.rejected).toHaveLength(1);
  expect(result.rejected[0].path).toBe('/characters/engineer/affinity');
  expect(result.applied).toHaveLength(2);
  expect(result.state.characters.find(c=>c.id==='guide')!.affinity).toBe(35);
  expect(result.state.characters.find(c=>c.id==='guide')!.relationship).toBe('同伴');
  expect(result.state.characters.find(c=>c.id==='engineer')!.affinity).toBe(20);
});

it('rolls back every operation of one actor when a later operation in that group fails',()=>{
  const result=commit(state(),[
    {op:'delta',path:'/characters/guide/affinity',value:5},
    {op:'replace',path:'/characters/guide/missing',value:1},
  ]);
  expect(result.applied).toHaveLength(0);
  expect(result.rejected.map(row=>row.path)).toEqual(['/characters/guide/affinity','/characters/guide/missing']);
  expect(result.state.characters.find(c=>c.id==='guide')!.affinity).toBe(30);
});

it('a manual replacement of player, characters and custom is one atomic group',()=>{
  const before=state();
  const result=commit(before,[
    {op:'replace',path:'/player',value:{...before.player,affinity:1}},
    {op:'replace',path:'/characters',value:[]},
    {op:'replace',path:'/custom',value:[]},
  ]);
  expect(result.applied).toHaveLength(0);
  expect(result.rejected).toHaveLength(3);
  expect(result.state).toEqual(before);
});

it('move and copy bind their source and target into one group',()=>{
  const plans=planGroups([
    {op:'move',from:'/characters/guide/affinity',path:'/characters/engineer/affinity'},
    {op:'replace',path:'/characters/engineer/relationship',value:'旧识'},
  ]);
  expect(plans).toHaveLength(1);
  expect(plans[0].indices).toEqual([0,1]);
});
