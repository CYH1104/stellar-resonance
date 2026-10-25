import {it,expect} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import WorldView from '../src/components/WorldView.vue';
import {newSession,finishVariant,stateAt,encounteredCharacters,selectVariant,backup,parseBackup,defaults} from '../src/domain/story';
it('keeps previously encountered NPCs in the relation graph after they leave while hiding never-met NPCs',async()=>{
 const s=newSession('测试',{name:'玩家',appearance:'',background:'',personality:''},'开场');s.initial.characters=s.initial.characters.map(c=>({...c,present:false}));
 const append=(characters:unknown[])=>{const v={id:crypto.randomUUID(),text:'正文',status:'incomplete' as const,createdAt:''};s.turns.push({id:crypto.randomUUID(),input:'行动',selected:0,variants:[v]});finishVariant(s,s.turns.length-1,v,{event:'事件',characters});};
 append([{id:'guide',present:true,affinity:5}]);append([{id:'guide',present:false}]);
 const html=await renderToString(createSSRApp(WorldView,{kind:'relations',w:{preferences:defaults(),state:stateAt(s),active:s} as never}));
 expect(html).toContain('样例引导员');expect(html).not.toContain('样例巡检员');expect(html).toContain('好感度 5');
});
it('retains MVU-only presence and affinity encounters after departure, but not discarded branches',async()=>{
 const s=newSession('MVU关系',{name:'玩家',appearance:'',background:'',personality:''},'开场');s.initial.characters.forEach(c=>c.present=false);
 const v={id:'v',text:'见面',status:'incomplete' as const,createdAt:''};s.turns.push({id:'t',input:'互动',selected:0,variants:[v]});
 finishVariant(s,0,v,{event:'互动',mvu:[{op:'replace',path:'/characters/guide/present',value:true},{op:'delta',path:'/characters/guide/affinity',value:-10}],characters:[{id:'guide',affinity:30}]});
 expect(stateAt(s).characters[0].affinity).toBe(20);
 const depart={id:'v2',text:'离开',status:'incomplete' as const,createdAt:''};s.turns.push({id:'t2',input:'离开',selected:0,variants:[depart]});finishVariant(s,1,depart,{event:'离开',mvu:[{op:'replace',path:'/characters/guide/present',value:false}]});
 expect(encounteredCharacters(s).map(a=>a.id)).toEqual(['guide']);
 const html=await renderToString(createSSRApp(WorldView,{kind:'relations',w:{preferences:defaults(),state:stateAt(s),active:s} as never}));expect(html).toContain('好感度 20');expect(html).toContain('样例引导员');
 const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];expect(stateAt(restored).characters[0].affinity).toBe(20);
 s.turns[0].variants.push({id:'alternative',text:'没有见面',status:'complete',createdAt:'',outcome:{event:'等待'}});selectVariant(s,0,1);expect(encounteredCharacters(s)).toEqual([]);
});
