import { describe, expect, it } from 'vitest';
import type { Variant } from '../src/domain/contracts';
import { backup, effectiveEvents, defaults, diceGrade, editMessage, finishVariant, newSession, parseBackup, selectVariant, stateAt, truncate, validateOutcome, visibleMemories } from '../src/domain/story';

function session() {
  return newSession('验收', { name: '访客', appearance: '', personality: '', background: '' }, '虚构开局');
}
function append(s: ReturnType<typeof session>, id: string, energy: number) {
  const variant: Variant = { id: `${id}-a`, text: '公开回复', status: 'incomplete', createdAt: new Date().toISOString() };
  s.turns.push({ id, input: '行动', dice: { value: 73, grade: '顺遂', rulesVersion: 'd100-v1' }, variants: [variant], selected: 0 });
  finishVariant(s, s.turns.length - 1, variant, { player: { energy }, characters: [{ id: 'guide', affinity: 40 }], event: `${id}事件` });
  return variant;
}

describe('剧情、状态与记忆一致性', () => {
  it('完整回复提交状态、事件和来源记忆；部分回复不提交', () => {
    const s = session(); append(s, 'first', 78);
    s.turns.push({ id: 'partial', input: '再问', variants: [{ id: 'partial-a', text: '只收到一半', status: 'incomplete', createdAt: '' }], selected: 0 });
    expect(stateAt(s).player.energy).toBe(78);
    expect(effectiveEvents(s)).toHaveLength(1);
    expect(visibleMemories(s)).toHaveLength(1);
  });
  it('切稿移除后续剧情，恢复该稿状态并排除旧稿记忆，骰点不变', () => {
    const s = session(); append(s, 'first', 78);
    const alternative: Variant = { id: 'first-b', text: '另一稿', status: 'incomplete', createdAt: '' };
    s.turns[0].variants.push(alternative);
    finishVariant(s, 0, alternative, { player: { energy: 65 }, event: '另一条事件' });
    append(s, 'second', 60);
    selectVariant(s, 0, 1);
    expect(s.turns).toHaveLength(1);
    expect(stateAt(s).player.energy).toBe(65);
    expect(visibleMemories(s).map(m => m.sourceVariant)).toEqual(['first-b']);
    expect(effectiveEvents(s).map(e => e.title)).toEqual(['另一条事件']);
    expect(s.turns[0].dice?.value).toBe(73);
  });
  it('回退恢复初始状态并清理事件记忆，保留手记', () => {
    const s = session(); append(s, 'first', 78);
    s.memories.push({ id: 'manual', text: '独立手记', kind: 'note', createdAt: '' });
    truncate(s, 0);
    expect(stateAt(s).player.energy).toBe(80);
    expect(effectiveEvents(s)).toEqual([]);
    expect(visibleMemories(s).map(m => m.id)).toEqual(['manual']);
  });
  it('手工编辑回复使当前更新失效，删除后续轮，仍保留原骰点', () => {
    const s = session(); append(s, 'first', 78); append(s, 'second', 60);
    editMessage(s, 0, 'assistant', '手改回复');
    expect(s.turns).toHaveLength(1);
    expect(stateAt(s).player.energy).toBe(80);
    expect(visibleMemories(s)).toEqual([]);
    expect(s.turns[0].variants[0].status).toBe('incomplete');
    expect(s.turns[0].dice?.value).toBe(73);
  });
  it('MVU 更新拒绝隐藏字段、越界值和不存在的人物', () => {
    const state = session().initial;
    for (const change of [{ event: 'x', systemPrompt: '秘密' }, { event: 'x', player: { energy: 101 } }, { event: 'x', characters: [{ id: 'unknown', affinity: 2 }] }]) {
      expect(() => validateOutcome(change, state)).toThrow();
    }
  });
  it('D100 判定边界正确，非法骰点被拒绝', () => {
    expect([1, 5, 6, 35, 36, 65, 66, 94, 95, 100].map(diceGrade)).toEqual(['大凶', '大凶', '不利', '不利', '平平', '平平', '顺遂', '顺遂', '大吉', '大吉']);
    expect(() => diceGrade(0)).toThrow(); expect(() => diceGrade(2.5)).toThrow();
  });
});

describe('本地备份边界', () => {
  it('合法备份往返保留选稿、状态与来源', () => {
    const s = session(); append(s, 'first', 78);
    const restored = parseBackup(backup({ version: 1, sessions: [s], preferences: defaults() }));
    expect(restored.sessions[0]).toEqual(s);
    expect(stateAt(restored.sessions[0]).player.energy).toBe(78);
  });
  it('接口档案的意外 Key 不进入备份', () => {
    const preferences = defaults(); Object.assign(preferences.profiles[0], { key: 'synthetic-secret' });
    expect(backup({ version: 1, sessions: [], preferences })).not.toContain('synthetic-secret');
  });
  it('接口地址可备份，但带凭据的地址不能随备份泄露或导入',()=>{
    const preferences=defaults();preferences.profiles[0].apiBaseUrl='https://synthetic.example/v1';
    expect(parseBackup(backup({version:1,sessions:[],preferences})).preferences.profiles[0].apiBaseUrl).toContain('synthetic.example');
    preferences.profiles[0].apiBaseUrl='https://synthetic-secret@example.com/v1';
    expect(backup({version:1,sessions:[],preferences})).not.toContain('synthetic-secret');
    expect(()=>parseBackup(JSON.stringify({version:1,sessions:[],preferences}))).toThrow('凭据');
  });
  it('导入拒绝凭据字段、坏来源和伪造骰子', () => {
    const s = session(); append(s, 'first', 78);
    const value = { version: 1 as const, sessions: [s], preferences: defaults() };
    const safe = backup(value);
    expect(() => parseBackup(safe.replace('"version": 1', '"version": 1, "apiKey": "synthetic"'))).toThrow();
    expect(() => parseBackup(safe.replace('"sourceTurn": "first"', '"sourceTurn": "missing"'))).toThrow();
    expect(() => parseBackup(safe.replace('"value": 73', '"value": 101'))).toThrow();
  });
});


it('建议随选稿存档与恢复，切稿、回退、编辑不会展示别轮建议',()=>{
  const s=session(),a=append(s,'first',78);
  finishVariant(s,0,a,{event:'原路线',suggestions:['向导询问','观察四周']});
  const b:Variant={id:'first-b',text:'另一稿',status:'incomplete',createdAt:''};s.turns[0].variants.push(b);
  finishVariant(s,0,b,{event:'新路线',suggestions:['查看地图']});
  expect(s.suggestions).toEqual(['向导询问','观察四周']);
  selectVariant(s,0,1);expect(s.suggestions).toEqual(['查看地图']);
  const next=append(s,'second',70);finishVariant(s,1,next,{event:'第二轮',suggestions:['打开信件']});
  const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];
  expect(restored.suggestions).toEqual(['打开信件']);
  truncate(restored,1);expect(restored.suggestions).toEqual(['查看地图']);
  selectVariant(restored,0,0);expect(restored.suggestions).toEqual(['向导询问','观察四周']);
  editMessage(restored,0,'assistant','编辑后的正文');expect(restored.suggestions).toEqual([]);
});
it('建议清除思考标签、去重并限制数量，坏建议不导致正文状态失败',()=>{
 const s=session();
 const out=validateOutcome({event:'事件',suggestions:['<think>secret</think>观察四周','观察四周',{},' ', '长'.repeat(201),'询问向导','翻阅资料','等候','第五条']},s.initial);
 expect(out.suggestions).toEqual(['观察四周','询问向导','翻阅资料','等候']);
 for(const suggestions of [null,'错误格式',{}])expect(validateOutcome({event:'事件',suggestions},s.initial).suggestions).toEqual([]);
 expect(validateOutcome({event:'旧存档'},s.initial).suggestions).toBeUndefined();
 s.suggestions=['旧存档建议'];const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()}));expect(restored.sessions[0].suggestions).toEqual(['旧存档建议']);
});
