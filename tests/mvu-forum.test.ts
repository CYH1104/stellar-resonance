import { describe, expect, it } from 'vitest';
import type { Outcome, Variant } from '../src/domain/contracts';
import {addForumAIReply,backup, defaults, finishVariant, likeForum, newSession, parseBackup, replyForum, selectVariant, stateAt, truncate, validateOutcome, visibleForum } from '../src/domain/story';

const fresh = () => newSession('状态与论坛验收', { name: '访客', appearance: '', personality: '', background: '' }, '虚构开局');
function variant(id: string): Variant { return { id, text: '公开剧情', status: 'incomplete', createdAt: new Date().toISOString() }; }
function add(s: ReturnType<typeof fresh>, id: string, outcome: Outcome) {
  const v = variant(`${id}-a`);
  s.turns.push({ id, input: '行动', variants: [v], selected: 0 });
  finishVariant(s, s.turns.length - 1, v, outcome);
  return v;
}
const post = (content: string) => ({ id: 'same-post-id', authorName: '样例引导员', content, topic: '测试话题', comments: [{ id: 'c1', authorName: '路人', content: '公开评论' }] });

describe('每轮 MVU 展示字段', () => {
  it('真实资料未给出的状态数值可以缺省，存档不会补成零或样例值',()=>{
    const s=fresh();s.initial={player:{id:'player',name:'访客',present:true},characters:[{id:'pro-01',name:'原文姓名',secondaryGender:'Alpha',present:true}]};
    const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];
    const actor=stateAt(restored).characters[0];expect(actor.affinity).toBeUndefined();expect(actor.energy).toBeUndefined();expect(actor.primaryGender).toBeUndefined();expect(actor.innerThought).toBeUndefined();expect(actor.secondaryGender).toBe('Alpha');
  });
  it('五个字段由完整回合更新，下一轮使用最新值，并支持在场变化', () => {
    const s = fresh();
    add(s, 'one', { event: '第一次交流', player: { name: '新名字', primaryGender: '测试第一性别', secondaryGender: '测试第二性别', innerThought: '玩家第一轮想法' }, characters: [{ id: 'guide', name: '公开称呼', primaryGender: '示例甲', secondaryGender: '示例乙', innerThought: '角色第一轮想法', affinity: 35 }] });
    add(s, 'two', { event: '第二次交流', player: { innerThought: '玩家第二轮想法' }, characters: [{ id: 'guide', innerThought: '角色第二轮想法', affinity: 41 }, { id: 'engineer', present: false }] });
    const state = stateAt(s);
    expect(state.player.name).toBe('新名字');
    expect(state.player.primaryGender).toBe('测试第一性别');
    expect(state.player.secondaryGender).toBe('测试第二性别');
    expect(state.player.innerThought).toBe('玩家第二轮想法');
    expect(state.characters.find(a => a.id === 'guide')).toMatchObject({ innerThought: '角色第二轮想法', affinity: 41 });
    expect(state.characters.filter(a => a.present).map(a => a.id)).toEqual(['guide']);
    expect(stateAt(s, 1).player.innerThought).toBe('玩家第一轮想法');
  });
  it('不完整回复不更新想法、好感度或论坛，即使附带了数据', () => {
    const s = fresh();
    s.turns.push({ id: 'partial', input: '行动', selected: 0, variants: [{ ...variant('partial-a'), outcome: { event: '未完成', player: { innerThought: '不该出现' }, characters: [{ id: 'guide', affinity: 99 }], forum: [post('不该出现')] } }] });
    expect(stateAt(s).player.innerThought).toBe('');
    expect(stateAt(s).characters[0].affinity).toBe(30);
    expect(visibleForum(s)).toEqual([]);
  });
  it('不擅自限定性别枚举或好感度等级，但拒绝隐藏字段和错误类型', () => {
    const state = fresh().initial;
    expect(validateOutcome({ event: '公开事件', characters: [{ id: 'guide', primaryGender: '用户将来定义的值', affinity: -20 }] }, state).characters?.[0].affinity).toBe(-20);
    for (const change of [{ event: 'x', player: { innerThought: { private: 'x' } } }, { event: 'x', characters: [{ id: 'guide', authorPersona: '隐藏原文' }] }, { event: 'x', characters: [{ id: 'guide', affinity: NaN }] }]) expect(() => validateOutcome(change, state)).toThrow();
  });
});

describe('剧情内论坛的一致性与存档', () => {
  it('AI回复保留作者及回复目标，可恢复、不重复、回退后失效，且不更新主线MVU',()=>{
    const s=fresh();add(s,'one',{event:'主线',forum:[post('公开动态')]});const key=visibleForum(s)[0].key,replyId=replyForum(s,key,'我的评论'),before=JSON.stringify(stateAt(s));
    const reply={authorId:'guide',authorName:'角色甲',content:'<think>synthetic-secret</think>给你的公开答复'};addForumAIReply(s,key,replyId,reply);addForumAIReply(s,key,replyId,reply);expect(s.forumActivity?.[key].replies).toHaveLength(2);
    const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];expect(restored.forumActivity?.[key].replies[1]).toMatchObject({kind:'ai',authorName:'角色甲',replyTo:replyId,text:'给你的公开答复'});expect(JSON.stringify(stateAt(restored))).toBe(before);truncate(restored,0);expect(restored.forumActivity?.[key]).toBeUndefined();expect(()=>addForumAIReply(restored,key,replyId,reply)).toThrow('当前剧情');
  });
  it('切稿后只显示所选动态，同 ID 的另一稿不继承点赞或评论', () => {
    const s = fresh(); const first = add(s, 'one', { event: '第一稿事件', forum: [post('第一稿动态')] });
    const oldKey = visibleForum(s)[0].key;
    likeForum(s, oldKey); replyForum(s, oldKey, '我对第一稿的回应');
    const second = variant('one-b'); s.turns[0].variants.push(second);
    finishVariant(s, 0, second, { event: '第二稿事件', forum: [post('第二稿动态')] });
    selectVariant(s, 0, 1);
    const current = visibleForum(s);
    expect(current.map(p => p.content)).toEqual(['第二稿动态']);
    expect(current[0].variantId).not.toBe(first.id);
    expect(s.forumActivity?.[current[0].key]).toMatchObject({liked:false,replies:[]});
    expect(() => replyForum(s, oldKey, '废弃稿件的新评论')).toThrow('当前剧情');
    selectVariant(s, 0, 0);
    expect(s.forumActivity?.[visibleForum(s)[0].key]?.replies[0].text).toBe('我对第一稿的回应');
  });
  it('回退清理后续动态和互动，保留以前的动态', () => {
    const s = fresh(); add(s, 'one', { event: '第一轮', forum: [post('第一轮动态')] });
    const firstKey = visibleForum(s)[0].key; likeForum(s, firstKey);
    add(s, 'two', { event: '第二轮', forum: [post('第二轮动态')] });
    const secondKey = visibleForum(s)[0].key; replyForum(s, secondKey, '第二轮评论');
    truncate(s, 1);
    expect(visibleForum(s).map(p => p.content)).toEqual(['第一轮动态']);
    expect(s.forumActivity?.[firstKey]?.liked).toBe(true);
    expect(s.forumActivity?.[secondKey]).toBeUndefined();
  });
  it('备份能恢复新的 MVU 字段、动态和自己的评论', () => {
    const s = fresh(); add(s, 'one', { event: '交流', player: { innerThought: '本轮想法' }, forum: [post('动态正文')] });
    const key = visibleForum(s)[0].key; replyForum(s, key, '本机回应');
    const restored = parseBackup(backup({ version: 1, sessions: [s], preferences: defaults() })).sessions[0];
    expect(stateAt(restored).player.innerThought).toBe('本轮想法');
    expect(visibleForum(restored)[0].content).toBe('动态正文');
    expect(restored.forumActivity?.[key]?.replies[0].text).toBe('本机回应');
  });
  it('旧版存档不含新增字段也可读取，不清空原剧情', () => {
    const s = fresh(); delete s.forumActivity;
    for (const actor of [s.initial.player, ...s.initial.characters]) { delete actor.primaryGender; delete actor.secondaryGender; delete actor.innerThought; }
    add(s, 'old', { event: '旧版事件', player: { energy: 78 }, characters: [{ id: 'guide', affinity: 34 }] });
    const restored = parseBackup(JSON.stringify({ version: 1, sessions: [s], preferences: defaults() })).sessions[0];
    expect(restored.turns).toHaveLength(1);
    expect(stateAt(restored).characters[0].affinity).toBe(34);
    expect(visibleForum(restored)).toEqual([]);
  });
  it('拒绝动态中的私有资料字段、坏评论和重复动态 ID', () => {
    const state = fresh().initial;
    for (const posts of [[{ ...post('正文'), privateWorldbook: '隐藏资料' }], [{ ...post('正文'), comments: [{ id: 'c1', authorName: '路人', content: 123 }] }], [post('A'), post('B')]]) expect(() => validateOutcome({ event: '公开事件', forum: posts }, state)).toThrow();
  });
});
