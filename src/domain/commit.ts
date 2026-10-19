import {applyMvu, cleanOperations, type MvuOperation} from './mvu.ts';
import type {WorldState} from './contracts';

export interface CommitRejection {index:number;path:string;group:string;reason:string}
export interface CommitResult {
  state: WorldState;
  applied: MvuOperation[];
  rejected: CommitRejection[];
  groups: {key:string;indices:number[]}[];
}

const segment=(path:string):string[]=>path.split('/').slice(1).map(part=>part.replace(/~1/g,'/').replace(/~0/g,'~'));

/** Base grouping before dependency closure. */
export function groupKey(op: MvuOperation): string {
  const parts = segment(op.path);
  if (parts[0] === 'characters' && parts[1]) return 'character:' + parts[1];
  if (parts[0] === 'characters') return 'characters';
  if (parts[0] === 'player') return 'player';
  if (parts[0] === 'custom') return 'custom';
  return 'root';
}

/** Replacement of the three roots is one transaction (manual override). */
function replacementSet(ops: MvuOperation[]): boolean {
  const roots = new Set(ops.filter(op => op.op === 'replace' && ['/player', '/characters', '/custom'].includes(op.path)).map(op => op.path));
  return roots.size === 3;
}

export function planGroups(ops: MvuOperation[]): {key:string;indices:number[]}[] {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let current = key;
    while (parent.get(current) && parent.get(current) !== current) current = parent.get(current)!;
    return current;
  };
  const union = (left: string, right: string) => {
    const a = find(left), b = find(right);
    if (a !== b) parent.set(a, b);
  };
  for (const op of ops) parent.set(groupKey(op), groupKey(op));
  for (const op of ops) {
    if (op.op === 'move' || op.op === 'copy') union(groupKey(op), groupKey({...op, path: op.from || op.path}));
  }
  if (replacementSet(ops)) for (const op of ops) union(groupKey(op), 'player');
  const byRoot = new Map<string, number[]>();
  ops.forEach((op, index) => {
    const root = find(groupKey(op));
    const list = byRoot.get(root) || [];
    list.push(index);
    byRoot.set(root, list);
  });
  return [...byRoot].map(([key, indices]) => ({key, indices}));
}

/** Apply valid groups, roll back a failed group and keep every other group. */
export function commit(state: WorldState, updates: unknown): CommitResult {
  const ops = cleanOperations(updates);
  const plans = planGroups(ops);
  const groupOf = new Map<number, string>();
  for (const plan of plans) for (const index of plan.indices) groupOf.set(index, plan.key);
  const failed = new Set<string>();
  const rejected: CommitRejection[] = [];
  let log: {index:number;op:MvuOperation;group:string}[] = [];
  let current = state;

  const rebuild = (): WorldState => {
    let next = state;
    const kept: typeof log = [];
    for (const item of log) {
      if (failed.has(item.group)) continue;
      try { next = applyMvu(next, [item.op]); kept.push(item); }
      catch { failed.add(item.group); }
    }
    if (kept.length !== log.length) { log = kept; return rebuild(); }
    log = kept;
    return next;
  };

  for (let index = 0; index < ops.length; index++) {
    const op = ops[index], group = groupOf.get(index)!;
    if (failed.has(group)) { rejected.push({index, path: op.path, group, reason: '同组操作失败'}); continue; }
    try {
      current = applyMvu(current, [op]);
      log.push({index, op, group});
    } catch {
      failed.add(group);
      for (const item of log) if (item.group === group) rejected.push({index: item.index, path: item.op.path, group, reason: '同组操作失败'});
      log = log.filter(item => item.group !== group);
      rejected.push({index, path: op.path, group, reason: '操作未通过校验'});
      current = rebuild();
    }
  }
  return {state: current, applied: log.map(item => item.op), rejected, groups: plans};
}
