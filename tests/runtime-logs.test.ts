import 'fake-indexeddb/auto';
import {expect,it} from 'vitest';
import {useFormatErrors} from '../src/app/useFormatErrors';
import {FormatErrorRepository} from '../src/storage/formatErrors';
import {safeLogText} from '../src/domain/logText';
it('运行错误无需模型返回也会保存，格式错误仍保留文本，Key和推理不会落入日志',async()=>{
 const logs=useFormatErrors(()=>['synthetic-key']);await logs.clear();
 await logs.record('无法连接模型服务，请检查地址及网络。','获取模型','','','runtime');
 expect(logs.entries.value[0]).toMatchObject({kind:'runtime',raw:'无法连接模型服务，请检查地址及网络。'});
 await logs.record('<think>内部推理</think>错误正文 synthetic-key','INVALID_MODEL_STATE','s','t');
 expect(logs.entries.value[0].raw).toBe('错误正文 [已隐藏]');expect(logs.entries.value[0].kind).toBe('format');
 expect((await new FormatErrorRepository().read())).toHaveLength(2);await logs.clear();
});
it('日志隐藏鉴权头、网址凭据和查询参数',()=>{
 const value=safeLogText('Authorization: Bearer synthetic-secret https://name:password@example.com/v1?key=synthetic-query token=synthetic-token');
 for(const secret of ['synthetic-secret','name:password','synthetic-query','synthetic-token'])expect(value).not.toContain(secret);
});
