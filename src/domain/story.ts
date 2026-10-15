import type { ActorState, Dice, Memory, Outcome, Persona, Preferences, Session, Snapshot, Turn, Variant, WorldState } from './contracts';
export const uid = () => crypto.randomUUID();
export const copy = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
export const now = () => new Date().toISOString();
export function defaults(): Preferences {
  const profile = (id: string, name: string, model: string) => ({ id, name, providerId: 'approved-provider', model, temperature: 0.7, maxTokens: 1600 });
  return { mode: 'demo', diceEnabled: false, vectorEnabled: false, profiles: [profile('main', '剧情接口', 'story-model'), profile('aux', '摘要与建议', 'utility-model'), profile('embed', '向量接口', 'embedding-model')], mainProfile: 'main', auxiliaryProfile: 'aux', embeddingProfile: 'embed', presets: [{ id: 'default', name: '基础叙事', content: '使用清晰中文叙事，停在需要玩家选择的地方。', enabled: true }], shortcuts: ['观察周围的情况。', '询问眼前的人发生了什么。'] };
}
export function initialState(name: string): WorldState {
  const actor = (id: string, label: string, affinity: number): ActorState => ({ id, name: label, energy: 80, focus: 70, affinity, present: true });
  return { player: actor('player', name || '玩家', 0), characters: [actor('guide', '样例引导员', 30), actor('engineer', '样例巡检员', 20)] };
}
export function newSession(name: string, persona: Persona, opening: string): Session {
  return { id: uid(), name: name.trim() || '新的旅程', createdAt: now(), updatedAt: now(), persona: copy(persona), opening: opening.trim() || '你来到一处虚构的星际接待站。引导员向你招手，等待你开口。', initial: initialState(persona.name), turns: [], memories: [], suggestions: [] };
}
export function diceGrade(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error('骰点必须为 1～100 的整数');
  return value <= 5 ? '大凶' : value <= 35 ? '不利' : value <= 65 ? '平平' : value <= 94 ? '顺遂' : '大吉';
}
export function rollDice(): Dice {
  const bytes = new Uint32Array(1); const limit = Math.floor(0x100000000 / 100) * 100;
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
  const value = bytes[0] % 100 + 1;
  return { value, grade: diceGrade(value), rulesVersion: 'd100-v1' };
}
function bounded(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100; }
export function validateOutcome(value: unknown, state: WorldState): Outcome {
  if (!value || typeof value !== 'object') throw new Error('状态更新格式不正确');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['player', 'characters', 'event'].includes(k))) throw new Error('状态更新包含未允许的字段');
  if (typeof v.event !== 'string' || !v.event.trim() || v.event.length > 500) throw new Error('事件说明不正确');
  const out: Outcome = { event: v.event };
  if (v.player !== undefined) {
    if (!v.player || typeof v.player !== 'object' || Array.isArray(v.player)) throw new Error('玩家更新格式不正确');
    const p = v.player as Record<string, unknown>;
    if (Object.keys(p).some(k => !['energy', 'focus'].includes(k)) || Object.values(p).some(x => !bounded(x))) throw new Error('玩家更新字段或范围不正确');
    out.player = {};
    if (p.energy !== undefined) out.player.energy = p.energy as number;
    if (p.focus !== undefined) out.player.focus = p.focus as number;
  }
  if (v.characters !== undefined) {
    if (!Array.isArray(v.characters) || v.characters.length > 50) throw new Error('人物更新格式不正确');
    out.characters = v.characters.map(c => {
      if (!c || typeof c !== 'object' || Object.keys(c).some(k => !['id', 'affinity'].includes(k)) || typeof c.id !== 'string' || !state.characters.some(a => a.id === c.id) || !bounded(c.affinity)) throw new Error('人物更新不合法');
      return { id: c.id, affinity: c.affinity };
    });
  }
  return out;
}
export function selected(turn: Turn): Variant | undefined { return turn.variants[turn.selected]; }
export function stateAt(session: Session, before = session.turns.length): WorldState {
  const state = copy(session.initial);
  for (const turn of session.turns.slice(0, before)) {
    const v = selected(turn); if (v?.status !== 'complete' || !v.outcome) continue;
    try {
      const outcome = validateOutcome(v.outcome, state);
      Object.assign(state.player, outcome.player);
      for (const change of outcome.characters || []) { const actor = state.characters.find(a => a.id === change.id); if (actor) actor.affinity = change.affinity; }
    } catch { /* Imported invalid patches never mutate the effective state. */ }
  }
  return state;
}
export function visibleMemories(session: Session, before = session.turns.length): Memory[] {
  const active = new Map(session.turns.slice(0, before).map(t => [t.id, selected(t)]));
  return session.memories.filter(m => !m.sourceTurn || (active.get(m.sourceTurn)?.status === 'complete' && active.get(m.sourceTurn)?.id === m.sourceVariant));
}
export function chronicle(session: Session) {
  return session.turns.flatMap((turn, index) => { const v = selected(turn); return v?.status === 'complete' && v.outcome ? [{ turnId: turn.id, title: v.outcome.event, time: v.createdAt, index: index + 1 }] : []; });
}
export function truncate(session: Session, count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > session.turns.length) throw new Error('回退位置不正确');
  session.turns = session.turns.slice(0, count);
  const ids = new Set(session.turns.map(t => t.id));
  session.memories = session.memories.filter(m => !m.sourceTurn || ids.has(m.sourceTurn));
  session.suggestions = []; session.updatedAt = now();
}
export function selectVariant(session: Session, index: number, variant: number): void {
  const turn = session.turns[index]; if (!turn?.variants[variant]) throw new Error('稿件不存在');
  truncate(session, index + 1); turn.selected = variant;
}
export function editMessage(session: Session, index: number, role: 'user' | 'assistant', text: string): void {
  const turn = session.turns[index]; if (!turn || !text.trim()) throw new Error('消息不能为空');
  truncate(session, index + 1);
  if (role === 'user') { turn.input = text.trim(); turn.variants = []; turn.selected = 0; }
  else { const v = selected(turn); if (!v) throw new Error('稿件不存在'); v.text = text.trim(); v.status = 'incomplete'; delete v.outcome; }
  session.memories = session.memories.filter(m => m.sourceTurn !== turn.id);
}
export function finishVariant(session: Session, turnIndex: number, variant: Variant, outcome: unknown): void {
  variant.outcome = validateOutcome(outcome, stateAt(session, turnIndex)); variant.status = 'complete';
  session.memories.push({ id: uid(), text: `${variant.outcome.event}。${variant.text.slice(0,220)}`, kind: 'event', createdAt: now(), sourceTurn: session.turns[turnIndex].id, sourceVariant: variant.id });
  session.updatedAt = now();
}
export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0; for (let i=0;i<a.length;i++) { dot += a[i]*b[i]; aa += a[i]*a[i]; bb += b[i]*b[i]; }
  return aa && bb ? dot / Math.sqrt(aa*bb) : 0;
}
export function keywordScore(text: string, query: string): number {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const chars = [...new Set(query.replace(/\s/g, '').toLowerCase())];
  return words.reduce((n,w) => n + (text.toLowerCase().includes(w) ? 3 : 0), 0) + chars.reduce((n,c) => n + (text.toLowerCase().includes(c) ? 0.1 : 0), 0);
}
export function backup(snapshot: Snapshot): string {
  return JSON.stringify({ version: 1, sessions: copy(snapshot.sessions), preferences: cleanPreferences(snapshot.preferences) }, null, 2);
}
export function cleanPreferences(p: Preferences): Preferences {
  return { mode: p.mode, diceEnabled: !!p.diceEnabled, vectorEnabled: !!p.vectorEnabled, mainProfile: p.mainProfile, auxiliaryProfile: p.auxiliaryProfile, embeddingProfile: p.embeddingProfile, profiles: p.profiles.map(x => ({ id:x.id, name:x.name, providerId:x.providerId, model:x.model, temperature:x.temperature, maxTokens:x.maxTokens })), presets: p.presets.map(x => ({id:x.id,name:x.name,content:x.content,enabled:!!x.enabled})), shortcuts:[...p.shortcuts] };
}
const secretNames = new Set(['apikey', 'api_key', 'key', 'authorization', 'access_token', 'token', 'password', 'secret', '__proto__', 'prototype', 'constructor']);
function inspect(value: unknown, depth = 0): void {
  if (depth > 18) throw new Error('备份结构过深');
  if (!value || typeof value !== 'object') return;
  for (const [k,v] of Object.entries(value)) { if (secretNames.has(k.toLowerCase())) throw new Error('备份含凭据或不允许的字段'); inspect(v, depth+1); }
}
export function parseBackup(text: string): Snapshot {
  if (new TextEncoder().encode(text).length > 20*1024*1024) throw new Error('首版备份限制为 20MB');
  const value = JSON.parse(text) as Snapshot; inspect(value);
  if (!value || value.version !== 1 || !Array.isArray(value.sessions) || !value.preferences || !Array.isArray(value.preferences.profiles) || !Array.isArray(value.preferences.presets) || !Array.isArray(value.preferences.shortcuts)) throw new Error('不是支持的备份格式');
  if (value.sessions.length > 100 || !value.preferences.profiles.length || value.preferences.profiles.length > 30) throw new Error('存档最多 100 份，接口档案必须为 1～30 份');
  const ids = new Set<string>();
  for (const s of value.sessions) {
    if (!s || typeof s.id !== 'string' || ids.has(s.id) || typeof s.name !== 'string' || typeof s.opening !== 'string' || !s.persona || typeof s.persona.name !== 'string' || !Array.isArray(s.turns) || !Array.isArray(s.memories) || !Array.isArray(s.suggestions) || !s.initial || !Array.isArray(s.initial.characters)) throw new Error('存档内容不完整');
    ids.add(s.id);
    for (const a of [s.initial.player, ...s.initial.characters]) if (!a || typeof a.id !== 'string' || typeof a.name !== 'string' || !bounded(a.energy) || !bounded(a.focus) || !bounded(a.affinity)) throw new Error('初始状态不合法');
    const turnIds = new Set<string>();
    for (const t of s.turns) {
      if (!t || typeof t.id !== 'string' || turnIds.has(t.id) || typeof t.input !== 'string' || !Array.isArray(t.variants) || !Number.isInteger(t.selected) || t.selected < 0 || (t.variants.length && t.selected >= t.variants.length)) throw new Error('消息版本不合法');
      turnIds.add(t.id);
      if (t.dice) { if (t.dice.rulesVersion !== 'd100-v1' || diceGrade(t.dice.value) !== t.dice.grade) throw new Error('骰子记录不合法'); }
      for (const v of t.variants) { if (!v || typeof v.id !== 'string' || typeof v.text !== 'string' || !['complete','incomplete'].includes(v.status)) throw new Error('回复格式不正确'); if (v.outcome) validateOutcome(v.outcome, s.initial); }
    }
    for (const m of s.memories) {
      if (!m || typeof m.id !== 'string' || typeof m.text !== 'string' || !['note','event','chapter'].includes(m.kind)) throw new Error('记忆格式不正确');
      if (m.sourceTurn && (!turnIds.has(m.sourceTurn) || !s.turns.find(t=>t.id===m.sourceTurn)?.variants.some(v=>v.id===m.sourceVariant))) throw new Error('记忆来源不存在');
      if (m.vector && (typeof m.vector.model !== 'string' || !Array.isArray(m.vector.values) || m.vector.values.length > 8192 || m.vector.values.some(n=>typeof n!=='number'||!Number.isFinite(n)))) throw new Error('记忆向量不正确');
    }
  }
  for (const p of value.preferences.profiles) if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.providerId !== 'string' || typeof p.model !== 'string' || !Number.isFinite(p.temperature) || p.temperature < 0 || p.temperature > 2 || !Number.isInteger(p.maxTokens) || p.maxTokens < 1 || p.maxTokens > 32000) throw new Error('模型参数不正确');
  const profileIds=new Set(value.preferences.profiles.map(p=>p.id));
  if(profileIds.size!==value.preferences.profiles.length||[value.preferences.mainProfile,value.preferences.auxiliaryProfile,value.preferences.embeddingProfile].some(id=>!profileIds.has(id)))throw new Error('模型档案引用不正确');
  for (const p of value.preferences.presets) if (typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.content !== 'string' || typeof p.enabled !== 'boolean') throw new Error('预设格式不正确');
  if (value.preferences.shortcuts.some(x=>typeof x!=='string') || !['demo','server'].includes(value.preferences.mode)) throw new Error('偏好格式不正确');
  value.preferences = cleanPreferences(value.preferences); return value;
}
