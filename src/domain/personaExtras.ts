// Keep the original form's extra fields inside the existing saved persona schema.
const labels=['信息素','精神力等级'] as const;
export type ExtraLabel=typeof labels[number];
export function readPersonaExtra(text:string|undefined,label:ExtraLabel):string {
  const line=(text||'').split('\n').find(line=>line.startsWith(label+'：'));
  return line?.slice(label.length+1)||'';
}
export function personaNotes(text:string|undefined):string {
  return (text||'').split('\n').filter(line=>!labels.some(label=>line.startsWith(label+'：'))).join('\n');
}
export function writePersonaExtra(text:string|undefined,label:ExtraLabel,value:string):string {
  const lines=(text||'').split('\n').filter(line=>!line.startsWith(label+'：'));
  const clean=value.replace(/[\r\n]/g,' ').trim();
  if(clean)lines.push(label+'：'+clean);
  return lines.join('\n').replace(/^\n+|\n+$/g,'');
}
export function writePersonaNotes(text:string|undefined,notes:string):string {
  const extras=(text||'').split('\n').filter(line=>labels.some(label=>line.startsWith(label+'：')));
  return [notes,...extras].filter(Boolean).join('\n');
}

