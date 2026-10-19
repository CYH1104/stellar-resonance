import type {WorldState} from './contracts';
import {validActorId} from './dynamicActors.ts';

export type RosterMode = 'delta' | 'legacy';
export interface RosterRow { id: string; present?: boolean }
export interface RosterClaim {
  mode: RosterMode;
  /** Present declarations, never exits. */
  present: string[];
  enter: string[];
  exit: string[];
  rows: RosterRow[];
  /** Explicit MVU presence transitions win over the status roster. */
  overrides: Map<string, boolean>;
}
export interface RosterResolution {
  mode: RosterMode;
  present: Set<string>;
  required: Set<string>;
  entered: Set<string>;
  exited: Set<string>;
}

const rosterIds = (value: unknown, label: string): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1000) throw Error(label + '格式不正确');
  const out: string[] = [];
  for (const id of value) {
    if (!validActorId(id)) throw Error(label + '包含无效角色');
    if (out.includes(id)) throw Error(label + '包含重复角色');
    out.push(id);
  }
  return out;
};

/** New protocol fields switch the roster to delta semantics. */
export function hasDeltaRoster(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const value = raw as Record<string, unknown>;
  return ['present', 'enter', 'exit'].some(key => value[key] !== undefined);
}

export function parseRosterClaim(raw: unknown, rows: unknown[] = []): RosterClaim {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const normalized: RosterRow[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    if (!validActorId(item.id) || typeof item.present !== 'boolean') continue;
    normalized.push({id: item.id, present: item.present});
  }
  if (!hasDeltaRoster(value)) {
    return {mode: 'legacy', present: rosterIds(value.presentCharacterIds, '名单'), enter: [], exit: [], rows: normalized, overrides: new Map()};
  }
  return {
    mode: 'delta',
    present: value.present !== undefined ? rosterIds(value.present, '在场名单') : rosterIds(value.presentCharacterIds, '在场名单'),
    enter: rosterIds(value.enter, '进场名单'),
    exit: rosterIds(value.exit, '离场名单'),
    rows: normalized,
    overrides: new Map(),
  };
}

export function withPresenceOverrides(claim: RosterClaim, state: WorldState, next: WorldState): RosterClaim {
  const overrides = new Map(claim.overrides);
  for (const actor of next.characters) {
    const before = state.characters.find(c => c.id === actor.id);
    if (before && before.present !== actor.present) overrides.set(actor.id, actor.present);
  }
  return {...claim, overrides};
}

/** Legacy rosters remain authoritative (omission still means exit); delta keeps prior presence. */
export function resolveRoster(state: WorldState, claim: RosterClaim): RosterResolution {
  const prior = new Set(state.characters.filter(c => c.present).map(c => c.id));
  if (claim.mode === 'legacy') {
    const present = new Set(claim.present);
    return {
      mode: 'legacy',
      present,
      required: new Set(present),
      entered: new Set([...present].filter(id => !prior.has(id))),
      exited: new Set([...prior].filter(id => !present.has(id))),
    };
  }
  const claimed = new Set(claim.present);
  const entered = new Set(claim.enter);
  const exited = new Set(claim.exit);
  for (const row of claim.rows) {
    if (row.present === true) entered.add(row.id);
    else if (row.present === false) exited.add(row.id);
  }
  for (const id of exited) {
    if (claimed.has(id) || entered.has(id)) throw Error('名单同时包含在场与离场');
  }
  for (const [id, present] of claim.overrides) {
    if (present) {
      exited.delete(id);
      claimed.add(id);
      entered.add(id);
    } else {
      claimed.delete(id);
      entered.delete(id);
      exited.add(id);
    }
  }
  const required = new Set([...prior, ...claimed, ...entered].filter(id => !exited.has(id)));
  return {mode: 'delta', present: new Set(required), required, entered, exited};
}
