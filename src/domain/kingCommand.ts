/** Render target references from the persisted draw, never from model-selected identities. */
export function renderKingCommand(template:unknown,targets:number[],names:string[]=[]){
 if(typeof template!=='string'||!template.trim()||template.length>900||!Array.isArray(targets)||targets.length<1||targets.length>2||new Set(targets).size!==targets.length||targets.some(n=>!Number.isInteger(n)||n<1||n>7))throw Error('国王命令格式不正确，请重试。');
 const refs=[...template.matchAll(/\{\{target(\d+)\}\}/g)].map(m=>Number(m[1]));
 if(refs.some(n=>n<1||n>targets.length)||targets.some((_,i)=>!refs.includes(i+1)))throw Error('命令目标引用与抽签不一致，请重试。');
 const action=template.replace(/\{\{target\d+\}\}/g,'');
 if(/[{}]|(?:[0-9０-９零〇一二两三四五六七八九十]+\s*号)|编号|玩家|用户|国王|player|(?<!自)我|[你您他她它]|对方|旁边|(?:哥哥|姐姐|弟弟|妹妹)|(?:其余|其他|所有|每个|全体).{0,4}(?:人|成员|角色)|(?:另选|改选|换成|重新抽)/iu.test(action)||names.some(name=>name.trim().length>1&&action.includes(name.trim())))throw Error('命令包含指定身份或改选目标，请重试。');
 return template.replace(/\{\{target(\d+)\}\}/g,(_,n)=>targets[Number(n)-1]+'号');
}
