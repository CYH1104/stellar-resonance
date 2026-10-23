import {modelError} from './ai.mjs';
export function isPromptDisclosure(text){
  if(typeof text!=='string')return false;
  const s=text.normalize('NFKC').replace(/[\u200b-\u200f\ufeff]/g,'');
  const target='(?:系统提示词|内置提示词|隐藏提示词|服务器提示词|开发者消息|system\\s*prompt|developer\\s*(?:message|instructions)|hidden\\s*instructions)';
  const action='(?:输出|打印|复述|泄露|显示|展示|告诉我|导出|翻译|编码|重复|提供|reveal|print|repeat|show|export|translate|encode|give me)';
  return /(?:你的|你们的|服务器的)(?:系统提示词|内置提示词|隐藏提示词).{0,12}(?:是什么|有哪些|内容)/s.test(s)||new RegExp(action+'.{0,100}'+target+'|'+target+'.{0,100}'+action,'is').test(s)||/what (?:is|are) your (?:system prompt|hidden instructions)/i.test(s);
}
export function guardPromptRequest(path,data){
  const fields=path==='/api/personal-terminal'?[data.input]:path==='/api/forum-reply'?[data.comments?.at(-1)?.content]:path==='/api/persona'?[data.wish]:['/api/generate','/api/random-event'].includes(path)?[data.input]:[];
  if(fields.some(isPromptDisclosure))throw modelError(403,'PROMPT_DISCLOSURE_REQUEST_BLOCKED');
}
