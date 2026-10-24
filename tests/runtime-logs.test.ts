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
it('stores one call with sections, recursively redacts nested secrets and marks truncation',async()=>{
 const logs=useFormatErrors(()=>['synthetic-deep-key']);await logs.clear();
 const long='正文'.repeat(250000);
 await logs.record('完成','GENERATION_COMPLETE','s','t','generation',{callId:'call-1',variantId:'v',sections:[{id:'errors',kind:'errors',title:'错误与校验',text:'Authorization: Bearer synthetic-deep-key'},{id:'prose',kind:'prose',title:'生成正文',text:long}],variables:{applied:true,total:0,changes:[],reviews:[],details:[],codes:[]}} as never);
 expect(logs.entries.value).toHaveLength(1);const stored=logs.entries.value[0];expect(stored.callId).toBe('call-1');expect(stored.sections).toHaveLength(2);expect(JSON.stringify(stored)).not.toContain('synthetic-deep-key');expect(stored.sections![1].text).toContain('已截断');
 await logs.clear();
});

it('redacts detached GitHub token strings and bounds an oversized multi-section record',async()=>{
 const synthetic='ghp_syntheticTokenForRedaction123';expect(safeLogText('failed '+synthetic)).not.toContain(synthetic);
 const logs=useFormatErrors();await logs.clear();
 await logs.record('x'.repeat(400000),'LARGE','s','t','generation',{sections:Array.from({length:12},(_,i)=>({id:String(i),kind:'prose',title:'正文',text:'z'.repeat(400000)}))});
 const entry=logs.entries.value[0];expect(JSON.stringify(entry).length).toBeLessThanOrEqual(1200000);expect(JSON.stringify(entry)).toContain('截断');
 expect((await new FormatErrorRepository().read())[0].id).toBe(entry.id);await logs.clear();
});
