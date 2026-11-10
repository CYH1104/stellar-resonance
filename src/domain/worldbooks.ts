/** Declarative lorebook data. Extension scripts are never executed. */
export interface LoreScope {mode:'global'|'characters';characterIds:string[]}
export interface WorldEntry {
  id:string; title:string; content:string; keys:string[]; secondaryKeys:string[];
  enabled:boolean; constant:boolean; selective:boolean; logic:number; order:number;
  position:number; depth:number; role:'system'|'user'|'assistant'; scanDepth:number|null;
  caseSensitive:boolean|null; wholeWords:boolean|null; probability:number; useProbability:boolean;
  excludeRecursion:boolean; preventRecursion:boolean; delayUntilRecursion:number;
  extra:string; scope?:LoreScope;
}
export interface Worldbook {
  id:string; name:string; entries:WorldEntry[]; scanDepth:number; recursive:boolean;
  caseSensitive:boolean; wholeWords:boolean; budget:number; extra:string; scope?:LoreScope;
}
export interface LoreContext {messages:string[]; userName:string; charName:string; persona?:string; seed:string; actors?:{id:string;name:string}[];characterDescription?:string;characterPersonality?:string;characterDepthPrompt?:string;scenario?:string;creatorNotes?:string;characterTags?:string[];generationType?:string}
export interface LoreDiagnostic {id:string;book:string;title:string;status:'disabled'|'empty'|'unsupported'|'unmatched'|'group-lost'|'probability'|'budget'|'scope-unavailable'|'inserted';detail?:string}
export function loreDiagnosticLabel(status:LoreDiagnostic['status']):string{return {disabled:'未启用',empty:'正文为空',unsupported:'设置暂不支持',unmatched:'未命中或未到递归层', 'group-lost':'同组未选中',probability:'概率未命中',budget:'超出预算','scope-unavailable':'作用对象未登记',inserted:'已插入'}[status];}
export interface LoreInsertion {content:string;position:number;depth:number;role:'system'|'user'|'assistant';order:number}
export const WORLD_FILE_LIMIT=5*1024*1024;
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fail=(s:string):never=>{throw new Error(s);};
const str=(v:unknown,max:number,fallback='')=>v===undefined||v===null?fallback:typeof v==='string'&&v.length<=max?v:fail('世界书文字过长或格式不正确');
const num=(v:unknown,d:number,min:number,max:number)=>v===undefined||v===null?d:typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:fail('世界书数值不正确');
const bool=(v:unknown,d=false)=>v===undefined||v===null?d:v===true||v===1?true:v===false||v===0?false:fail('世界书开关格式不正确');
const nullableBool=(v:unknown)=>v===undefined||v===null?null:bool(v);
const keys=(v:unknown):string[]=>v===undefined||v===null?[]:Array.isArray(v)&&v.length<=500?v.map(k=>str(k,1000)).filter(Boolean):fail('世界书关键词必须是字符串数组');
const integer=(v:unknown,d:number,min:number,max:number)=>{const n=num(v,d,min,max);return Number.isInteger(n)?n:fail('世界书深度和位置必须是整数');};
function safeData(value:unknown,depth=0):void {
  if(depth>16)fail('世界书结构过深');
  if(!value||typeof value!=='object')return;
  for(const [k,v] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(k))fail('世界书包含不允许的字段');safeData(v,depth+1);}
}
function extra(value:unknown):string {safeData(value);const s=JSON.stringify(value??{});if(s.length>WORLD_FILE_LIMIT)fail('世界书附加数据过大');return s;}
function readExtra(value:unknown):Record<string,any>{const s=str(value,WORLD_FILE_LIMIT,'{}');let data;try{data=JSON.parse(s);}catch{fail('世界书附加数据损坏');}safeData(data);if(!object(data))fail('世界书附加数据不正确');return data;}
function rawOptions(e:WorldEntry):Record<string,any>{const r=readExtra(e.extra);return {...(object(r.extensions)?r.extensions:{}),...r};}
function cleanScope(value:unknown):LoreScope|undefined {
  if(value===undefined||value===null)return undefined;if(!object(value)||!['global','characters'].includes(value.mode)||!Array.isArray(value.characterIds)||value.characterIds.length>1000||value.characterIds.some((id:unknown)=>typeof id!=='string'||!id||id.length>128||['__proto__','constructor','prototype','player'].includes(id as string)))fail('世界书作用范围不正确');
  const scope=value as Record<string,any>;return {mode:scope.mode,characterIds:scope.mode==='global'?[]:[...new Set(scope.characterIds as string[])]};
}
export interface LoreGroup {names:string[];override:boolean;weight:number;scoring:boolean|null}
export function worldEntryGroup(e:WorldEntry):LoreGroup {
  const r=rawOptions(e),weight=r.groupWeight??r.group_weight??100,scoring=r.useGroupScoring??r.use_group_scoring;
  return {names:typeof r.group==='string'?[...new Set(r.group.split(',').map((s:string)=>s.trim()).filter(Boolean))]:[],override:(r.groupOverride??r.group_override)===true,weight:typeof weight==='number'&&Number.isFinite(weight)?Math.max(0,Math.min(10000,weight)):100,scoring:typeof scoring==='boolean'?scoring:null};
}
export function setWorldEntryGroup(e:WorldEntry,group:LoreGroup):void {
  const r=readExtra(e.extra);Object.assign(r,{group:group.names.join(', '),groupOverride:group.override,groupWeight:group.weight,useGroupScoring:group.scoring});e.extra=extra(r);
}
export function newWorldEntry(id:string=crypto.randomUUID()):WorldEntry {
  return {id,title:'新条目',content:'',keys:[],secondaryKeys:[],enabled:true,constant:false,selective:true,logic:0,order:100,position:1,depth:4,role:'system',scanDepth:null,caseSensitive:null,wholeWords:null,probability:100,useProbability:true,excludeRecursion:false,preventRecursion:false,delayUntilRecursion:0,extra:'{}'};
}
export function newWorldbook(id:string=crypto.randomUUID()):Worldbook {
  return {id,name:'新世界书',entries:[],scanDepth:2,recursive:false,caseSensitive:false,wholeWords:false,budget:30000,extra:'{}'};
}
export function cleanWorldEntry(value:unknown):WorldEntry {
  if(!object(value))fail('世界书条目格式不正确');const v=value as Record<string,any>;
  const role=v.role??'system';if(!['system','user','assistant'].includes(role))fail('世界书消息角色不正确');
  readExtra(v.extra);
  return {id:str(v.id,128),title:str(v.title,500),content:str(v.content,200000),keys:keys(v.keys),secondaryKeys:keys(v.secondaryKeys),enabled:bool(v.enabled,true),constant:bool(v.constant),selective:bool(v.selective,true),logic:integer(v.logic,0,0,3),order:num(v.order,100,-100000,100000),position:integer(v.position,1,0,7),depth:integer(v.depth,4,0,1000),role,scanDepth:v.scanDepth===null||v.scanDepth===undefined?null:integer(v.scanDepth,2,0,1000),caseSensitive:nullableBool(v.caseSensitive),wholeWords:nullableBool(v.wholeWords),probability:num(v.probability,100,0,100),useProbability:bool(v.useProbability,true),excludeRecursion:bool(v.excludeRecursion),preventRecursion:bool(v.preventRecursion),delayUntilRecursion:integer(v.delayUntilRecursion,0,0,20),extra:str(v.extra,WORLD_FILE_LIMIT,'{}'),scope:cleanScope(v.scope)};
}
export function cleanWorldbooks(value:unknown):Worldbook[] {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>40)fail('世界书最多保存 40 份');
  const ids=new Set<string>();let total=0;
  return (value as unknown[]).map(raw=>{
    if(!object(raw)||!Array.isArray(raw.entries)||raw.entries.length>10000)fail('世界书条目格式不正确或超过 10000 条');
    const v=raw as Worldbook;readExtra(v.extra);const id=str(v.id,128);if(!id||ids.has(id))fail('世界书标识重复或为空');ids.add(id);
    const entries=v.entries.map(cleanWorldEntry),entryIds=new Set(entries.map(e=>e.id));if(entryIds.size!==entries.length||entryIds.has(''))fail('世界书条目标识重复或为空');
    const book:Worldbook={id,name:str(v.name,200,'未命名世界书'),entries,scanDepth:integer(v.scanDepth,2,0,1000),recursive:bool(v.recursive),caseSensitive:bool(v.caseSensitive),wholeWords:bool(v.wholeWords),budget:integer(v.budget,30000,100,100000),extra:str(v.extra,WORLD_FILE_LIMIT,'{}'),scope:cleanScope(v.scope)};
    total+=JSON.stringify(book).length;if(total>12*1024*1024)fail('本地世界书总大小超过 12MB，请分别导出后精简');return book;
  });
}
export function cleanWorldbookIds(value:unknown):string[]{if(value===undefined)return [];if(!Array.isArray(value)||value.length>40||value.some(x=>typeof x!=='string'||x.length>128))fail('世界书绑定不正确');return [...new Set(value as string[])];}
export function importWorldbook(text:string,filename='世界书.json',id:string=crypto.randomUUID()):Worldbook {
  if(new TextEncoder().encode(text).length>WORLD_FILE_LIMIT)fail('单份世界书文件不能超过 5MB');
  let root;try{root=JSON.parse(text.replace(/^\uFEFF/,''));}catch{fail('不是有效的世界书 JSON 文件');}
  safeData(root);if(!object(root))fail('不是支持的世界书格式');
  // Extract only embedded lore. Character/persona card fields are never imported.
  const data=root.data?.character_book??root.character_book??root;
  if(!object(data)||!data.entries||!Array.isArray(data.entries)&&!object(data.entries))fail('未找到世界书 entries 条目');
  const rows=Array.isArray(data.entries)?data.entries:Object.values(data.entries);
  if(rows.length>10000)fail('世界书最多 10000 条');
  const book=newWorldbook(id);book.name=str(data.name,200,filename.replace(/\.json$/i,''));
  book.scanDepth=integer(data.scan_depth??data.scanDepth,2,0,1000);book.recursive=bool(data.recursive_scanning??data.recursive,false);
  book.caseSensitive=bool(data.caseSensitive,false);book.wholeWords=bool(data.matchWholeWords,false);
  if(data.token_budget!==undefined)book.budget=Math.min(100000,Math.max(100,Math.floor(num(data.token_budget,7500,0,1000000)*4)));
  const {entries:_,...bookExtra}=data;book.extra=extra(bookExtra);
  book.scope=cleanScope(data.extensions?.academy_scope);
  const seen=new Set<string>();
  book.entries=rows.map((r:any,index:number)=>{
    if(!object(r)||typeof r.content!=='string')fail(`第 ${index+1} 条缺少 content 正文`);
    const x=object(r.extensions)?r.extensions:{};const opt=(a:string,b=a)=>r[a]??x[b];
    let entryId=String(r.uid??r.id??index);if(seen.has(entryId))entryId=`${entryId}-${index}`;seen.add(entryId);
    const role=opt('role')??0;const position=typeof r.position==='string'?(x.position??(r.position==='before_char'?0:r.position==='after_char'?1:7)):opt('position')??(r.keys!==undefined?1:0);
    return cleanWorldEntry({...newWorldEntry(entryId),scope:cleanScope(x.academy_scope),title:r.comment??r.name??r.key?.[0]??r.keys?.[0]??`条目 ${index+1}`,content:r.content,keys:r.key??r.keys??[],secondaryKeys:r.keysecondary??r.secondary_keys??[],enabled:r.disable!==undefined?!bool(r.disable):bool(r.enabled,true),constant:bool(r.constant),selective:bool(r.selective,true),logic:opt('selectiveLogic')??0,order:r.order??r.insertion_order??100,position,depth:opt('depth')??4,role:typeof role==='number'?['system','user','assistant'][role]:role,scanDepth:opt('scanDepth','scan_depth')??null,caseSensitive:opt('caseSensitive','case_sensitive')??null,wholeWords:opt('matchWholeWords','match_whole_words')??null,probability:opt('probability')??100,useProbability:opt('useProbability')??true,excludeRecursion:opt('excludeRecursion','exclude_recursion')??false,preventRecursion:opt('preventRecursion','prevent_recursion')??false,delayUntilRecursion:opt('delayUntilRecursion','delay_until_recursion')===true?1:opt('delayUntilRecursion','delay_until_recursion')||0,extra:extra(r)});
  });
  return cleanWorldbooks([book])[0];
}
/** These options need additional runtime support, but never disable a whole entry. */
export function worldEntryWarnings(entry:WorldEntry):string[]{
  const r=rawOptions(entry),warnings:string[]=[];
  if(![0,1,4].includes(entry.position))warnings.push('作者注、示例对话或 Outlet 插入位置');
  for(const [names,label] of [ [['sticky','cooldown','delay'],'粘滞／冷却／延迟'],[['vectorized'],'世界书向量触发'],[['automationId','automation_id'],'自动化脚本'] ] as [string[],string][]){if(names.some(k=>r[k]))warnings.push(label);}
  if(/\{\{(?!user\}\}|char\}\}|persona\}\}|charIfNotGroup\}\})/i.test(entry.content+entry.keys.join('')+entry.secondaryKeys.join(''))||/^\s*@@/m.test(entry.content))warnings.push('高级宏或激活装饰器');
  return warnings;
}
export function worldbookWarnings(book:Worldbook):string[]{return book.entries.flatMap(e=>{const w=worldEntryWarnings(e);return w.length?[`${e.title||e.id}：${w.join('、')}尚未完整接入；条目仍按开关、常驻或关键词规则参与触发。`]:[];});}
/** Import review does not remove unsupported settings or silently change activation. */
export function worldbookImportReview(book:Worldbook){
 return book.entries.flatMap(entry=>{
  const unsupported=worldEntryWarnings(entry),reasons=[...unsupported.map(w=>`扩展选项尚未完整接入：${w}；不影响条目按常驻／关键词参与触发`)];
  if(!entry.enabled)reasons.unshift('原文件已关闭');
  if(!entry.constant&&!entry.keys.some(k=>k.trim()))reasons.push('非常驻且没有主要关键词，没有普通关键词触发入口');
  return reasons.length?[{entry,reasons,recommended:!entry.enabled}]:[];
 });
}
export function exportWorldbook(book:Worldbook):string {
  const b=cleanWorldbooks([book])[0],root=readExtra(b.extra);
  delete root.originalData;
  const extensions=(raw:Record<string,any>,scope?:LoreScope)=>{const result={...raw.extensions};delete result.academy_scope;if(scope)result.academy_scope=scope;return result;};
  const entries=Object.fromEntries(b.entries.map((e,i)=>{const raw=readExtra(e.extra);return [String(i),{...raw,extensions:extensions(raw,e.scope),uid:i,key:e.keys,keysecondary:e.secondaryKeys,comment:e.title,content:e.content,disable:!e.enabled,constant:e.constant,selective:e.selective,selectiveLogic:e.logic,order:e.order,position:e.position,depth:e.depth,role:['system','user','assistant'].indexOf(e.role),scanDepth:e.scanDepth,caseSensitive:e.caseSensitive,matchWholeWords:e.wholeWords,probability:e.probability,useProbability:e.useProbability,excludeRecursion:e.excludeRecursion,preventRecursion:e.preventRecursion,delayUntilRecursion:e.delayUntilRecursion}];}));
  return JSON.stringify({...root,extensions:extensions(root,b.scope),name:b.name,scan_depth:b.scanDepth,recursive_scanning:b.recursive,token_budget:Math.floor(b.budget/4),caseSensitive:b.caseSensitive,matchWholeWords:b.wholeWords,entries},null,2);
}
function expand(s:string,ctx:LoreContext):string{
  let size=s.length;
  return s.replace(/\{\{(user|char|persona|charIfNotGroup)\}\}/gi,(token,k)=>{const value=k.toLowerCase()==='user'?ctx.userName:k.toLowerCase()==='persona'?ctx.persona||ctx.userName:ctx.charName;size+=value.length-token.length;if(size>100000)fail('世界书宏展开超过 100000 字符，请精简条目');return value;});
}
function random(seed:string):number{let h=2166136261;for(let i=0;i<seed.length;i++)h=Math.imul(h^seed.charCodeAt(i),16777619);return (h>>>0)/4294967296;}
function matches(haystack:string,key:string,sensitive:boolean,whole:boolean):boolean {
  const literal=key.match(/^\/(.*)\/([a-z]*)$/is);
  if(literal){try{return new RegExp(literal[1],literal[2]).test(haystack);}catch{/* Tavern falls back to literal matching for invalid regex syntax. */}}
  if(!key.trim())return false;const h=sensitive?haystack:haystack.toLowerCase(),k=sensitive?key:key.toLowerCase();
  if(!whole)return h.includes(k);
  // Whole word Latin keys use word boundaries; CJK keys retain substring behavior.
  if(!/^[\p{Script=Latin}\p{N}_]+$/u.test(k))return h.includes(k);
  let from=0;while(from<=h.length){const at=h.indexOf(k,from);if(at<0)return false;const word=(c:string)=>!!c&&/[\p{L}\p{N}_]/u.test(c);if(!word(h[at-1]||'')&&!word(h[at+k.length]||''))return true;from=at+1;}return false;
}
export function resolveWorldbooks(books:Worldbook[],ctx:LoreContext):{entries:LoreInsertion[];activated:string[];warnings:string[];diagnostics:LoreDiagnostic[]} {
  const candidates=books.flatMap(book=>book.entries.map(e=>({book,e,id:book.id+':'+e.id,unsupported:worldEntryWarnings(e),raw:rawOptions(e),group:worldEntryGroup(e)}))).sort((a,b)=>b.e.order-a.e.order);
  const picked=new Set<string>(),checked=new Set<string>(),injections:LoreInsertion[]=[],activated:string[]=[],warnings:string[]=[];
  const spent=new Map<string,number>(),usedGroups=new Set<string>(),diagnoses=new Map<string,LoreDiagnostic>();let recursiveText='';let total=0;
  const diagnose=(c:typeof candidates[number],status:LoreDiagnostic['status'],detail?:string)=>diagnoses.set(c.id,{id:c.id,book:c.book.name,title:c.e.title,status,...(detail?{detail}:{})});
  for(const c of candidates)diagnose(c,!c.e.enabled?'disabled':!c.e.content.trim()?'empty':'unmatched');
  for(let step=0;step<=20;step++){
    let added=false;const next:string[]=[];
    const eligible:(typeof candidates[number]&{score:number})[]=[];
    for(const c of candidates){
      const {book,e,raw,id}=c;if(picked.has(id)||checked.has(id)||!e.enabled||!e.content.trim()||step>0&&(!book.recursive||e.excludeRecursion)||e.delayUntilRecursion>step)continue;
      if(Array.isArray(raw.triggers)&&raw.triggers.length&&!raw.triggers.includes(ctx.generationType||'normal'))continue;
      const filter=raw.characterFilter;
      if(filter&&typeof filter==='object'){
        if(Array.isArray(filter.names)&&filter.names.length){const hit=filter.names.includes(ctx.charName);if(filter.isExclude?hit:!hit)continue;}
        if(Array.isArray(filter.tags)&&filter.tags.length){const hit=filter.tags.some((tag:unknown)=>typeof tag==='string'&&ctx.characterTags?.includes(tag));if(filter.isExclude?hit:!hit)continue;}
      }
      const depth=e.scanDepth??book.scanDepth,sensitive=e.caseSensitive??book.caseSensitive,whole=e.wholeWords??book.wholeWords;
      const scan=ctx.messages.slice(-depth||ctx.messages.length).join('\n');
      const fields:[string[],string|undefined][]=[
        [['matchPersonaDescription','match_persona_description'],ctx.persona],
        [['matchCharacterDescription','match_character_description'],ctx.characterDescription],
        [['matchCharacterPersonality','match_character_personality'],ctx.characterPersonality],
        [['matchCharacterDepthPrompt','match_character_depth_prompt'],ctx.characterDepthPrompt],
        [['matchScenario','match_scenario'],ctx.scenario],
        [['matchCreatorNotes','match_creator_notes'],ctx.creatorNotes]
      ];
      const source=depth===0?'':scan+fields.filter(([keys,value])=>value&&keys.some(k=>raw[k]===true||raw[k]===1)).map(([,value])=>'\n\x01'+value).join('')+(step>0?'\n\x01'+recursiveText:'');
      const test=(k:string)=>matches(source,expand(k,ctx),sensitive,whole);
      if(!e.constant){if(!e.keys.some(test))continue;if(e.selective&&e.secondaryKeys.length){const any=e.secondaryKeys.some(test),all=e.secondaryKeys.every(test);if(![any,!all,!any,all][e.logic])continue;}}
      const primary=e.keys.filter(test).length,secondary=e.secondaryKeys.filter(test).length;
      const score=!e.keys.length?0:primary+(e.logic===0||e.logic===3&&secondary===e.secondaryKeys.length?secondary:0);
      eligible.push({...c,score});
    }
    // Inclusion groups are shared across bound books, just as in Tavern. No per-NPC rerolls.
    const groups=new Map<string,typeof eligible>();for(const c of eligible)for(const name of c.group.names){const rows=groups.get(name)||[];rows.push(c);groups.set(name,rows);}
    const losers=new Set<string>();
    for(const [name,members] of groups){
      const rows=members.filter(c=>!losers.has(c.id));if(!rows.length)continue;
      if(usedGroups.has(name)){for(const c of rows)losers.add(c.id);continue;}
      // Explicitly scored entries below the best matching-key score are eliminated first.
      const max=Math.max(...rows.map(c=>c.score));const scored=rows.filter(c=>c.group.scoring!==true||c.score===max);for(const c of rows)if(!scored.includes(c))losers.add(c.id);
      if(scored.length<=1)continue;
      let winner=scored.find(c=>c.group.override);
      if(!winner){const sum=scored.reduce((n,c)=>n+c.group.weight,0);if(sum>0){const roll=random(ctx.seed+':group:'+name+':'+step)*sum;let current=0;winner=scored.find(c=>(current+=c.group.weight)>roll);}}
      for(const c of scored)if(c!==winner)losers.add(c.id);
    }
    for(const c of eligible){
      const {book,e,id,raw}=c;checked.add(id);
      if(losers.has(id)){diagnose(c,'group-lost',c.group.names.join(', '));continue;}
      if(e.useProbability&&random(ctx.seed+':'+id)*100>=e.probability){diagnose(c,'probability');continue;}
      let content:string;try{content=expand(e.content,ctx);}catch{diagnose(c,'budget','宏展开超出预算');warnings.push(`${book.name}／${e.title}：宏展开超出预算，未插入。`);continue;}
      const scope=e.scope??book.scope;
      if(scope?.mode==='characters'){
        const actors=(ctx.actors||[]).filter(a=>scope.characterIds.includes(a.id));
        if(actors.length!==scope.characterIds.length||!actors.length){diagnose(c,'scope-unavailable','指定角色尚未登记；请在作用范围中重新选择');warnings.push(`${book.name}／${e.title}：指定角色尚未登记，未插入。`);continue;}
        content='Scope: apply the following lore only to these NPCs, never to other actors: '+JSON.stringify(actors.map(a=>({id:a.id,name:a.name})))+'\n'+content;
      }
      const used=spent.get(book.id)||0;
      if(raw.ignoreBudget!==true&&used+content.length>book.budget||total+content.length>100000){diagnose(c,'budget');warnings.push(`${book.name}／${e.title}：超出世界书字数预算，未插入。`);continue;}
      const position=[0,1,4].includes(e.position)?e.position:1;
      if(c.unsupported.length)warnings.push(`${book.name}／${e.title}：${c.unsupported.join('、')}尚未完整接入；已按常驻／关键词触发${position!==e.position?'，内容置于角色定义后':''}。`);
      picked.add(id);spent.set(book.id,used+(raw.ignoreBudget===true?0:content.length));total+=content.length;activated.push(id);injections.push({content,position,depth:e.depth,role:e.role,order:e.order});added=true;if(book.recursive&&!e.preventRecursion)next.push(content);
      for(const name of c.group.names)usedGroups.add(name);diagnose(c,'inserted');
    }
    if(!added||!next.length)break;recursiveText+='\n'+next.join('\n');
  }
  return {entries:injections.sort((a,b)=>a.order-b.order),activated,warnings,diagnostics:[...diagnoses.values()]};
}
export function cleanLoreInsertions(value:unknown):LoreInsertion[]{
  if(value===undefined)return [];if(!Array.isArray(value)||value.length>10000)fail('世界书触发结果格式不正确');let total=0;
  return (value as Record<string,any>[]).map(v=>{if(!object(v)||![0,1,4].includes(v.position)||!['system','user','assistant'].includes(v.role))fail('世界书插入位置或消息角色不正确');const content=str(v.content,100000);total+=content.length;if(total>100000)fail('本轮世界书内容超过 100000 字符');return {content,position:v.position,role:v.role,depth:integer(v.depth,4,0,1000),order:num(v.order,100,-100000,100000)};});
}
