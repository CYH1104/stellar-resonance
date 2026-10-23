import type {WorldState} from './contracts';
export const terminalCodeRoot='/custom/终端码/';
export const validTerminalCode=(value:unknown):value is string=>typeof value==='string'&&/^\d{11}$/.test(value);
export function terminalCodePath(id:string){return terminalCodeRoot+id.replace(/~/g,'~0').replace(/\//g,'~1');}
export function terminalCodeIds(state?:Pick<WorldState,'characters'>){return ['player',...(state?.characters||[]).map(c=>c.id)];}
export function terminalCodeBindings(state?:Pick<WorldState,'variables'|'characters'>):Record<string,string>{
 const raw=state?.variables?.终端码;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 return Object.fromEntries(terminalCodeIds(state).filter(id=>validTerminalCode(raw[id])).map(id=>[id,raw[id] as string]));
}
export function isTerminalCodePath(path:string,state:Pick<WorldState,'characters'>){return terminalCodeIds(state).some(id=>terminalCodePath(id)===path);}
export function validateTerminalCodeMap(before:unknown,after:unknown,ids:string[]){
 const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 if(after===undefined&&before===undefined)return;
 if(!object(after)||Object.keys(after).some(id=>!ids.includes(id)))throw Error('终端码只能绑定当前会话中已登记的角色 ID');
 const used=new Set<string>();
 for(const [id,code] of Object.entries(after)){if(code!==''&&!validTerminalCode(code)||validTerminalCode(code)&&used.has(code))throw Error('终端码必须为不重复的11位数字');if(code)used.add(code as string);if(object(before)&&validTerminalCode(before[id])&&before[id]!==code)throw Error('已绑定的角色终端码不能随意变更');}
 if(object(before)&&Object.entries(before).some(([id,code])=>validTerminalCode(code)&&after[id]!==code))throw Error('已绑定的角色终端码不能删除');
}
