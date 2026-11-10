export interface OutputParsing {version:1;enabled:boolean;tags:string[]}
const reserved=new Set(['content','story','maintext','正文','顶栏','status','sr_state','sr_done','updatevariable','choices','forum','theater','done','slate','user_input','html','head','body','div','span','p','section','details','summary','script','style','br']);
export const defaultOutputParsing=():OutputParsing=>({version:1,enabled:true,tags:['foundation']});
export function cleanOutputParsing(value:unknown):OutputParsing{
 if(value===undefined)return defaultOutputParsing();
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('自动解析设置格式不正确');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['version','enabled','tags'].includes(k))||v.version!==1||typeof v.enabled!=='boolean'||!Array.isArray(v.tags)||v.tags.length>64)throw Error('自动解析设置格式不正确或版本过新');
 const tags:string[]=[];
 for(const item of v.tags){
  if(typeof item!=='string')throw Error('辅助标签名称必须是文字');const tag=item.trim().toLowerCase();
  if(!/^[\p{L}_][\p{L}\p{N}_:-]{0,63}$/u.test(tag)||reserved.has(tag))throw Error('请填写辅助区块标签名称，不能使用正文、状态或 HTML 标签');
  if(!tags.includes(tag))tags.push(tag);
 }
 return {version:1,enabled:v.enabled,tags};
}
export function cleanPresetOutputParsing(value:unknown):Record<string,OutputParsing>{
 if(value===undefined)return {};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>500)throw Error('预设自动解析集合格式不正确');
 return Object.fromEntries(Object.entries(value).map(([id,config])=>{
  if(!id||id.length>200||['__proto__','constructor','prototype'].includes(id))throw Error('预设自动解析标识不正确');
  return [id,cleanOutputParsing(config)];
 }));
}
export function presetOutputParsing(p:{presetOutputParsing?:Record<string,OutputParsing>},id:string){return cleanOutputParsing(p.presetOutputParsing?.[id]);}
export function outputParsingTags(value:unknown){const config=cleanOutputParsing(value);return config.enabled?config.tags:[];}
