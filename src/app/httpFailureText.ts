import type {HttpFailure} from '../gateway/requestFailure';
const reasons:Record<number,string>={400:'请求参数被拒绝',401:'凭据或登录无效',403:'没有访问权限',404:'接口不存在',405:'接口不接受该请求方式',408:'请求超时',409:'请求与当前数据冲突',413:'请求内容过大',415:'请求格式不被接受',429:'请求过于频繁，请稍后重试',500:'服务器内部错误',501:'功能尚未配置',502:'网关错误',503:'服务暂不可用',504:'网关超时'};
const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=400&&v<=599;
const upstream=(f:HttpFailure)=>valid(f.upstreamStatus)||valid(f.providerStatus)||!!f.upstreamMessage||!!f.providerCode;
function status(f:HttpFailure){if(valid(f.upstreamStatus))return {value:f.upstreamStatus,label:'上游 HTTP '};if(valid(f.providerStatus))return {value:f.providerStatus,label:'模型返回状态：'};if(f.upstreamMessage||f.providerCode)return;return valid(f.status)?{value:f.status,label:'HTTP '}:undefined;}
export function httpFailureNotice(f:HttpFailure):{message:string;key:string}|undefined{
 const s=status(f),message=f.upstreamMessage?.trim(),code=f.providerCode||f.code||'';if(!s&&!message&&!f.providerCode)return;
 const origin=upstream(f)?'上游模型服务':'本机后台',reason=s?reasons[s.value]||'请求失败':'';
 const description=[s?s.label+s.value:'',f.task,origin+(!message?reason:''),f.providerCode&&f.providerCode!==String(s?.value)?'模型错误码：'+f.providerCode:'',message||''].filter(Boolean).join(' · ');
 return {message:description,key:`http:${origin}:${s?.value??'none'}:${f.task}:${code}:${message||''}`};
}
export function httpFailureLog(f:HttpFailure){const notice=httpFailureNotice(f);if(!notice)return '';return 'HTTP 错误：'+notice.message+(f.message&&f.message!==f.upstreamMessage?' · '+f.message:'');}
