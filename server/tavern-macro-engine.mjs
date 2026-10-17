import {AsyncLocalStorage} from 'node:async_hooks';
const scope=new AsyncLocalStorage();
export function createTavernContext(options={}){return {...options,local:new Map(),global:new Map()};}
export const withTavernContext=(options,fn)=>scope.run(createTavernContext(options),fn);
export const setTavernContext=options=>scope.enterWith(createTavernContext(options));
function argumentsOf(body){const parts=[];let start=0,depth=0;for(let i=0;i<body.length;i++){if(body.startsWith('{{',i)){depth++;i++;}else if(body.startsWith('}}',i)){depth--;i++;}else if(!depth&&body.startsWith('::',i)){parts.push(body.slice(start,i));start=i+2;i++;}}parts.push(body.slice(start));return parts;}
function add(current,value){const previous=current||0;try{const parsed=JSON.parse(previous);if(Array.isArray(parsed)){parsed.push(value);return JSON.stringify(parsed);}}catch{}return Number.isNaN(Number(previous))||Number.isNaN(Number(value))?String(previous||'')+value:String(Number(previous)+Number(value));}
/** Tavern text macro semantics, bounded and request-local; never execute extension scripts. */
export function expandTavernMacros(entries,options={}){
 const context=options.context||scope.getStore()||createTavernContext(options),env={...context,...options};let total=0,operations=0;
 const read=(text,depth=0)=>{
  if(depth>12||text.length>300000)throw Error('PRESET_MACRO_LIMIT');let result='',offset=0;
  while(offset<text.length){
   const start=text.indexOf('{{',offset);if(start<0){result+=text.slice(offset);break;}result+=text.slice(offset,start);
   let at=start+2,nesting=1;for(;at<text.length&&nesting;){if(text.startsWith('{{',at)){nesting++;at+=2;}else if(text.startsWith('}}',at)){nesting--;at+=2;}else at++;}
   if(nesting){result+=text.slice(start);break;}if(++operations>10000)throw Error('PRESET_MACRO_LIMIT');
   const full=text.slice(start,at),parts=argumentsOf(full.slice(2,-2)),kind=parts.shift().trim().toLowerCase();let replacement=full;
   const arg=i=>read(parts[i]??'',depth+1),store=kind.includes('global')?context.global:context.local,variable=kind.replace('global','');
   if(['setvar','addvar','incvar','decvar','getvar','hasvar','varexists','deletevar','flushvar'].includes(variable)){
    const name=arg(0);if(!name||name.length>128)throw Error('PRESET_MACRO_LIMIT');
    if(['getvar','hasvar','varexists'].includes(variable))replacement=variable==='getvar'?store.get(name)||'':String(store.has(name));
    else if(['deletevar','flushvar'].includes(variable)){store.delete(name);replacement='';}
    else{const value=variable==='setvar'?arg(1):add(store.get(name),variable==='incvar'?'1':variable==='decvar'?'-1':arg(1));if(value.length>60000||store.size>=1000&&!store.has(name))throw Error('PRESET_MACRO_LIMIT');store.set(name,value);replacement=['incvar','decvar'].includes(variable)?value:'';}
   }else if(kind.startsWith('//')||['noop','压缩相邻消息'].includes(kind))replacement='';
   else if(kind==='trim'){result=result.replace(/[\r\n]+$/,'');while(at<text.length&&/[\r\n]/.test(text[at]))at++;replacement='';}
   else if(['user','char','persona','description','personality','scenario','group','groupnotmuted','charifnotgroup'].includes(kind)){const names={user:env.user,char:env.char,persona:env.persona,description:env.description,personality:env.personality,scenario:env.scenario,group:env.group??env.char,groupnotmuted:env.group??env.char,charifnotgroup:env.group??env.char};if(names[kind]!==undefined)replacement=String(names[kind]);}
   else if(['lastusermessage','input'].includes(kind))replacement=env.input||'';
   else if(['lastcharmessage','lastassistantmessage'].includes(kind))replacement=env.history?.findLast(m=>m.role==='assistant')?.content||'';
   else if(kind==='lastmessage')replacement=env.history?.at(-1)?.content||'';
   else if(kind==='newline'||kind==='space'){const count=parts.length?Number(arg(0)):1;if(!Number.isInteger(count)||count<0||count>10000)throw Error('PRESET_MACRO_LIMIT');replacement=(kind==='newline'?'\n':' ').repeat(count);}
   else if(kind==='random'){const choices=parts.length===1?parts[0].split(','):parts;replacement=read(choices[Math.floor(Math.random()*choices.length)]||'',depth+1);}
   else if(kind==='reverse')replacement=Array.from(arg(0)).reverse().join('');
   result+=replacement;offset=at;if(result.length>300000)throw Error('PRESET_CONTEXT_TOO_LARGE');
  }
  return result;
 };
 return entries.map(entry=>{const content=read(entry.content);total+=content.length;if(total>300000)throw Error('PRESET_CONTEXT_TOO_LARGE');return {...entry,content};});
}
export function expandInternalMacros(template){return scope.getStore()?expandTavernMacros([{content:template}])[0].content:template;}
