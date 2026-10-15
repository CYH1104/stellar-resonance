import {expect,it} from 'vitest';
import {ReasoningFilter,stripReasoning} from '../src/domain/reasoning';
import {backup,defaults,newSession,parseBackup} from '../src/domain/story';
it('模型思考标签在任意分片下均不进入可见输出，支持嵌套和未闭合时隐藏到底',()=>{
  const text='<ThInK>synthetic-secret<analysis>nested</analysis></ThInK>正文。<cot>another-secret</cot>结尾。';
  for(let n=1;n<=text.length;n++){const f=new ReasoningFilter();let out='';for(let i=0;i<text.length;i+=n)out+=f.push(text.slice(i,i+n));out+=f.finish();expect(out).toBe('正文。结尾。');}
  expect(stripReasoning('正文<think>未闭合secret')).toBe('正文');expect(stripReasoning('正文<thi')).toBe('正文');expect(stripReasoning('角色内心想法：先观察。精神体OS：想睡觉。')).toContain('精神体OS');
  expect(stripReasoning('<!--secret<think>fake</think>-->正文')).toBe('正文');expect(stripReasoning('正文<!--secret')).toBe('正文');
  const f=new ReasoningFilter();expect(f.push('<!')+f.finish()).toBe('');expect(f.push('--secret-->正文')+f.finish()).toBe('正文');
});
it('历史备份恢复与重新导出会移除模型思考及独立推理字段，保留玩家预设原文',()=>{
  const s=newSession('测试',{name:'玩家',appearance:'',personality:'',background:''},'');s.turns.push({id:'t',input:'行动',selected:0,variants:[{id:'v',text:'<think>synthetic-secret</think>保留正文',status:'incomplete',createdAt:'',reasoning:'extra-secret'} as any]});
  s.memories.push({id:'m',kind:'event',text:'<analysis>memory-secret</analysis>事件',createdAt:''});const p=defaults();p.presets[0].content='用户自己的提示词<think>模板</think>';
  const raw=JSON.stringify({version:1,sessions:[s],preferences:p});const restored=parseBackup(raw),out=backup(restored);expect(restored.sessions[0].turns[0].variants[0].text).toBe('保留正文');expect(out).not.toContain('synthetic-secret');expect(out).not.toContain('extra-secret');expect(out).not.toContain('memory-secret');expect(out).toContain('用户自己的提示词');expect(out).toContain('<think>模板</think>');
});
