/** Syntax-only normalization; optional outer side-block closure never invents values. No JS evaluation. */
export function parseStateJson(source,{closeOuterContainer=false}={}){
  let text=source.trim();const fence=text.match(/^```(?:json)?[ \t]*(?:\r?\n)?([\s\S]*?)\s*```$/i);if(fence)text=fence[1].trim();
  const info={kind:'state-json',chars:text.length,format:'strict',controls:0,trailingCommas:0,fenced:!!fence};
  try{return {value:JSON.parse(text),info};}catch{}
  let quoted=false,escaped=false,depth=0,normalized='';
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(escaped){normalized+=ch;escaped=false;continue;}
      if(ch==='\\'){normalized+=ch;escaped=true;continue;}
      if(ch==='"'){quoted=false;normalized+=ch;continue;}
      if(ch.charCodeAt(0)<32){normalized+=JSON.stringify(ch).slice(1,-1);info.controls++;}else normalized+=ch;
    }else{
      if(ch==='"')quoted=true;
      if(ch==='{'||ch==='[')depth++;if(ch==='}'||ch===']')depth--;
      if(ch===','){let j=i+1;while(/\s/.test(text[j]||'')&&j<text.length)j++;if(text[j]==='}'||text[j]===']'){info.trailingCommas++;continue;}}
      normalized+=ch;
    }
  }
  try{return {value:JSON.parse(normalized),info:{...info,format:'normalized'}};}
  catch(error){
    // Explicitly delimited side blocks sometimes omit only their final outer bracket.
    // Recover a complete child, never a cut-off string, value, or nested structure.
    if(closeOuterContainer&&!quoted&&depth===1&&/[}\]]\s*$/.test(normalized)){
      const first=normalized.trimStart()[0],close=first==='['?']':first==='{'?'}':'';
      if(close)try{return {value:JSON.parse(normalized+close),info:{...info,format:'normalized',outerClosed:true}};}catch{}
    }
    const position=String(error.message).match(/position (\d+)/i),offset=position?Number(position[1]):undefined;
    const line=offset===undefined?undefined:normalized.slice(0,offset).split('\n').length;
    const column=offset===undefined?undefined:offset-normalized.lastIndexOf('\n',offset-1);
    const category=quoted||depth>0?'incomplete':/^\s*[{[]/.test(normalized)?'syntax':'not-object';
    const diagnostic={...info,format:'invalid',category,unclosedString:quoted,depth,...(offset===undefined?{}:{offset,line,column})};
    throw Object.assign(new Error('MODEL_STATE_JSON_INVALID'),{status:502,code:'MODEL_STATE_JSON_INVALID',diagnostic});
  }
}
