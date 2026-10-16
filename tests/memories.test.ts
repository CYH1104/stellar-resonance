import {expect,it} from 'vitest';
import {normalizeMemoryResult,formatMemory,activeCommitments,memoryContext,buildRecallQuery,memorySignature,vectorCurrent,type MemoryRequest} from '../src/domain/memories';
import {newSession,initialState,finishVariant,backup,parseBackup,defaults,visibleMemories,selectVariant,truncate} from '../src/domain/story';
import {rankMemories} from '../src/memory/scoring';
const input=():MemoryRequest=>{const before=initialState('祁言'),after=structuredClone(before);after.characters[0].affinity=42;after.player.mentalPowerLevel='S级';return {turnId:'t',variantId:'v',input:'归还书本',story:'你归还借来的书，与引导员约定明天一起报到。',before,after,priorCommitments:[]};};
const raw=()=>({participants:['祁言','样例引导员'],time:'578.09.01 09:30',location:'报到台',userActions:['归还借来的书'],charActions:[{name:'样例引导员',actions:['接受书本并约定明天一起报到']}],gains:['获得报到信息'],losses:['归还借来的书'],commitments:[{id:'new',participants:['祁言','样例引导员'],content:'明天一起报到',deadline:'明天',status:'open'}],affinityChanges:[{id:'guide',before:999,after:1000,delta:1,reason:'按约归还书本增加信任'}]});
it('异能变化可完整进入事实记忆，清空能力以无表示而不导致记忆格式失败',()=>{
 const r=input();r.before.player.ability='旧能力'.repeat(150);r.after.player.ability='新能力'.repeat(150);
 expect(normalizeMemoryResult(raw(),r).stateChanges.find(c=>c.field==='异能')?.after).toBe(r.after.player.ability);
 r.after.player.ability='';expect(normalizeMemoryResult(raw(),r).stateChanges.find(c=>c.field==='异能')?.after).toBe('无');
});
it('逐轮记忆覆盖完整字段，数值从前后状态计算，禁止模型伪造差值',()=>{
 const r=normalizeMemoryResult(raw(),input());expect(r.affinityChanges[0]).toEqual({id:'guide',name:'样例引导员',before:30,after:42,delta:12,reason:'按约归还书本增加信任'});expect(r.stateChanges[0]).toMatchObject({id:'player',field:'精神力等级',after:'S级'});
 const text=formatMemory(r);for(const label of ['人物：','时间：','地点：','user行动：','char行动：','获得：','失去／消耗：','重要约定：','好感度变化：'])expect(text).toContain(label);expect(text).toContain('30 → 42');expect(text).not.toContain('999');
});
it('缺少关键字段、正文排版标签或超长输出会失败，而不是把正文截断入库',()=>{
 for(const change of [{time:undefined},{userActions:[]},{gains:undefined},{userActions:['<Slate>标题</Slate>']},{location:'x'.repeat(501)}])expect(()=>normalizeMemoryResult({...raw(),...change},input())).toThrow();
 const r=normalizeMemoryResult({...raw(),userActions:['<think>模型推理</think>归还书本']},input());expect(formatMemory(r)).not.toContain('模型推理');
});
it('约定用稳定ID更新状态，只把未履行约定固定带入，检索记忆不截断到1000字',()=>{
 const first=normalizeMemoryResult(raw(),input());const m={id:'m',text:formatMemory(first),kind:'event' as const,createdAt:'',record:first,status:'ready' as const};const promises=activeCommitments([m]);expect(promises).toHaveLength(1);
 const next=input();next.variantId='v2';next.priorCommitments=promises;const second=normalizeMemoryResult({...raw(),commitments:[{...promises[0],status:'fulfilled'}]},next);
 expect(activeCommitments([m,{...m,id:'m2',record:second}])).toEqual([]);const context=memoryContext([{id:'note',text:'完整记忆'.repeat(700),kind:'note',createdAt:''}],promises);expect(context[0]).toContain('明天一起报到');expect(context[1].length).toBe(2800);
});
it('记忆随稿件隔离，备份保留结构化事实，回退不检索另一条剧情路线',()=>{
 const s=newSession('记忆测试',{name:'祁言',appearance:'',personality:'',background:''},'');s.turns.push({id:'t',input:'归还书本',selected:0,variants:[{id:'v',text:'正文',status:'incomplete',createdAt:''}]});finishVariant(s,0,s.turns[0].variants[0],{event:'已归还书本'});const m=s.memories[0];expect(m.status).toBe('pending');expect(m.text).not.toContain('<Slate>');Object.assign(m,{record:normalizeMemoryResult(raw(),input()),status:'ready'});m.text=formatMemory(m.record!);
 const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];expect(restored.memories[0].record?.gains).toEqual(['获得报到信息']);
 restored.turns[0].variants.push({id:'other',text:'另一条路线',status:'complete',createdAt:'',outcome:{event:'没有约定'}});selectVariant(restored,0,1);expect(visibleMemories(restored)).toEqual([]);truncate(restored,0);expect(restored.memories).toEqual([]);
});
it('查询结合用户输入、在场char和近期事件，向量能够召回没有相同关键词的旧事',()=>{
 const r=input(),query=buildRecallQuery('那件事还算数吗',r.before,['借书']);expect(query).toContain('样例引导员');expect(query).toContain('借书');const ranked=rankMemories([{id:'unrelated',text:'食堂菜单',vector:[0,1]},{id:'relevant',text:'曾答应归还借阅资料',vector:[1,0]}],query,[1,0]);expect(ranked[0]).toBe('relevant');
});
it('文字编辑或更换向量模型后旧索引失效，签名不受附带约定列表变化影响',()=>{
 const m={id:'n',kind:'note' as const,text:'原文',createdAt:'',vector:{model:'model-a',text:'原文',values:[1,0]}};expect(vectorCurrent(m,'model-a')).toBe(true);expect(vectorCurrent({...m,text:'新文'},'model-a')).toBe(false);expect(vectorCurrent(m,'model-b')).toBe(false);
 const r=input();expect(memorySignature(r)).toBe(memorySignature(Object.assign({},r,{priorCommitments:[{id:'extra',participants:['甲'],content:'约定',deadline:'未明确',status:'open'}]})));expect(memorySignature(r)).not.toBe(memorySignature({...r,story:'正文被编辑'}));
});
