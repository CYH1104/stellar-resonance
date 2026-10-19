import type {WorldState} from './contracts';
import type {RepairComparison} from './stateRepair';
import {cleanJson,type Json} from './mvu.ts';
export interface RepairFieldChange {path:string;before?:Json;after?:Json}
export interface RepairAudit {variantId:string;createdAt:string;rows:RepairComparison[];changes:RepairFieldChange[];codes:string[];problem?:string;truncated:boolean}
export function createRepairAudit(variantId:string,before:WorldState,after:WorldState,rows:RepairComparison[],codes:string[]=[],problem?:string):RepairAudit {
 const changes:RepairFieldChange[]=[];let truncated=false;
 const data=(s:WorldState)=>({player:s.player,characters:Object.fromEntries(s.characters.map(a=>[a.id,a])),custom:s.variables||{}});
 function diff(a:unknown,b:unknown,path:string){if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){const left=a as Record<string,unknown>,right=b as Record<string,unknown>;for(const key of new Set([...Object.keys(left),...Object.keys(right)]))diff(left[key],right[key],path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'));}else if(changes.length<200)changes.push({path,...(a===undefined?{}:{before:cleanJson(a)}),...(b===undefined?{}:{after:cleanJson(b)})});else truncated=true;}
 diff(data(before),data(after),'');return {variantId,createdAt:new Date().toISOString(),rows,changes,codes:[...new Set(codes)],...(problem?{problem:problem.slice(0,1000)}:{}),truncated};
}
export function validateRepairAudit(value:unknown,variantId:string):void {
 const v=value as RepairAudit;if(!v||typeof v!=='object'||v.variantId!==variantId||typeof v.createdAt!=='string'||v.createdAt.length>100||typeof v.truncated!=='boolean'||v.problem!==undefined&&(typeof v.problem!=='string'||v.problem.length>1000)||!Array.isArray(v.rows)||v.rows.length>1000||!Array.isArray(v.changes)||v.changes.length>200||!Array.isArray(v.codes)||v.codes.length>100||v.codes.some(c=>typeof c!=='string'||!/^[A-Z0-9_\-]{1,100}$/.test(c)))throw Error('补修对照记录不正确');
 for(const row of v.rows)if(!row||typeof row.id!=='string'||row.id.length>128||typeof row.name!=='string'||row.name.length>200||[row.beforePresent,row.afterPresent].some(x=>x!==undefined&&typeof x!=='boolean')||[row.beforeAffinity,row.afterAffinity].some(x=>x!==undefined&&(typeof x!=='number'||!Number.isFinite(x))))throw Error('补修角色记录不正确');
 for(const c of v.changes){if(!c||typeof c.path!=='string'||!/^\/(?:player|characters|custom)(?:\/|$)/.test(c.path)||c.path.length>2000||!Object.hasOwn(c,'before')&&!Object.hasOwn(c,'after'))throw Error('补修字段记录不正确');if(Object.hasOwn(c,'before'))cleanJson(c.before);if(Object.hasOwn(c,'after'))cleanJson(c.after);}
}
