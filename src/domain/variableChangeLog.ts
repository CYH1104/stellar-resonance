import type {WorldState} from './contracts';
import {dataFromState,type Json} from './mvu';
export interface VariableChangeLog {applied:boolean;total:number;changes:{path:string;before:string;after:string}[];reviews:{name:string;before:number;after:number}[];details:string[];codes:string[]}
export function variableChangeLog(before:WorldState,after:WorldState,applied:boolean,reviewedIds:string[]=[],details:string[]=[],codes:string[]=[]):VariableChangeLog {
 const changes:VariableChangeLog['changes']=[];let total=0;
 function diff(a:Json|undefined,b:Json|undefined,path:string){
  if(JSON.stringify(a)===JSON.stringify(b))return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[key],b[key],path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'));}
  else{total++;if(changes.length<200)changes.push({path,before:a===undefined?'未提供':JSON.stringify(a),after:b===undefined?'已删除':JSON.stringify(b)});}
 }
 if(applied)diff(dataFromState(before).stat_data,dataFromState(after).stat_data,'');
 return {applied,total,changes,reviews:applied?reviewedIds.map(id=>{const a=before.characters.find(c=>c.id===id),b=after.characters.find(c=>c.id===id);return {name:b?.name||a?.name||id,before:a?.affinity??0,after:b?.affinity??a?.affinity??0};}):[],details:[...details],codes:[...codes]};
}
