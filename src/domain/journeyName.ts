export function defaultJourneyName(existing:string[]=[],date=new Date()):string{
  const base=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);
  let name=base,index=2;
  while(existing.includes(name))name=`${base} (${index++})`;
  return name;
}
