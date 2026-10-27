import {it,expect} from 'vitest';
import {generationSections,orderedSections} from '../src/domain/runLogSections';
import type {Variant,WorldState,Memory} from '../src/domain/contracts';
it('shows finish metadata in ordinary logs without misclassifying it as an error',()=>{
 const sections=generationSections({errors:[],variant:{id:'v',text:'正文',status:'complete',createdAt:''},before:state(),after:state(),applied:true,variables:{applied:true,total:0,changes:[],reviews:[],details:[],codes:[]},completionInfo:'上游结束原因：length\n请求输出上限：2000 tokens'});
 expect(sections.find(s=>s.title==='上游结束信息')?.text).toContain('length');
 expect(sections.some(s=>s.kind==='errors')).toBe(false);
});
const state=(name='玩家'):WorldState=>({player:{id:'player',name,present:true},characters:[{id:'a',name:'甲',present:true}]});
it('orders errors first, then actual content, MVU, terminal activity and a real vector trace',()=>{
 const before=state(),after=state();after.characters[0].affinity=20;
 const variant:Variant={id:'v',text:'正文内容',status:'complete',createdAt:'now',outcome:{event:'事件',characters:[{id:'a',affinity:20}],theaters:[{slot:4,kind:'custom',title:'小剧场',content:'剧场内容'}],terminal:{groups:[{id:'g',title:'群',members:['a'],ownerId:'a',adminIds:[],announcement:'',messages:[{id:'a',text:'群消息'}],topic:'话题'}],privateMessages:[{id:'a',text:'私聊内容',topic:'问候'}],friendRequests:[]},mvu:[{op:'replace',path:'/characters/0/affinity',value:20}]}};
 const sections=generationSections({errors:['校验错误'],variant,outcome:variant.outcome,before,after,applied:true,variables:{applied:true,total:1,changes:[],reviews:[],details:[],codes:[]},recall:{mode:'vector+keyword',query:'查询',candidates:3,hits:[{id:'m',kind:'note',text:'召回片段',createdAt:'now'}] as Memory[]},raw:'供应商原始输出'});
 expect(sections.map(s=>s.kind)).toEqual(['errors','prose','characters','theaters','terminal','variables','terminalActivity','modelOutput','vector']);
 expect(orderedSections([...sections].reverse()).map(s=>s.kind)).toEqual(sections.map(s=>s.kind));
 expect(sections.find(s=>s.kind==='prose')?.text).toBe('正文内容');expect(sections.find(s=>s.kind==='terminal')?.text).toContain('私聊内容');expect(sections.find(s=>s.kind==='theaters')?.text).toContain('剧场内容');expect(sections.find(s=>s.kind==='terminalActivity')?.text).toContain('群消息');expect(sections.find(s=>s.kind==='vector')?.text).toContain('向量 + 关键词');expect(sections.find(s=>s.kind==='variables')?.variables?.details.join(' ')).toContain('MVU 1');expect(sections.find(s=>s.kind==='modelOutput')?.text).toBe('供应商原始输出');
});
it('never pretends a state-only call retrieved vectors',()=>{
 const variant:Variant={id:'v',text:'',status:'complete',createdAt:'now'};
 const sections=generationSections({errors:[],variant,before:state(),after:state(),applied:false,variables:{applied:false,total:0,changes:[],reviews:[],details:[],codes:[]},stateOnly:true});
 expect(sections.find(s=>s.kind==='vector')).toBeUndefined();expect(sections.find(s=>s.kind==='modelOutput')).toBeUndefined();
});


it('captures actual MVU-only state snapshots rather than claiming no character updates',()=>{
 const after=state();after.characters[0].affinity=37;
 const sections=generationSections({errors:[],variant:{id:'v',text:'完成',status:'complete',createdAt:'now'},outcome:{event:'完成',mvu:[{op:'replace',path:'/characters/0/affinity',value:37}]},before:state(),after,applied:true,variables:{applied:true,total:1,changes:[],reviews:[],details:[],codes:[]}});
 expect(sections.find(s=>s.kind==='characters')?.text).toContain('37');expect(sections.find(s=>s.kind==='vector')).toBeUndefined();
});
