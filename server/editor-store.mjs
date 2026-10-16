import {WORLD_DEFAULTS,characterRows} from './editor-ui/worldbook.js';
import {isPlaceholderCharacter} from './placeholders.mjs';
import {validateMapAssets} from './map-assets.mjs';
import {readFile,writeFile,mkdir,rename,stat,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const clone=v=>JSON.parse(JSON.stringify(v));
const fields={name:80,en:120,no:20,sex:100,primaryGender:100,title:500,str:1500,shos:1500,intro:12000,quote:3000,img:2000,hiddenPrompt:60000,spiritAnimal:1500,mentalPowerLevel:100,labelName:100,labelStr:100,labelShos:100,labelTitle:100,labelIntro:100,labelQuote:100};
function fallbackForNullable(key){return ['caseSensitive','matchWholeWords','useGroupScoring'].includes(key)?false:0;}
function safeJson(value,depth=0){if(depth>20)throw error('EDITOR_DATA_TOO_DEEP');if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;if(Array.isArray(value))return value.map(v=>safeJson(v,depth+1));if(value&&typeof value==='object'){const out={};for(const [key,v] of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw error('INVALID_EDITOR_FIELD');out[key]=safeJson(v,depth+1);}return out;}throw error('INVALID_EDITOR_FIELD');}
const error=(code,status=400)=>Object.assign(new Error(code),{code,status});
export function defaultEditorData(card){return {version:1,characters:card.characters.map(c=>({...clone(c),hiddenPrompt:c.hiddenPrompt??[c.title,c.str,c.shos,c.intro,c.quote].filter(Boolean).join('\n'),img:c.img||''})),entries:[{uid:'world',comment:'学院内置世界设定',content:typeof card.world.sourceText==='string'?card.world.sourceText:JSON.stringify(card.world.sourceText||{},null,2),key:[],keysecondary:[],constant:true,disable:false,selective:false,selectiveLogic:0,order:100,position:0,depth:4,role:0}]};}
export function validateEditorData(raw){
  if(!raw||raw.version!==1||!Array.isArray(raw.characters)||raw.characters.length>200||!Array.isArray(raw.entries)||raw.entries.length>1000)throw error('INVALID_EDITOR_DATA');
  const ids=new Set(),characters=raw.characters.map((c,i)=>{if(!c||typeof c.id!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(c.id)||ids.has(c.id))throw error('INVALID_CHARACTER_ID');ids.add(c.id);const out={id:c.id};for(const [key,max] of Object.entries(fields)){const value=c[key]??'';if(typeof value!=='string'||value.length>max)throw error('INVALID_CHARACTER_FIELD');out[key]=value.trim();}const rows=characterRows(c);if(rows.length>100)throw error('TOO_MANY_CHARACTER_FIELDS');const rowIds=new Set();out.displayFields=rows.map((row,j)=>{if(!row||typeof row.label!=='string'||typeof row.value!=='string'||row.label.length>100||row.value.length>12000)throw error('INVALID_DISPLAY_FIELD');const id=String(row.id||'field-'+j);if(rowIds.has(id)||id.length>100)throw error('INVALID_DISPLAY_FIELD');rowIds.add(id);if(['name','no','id','hiddenPrompt'].includes(row.key))throw error('REQUIRED_FIELD_IS_FIXED');return {id,key:typeof row.key==='string'?row.key:'custom',label:row.label,value:row.value};});
    if(Array.isArray(c.displayFields)){for(const [key] of [['en'],['sex'],['primaryGender'],['str'],['shos'],['title'],['spiritAnimal'],['mentalPowerLevel'],['intro'],['quote']])out[key]='';for(const row of out.displayFields){if(Object.hasOwn(fields,row.key)&&!['img','hiddenPrompt','name','no'].includes(row.key)){if(row.value.length>fields[row.key])throw error('INVALID_CHARACTER_FIELD');const value=row.key==='en'?row.value.toUpperCase():row.value;if(value.length>fields[row.key])throw error('INVALID_CHARACTER_FIELD');out[row.key]=value;const alias={str:'labelStr',shos:'labelShos',title:'labelTitle',intro:'labelIntro',quote:'labelQuote'}[row.key];if(alias)out[alias]=row.label;}}}
    if(!out.name)throw error('CHARACTER_NAME_REQUIRED');if(!out.no)throw error('CHARACTER_NUMBER_REQUIRED');if(!/^[\w\s.\-]{1,20}$/.test(out.no))throw error('INVALID_CHARACTER_NUMBER');if(out.img){let u;try{u=new URL(out.img);}catch{throw error('INVALID_IMAGE_URL');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password||/["'<>]/.test(out.img))throw error('INVALID_IMAGE_URL');}return out;});
  const uids=new Set();let entries=(raw.worldbooks?[]:raw.entries).map((e,i)=>{
    if(!e||typeof e!=='object'||Array.isArray(e))throw error('INVALID_WORLDBOOK_ENTRY');
    const uid=e.uid??i;if(!['string','number'].includes(typeof uid)||String(uid).length>100||uids.has(String(uid)))throw error('DUPLICATE_ENTRY_ID');uids.add(String(uid));
    const out={...safeJson(e),uid};
    for(const [key,fallback] of Object.entries(WORLD_DEFAULTS)){
      const value=e[key]===undefined?clone(fallback):e[key];
      if(Array.isArray(fallback)){if(!Array.isArray(value)||value.length>200||value.some(k=>typeof k!=='string'||k.length>500))throw error('INVALID_KEYWORDS');}
      else if(fallback===null){if(value!==null&&(typeof fallbackForNullable(key)!==typeof value||typeof value==='number'&&(!Number.isFinite(value)||value<0)))throw error('INVALID_WORLDBOOK_FIELD');}
      else if(typeof value!==typeof fallback||typeof value==='number'&&!Number.isFinite(value))throw error('INVALID_WORLDBOOK_FIELD');
      if(typeof value==='string'&&value.length>(key==='content'?100000:1000))throw error('INVALID_WORLDBOOK_FIELD');out[key]=value;
    }
    if(!Number.isInteger(out.selectiveLogic)||out.selectiveLogic<0||out.selectiveLogic>3||!Number.isInteger(out.position)||out.position<0||out.position>7||!Number.isInteger(out.role)||out.role<0||out.role>2||out.probability<0||out.probability>100||out.depth<0||out.depth>1000||out.delayUntilRecursion<0)throw error('INVALID_ENTRY_PLACEMENT');
    return out;
  });
  let worldbooks;
  if(raw.worldbooks!==undefined){if(!Array.isArray(raw.worldbooks)||raw.worldbooks.length>50)throw error('INVALID_WORLDBOOKS');const bookIds=new Set();worldbooks=raw.worldbooks.map(book=>{if(!book||typeof book.id!=='string'||book.id.length>100||bookIds.has(book.id)||typeof book.name!=='string'||book.name.length>200)throw error('INVALID_WORLDBOOK');bookIds.add(book.id);return {id:book.id,name:book.name,enabled:book.enabled!==false,metadata:safeJson(book.metadata||{}),entries:validateEditorData({version:1,characters:raw.characters,entries:book.entries}).entries};});entries=worldbooks.filter(b=>b.enabled).flatMap(book=>book.entries.map(entry=>({...entry,uid:book.id+':'+entry.uid})));}
  if(entries.length>1000)throw error('TOO_MANY_ENTRIES');
  return {version:1,characters,entries,map:validateMapAssets(raw.map),worldbook:safeJson(raw.worldbook||{}),...(worldbooks?{worldbooks}:{})};
}
export function publicCards(data){return data.characters.map(c=>Object.fromEntries(Object.entries(c).filter(([key])=>(Object.hasOwn(fields,key)&&key!=='hiddenPrompt')||['id','displayFields'].includes(key))));}
export function cardWithEditor(base,data){return {...clone(base),characters:clone(data.characters),world:{...clone(base.world),sourceText:'',entries:clone(data.entries)}};}
export function createEditorStore(root,base){
  const directory=resolve(root,'server/private'),file=resolve(directory,'editor-data.json');let queue=Promise.resolve();
  async function read(){let raw;try{raw=await readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;raw=JSON.stringify(defaultEditorData(base));}const parsed=JSON.parse(raw);if(Array.isArray(parsed.characters))parsed.characters=parsed.characters.filter(c=>!isPlaceholderCharacter(c));return {revision:createHash('sha256').update(raw).digest('hex'),data:validateEditorData(parsed)};}
  async function save(data,revision){const task=queue.then(async()=>{const current=await read();if(current.revision!==revision)throw error('EDITOR_CONFLICT',409);const clean=validateEditorData(data),oldIds=new Set(clean.characters.map(c=>c.id));if(current.data.characters.some(c=>!oldIds.has(c.id)))throw error('EXISTING_CHARACTER_ID_REQUIRED');await mkdir(directory,{recursive:true});try{await stat(file);await copyFile(file,resolve(directory,'editor-data.previous.json'));}catch(e){if(e.code!=='ENOENT')throw e;}const temporary=file+'.tmp';await writeFile(temporary,JSON.stringify(clean,null,2),'utf8');await rename(temporary,file);return read();});queue=task.catch(()=>{});return task;}
  return {read,save};
}
export function activeWorldEntries(entries,request){
  const history=request.history||[];
  return (entries||[]).filter(e=>{if(e.disable)return false;if(e.constant)return true;const text=[...(e.depth?history.slice(-e.depth*2):[]).map(m=>m.content),request.input||''].join('\n').toLocaleLowerCase();const hit=k=>text.includes(k.toLocaleLowerCase());if(!e.key?.some(hit))return false;if(!e.selective||!e.keysecondary?.length)return true;const any=e.keysecondary.some(hit),all=e.keysecondary.every(hit);return [any,!all,!any,all][e.selectiveLogic||0];}).sort((a,b)=>b.order-a.order||String(a.uid).localeCompare(String(b.uid)));
}
export function applyWorldEntries(messages,entries,request){
  const activated=activeWorldEntries(entries,request),out=[...messages];
  let beforeIndex=0,afterIndex=Math.max(0,out.length-1);for(const e of activated){const role=['system','user','assistant'][e.role||0],message={role,content:e.content};if(e.position===0){out.splice(beforeIndex++,0,message);afterIndex++;}else if(e.position===4){out.splice(Math.max(beforeIndex,out.length-1-e.depth),0,message);afterIndex++;}else out.splice(afterIndex++,0,message);}
  return out;
}
