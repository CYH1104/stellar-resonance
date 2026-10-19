import {it,expect} from 'vitest';
import {createSSRApp,reactive} from 'vue';
import {renderToString} from 'vue/server-renderer';
import StateRepairReport from '../src/components/StateRepairReport.vue';
import StoryActions from '../src/components/StoryActions.vue';
import {createRepairAudit,validateRepairAudit} from '../src/domain/repairAudit';
import {newSession,finishVariant,stateAt,copy,backup,parseBackup,defaults} from '../src/domain/story';
it('records actual field changes and codes, keeps the original state immutable, and survives backup',()=>{
 const s=newSession('对照',{name:'玩家',appearance:'',background:'',personality:''},''),v={id:'v',text:'正文',createdAt:'',status:'incomplete' as const,repairAudit:undefined as ReturnType<typeof createRepairAudit>|undefined};s.turns.push({id:'t',input:'行动',selected:0,variants:[v]});
 const before=stateAt(s);finishVariant(s,0,v,{event:'交谈',characters:[{id:'guide',affinity:45,spiritThought:'想吃鱼'}]});v.repairAudit=createRepairAudit(v.id,before,stateAt(s),[],['STATE_FIELD_SKIPPED']);
 expect(v.repairAudit.changes).toContainEqual({path:'/characters/guide/affinity',before:30,after:45});expect(before.characters[0].affinity).toBe(30);
 const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()}));expect(restored.sessions[0].turns[0].variants[0].repairAudit).toEqual(v.repairAudit);
 expect(()=>validateRepairAudit({...v.repairAudit,variantId:'wrong'},v.id)).toThrow();
});
it('renders only the selected variant audit, collapsed by default, and reports unchanged/failed data honestly',async()=>{
 const s=newSession('稿件',{name:'玩家',appearance:'',background:'',personality:''},''),before=stateAt(s),after=copy(before);after.characters[0].affinity=45;
 s.turns=[{id:'t',input:'行动',selected:0,variants:[{id:'a',text:'甲稿',status:'complete',createdAt:'',repairAudit:createRepairAudit('a',before,after,[],['STATE_FIELD_SKIPPED'])},{id:'b',text:'乙稿',status:'complete',createdAt:'',repairAudit:createRepairAudit('b',before,before,[],[],'接口失败')}]}];
 const w=reactive({active:s,replayWarnings:[],busy:false,canContinue:true,preferences:defaults()});
 let html=await renderToString(createSSRApp(StateRepairReport,{w:w as never,turnId:'t'}));expect(html).toContain('/characters/guide/affinity');expect(html).toContain('45');expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);expect(html).not.toContain('接口失败');
 s.turns[0].selected=1;html=await renderToString(createSSRApp(StateRepairReport,{w:w as never,turnId:'t'}));expect(html).toContain('接口失败');expect(html).toContain('没有已应用的变量变化');expect(html).not.toContain('/characters/guide/affinity');
 const menu=await renderToString(createSSRApp(StoryActions,{w:w as never,index:0,showAvatar:true,showVariables:true}));expect(menu).toContain('撤回');expect(menu).not.toContain('从此幕重来');expect(menu).not.toContain('repair-result');
});
