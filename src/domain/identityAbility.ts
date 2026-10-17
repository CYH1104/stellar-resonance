/** Split only explicitly labelled power clauses; never infer a power from an occupation. */
export function separateIdentityAbility<T extends {identity?:string;ability?:string}>(value:T):T {
  if(typeof value.identity!=='string')return {...value};
  const powers:string[]=[];
  const identity=value.identity.replace(/(?:^|[，,；;\n]|[ \t]+)(?:异能|特殊能力)\s*[:：]?\s*(「[^」\n]+」|【[^】\n]+】|[^\n，,；;]+)/gu,(_all,power:string)=>{const text=power.trim().replace(/^[「【]|[」】]$/g,'').trim();if(text)powers.push(text);return '';}).replace(/^[，,；;\s]+|[，,；;\s]+$/g,'').trim();
  if(!powers.length)return {...value};
  const ability=[...new Set([...(typeof value.ability==='string'?value.ability.split('\n'):[]),...powers].map(s=>s.trim()).filter(Boolean))].join('\n');
  return {...value,identity,ability};
}
