export interface RegexRule {id:string;setId?:string;scriptName:string;findRegex:string;replaceString:string;trimStrings:string[];placement:number[];disabled:boolean;markdownOnly:boolean;promptOnly:boolean;runOnEdit:boolean;substituteRegex:number;minDepth:number|null;maxDepth:number|null}
export function cleanRegexRules(value:unknown):RegexRule[]{
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>500)throw Error('正则规则最多500条');
  return value.map((r:any)=>{
    if(!r||typeof r!=='object'||typeof r.findRegex!=='string'||r.findRegex.length>10000||typeof r.replaceString!=='string'||r.replaceString.length>100000)throw Error('正则查找或替换内容不正确');
    const placements=Array.isArray(r.placement)?r.placement:String(r.placement??2).split(',');
    const depth=(n:unknown)=>n===null||n===undefined||n===''?null:Number.isInteger(Number(n))&&Number(n)>=-1&&Number(n)<=100000?Number(n):null;
    return {id:typeof r.id==='string'?r.id:crypto.randomUUID(),...(typeof r.setId==='string'?{setId:r.setId}:{}),scriptName:String(r.scriptName||'未命名正则').slice(0,200),findRegex:r.findRegex,replaceString:r.replaceString,trimStrings:(Array.isArray(r.trimStrings)?r.trimStrings:typeof r.trimStrings==='string'?r.trimStrings.split(/\s+/):[]).filter((s:unknown)=>typeof s==='string'&&s.length).slice(0,100),placement:[...new Set<number>(placements.map(Number).filter((n:number)=>[1,2,3,5,6].includes(n)))],disabled:r.disabled===true,markdownOnly:r.markdownOnly===true,promptOnly:r.promptOnly===true,runOnEdit:r.runOnEdit===true,substituteRegex:[0,1,2].includes(Number(r.substituteRegex))?Number(r.substituteRegex):0,minDepth:depth(r.minDepth),maxDepth:depth(r.maxDepth)};
  });
}
export function importRegexRules(raw:any,setId?:string):RegexRule[]{
  const result:RegexRule[]=[];
  for(const source of [raw?.extensions?.regex_scripts,raw?.extensions?.SPreset?.RegexBinding?.regexes,raw?.regex_scripts,Array.isArray(raw)?raw:undefined,raw?.findRegex!==undefined?[raw]:undefined]){
    if(!Array.isArray(source))continue;
    for(const rule of cleanRegexRules(source))if(!result.some(r=>r.id===rule.id||r.findRegex===rule.findRegex&&r.replaceString===rule.replaceString&&r.scriptName===rule.scriptName))result.push({...rule,...(setId?{setId}:{})});
  }
  if(result.length>500)throw Error('正则规则最多500条');return result;
}
export function regexPattern(source:string):RegExp{
  if(!source)throw Error('查找正则不能为空');
  const literal=source.startsWith('/')?source.match(/^\/([\s\S]*)\/([a-z]*)$/i):undefined;
  return new RegExp(literal?literal[1]:source,literal?literal[2]: 'g');
}
export interface RegexContext {placement:number;scope:'display'|'prompt';depth?:number;edited?:boolean;user?:string;char?:string}
function macros(text:string,c:RegexContext,escape=false){return text.replace(/\{\{(user|char)\}\}/gi,(_,key:string)=>{const value=c[key.toLowerCase() as 'user'|'char']||'';return escape?value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'):value;});}
export function applyRegexRules(text:string,rules:RegexRule[],context:RegexContext){
  const errors:string[]=[];let output=text;
  for(const r of rules){
    if(r.disabled||!r.placement.includes(context.placement)||context.edited&&!r.runOnEdit)continue;
    if((r.markdownOnly||r.promptOnly)&&!(context.scope==='display'?r.markdownOnly:r.promptOnly))continue;
    if(context.depth!==undefined&&(r.minDepth!==null&&r.minDepth>=-1&&context.depth<r.minDepth||r.maxDepth!==null&&r.maxDepth>=0&&context.depth>r.maxDepth))continue;
    try{
      const pattern=regexPattern(r.substituteRegex?macros(r.findRegex,context,r.substituteRegex===2):r.findRegex);
      const before=output;let replacementSize=0;
      output=output.replace(pattern,(...args:any[])=>{
        const groups=typeof args.at(-1)==='object'?args.at(-1):undefined;
        const count=args.length-(groups?3:2);
        const replacement=r.replaceString.replace(/\{\{match\}\}/gi,'$0').replace(/\$(\d+)|\$<([^>]+)>/g,(_,n:string,name:string)=>{
          let value=String((n?Number(n)<count?args[Number(n)]:undefined:groups?.[name])??'');
          for(const trim of r.trimStrings)value=value.split(macros(trim,context)).join('');return value;
        });const result=macros(replacement,context);replacementSize+=result.length;if(replacementSize>500000)throw Error('替换结果过大');return result;
      });
      if(output.length>500000){output=before;throw Error('替换结果过大');}
    }catch(e){errors.push(r.scriptName+'：'+(e instanceof Error?e.message:'正则错误'));}
  }
  return {text:output,errors};
}

export function regexHtmlDocument(html:string,highlight=false){
  const content=html.replace(/^\s*```(?:html)?\s*\n?/i,'').replace(/\n?```\s*$/,'');
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src https: data:; script-src \'none\'; base-uri \'none\'; form-action \'none\'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{color-scheme:light dark}body{margin:8px;font:15px/1.7 system-ui;overflow-wrap:anywhere}img{max-width:100%;height:auto}'+(highlight?'body{text-decoration:underline;text-decoration-color:#9fc4e9;text-underline-offset:5px}':'')+'</style></head><body>'+content+'</body></html>';
}
