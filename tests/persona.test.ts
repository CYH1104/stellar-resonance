import {expect,it} from 'vitest';
import {blankPersona,mergePersonaDraft,normalizePersona} from '../src/domain/persona';
import {backup,defaults,newSession,parseBackup} from '../src/domain/story';
it('开始游戏拒绝空白姓名，AI 填写前允许空草稿',()=>{
  expect(()=>newSession('测试',blankPersona(),'')).toThrow('姓名');
  expect(()=>normalizePersona({...blankPersona(),name:'  \n '})).toThrow('姓名');
  expect(normalizePersona(blankPersona(),false).name).toBe('');
});
it('AI 只补空白字段，玩家原有姓名、精神体和其他补充保留',()=>{
  const current={...blankPersona(),name:'我起的名字',spiritAnimal:'雪豹',other:'我的补充'};
  const result=mergePersonaDraft(current,{...blankPersona(),name:'AI 起名',spiritAnimal:'狼',other:'AI 补充',background:'学院新生',personality:'慢热'});
  expect(result).toMatchObject({name:'我起的名字',spiritAnimal:'雪豹',other:'我的补充',background:'学院新生',personality:'慢热'});
  expect(current.background).toBe('');
});
it('坏的 AI 人设不会修改原草稿',()=>{
  const current=blankPersona();
  for(const data of [{name:'访客',privateWorldbook:'不可用'},{name:''},{name:'访客',spiritAnimal:[]}])expect(()=>mergePersonaDraft(current,data)).toThrow();
  expect(current).toEqual(blankPersona());
});
it('精神体和其他内容进入玩家人设并随备份恢复',()=>{
  const s=newSession('测试',{...blankPersona(),name:'林星',spiritAnimal:'白色小猫',other:'不擅长早起'},'迎新');
  const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];
  expect(restored.persona.spiritAnimal).toBe('白色小猫');expect(restored.persona.other).toBe('不擅长早起');
});

it('精神力等级可填写、AI补空、保存，并迁移其他栏旧字段而不猜测等级',()=>{
 const p=normalizePersona({...blankPersona(),name:'玩家',mentalPowerLevel:'S+'});expect(p.mentalPowerLevel).toBe('S+');expect(mergePersonaDraft(p,{...blankPersona(),name:'AI',mentalPowerLevel:'B'}).mentalPowerLevel).toBe('S+');
 const old={name:'玩家',appearance:'',personality:'',background:'',other:'精神力等级：A级'};expect(normalizePersona(old).mentalPowerLevel).toBe('A级');
 const s=newSession('存档',old,'');delete s.persona.mentalPowerLevel;const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];expect(restored.persona.mentalPowerLevel).toBe('A级');
 expect(()=>normalizePersona({...p,mentalPowerLevel:5})).toThrow();expect(normalizePersona({...p,mentalPowerLevel:'x'.repeat(101)}).mentalPowerLevel).toHaveLength(101);
});

it('长人设字段保存与备份恢复时不截断',()=>{const text="设定".repeat(40000);const p={...blankPersona(),name:"玩家",background:text,rawText:text};expect(normalizePersona(p).background).toBe(text);const s=newSession("长人设",p,"");expect(parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0].persona.rawText).toBe(text);});

