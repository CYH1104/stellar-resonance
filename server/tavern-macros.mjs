/** Request-local text macros only. Never execute scripts or persist preset variables. */
export function expandTavernMacros(entries,{input='',history=[]}={}){
  const variables=new Map();let total=0,operations=0;
  const read=(text,phase,argument=false,depth=0)=>{
    if(depth>12||text.length>300000)throw Error('PRESET_MACRO_LIMIT');let result='',offset=0;
    while(offset<text.length){
      const start=text.indexOf('{{',offset);if(start<0){result+=text.slice(offset);break;}result+=text.slice(offset,start);
      let at=start+2,nesting=1;for(;at<text.length&&nesting;){if(text.startsWith('{{',at)){nesting++;at+=2;}else if(text.startsWith('}}',at)){nesting--;at+=2;}else at++;}
      if(nesting){result+=text.slice(start);break;}if(++operations>10000)throw Error('PRESET_MACRO_LIMIT');
      const full=text.slice(start,at),body=full.slice(2,-2),separator=body.indexOf('::'),kind=(separator<0?body:body.slice(0,separator)).trim().toLowerCase(),args=separator<0?'':body.slice(separator+2),next=args.indexOf('::'),key=next<0?args:args.slice(0,next),value=next<0?'':args.slice(next+2);let replacement=full;
      if(['setvar','setglobalvar','addvar','addglobalvar'].includes(kind)){
        replacement='';if(phase==='collect'){
          if(key.length>128||variables.size>=1000&&!variables.has(key))throw Error('PRESET_MACRO_LIMIT');
          const argumentValue=read(value,phase,true,depth+1),updated=kind.startsWith('add')?(variables.get(key)||'')+argumentValue:argumentValue;
          if(updated.length>60000)throw Error('PRESET_MACRO_LIMIT');variables.set(key,updated);
        }
      }else if(['getvar','getglobalvar'].includes(kind)){if(phase==='render'||argument)replacement=variables.get(key)||'';}
      else if(kind.startsWith('//')||kind==='trim'||kind==='压缩相邻消息')replacement='';
      else if(kind==='lastusermessage'&&phase==='render')replacement=input;
      else if(['lastcharmessage','lastassistantmessage'].includes(kind)&&phase==='render')replacement=history.findLast(m=>m.role==='assistant')?.content||'';
      else if(kind==='newline')replacement='\n';else if(kind==='space')replacement=' ';
      else if(kind==='random'&&phase==='render'){const choices=args.split('::');replacement=choices[Math.floor(Math.random()*choices.length)]||'';}
      result+=replacement;offset=at;if(result.length>300000)throw Error('PRESET_CONTEXT_TOO_LARGE');
    }
    return result;
  };
  const prepared=entries.map(entry=>({...entry,content:read(entry.content,'collect')}));
  return prepared.map(entry=>{const content=read(entry.content,'render');total+=content.length;if(total>300000)throw Error('PRESET_CONTEXT_TOO_LARGE');return {...entry,content};});
}
