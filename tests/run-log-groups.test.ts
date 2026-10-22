import {it,expect} from 'vitest';
import {runLogGroups,copyableRunLog} from '../src/domain/runLogGroups';
import type {FormatErrorRecord} from '../src/storage/formatErrors';
const row=(id:string,sessionId:string,turnId:string,code:string,at:string,kind:FormatErrorRecord['kind']='runtime'):FormatErrorRecord=>({id,sessionId,turnId,code,at,kind,raw:id});
it('combines generation, compatibility and delayed errors across dates in the original round',()=>{
 const entries=[row('memory','s','t','后台记忆整理','2026-10-22T00:00:01Z'),row('done','s','t','GENERATION_COMPLETE','2026-10-21T23:59:59Z','generation'),row('format','s','t','STATE_COMPAT_RECOVERED','2026-10-21T23:59:58Z','format')];
 const groups=runLogGroups(entries,[{id:'s',name:'旅程',turns:[{id:'before'},{id:'t'}] as any}]);
 expect(groups).toHaveLength(1);expect(groups[0]).toMatchObject({name:'旅程',round:2,errors:1,generations:1});expect(groups[0].entries.map(e=>e.id)).toEqual(['format','done','memory']);expect(entries[0].id).toBe('memory');
});
it('keeps sessions and rounds separate while retaining retries',()=>{
 const entries=[row('a','s','t','GENERATION_INCOMPLETE','3','generation'),row('b','s','t','GENERATION_COMPLETE','4','generation'),row('c','other','t','error','2'),row('d','s','other','error','1')];
 const groups=runLogGroups(entries,[]);expect(groups).toHaveLength(3);expect(groups[0]).toMatchObject({generations:2,errors:1});expect(groups.flatMap(g=>g.entries)).toHaveLength(4);
});
it('retains deleted-turn metadata and never merges unidentified records',()=>{
 const groups=runLogGroups([{...row('a','removed','old','error','1'),round:9},row('b','','','error','2'),row('c','','','error','3')],[]);
 expect(groups).toHaveLength(3);expect(groups.find(g=>g.turnId==='old')?.round).toBe(9);
});
it('copies all records of one round including source identifiers and variable snapshots',()=>{
 const entries=[{...row('done','s','t','GENERATION_COMPLETE','2','generation'),round:2,variantId:'v',variables:{applied:true,total:0,changes:[],reviews:[],details:[],codes:[]}},row('error','s','t','后台记忆整理','3')];
 const text=copyableRunLog(runLogGroups(entries,[])[0]);
 for(const value of ['第 2 轮','会话 s','楼层 t','稿件 v','GENERATION_COMPLETE','后台记忆整理','变量变化','"applied": true'])expect(text).toContain(value);
 expect(text.indexOf('GENERATION_COMPLETE')).toBeLessThan(text.indexOf('后台记忆整理'));
});
