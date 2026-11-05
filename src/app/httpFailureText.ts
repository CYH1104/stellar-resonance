import type {HttpFailure} from '../gateway/requestFailure';

const reasons:Record<number,string>={400:'请求参数被拒绝',401:'凭据或登录无效',403:'没有访问权限',404:'接口不存在',405:'接口不接受该请求方式',408:'请求超时',409:'请求与当前数据冲突',413:'请求内容过大',415:'请求格式不被接受',429:'请求过于频繁，请稍后重试',500:'服务器内部错误',501:'功能尚未配置',502:'网关错误',503:'服务暂不可用',504:'网关超时'};

/** Only a status the transport or the upstream really reported is shown; nothing is parsed out of an error body. */
function statusOf(failure:HttpFailure):number|undefined{
 const status=failedUpstream(failure)?failure.upstreamStatus:failure.status;
 return status!==undefined&&Number.isInteger(status)&&status>=400&&status<=599?status:undefined;
}
const failedUpstream=(failure:HttpFailure)=>Number.isInteger(failure.upstreamStatus)&&Number(failure.upstreamStatus)>=400&&Number(failure.upstreamStatus)<=599;
export function httpFailureNotice(failure:HttpFailure):{message:string;key:string}|undefined{
 const status=statusOf(failure);if(status===undefined)return;
 const origin=failedUpstream(failure)?'上游模型服务':'本机后台',reason=reasons[status]||'请求失败';
 const detail=!failedUpstream(failure)&&failure.code==='PRIVATE_NATIVE_EXECUTION_FAILED'?'原生提示词组装失败，尚未调用模型；已有资料保留。':!failedUpstream(failure)&&status===503&&failure.code==='NATIVE_PRIVATE_COMPILER_PENDING'?'当前站点生成已暂停；已有存档和设置保留。':`${origin}${reason}`;
 return {message:`HTTP ${status} · ${failure.task} · ${detail}`,key:`http:${origin}:${status}:${failure.task}:${failure.code||''}`};
}
/** Full sanitized line for the run log; the caller redacts credentials before recording it. */
export function httpFailureLog(failure:HttpFailure){
 const status=statusOf(failure);if(status===undefined)return '';
 const origin=failedUpstream(failure)?'上游模型服务':'本机后台',reason=reasons[status]||'请求失败';
 return `HTTP 错误：${origin} ${status}（${reason}）· ${failure.task}${failure.code?' · 代码 '+failure.code:''} · ${failure.message}`;
}
