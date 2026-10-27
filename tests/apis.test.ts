import {expect,it} from 'vitest';
import {defaults,backup,parseBackup} from '../src/domain/story';
import {apiConfigurationIssues,migrateApiSettings,requiredApis,taskApi,terminalApiIssues,textApiTasks} from '../src/domain/apis';
import type {Preferences,Profile} from '../src/domain/contracts';
const fill=(p:Profile)=>Object.assign(p,{apiBaseUrl:'https://synthetic.example/v1',model:'model-'+p.id});
const keys=(p:Preferences)=>Object.fromEntries(p.profiles.map(p=>[p.id,'synthetic-key']));
it('终端API独立选择并随备份保存，不能选择向量接口',()=>{const p=defaults();fill(p.profiles.find(x=>x.id==='aux')!);p.terminalProfile='aux';p.terminalEnabled=true;expect(taskApi(p,'terminal')?.id).toBe('aux');
 // 终端是可选功能：正文必需接口里不能出现它，终端就绪由 terminalApiIssues 单独把关。
 expect(requiredApis(p).some(x=>x.id==='aux')).toBe(false);
 expect(terminalApiIssues(p,{main:'synthetic-key',aux:'synthetic-key'},()=>true)).toEqual([]);
 expect(terminalApiIssues(p,{main:'synthetic-key'},()=>true)).toHaveLength(1);
 expect(apiConfigurationIssues(p,{main:'synthetic-key',aux:''},()=>false).some(x=>x.includes('终端'))).toBe(false);
 const restored=parseBackup(backup({version:1,sessions:[],preferences:p}));expect(restored.preferences.terminalProfile).toBe('aux');p.terminalProfile='embed';expect(()=>migrateApiSettings(p)).toThrow('终端 API');});
it('文字功能默认主 API，本地检索不要求副 API 或向量 API',()=>{
  const p=defaults();fill(p.profiles[0]);fill(p.profiles[2]);expect(textApiTasks.map(t=>taskApi(p,t.key)?.id)).toEqual(['main','main',undefined,'main']);
  expect(requiredApis(p).map(p=>p.id)).toEqual(['main']);expect(apiConfigurationIssues(p,{main:'synthetic-key',embed:'synthetic-key'},()=>true)).toEqual([]);
});
it('每项功能独立指定主或副 API，重排副 API 不改变任务选择',()=>{
  const p=defaults();p.profiles.push({...p.profiles[1],id:'aux2'});p.auxiliaryProfiles!.push('aux2');
  p.storyProfile='aux2';p.summaryProfile='aux';p.suggestionsProfile='main';p.personaProfile='aux2';
  expect(textApiTasks.map(t=>taskApi(p,t.key)?.id)).toEqual(['aux2','aux',undefined,'aux2']);
  p.auxiliaryProfiles!.reverse();expect(textApiTasks.map(t=>taskApi(p,t.key)?.id)).toEqual(['aux2','aux',undefined,'aux2']);
});
it('未选用的副 API 草稿不阻拦，只检查主 API、被选用接口和开启的向量',()=>{
  const p=defaults();fill(p.profiles[0]);fill(p.profiles[2]);p.profiles[1].apiBaseUrl='https://draft.example/v1';const credentials={main:'synthetic-key',embed:'synthetic-key'};
  expect(apiConfigurationIssues(p,credentials,()=>true)).toEqual([]);
  p.summaryProfile='aux';expect(apiConfigurationIssues(p,credentials,()=>true).join()).toContain('副 API');
  p.summaryProfile='main';p.personaProfile='aux';expect(apiConfigurationIssues(p,credentials,()=>true).join()).toContain('副 API');
  p.personaProfile='main';expect(apiConfigurationIssues(p,credentials,()=>false).join()).toContain('尚未确认');
});
it('即使所有功能都选副 API，主 API 仍然必填',()=>{
  const p=defaults();fill(p.profiles[1]);for(const task of textApiTasks)p[task.field]='aux';
  expect(apiConfigurationIssues(p,{aux:'synthetic-key'},()=>true).join()).toContain('主 API');
});
it('向量检索按用户开关迁移，仅开启时要求向量 API',()=>{
  const p=defaults();fill(p.profiles[0]);fill(p.profiles[2]);const credentials=keys(p);delete credentials.aux;delete credentials.embed;
  p.vectorEnabled=false;expect(migrateApiSettings(p).vectorEnabled).toBe(false);expect(apiConfigurationIssues(p,credentials,()=>true)).toEqual([]);p.vectorEnabled=true;
  expect(apiConfigurationIssues(p,credentials,()=>true).join()).toContain('向量 API');fill(p.profiles[2]);credentials.embed='synthetic-vector-key';expect(apiConfigurationIssues(p,credentials,()=>true)).toEqual([]);
});
it('旧配置保留剧情选择和副 API，新增功能选择默认主 API，不再自动抢选副 API',()=>{
  const p=defaults();delete p.summaryProfile;delete p.suggestionsProfile;delete p.personaProfile;p.storyProfile='aux';fill(p.profiles[1]);
  const migrated=migrateApiSettings(p);expect(migrated.storyProfile).toBe('aux');expect([migrated.summaryProfile,migrated.suggestionsProfile,migrated.personaProfile]).toEqual(['main','main','main']);expect(migrated.profiles[1]).toEqual(p.profiles[1]);
});
it('旧接口池完整迁移并清空旧占位名称，不覆盖实际接口',()=>{
  const p=defaults();delete p.auxiliaryProfiles;delete p.storyProfile;p.profiles[1].model='utility-model';p.profiles[0].model='story-model';
  p.profiles.push({...p.profiles[1],id:'extra',model:'actual-model',apiBaseUrl:'https://synthetic.example/v1'});
  const migrated=migrateApiSettings(p);expect(migrated.auxiliaryProfiles).toEqual(['aux','extra']);expect(migrated.storyProfile).toBe('main');expect(migrated.profiles[0].model).toBe('');expect(migrated.profiles[3].model).toBe('actual-model');expect(p.profiles[0].model).toBe('story-model');
});
it('旧版共用主模型的向量配置复制为独立档案',()=>{
  const p=defaults();delete p.auxiliaryProfiles;delete p.storyProfile;fill(p.profiles[0]);fill(p.profiles[2]);p.embeddingProfile='main';const migrated=migrateApiSettings(p);
  expect(migrated.embeddingProfile).not.toBe('main');expect(migrated.profiles.find(p=>p.id===migrated.embeddingProfile)?.apiBaseUrl).toBe(p.profiles[0].apiBaseUrl);
});
it('备份保留每个功能的选择并拒绝坏引用，不包含 Key',()=>{
  const p=defaults();p.storyProfile='aux';p.summaryProfile='main';p.suggestionsProfile='aux';p.personaProfile='aux';Object.assign(p.profiles[0],{key:'synthetic-secret-key'});
  const text=backup({version:1,sessions:[],preferences:p});expect(text).not.toContain('synthetic-secret-key');const restored=parseBackup(text).preferences;
  expect(textApiTasks.map(t=>restored[t.field])).toEqual(['aux','main',undefined,'aux']);
  for(const task of textApiTasks){const invalid=JSON.parse(text);invalid.preferences[task.field]='embed';expect(()=>parseBackup(JSON.stringify(invalid))).toThrow('API 引用');}
  const invalid=JSON.parse(text);invalid.preferences.auxiliaryProfiles=['missing'];expect(()=>parseBackup(JSON.stringify(invalid))).toThrow('副 API');
});
it('论坛回复默认关闭，开启时才校验所选接口，设置和旧备份可以恢复',()=>{
  const p=defaults();fill(p.profiles[0]);fill(p.profiles[2]);p.forumReplyProfile='aux';expect(p.forumReplyEnabled).toBe(false);expect(requiredApis(p).map(p=>p.id)).toEqual(['main']);
  p.forumReplyEnabled=true;expect(requiredApis(p).map(p=>p.id)).toEqual(['main','aux']);expect(apiConfigurationIssues(p,{main:'synthetic-key',embed:'synthetic-key'},()=>true).join()).toContain('副 API');fill(p.profiles[1]);expect(apiConfigurationIssues(p,keys(p),()=>true)).toEqual([]);
  const restored=parseBackup(backup({version:1,sessions:[],preferences:p}));expect(restored.preferences).toMatchObject({forumReplyEnabled:true,forumReplyProfile:'aux'});delete p.forumReplyEnabled;delete p.forumReplyProfile;expect(migrateApiSettings(p)).toMatchObject({forumReplyEnabled:false,forumReplyProfile:'main'});
});

it('disabling action suggestions removes its auxiliary API requirement and survives backup',()=>{const p=defaults();p.suggestionsProfile='aux';p.suggestionsEnabled=false;expect(requiredApis(p).map(x=>x.id)).not.toContain('aux');const restored=parseBackup(backup({version:1,sessions:[],preferences:p}));expect(restored.preferences.suggestionsEnabled).toBe(false);});

it('旧变量模型选择迁移为剧情模型，不单独要求变量接口',()=>{const p=defaults();p.storyProfile='main';p.stateProfile='aux';const migrated=migrateApiSettings(p);expect(migrated.stateProfile).toBe('main');expect(textApiTasks.some(t=>String(t.key)==='state')).toBe(false);expect(requiredApis(migrated).map(x=>x.id)).not.toContain('aux');p.storyProfile='aux';expect(migrateApiSettings(p).stateProfile).toBe('aux');});
