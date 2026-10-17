import {it,expect} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import SpiritPersonaFields from '../src/components/SpiritPersonaFields.vue';
import ActorCard from '../src/components/ActorCard.vue';
import {blankPersona,normalizePersona,mergePersonaDraft} from '../src/domain/persona';
import {newSession,finishVariant,stateAt,backup,parseBackup,defaults,truncate} from '../src/domain/story';
import {separateIdentityAbility} from '../src/domain/identityAbility';
it('精神体四项独立输入，可持久保存与恢复；AI 填表保留用户已填性格',async()=>{
 const persona=normalizePersona({...blankPersona(),name:'玩家',spiritAnimal:'白猫',spiritName:'糯米',spiritAppearance:'蓝眼睛',spiritPersonality:'嘴硬心软',spiritAbility:'感知情绪'});
 const html=await renderToString(createSSRApp(SpiritPersonaFields,{persona}));for(const label of ['精神体姓名','精神体外貌','精神体性格','精神体能力'])expect(html).toContain(label);
 const s=newSession('精神体测试',persona,'');const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()}));expect(restored.sessions[0].persona).toEqual(persona);
 expect(mergePersonaDraft(persona,{...persona,spiritPersonality:'不应覆盖'}).spiritPersonality).toBe('嘴硬心软');expect(()=>normalizePersona({...persona,spiritAbility:42})).toThrow();
});
it('旧人设无新字段仍可使用，身份中的异能分离且不把职位当异能',()=>{
 const p=normalizePersona({name:'玩家',appearance:'',background:'',personality:'',identity:'破军系新生，异能「言出法随」'});expect(p.identity).toBe('破军系新生');expect(p.ability).toBe('言出法随');expect(p.spiritPersonality).toBe('');
 expect(separateIdentityAbility({identity:'学院董事会 院长\n学生会 会长'})).toEqual({identity:'学院董事会 院长\n学生会 会长'});
 const clean=separateIdentityAbility({identity:'破军系 一年级，异能「言出法随」',ability:'已有异能'});expect(clean.ability).toBe('已有异能\n言出法随');expect(separateIdentityAbility(clean)).toEqual(clean);
});
it('异能 MVU 独立保存，回退与备份恢复一致，状态栏不再混入身份',async()=>{
 const s=newSession('状态',{...blankPersona(),name:'玩家',identity:'破军系 一年级',ability:'感知'},'');const v={id:'v',text:'正文',status:'incomplete' as const,createdAt:''};s.turns.push({id:'t',input:'行动',selected:0,variants:[v]});
 finishVariant(s,0,v,{event:'使用能力',player:{identity:'破军系 一年级，异能「言出法随」'},characters:[{id:'guide',present:true,ability:'空间感知'}]});
 const state=stateAt(s);expect(state.player.identity).toBe('破军系 一年级');expect(state.player.ability).toBe('言出法随');expect(state.characters[0].ability).toBe('空间感知');
 const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];expect(stateAt(restored).player.ability).toBe('言出法随');truncate(restored,0);expect(stateAt(restored).player.ability).toBe('感知');
 const html=await renderToString(createSSRApp(ActorCard,{actor:{id:'player',name:'玩家',present:true,identity:'破军系新生，异能「言出法随」'},player:true}));expect(html).toContain('【破军系新生】');expect(html).toMatch(/<dt[^>]*>异能<\/dt>/);expect(html).toContain('言出法随');expect(html).not.toContain('【破军系新生，异能');
});
