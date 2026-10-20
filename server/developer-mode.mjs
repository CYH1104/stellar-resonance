const emails=new Set(['1683264627@qq.com','2889463835@qq.com','237474810@qq.com']);
export const developerAllowed=account=>!!account&&typeof account.email==='string'&&emails.has(account.email.trim().toLowerCase());
// Only structural metadata. Never transmit prompt text, credentials, or hidden reasoning.
export function developerTrace(messages,{stage,model='',elapsedMs=0,stateAuxiliary=false,presets,profile,outcome,validationCodes=[]}={}){
 const contract=messages.map((m,i)=>({m,i})).findLast(({m})=>m.role==='system'&&m.content.includes('[Output contract; state-output-v1;'));
 let manifest;try{manifest=JSON.parse(contract?.m.content.match(/Manifest: ([^\n]+)/)?.[1]||'null');}catch{}
 const outputContract={state:!!manifest,slots:Array.isArray(manifest?.enabledTheaterSlots)?manifest.enabledTheaterSlots:[],messageIndex:contract?contract.i+1:0};
 return {outputContract,stage,model:String(model).slice(0,200),elapsedMs:Math.max(0,Math.round(elapsedMs)),stateAuxiliary,messages:messages.map((m,index)=>({index:index+1,role:m.role,characters:typeof m.content==='string'?m.content.length:0})),...(presets?{presets}:{}),...(profile?{sampling:Object.fromEntries(['temperature','maxTokens','topP','frequencyPenalty','presencePenalty'].filter(k=>Number.isFinite(profile[k])).map(k=>[k,profile[k]]))}:{}),...(outcome?{checks:{stateReceived:outcome.stateUpdate?outcome.stateUpdate.received:!!(outcome.characters?.length||outcome.player||outcome.mvu?.length),validationCodes:validationCodes.slice(0,30),characterUpdates:outcome.characters?.length||0,suggestions:outcome.suggestions?.length||0,forumPosts:outcome.forum?.length||0,theaterSlots:(outcome.theaters||[]).map(t=>t.slot)}}:{})};
}
