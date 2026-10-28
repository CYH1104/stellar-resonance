const dangerous=new Set(['__proto__','prototype','constructor']);
function inspect(value){if(value&&typeof value==='object'){for(const key of Object.keys(value)){if(dangerous.has(key))throw Error('UNSAFE_PRESET_KEY');inspect(value[key]);}}}
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
/** Patch only supplied fields; prompts are merged by stable native identifier. */
export function patchRawPreset(source,patch){
 inspect(source);inspect(patch);if(!object(source)||!object(patch))throw Error('INVALID_PRESET');
 const result=structuredClone(source);
 for(const [key,value] of Object.entries(patch)){
  if(key==='prompts'){
   if(!Array.isArray(value)||!Array.isArray(result.prompts))throw Error('INVALID_PROMPT_PATCH');
   const seen=new Set();
   for(const edit of value){if(!object(edit)||typeof edit.identifier!=='string'||seen.has(edit.identifier))throw Error('INVALID_PROMPT_PATCH');seen.add(edit.identifier);
    const index=result.prompts.findIndex(p=>p.identifier===edit.identifier);if(index<0)throw Error('UNKNOWN_PROMPT');
    result.prompts[index]=patchRawPreset(result.prompts[index],edit);
    if(Object.hasOwn(edit,'enabled')){
     if(typeof edit.enabled!=='boolean')throw Error('INVALID_PROMPT_PATCH');
     for(const group of result.prompt_order||[])for(const entry of group.order||[])if(entry.identifier===edit.identifier)entry.enabled=edit.enabled;
    }
   }
  }else if(object(value)&&object(result[key]))result[key]=patchRawPreset(result[key],value);
  else result[key]=structuredClone(value);
 }
 return result;
}
/** Effective runtime policy is separate from the losslessly stored preset. */
export function protectedRuntimePreset(source){
 inspect(source);const result=structuredClone(source);
 result.show_thoughts=false;result.include_reasoning=false;result.request_thoughts=false;result.should_return_reasoning=false;
 return result;
}

export function validatePublicGeneration(value){
 if(!object(value)||Object.keys(value).some(k=>k!=='input')||typeof value.input!=='string'||!value.input.trim()||value.input.length>8000)throw Error('INVALID_PUBLIC_GENERATION');
 return {input:value.input};
}
