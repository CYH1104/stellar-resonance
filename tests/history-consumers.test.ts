import {describe,it,expect} from 'vitest';
import {reactive} from 'vue';
import {newSession,encounteredCharacters,visibleForum,stateAt,copy,selectVariant,truncate} from '../src/domain/story';
function fixture(n=12){const s=newSession('历史统计',{name:'玩家',appearance:'',background:'',personality:''},'开场');s.initial.characters=[{id:'a',name:'同学',present:false,affinity:0},{id:'b',name:'未见',present:false}];for(let i=0;i<n;i++)s.turns.push({id:'t'+i,input:'继续',selected:0,variants:[{id:'v'+i,text:'正文',status:'complete',createdAt:'now',outcome:{event:'事件'+i,characters:[{id:'a',affinity:i+1,present:i===0}],forum:[{id:'p'+i,authorName:'同学',content:'动态'+i}]}}]});return s;}
describe('history consumers',()=>{
 for(const [name,read] of [['encounters',encounteredCharacters],['forum',visibleForum]] as const)it(name+' validates a long history a bounded number of times',()=>{const s=fixture(100);let visits=0;for(const t of s.turns){const out=t.variants[0].outcome!;const event=out.event;Object.defineProperty(out,'event',{enumerable:true,get(){visits++;return event;}});}expect(read(s).length).toBeGreaterThan(0);expect(visits).toBeLessThanOrEqual(100*16);});
 it('preserves MVU encounters, overrides, invalid and incomplete rounds, forum order and boundaries',()=>{
 const s=fixture(6);s.turns[0].variants[0].outcome={event:'初遇',mvu:[{op:'replace',path:'/characters/a/present',value:true}]};s.turns[1].variants[0].outcome!.characters![0].affinity=999;s.turns[2].variants[0].status='incomplete';s.turns[3].variants[0].mvuOverride=[{op:'replace',path:'/characters/a/name',value:'新名字'}];
 expect(encounteredCharacters(s).map(a=>a.id)).toEqual(['a']);expect(encounteredCharacters(s)[0]).toEqual(stateAt(copy(s)).characters[0]);
 expect(visibleForum(s).map(p=>[p.content,p.key,p.round])).toEqual([['动态5','forum/v5/p5',6],['动态4','forum/v4/p4',5],['动态3','forum/v3/p3',4]]);
 expect(encounteredCharacters(s,0)).toEqual([]);expect(visibleForum(s,3)).toEqual([]);expect(encounteredCharacters(s,1)[0].present).toBe(true);expect(visibleForum(s,-1).map(p=>p.round)).toEqual([5,4]);expect(visibleForum(s,999)).toEqual(visibleForum(s));
 });
 it('uses current branches, edits, rewinds and imported initial state without stale caching',()=>{const s=reactive(fixture(2));expect(visibleForum(s)).toHaveLength(2);s.turns[0].variants.push({id:'alternate',text:'没有相遇',status:'complete',createdAt:'now',outcome:{event:'等待'}});selectVariant(s,0,1);truncate(s,1);expect(encounteredCharacters(s)).toEqual([]);expect(visibleForum(s)).toEqual([]);s.turns[0].variants[1].outcome!.characters=[{id:'b',present:true}];expect(encounteredCharacters(s).map(a=>a.id)).toEqual(['b']);s.initial.characters[1].name='导入姓名';expect(encounteredCharacters(s)[0].name).toBe('导入姓名');});
});
