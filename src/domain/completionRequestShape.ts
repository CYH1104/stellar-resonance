export interface CompletionRequestShape{messages:number;system:number;user:number;assistant:number;characters:number;empty:number;lastRole:'system'|'user'|'assistant'|'none';systemAfterConversation:boolean;stream:boolean;toolFields:number;}
/** Accept only bounded counts and fixed values, never arbitrary provider text. */
export function cleanCompletionRequestShape(value:unknown):CompletionRequestShape|undefined{
 if(!value||typeof value!=='object'||Array.isArray(value))return;
 const source=value as Record<string,unknown>,result:Record<string,unknown>={};
 for(const key of ['messages','system','user','assistant','characters','empty','toolFields']){const number=source[key];if(typeof number!=='number'||!Number.isSafeInteger(number)||number<0||number>100000000)return;result[key]=number;}
 if(Number(source.system)+Number(source.user)+Number(source.assistant)!==source.messages||Number(source.empty)>Number(source.messages)||Number(source.toolFields)>4)return;
 if(typeof source.lastRole!=='string'||!['system','user','assistant','none'].includes(source.lastRole)||typeof source.systemAfterConversation!=='boolean'||typeof source.stream!=='boolean')return;
 if((source.messages===0)!==(source.lastRole==='none'))return;
 return {...result,lastRole:source.lastRole,systemAfterConversation:source.systemAfterConversation,stream:source.stream} as unknown as CompletionRequestShape;
}
export function completionRequestShapeText(value:unknown):string{
 const shape=cleanCompletionRequestShape(value);if(!shape)return '';
 return `\n实际请求：${shape.messages} 条消息（system ${shape.system}／user ${shape.user}／assistant ${shape.assistant}），${shape.characters} 个字符；空消息 ${shape.empty} 条；末条 ${shape.lastRole}；对话后 system ${shape.systemAfterConversation?'有':'无'}；${shape.stream?'流式':'非流式'}；工具字段 ${shape.toolFields} 个。`;
}
