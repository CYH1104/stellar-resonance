const emails=new Set(['1683264627@qq.com','2889463835@qq.com','237474810@qq.com']);
export const developerAllowed=account=>!!account&&typeof account.email==='string'&&emails.has(account.email.trim().toLowerCase());
// Only structural metadata. Never transmit prompt text, credentials, or hidden reasoning.
export function developerTrace(messages,{stage,model='',elapsedMs=0,stateAuxiliary=false}={}){
 return {stage,model:String(model).slice(0,200),elapsedMs:Math.max(0,Math.round(elapsedMs)),stateAuxiliary,messages:messages.map((m,index)=>({index:index+1,role:m.role,characters:typeof m.content==='string'?m.content.length:0}))};
}
