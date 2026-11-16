import {expect,it} from 'vitest';
import {applyMvu} from '../src/domain/mvu';
import {terminalStoryClock,scenePaths,sceneSnapshotLabel} from '../src/domain/storyScene';
import {newSession,stateAt,backup,parseBackup,defaults} from '../src/domain/story';
it('initializes only scene values on the first scene patch and restores them per variant and backup',()=>{
 const s=newSession('剧情日期',{name:'玩家',appearance:'',personality:'',background:''},'');
 const first={id:'v1',text:'放学了',status:'complete' as const,createdAt:'now',outcome:{event:'放学',mvu:[{op:'replace' as const,path:scenePaths.日期,value:'2042-03-05'},{op:'replace' as const,path:scenePaths.时间,value:'18:42'},{op:'replace' as const,path:scenePaths.地点,value:'学院图书馆'}]}};
 const second={...first,id:'v2',outcome:{event:'上课',mvu:[{op:'replace' as const,path:scenePaths.时间,value:'09:10'}]}};
 s.turns.push({id:'t1',input:'继续',selected:0,variants:[first,second]});
 expect(terminalStoryClock(stateAt(s))).toMatchObject({time:'18:42',label:'2042-03-05',location:'学院图书馆'});
 s.turns[0].selected=1;expect(terminalStoryClock(stateAt(s)).time).toBe('09:10');
 const restored=parseBackup(backup({version:1,preferences:defaults(),sessions:[s]})).sessions[0];
 expect(terminalStoryClock(stateAt(restored)).time).toBe('09:10');restored.turns=[];expect(terminalStoryClock(stateAt(restored)).time).toBe('— : —');
});
it('uses narrative values for legacy saves and never uses the computer clock',()=>{
 expect(terminalStoryClock(undefined,'2042年3月5日 星期三 18:42 图书馆')).toMatchObject({time:'18:42',label:'2042年3月5日',day:3});
 expect(terminalStoryClock()).toMatchObject({time:'— : —',label:'剧情日期待明确',day:0});
});
it('keeps fictional calendar labels without inventing Gregorian weekdays or reading the wall clock',()=>{
 expect(terminalStoryClock(undefined,'星历578年09月01日 08:00')).toMatchObject({label:'星历578年09月01日',time:'08:00',day:0});
 expect(terminalStoryClock(undefined,'2042-03-05 08:00').day).toBe(0);
 expect(sceneSnapshotLabel({日期:'2042-03-05',时间:'08:00',地点:'教室'})).toBe('2042-03-05 · 08:00 · 教室');
 expect(sceneSnapshotLabel({日期:'星历578年09月01日',星期:'星期三',时间:'08:00',地点:'教室'})).toContain('星期三');
});
it('does not add scene fields to unrelated patches and rejects malformed scene time',()=>{
 const state={player:{id:'player',name:'玩家',present:true},characters:[],variables:{score:1}};
 expect(applyMvu(state,[{op:'delta',path:'/custom/score',value:1}]).variables).toEqual({score:2});
 expect(()=>applyMvu(state,[{op:'replace',path:scenePaths.时间,value:'99:99'}])).toThrow();
 expect(state.variables).toEqual({score:1});
});
