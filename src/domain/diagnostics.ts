export interface GenerationDiagnostic {kind:'state-json'|'generation';attempt:number;stage:'accepted'|'rejected';code?:string;chars?:number;format?:'strict'|'normalized'|'invalid';controls?:number;trailingCommas?:number;fenced?:boolean;category?:'incomplete'|'syntax'|'not-object';unclosedString?:boolean;depth?:number;offset?:number;line?:number;column?:number;contentChars?:number;visibleChars?:number;reasoningChars?:number;finishReason?:'stop'|'length'|'content_filter'|'tool_calls'|'other'|''}
/** Explicit metadata allowlist. No response text, prompt, token, URL or upstream error string. */
export function cleanDiagnostic(value:unknown):GenerationDiagnostic|undefined {
  if(!value||typeof value!=='object')return;const v=value as Record<string,unknown>;
  if(!['state-json','generation'].includes(String(v.kind))||!['accepted','rejected'].includes(String(v.stage))||!Number.isInteger(v.attempt)||Number(v.attempt)<0||Number(v.attempt)>3)return;
  const out:Record<string,unknown>={kind:v.kind,stage:v.stage,attempt:v.attempt};
  for(const k of ['chars','controls','trailingCommas','depth','offset','line','column','contentChars','visibleChars','reasoningChars'])if(Number.isInteger(v[k])&&Number(v[k])>=-1000&&Number(v[k])<=2000000)out[k]=v[k];
  for(const k of ['fenced','unclosedString'])if(typeof v[k]==='boolean')out[k]=v[k];
  for(const [k,allowed] of [['format',['strict','normalized','invalid']],['category',['incomplete','syntax','not-object']],['finishReason',['stop','length','content_filter','tool_calls','other','']]] as const)if((allowed as readonly unknown[]).includes(v[k]))out[k]=v[k];
  if(typeof v.code==='string'&&/^(?:MODEL_(?:STATE_[A-Z_]+|FANFIC_[A-Z_]+|DIARY_[A-Z_]+|THEATERS_MISSING|RESPONSE_INCOMPLETE)|INVALID_(?:MODEL_STATE|COMPLETION_MARKER)|CHARACTER_(?:AFFINITY|SPIRIT_THOUGHT)_MISSING|PLAYER_SPIRIT_THOUGHT_MISSING|DICE_EVENT_[A-Z_]+|UNKNOWN_MODEL_CHARACTER)$/.test(v.code))out.code=v.code;
  return out as unknown as GenerationDiagnostic;
}
