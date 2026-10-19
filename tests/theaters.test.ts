import {expect,it} from 'vitest';
import {cleanTheaters,cleanTheaterScenes,defaultTheaters,determinePairing,visibleTheaters} from '../src/domain/theaters';
import {backup,defaults,finishVariant,newSession,parseBackup,selectVariant,truncate,visibleMemories} from '../src/domain/story';
const persona={name:'玩家',appearance:'',personality:'',background:'',primaryGender:'男',pairingPreference:'BL-攻'};
const char={id:'c',name:'角色',present:false,primaryGender:'男',secondaryGender:'Omega'};
it('旧四槽设置迁移时保留自定义内容与开关，只补关闭的新槽位',()=>{
 const old=defaultTheaters().slice(0,4);old[0].enabled=false;old[3].enabled=true;old[3].instruction='自定义规则';
 const migrated=cleanTheaters(old);expect(migrated.slice(0,4)).toEqual(old);expect(migrated.slice(4).map(s=>[s.slot,s.enabled])).toEqual([[5,false],[6,false],[7,false]]);
 const prefs=defaults();prefs.theaters=old;const restored=parseBackup(backup({version:1,preferences:prefs,sessions:[]}));expect(restored.preferences.theaters).toEqual(migrated);
 expect(cleanTheaters([...old.slice(0,3),{...old[3],slot:7}]).map(s=>s.slot)).toEqual([1,2,3,7]);
});
it('小剧场结果支持新增位置，重复槽位仍拒绝',()=>{
 const scenes=Array.from({length:6},(_,i)=>({slot:i+2,kind:'custom' as const,title:'片段'+i,content:'独立内容'+i}));
 expect(cleanTheaterScenes(scenes)).toHaveLength(6);expect(cleanTheaterScenes([...scenes,{...scenes[0],slot:8}])).toHaveLength(7);expect(()=>cleanTheaterScenes([scenes[0],scenes[0]])).toThrow();
 const s=newSession('六剧场',persona,''),v={id:'six',text:'正文',status:'incomplete' as const,createdAt:''};s.turns.push({id:'t',input:'行动',selected:0,variants:[v]});finishVariant(s,0,v,{event:'主线',theaters:scenes});
 expect(visibleTheaters(parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0]).map(s=>s.slot)).toEqual([2,3,4,5,6,7]);
});
it('论坛独立，玩家新增的小剧场设置可导出回读',()=>{
  expect(cleanTheaters(undefined).filter(t=>t.enabled).map(t=>t.kind)).toEqual(['forum','group']);
  const settings=defaultTheaters();settings[3].enabled=true;expect(cleanTheaters(settings)).toHaveLength(7);
  const expanded=cleanTheaters([...settings,...Array.from({length:8},(_,i)=>({...settings[3],slot:8+i,title:'新增'+i,enabled:true}))]);
  const prefs=defaults();prefs.theaters=expanded;
  expect(parseBackup(backup({version:1,preferences:prefs,sessions:[]})).preferences.theaters).toEqual(expanded);
  expect(()=>cleanTheaters([...settings,{...settings[3],slot:8.5}])).toThrow();
  settings[0].kind='custom';expect(()=>cleanTheaters(settings)).toThrow();
});
it('配对只用明确人设：支持 BL 攻受和 BG／GB，未知性别不按 ABO 猜测',()=>{
  expect(determinePairing(persona,char)).toMatchObject({category:'BL',userRole:'攻'});
  expect(determinePairing({...persona,pairingPreference:'BL-受'},char).userRole).toBe('受');
  expect(determinePairing({...persona,primaryGender:'女',pairingPreference:'GB'},char).category).toBe('GB');
  expect(determinePairing({...persona,primaryGender:'女',pairingPreference:'BG'},char).category).toBe('BG');
  expect(determinePairing(persona,{...char,primaryGender:undefined}).category).toBe('待补充');
});
it('小剧场与精神体 OS 仅来自有效稿件，切稿回退同步恢复，不写入主线记忆',()=>{
  const s=newSession('测试',persona,'开场');s.initial.characters=[char];s.initial.player.spiritAnimal='白猫';
  const first={id:'a',text:'主线正文',status:'incomplete' as const,createdAt:''};s.turns.push({id:'t',input:'行动',selected:0,variants:[first]});
  finishVariant(s,0,first,{event:'主线事件',player:{spiritThought:'想睡觉'},characters:[{id:'c',spiritAnimal:'白虎',spiritThought:'先观察'}],theaters:[{slot:2,kind:'group',title:'群聊',content:'',messages:[{speaker:'角色',content:'小剧场独有消息'}]}]});
  expect(visibleTheaters(s)[0].messages?.[0].content).toBe('小剧场独有消息');expect(visibleMemories(s)[0].text).not.toContain('小剧场独有消息');
  const second={id:'b',text:'另一稿',status:'incomplete' as const,createdAt:''};s.turns[0].variants.push(second);finishVariant(s,0,second,{event:'另一事件',theaters:[]});selectVariant(s,0,1);expect(visibleTheaters(s)).toEqual([]);
  selectVariant(s,0,0);const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];expect(visibleTheaters(restored)).toHaveLength(1);
  truncate(restored,0);expect(visibleTheaters(restored)).toEqual([]);
});
it('不接受 char 与 char 作为同人文的主角字段',()=>{
  const s=newSession('测试',persona,'');s.initial.characters=[char];const v={id:'bad',text:'正文',status:'incomplete' as const,createdAt:''};s.turns.push({id:'t',input:'行动',selected:0,variants:[v]});
  expect(()=>finishVariant(s,0,v,{event:'事件',theaters:[{slot:3,kind:'fanfic',title:'错误配对',content:'番外',participantIds:['c','d']}]})).toThrow();
});
