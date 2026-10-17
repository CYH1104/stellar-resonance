import {expect,it} from 'vitest';
import {defaults} from '../src/domain/story';
import {exportApiSettings,parseApiSettings} from '../src/domain/apiTransfer';

it('主副向量、路由与开关往返，无关资料与 Key 默认不导出',()=>{
 const p=defaults();p.stateProfile='aux';p.summaryProfile='aux';p.forumReplyProfile='aux';p.vectorEnabled=true;p.forumReplyEnabled=true;
 Object.assign(p.profiles[0],{apiBaseUrl:'https://synthetic.example/v1',model:'test',topP:0.8});
 const text=exportApiSettings(p,{main:'synthetic-secret'}),result=parseApiSettings(text);
 expect(result.configuration.profiles).toEqual(p.profiles);expect(result.configuration.stateProfile).toBe('aux');expect(result.configuration.summaryProfile).toBe('aux');expect(result.configuration.forumReplyEnabled).toBe(true);
 expect(text).not.toContain('synthetic-secret');expect(text).not.toContain('presets');expect(text).not.toContain('worldbooks');expect(result.keys).toBeUndefined();
 expect(parseApiSettings(exportApiSettings(p,{main:'synthetic-secret'},true)).keys).toEqual({main:'synthetic-secret'});
});
it('错误引用、重复接口、恶意地址和非数值参数均拒绝',()=>{
 const original=JSON.parse(exportApiSettings(defaults(),{}));
 for(const change of [
  (v:any)=>v.configuration.profiles.push(v.configuration.profiles[0]),
  (v:any)=>v.configuration.summaryProfile='missing',
  (v:any)=>v.configuration.stateProfile='embed',
  (v:any)=>v.configuration.mainProfile='embed',
  (v:any)=>v.configuration.profiles[0].apiBaseUrl='https://user:password@synthetic.example',
  (v:any)=>v.configuration.profiles[0].maxTokens='1600',
  (v:any)=>v.keys={__unknown:'secret'},
  (v:any)=>v.configuration.profiles[0].id='__proto__',
 ]){const v=structuredClone(original);change(v);expect(()=>parseApiSettings(JSON.stringify(v))).toThrow();}
 expect(()=>parseApiSettings('x'.repeat(1024*1024+1))).toThrow('1MB');
 expect(()=>parseApiSettings('not json')).toThrow();
});
it('未知字段不进入配置，未配置的可选接口可以备份',()=>{
 const value=JSON.parse(exportApiSettings(defaults(),{}));value.configuration.presets=[{content:'unwanted'}];value.configuration.profiles[0].apiKey='unwanted';
 const result=parseApiSettings('\uFEFF'+JSON.stringify(value));expect(JSON.stringify(result)).not.toContain('unwanted');expect(result.configuration.profiles).toHaveLength(3);
});
