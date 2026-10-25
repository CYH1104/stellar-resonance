import type {Outcome, Variant, WorldState} from './contracts';
import type {VariableChangeLog} from './variableChangeLog';
import type {Memory} from './contracts';

export type RunLogSectionKind='errors'|'prose'|'characters'|'theaters'|'terminal'|'variables'|'terminalActivity'|'modelOutput'|'vector'|'note';
export interface RunLogSection {id:string;kind:RunLogSectionKind;title:string;text?:string;details?:string[];variables?:VariableChangeLog}
export interface RecallTrace {mode:'vector+keyword'|'keyword'|'none';query:string;candidates:number;hits:Memory[];fallback?:string}
const section=(kind:RunLogSectionKind,title:string,text?:string,extra:Partial<RunLogSection>={}):RunLogSection=>({id:kind+'-'+Math.random().toString(36).slice(2,10),kind,title,...(text?{text}:{}),...extra});
const names=(state:WorldState)=>new Map([state.player,...state.characters].map(a=>[a.id,a.name]));
export function characterSection(outcome:Outcome|undefined,afterState?:WorldState){
 const actors=afterState?[afterState.player,...afterState.characters]:[...(outcome?.player?[outcome.player]:[]),...(outcome?.characters||[])];
 const rows=actors.map(actor=>JSON.stringify(actor,null,2));
 return section('characters','人物状态栏',rows.length?rows.join('\n\n'):'本调用未记录人物状态快照。');
}
export function theaterSection(outcome:Outcome|undefined){
 const rows=(outcome?.theaters||[]).map(scene=>{const head=`【${scene.title||'小剧场'}】`+(scene.complete===false?'（未确认完成）':'');const body=scene.messages?.length?scene.messages.map(m=>m.speaker+'：'+m.content).join('\n'):scene.content;return head+'\n'+body;});
 return section('theaters','小剧场',rows.length?rows.join('\n\n'):'本轮没有启用或返回小剧场。');
}
export function privateTerminalSection(outcome:Outcome|undefined,afterState?:WorldState){
 const map=names(afterState||{player:{id:'player',name:'玩家',present:true},characters:[]});
 const rows=(outcome?.terminal?.privateMessages||[]).map(m=>(map.get(m.id)||m.id)+'：'+m.text);
 return section('terminal','本调用终端私聊',rows.length?rows.join('\n'):'本调用没有角色主动私聊。');
}
export function terminalActivitySection(outcome:Outcome|undefined,afterState?:WorldState){
 const map=names(afterState||{player:{id:'player',name:'玩家',present:true},characters:[]});
 const terminal=outcome?.terminal,rows:string[]=[];
 for(const g of terminal?.groups||[]){rows.push(`群聊「${g.title}」`+(g.topic?' · '+g.topic:''));for(const m of g.messages||[])rows.push('  '+(map.get(m.id)||m.id)+'：'+m.text);}
 for(const f of terminal?.friendRequests||[])rows.push('好友申请：'+(map.get(f.id)||f.id)+' · '+f.reason);
 const report=terminal?.report;
 if(report){rows.push(`终端同步：新增群消息 ${report.applied?.groupMessages??0}、私聊 ${report.applied?.privateMessages??0}、忽略 ${report.applied?.ignored??0}`);for(const issue of report.issues||[])rows.push(`  异常 ${issue.code} · ${issue.path}${issue.count?` · ${issue.count} 条`:''}`);}
 return section('terminalActivity','终端活动',rows.length?rows.join('\n'):'本调用没有群聊、私聊、好友申请或同步异常。');
}
export function vectorSection(trace:RecallTrace|undefined,stateOnly=false){
 if(!trace||trace.mode==='none'||!trace.hits.length&&!trace.fallback)return undefined;
 const rows=[`模式：${trace.mode==='vector+keyword'?'向量 + 关键词':'关键词'}`,`候选：${trace.candidates} 条`];
 if(trace.fallback)rows.push('回退：'+trace.fallback);
 for(const m of trace.hits)rows.push('命中：'+m.text.replace(/\s+/g,' ').slice(0,240));
 return section('vector','向量记忆召回',rows.join('\n'));
}
export function modelOutputSection(raw?:string){
 if(typeof raw!=='string'||!raw.trim())return undefined;
 return section('modelOutput','模型原始输出',raw);
}
export function generationSections(input:{errors:string[];variant:Variant;outcome?:Outcome;before:WorldState;after:WorldState;applied:boolean;variables:VariableChangeLog;recall?:RecallTrace;stateOnly?:boolean;raw?:string}){
 const {errors,variant,outcome,before,after,applied,variables,recall,stateOnly,raw}=input;
 const sections:RunLogSection[]=[];
 const diagnostics=[...errors,...(outcome?.stateUpdate?.codes||[])];if(diagnostics.length)sections.push(section('errors','错误与校验',[...new Set(diagnostics)].join('\n')));
 sections.push(section('prose','生成正文',variant.text||'本次没有收到正文。'));
 sections.push(characterSection(outcome,after));
 sections.push(theaterSection(outcome));
 sections.push(privateTerminalSection(outcome,after));
 const mvu=(outcome?.mvu||[]).map(op=>JSON.stringify(op));
 sections.push(section('variables','MVU 变量与状态差异',variables.applied?`实际状态差异 ${variables.total} 项；MVU 操作 ${mvu.length} 条`:'本次未应用状态。',{variables:{...variables,...(mvu.length?{details:[...variables.details,...mvu.slice(0,100).map((op,i)=>'MVU '+(i+1)+'：'+op)]}:{})}}));
 sections.push(terminalActivitySection(outcome,after));
 const modelOutput=modelOutputSection(raw);if(modelOutput)sections.push(modelOutput);
 const vector=vectorSection(recall,stateOnly);if(vector)sections.push(vector);
 if(!applied)sections.push(section('note','保存说明','本次生成未应用为当前稿件，状态差异与正文按请求结束时的快照记录。'));
 return sections;
}
export function orderedSections(sections:RunLogSection[]=[]){const order:RunLogSectionKind[]=['errors','prose','characters','theaters','terminal','variables','terminalActivity','modelOutput','vector','note'];return [...sections].sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind));}
export function legacySectionsNote(record:{kind?:string;sections?:RunLogSection[]}){return !record.sections?.length&&(record.kind==='generation'||record.kind==='terminal')?'此历史记录未记录分区明细。':'';}
