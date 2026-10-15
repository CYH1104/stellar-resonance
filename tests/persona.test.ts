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
  for(const data of [{name:'访客',privateWorldbook:'不可用'},{name:''},{name:'访客',spiritAnimal:[]},{name:'访客',other:'x'.repeat(3001)}])expect(()=>mergePersonaDraft(current,data)).toThrow();
  expect(current).toEqual(blankPersona());
});
it('精神体和其他内容进入玩家人设并随备份恢复',()=>{
  const s=newSession('测试',{...blankPersona(),name:'林星',spiritAnimal:'白色小猫',other:'不擅长早起'},'迎新');
  const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];
  expect(restored.persona.spiritAnimal).toBe('白色小猫');expect(restored.persona.other).toBe('不擅长早起');
});
