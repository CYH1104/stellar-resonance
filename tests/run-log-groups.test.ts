import {it,expect} from 'vitest';
import {runLogGroups} from '../src/domain/runLogGroups';
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
