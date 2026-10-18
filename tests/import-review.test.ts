import {it,expect} from 'vitest';
import {computed} from 'vue';
import {defaults} from '../src/domain/story';
import {useWorldbooks} from '../src/app/useWorldbooks';
import {exportWorldbook,importWorldbook} from '../src/domain/worldbooks';
const sample=JSON.stringify({entries:{0:{uid:0,comment:'分组常驻',content:'中性占位正文',constant:true,group:'System'},1:{uid:1,comment:'空关键词',content:'空关键词正文',constant:false,key:[]},2:{uid:2,comment:'原本关闭',content:'关闭正文',constant:true,disable:true},3:{uid:3,comment:'普通条目',content:'保留正文',constant:true}}});
function harness(){const p=defaults();const w=useWorldbooks(p,computed(()=>undefined),()=>[],()=>false,async()=>{},()=>{},()=>{},()=>{});return {p,w};}
it('stages imports without binding or saving books; cancellation preserves previous data',()=>{
 const {p,w}=harness();w.importUserWorldbook(sample,'样本.json');expect(p.worldbooks||[]).toHaveLength(0);expect(p.defaultWorldbookIds||[]).toHaveLength(0);
 expect(w.worldbookImportPending.value?.rows).toHaveLength(3);expect(w.worldbookImportPending.value?.disabled).toEqual(['0','1','2']);
 w.cancelWorldbookImport();expect(w.worldbookImportPending.value).toBeUndefined();expect(p.worldbooks||[]).toHaveLength(0);
});
it('explicit enable-all overrides source switches and unsupported settings without dropping entries',()=>{
 const {p,w}=harness();w.importUserWorldbook(sample,'样本.json');w.worldbookImportPending.value!.disabled=[];w.confirmWorldbookImport();
 const b=p.worldbooks![0];expect(b.entries.map(e=>e.enabled)).toEqual([true,true,true,true]);expect(b.entries).toHaveLength(4);
 expect(JSON.parse(b.entries[0].extra).group).toBe('System');expect(b.entries[1].constant).toBe(false);
 const again=importWorldbook(exportWorldbook(b));expect(again.entries.map(e=>e.enabled)).toEqual([true,true,true,true]);
});
it('select all closes every listed candidate and handles multiple files in order',()=>{
 const {p,w}=harness();w.importUserWorldbook(sample,'一.json');w.importUserWorldbook(sample,'二.json');
 const pending=w.worldbookImportPending.value!;pending.disabled=pending.rows.map(r=>r.entry.id);w.confirmWorldbookImport();
 expect(p.worldbooks![0].entries.map(e=>e.enabled)).toEqual([false,false,false,true]);expect(w.worldbookImportPending.value?.book.name).toBe('二');
 w.cancelWorldbookImport();expect(p.worldbooks).toHaveLength(1);
});
