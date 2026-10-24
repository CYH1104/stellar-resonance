import {ref} from 'vue';
import {FormatErrorRepository,type FormatErrorRecord} from '../storage/formatErrors';
import {safeLogText,sanitizeLogValue} from '../domain/logText';
const recordLimit=1200000;
function fit(record:FormatErrorRecord){
 if(JSON.stringify(record).length<=recordLimit)return record;
 const marker='\n…[日志总量超限已截断]';
 record.raw=safeLogText(record.raw,[],100000)+marker;
 record.sections=(record.sections||[]).map(section=>({...section,text:section.text?safeLogText(section.text,[],section.kind==='prose'?400000:60000):undefined,details:section.details?.slice(0,50).map(detail=>safeLogText(detail,[],2000)),variables:section.variables?{...section.variables,changes:section.variables.changes.slice(0,50),details:section.variables.details.slice(0,50),reviews:section.variables.reviews.slice(0,50),codes:section.variables.codes.slice(0,50)}:undefined}));
 if(JSON.stringify(record).length>recordLimit){record.sections=record.sections.map(section=>section.kind==='prose'?{...section,text:section.text?safeLogText(section.text,[],200000)+marker:undefined}:section).slice(0,8);record.raw=safeLogText(record.raw,[],20000)+marker;}
 if(JSON.stringify(record).length>recordLimit){
  record.variables=record.variables?{...record.variables,changes:record.variables.changes.slice(0,30),details:record.variables.details.slice(0,30),reviews:record.variables.reviews.slice(0,30),codes:record.variables.codes.slice(0,30)}:undefined;
  record.sections=record.sections?.map(section=>({...section,text:section.text?safeLogText(section.text,[],section.kind==='prose'?100000:10000):undefined,details:section.details?.slice(0,20),variables:section.variables?sanitizeLogValue(section.variables,[],500) as typeof section.variables:undefined}));
 }
 if(JSON.stringify(record).length>recordLimit){record.variables=undefined;record.sections=record.sections?.map(s=>({...s,variables:undefined,details:undefined}));}
 return record;
}
export function useFormatErrors(secrets:()=>string[]=()=>[]){
 const entries=ref<FormatErrorRecord[]>([]),problem=ref('');const repository=new FormatErrorRepository();let queue=Promise.resolve();
 const ready=repository.read().then(rows=>{entries.value=rows;}).catch(()=>{});
 function change(fn:()=>void){const task=queue.then(async()=>{await ready;fn();try{await repository.write(JSON.parse(JSON.stringify(entries.value)));problem.value='';}catch{problem.value='错误记录暂未写入浏览器，请检查本地存储空间。';}});queue=task.catch(()=>{});return task;}
 async function record(raw:string,code:string,sessionId:string,turnId:string,kind:'format'|'runtime'|'generation'|'terminal'='format',meta?:Partial<Pick<FormatErrorRecord,'variantId'|'round'|'variables'|'callId'|'sections'>>){
  if(!raw.trim())return;
  await change(()=>{
   const secretValues=secrets();
   const cleanMeta=meta?sanitizeLogValue(meta,secretValues) as typeof meta:undefined;
   const entry:FormatErrorRecord={id:crypto.randomUUID(),at:new Date().toISOString(),sessionId,turnId,kind,...(cleanMeta||{}),code:safeLogText(code,secretValues,100),raw:safeLogText(raw,secretValues)};
   entries.value.unshift(fit(entry));entries.value=entries.value.slice(0,100);
  });
 }
 const clear=()=>change(()=>{entries.value=[];});
 return {entries,problem,record,clear};
}
