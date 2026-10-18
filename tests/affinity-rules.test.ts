import {it,expect} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import WorldView from '../src/components/WorldView.vue';
import type {ViewModel} from '../src/app/useWorkspace';
import {affinityEdgeStyle,affinitySchema,validAffinity} from '../src/domain/affinity';
import {applyMvu,dataFromState,parseMvuMessage} from '../src/domain/mvu';
import {newSession,stateAt,finishVariant,backup,parseBackup,defaults} from '../src/domain/story';

const session=()=>newSession('关系',{name:'玩家',appearance:'',personality:'',background:''},'开场');
it('shares affinity boundaries across schema and patch validation without resetting old values',()=>{
 const original=stateAt(session());
 for(const value of [-100,-1,0,100,150,200]){
  expect(validAffinity(value)).toBe(true);
  expect(applyMvu(original,[{op:'replace',path:'/characters/guide/affinity',value}]).characters[0].affinity).toBe(value);
 }
 for(const value of [-101,201,NaN,Infinity,'',false])expect(validAffinity(value)).toBe(false);
 expect(dataFromState(original).schema?.properties).toMatchObject({characters:{additionalProperties:{properties:{affinity:affinitySchema}}}});
 expect(()=>applyMvu(original,[{op:'delta',path:'/characters/guide/affinity',value:2},{op:'replace',path:'/characters/engineer/affinity',value:201}])).toThrow();
 expect(original.characters[0].affinity).toBe(30);
});
it('accepts explicit numeric strings in captured MVU patches but never empty or labelled values',()=>{
 const state=stateAt(session());const patch=(value:unknown,op='replace')=>parseMvuMessage('<UpdateVariable>\n<JSONPatch>'+JSON.stringify([{op,path:'/characters/guide/affinity',value}])+'</JSONPatch>\n</UpdateVariable>');
 expect(applyMvu(state,patch('150')).characters[0].affinity).toBe(150);
 expect(applyMvu(state,patch('2','delta')).characters[0].affinity).toBe(32);
 for(const value of ['', ' ', '150分',true,'Infinity','201'])expect(()=>applyMvu(state,patch(value))).toThrow();
});
it('preserves 200 and negative values across completed rounds and browser backup import',()=>{
 const s=session();for(const [i,affinity]of [200,-100,150].entries()){
  const v={id:'v'+i,text:'关系变化',status:'incomplete' as const,createdAt:''};s.turns.push({id:'t'+i,input:'行动',selected:0,variants:[v]});finishVariant(s,i,v,{event:'关系变化',mvu:[{op:'replace',path:'/characters/guide/affinity',value:affinity}]});
 }
 const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()}));expect(stateAt(restored.sessions[0]).characters[0].affinity).toBe(150);
 const v={id:'bad',text:'正文保留',status:'incomplete' as const,createdAt:''};s.turns.push({id:'bad',input:'行动',selected:0,variants:[v]});expect(()=>finishVariant(s,3,v,{event:'异常',characters:[{id:'guide',affinity:201}]})).toThrow();expect(v.status).toBe('incomplete');
});
it('renders pale red negative edges and keeps positive line strength increasing through 200',async()=>{
 expect(affinityEdgeStyle(-50).stroke).toBe('#d99b9b');expect(affinityEdgeStyle(0).stroke).toBe('var(--color-accent)');expect(affinityEdgeStyle(200).strokeWidth).toBeGreaterThan(affinityEdgeStyle(100).strokeWidth);
 const s=session(),state=stateAt(s);state.characters[0].affinity=-50;state.characters[1].affinity=200;
 const w={state,active:s,preferences:defaults()} as unknown as ViewModel;
 const html=await renderToString(createSSRApp(WorldView,{w,kind:'relations'}));expect(html).toContain('stroke:#d99b9b');expect(html).toContain('好感度 -50');expect(html).toContain('好感度 200');
});
