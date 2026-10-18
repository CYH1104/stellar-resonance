import {it,expect} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import WorldView from '../src/components/WorldView.vue';
import {newSession,finishVariant,stateAt} from '../src/domain/story';
it('keeps previously encountered NPCs in the relation graph after they leave while hiding never-met NPCs',async()=>{
 const s=newSession('测试',{name:'玩家',appearance:'',background:'',personality:''},'开场');s.initial.characters=s.initial.characters.map(c=>({...c,present:false}));
 const append=(characters:unknown[])=>{const v={id:crypto.randomUUID(),text:'正文',status:'incomplete' as const,createdAt:''};s.turns.push({id:crypto.randomUUID(),input:'行动',selected:0,variants:[v]});finishVariant(s,s.turns.length-1,v,{event:'事件',characters});};
 append([{id:'guide',present:true,affinity:5}]);append([{id:'guide',present:false}]);
 const html=await renderToString(createSSRApp(WorldView,{kind:'relations',w:{state:stateAt(s),active:s} as never}));
 expect(html).toContain('样例引导员');expect(html).not.toContain('样例巡检员');expect(html).toContain('好感度 5');
});
