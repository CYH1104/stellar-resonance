import {it,expect} from 'vitest';
import {newWorldbook,newWorldEntry,resolveWorldbooks,worldEntryWarnings,importWorldbook,exportWorldbook,cleanWorldbooks,setWorldEntryGroup,worldEntryGroup,type WorldEntry,type Worldbook} from '../src/domain/worldbooks';
const ctx={messages:['水 白 黑'],userName:'玩家',charName:'世界叙述者',seed:'turn',actors:[{id:'a',name:'甲'},{id:'b',name:'乙'}]};
const make=(rows:Partial<WorldEntry>[]):Worldbook=>({...newWorldbook('book'),entries:rows.map((r,i)=>({...newWorldEntry('e'+i),title:'条目'+i,content:'正文'+i,constant:true,...r}))});
const g=(group:string,extra={})=>({extra:JSON.stringify({group,...extra})});
it('supports grouped constant lore without silently injecting every candidate; keeps independent groups',()=>{
 const b=make([g('System'),g('System'),g('Body'),{}]);const r=resolveWorldbooks([b],ctx);
 expect(r.entries).toHaveLength(3);expect(r.diagnostics.filter(d=>d.status==='group-lost')).toHaveLength(1);expect(worldEntryWarnings(b.entries[0])).toEqual([]);expect(resolveWorldbooks([b],ctx)).toEqual(r);
});
it('uses priority overrides by descending order and preserves weighted extension fields on export',()=>{
 const b=make([g('Body',{groupOverride:true}),{...g('Body',{groupOverride:true}),order:900},g('Body',{groupWeight:10000})]);
 expect(resolveWorldbooks([b],ctx).activated).toEqual(['book:e1']);
 const imported=importWorldbook(JSON.stringify({entries:[{content:'中性内容',constant:true,extensions:{group:'G',group_override:true,group_weight:15,use_group_scoring:true,unknown:'保留'}}]}));
 expect(worldEntryGroup(imported.entries[0])).toEqual({names:['G'],override:true,weight:15,scoring:true});
 const again=importWorldbook(exportWorldbook(imported));expect(worldEntryGroup(again.entries[0])).toEqual(worldEntryGroup(imported.entries[0]));expect(JSON.parse(again.entries[0].extra).extensions.unknown).toBe('保留');
});
it('zero weights cannot win, unequal weights affect deterministic turn rolls',()=>{
 const b=make([g('G',{groupWeight:0}),g('G',{groupWeight:1})]);expect(resolveWorldbooks([b],ctx).activated).toEqual(['book:e1']);
 b.entries[0].extra=JSON.stringify({group:'G',groupWeight:9});const results=Array.from({length:100},(_,i)=>resolveWorldbooks([b],{...ctx,seed:'round-'+i}).activated[0]);
 expect(new Set(results).size).toBe(2);expect(results.filter(id=>id==='book:e0').length).toBeGreaterThan(60);
});
it('applies keyword scoring before overrides and weighted selection',()=>{
 const b=make([{...g('G',{useGroupScoring:true,groupOverride:true}),keys:['水']},{...g('G',{useGroupScoring:true}),keys:['水','白']}]);
 expect(resolveWorldbooks([b],ctx).activated).toEqual(['book:e1']);
 b.entries[0].extra=JSON.stringify({group:'G',useGroupScoring:false,groupOverride:true});expect(resolveWorldbooks([b],ctx).activated).toEqual(['book:e0']);
});
it('group selection spans bound books, handles comma groups, and never rolls per NPC',()=>{
 const b=make([g('A, B'),g('B')]),other={...make([g('A')]),id:'other'};
 const r=resolveWorldbooks([b,other],ctx);for(const group of ['A','B'])expect(r.activated.filter(id=>{const [book,e]=id.split(':');return worldEntryGroup((book==='other'?other:b).entries.find(x=>x.id===e)!).names.includes(group)}).length).toBeLessThanOrEqual(1);
 expect(resolveWorldbooks([b,other],{...ctx,actors:[...ctx.actors,{id:'c',name:'丙'}]}).activated).toEqual(r.activated);
});
it('a group already inserted cannot activate another member through recursion; budgets and probability stay visible',()=>{
 const b=make([{...g('G'),content:'递归词'},{...g('G'),constant:false,keys:['递归词']}]);b.recursive=true;
 const r=resolveWorldbooks([b],ctx);expect(r.activated).toEqual(['book:e0']);expect(r.diagnostics[1].status).toBe('group-lost');
 const c=make([{probability:0},{content:'x'.repeat(200)}]);c.budget=100;expect(resolveWorldbooks([c],ctx).diagnostics.map(d=>d.status)).toEqual(['probability','budget']);
});
it('timing option warnings do not block base activation; disabled/empty/unmatched stay distinguishable',()=>{
 const b=make([{enabled:false},{content:''},{constant:false,keys:['没有']},{...g('G',{sticky:2})}]);expect(resolveWorldbooks([b],ctx).diagnostics.map(d=>d.status)).toEqual(['disabled','empty','unmatched','inserted']);
});
it('scope inherits the book, permits per-entry global override, preserves macros and original content',()=>{
 const b=make([{content:'{{char}} 与 {{user}}'},{scope:{mode:'global',characterIds:[]}}]);b.scope={mode:'characters',characterIds:['a','b']};
 const r=resolveWorldbooks([b],ctx);expect(r.entries[0].content).toContain('"id":"a","name":"甲"');expect(r.entries[0].content).toContain('"id":"b","name":"乙"');expect(r.entries[0].content).toContain('世界叙述者 与 玩家');expect(r.entries[1].content).toBe('正文1');expect(b.entries[0].content).toBe('{{char}} 与 {{user}}');
 expect(importWorldbook(exportWorldbook(b))).toMatchObject({scope:b.scope,entries:[{},{scope:{mode:'global',characterIds:[]}}]});
});
it('unregistered scopes are explicit and never redirected to another actor or silently global',()=>{
 const b=make([{scope:{mode:'characters',characterIds:['missing']}}]);expect(resolveWorldbooks([b],ctx).diagnostics[0].status).toBe('scope-unavailable');expect(resolveWorldbooks([b],ctx).entries).toEqual([]);expect(()=>cleanWorldbooks([{...b,scope:{mode:'characters',characterIds:['__proto__']}}])).toThrow();
 setWorldEntryGroup(b.entries[0],{names:['Edited'],override:true,weight:50,scoring:false});expect(worldEntryGroup(b.entries[0]).names).toEqual(['Edited']);
});
