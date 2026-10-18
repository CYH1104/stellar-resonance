/** Shared by patch validation, model rules and graph rendering. Defaults apply only to new actors. */
export const affinityRule = Object.freeze({type:'number',min:-100,max:200,default:0});
export const affinityRange = `[${affinityRule.min},${affinityRule.max}]`;
export const affinitySchema = Object.freeze({type:'number',minimum:affinityRule.min,maximum:affinityRule.max,default:affinityRule.default});
/** Accept explicit decimal strings from model JSON, never blanks, booleans or display labels. */
export function affinityNumber(value:unknown):unknown {
  if(typeof value==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())){
    const number=Number(value);if(Number.isFinite(number))return number;
  }
  return value;
}
export function validAffinity(value:unknown):value is number {
  return typeof value==='number'&&Number.isFinite(value)&&value>=affinityRule.min&&value<=affinityRule.max;
}
export function affinityEdgeStyle(value=0){
  const limit=value<0?-affinityRule.min:affinityRule.max;
  const strength=Math.min(limit,Math.abs(value))/limit;
  return {stroke:value<0?'#d99b9b':'var(--color-accent)',strokeWidth:1+strength*4,opacity:.3+strength*.7,strokeDasharray:value<0?'5 4':'none'};
}
