import {afterEach,expect,it,vi} from 'vitest';
import {createSSRApp} from 'vue';import {renderToString} from 'vue/server-renderer';
import {completionProfile} from '../src/domain/completionProfile';
import {modelRequestContext} from '../src/gateway/requestFailure';
import {HttpGateway} from '../src/gateway/http';
import StoryReplyFailure from '../src/components/StoryReplyFailure.vue';
import {completionRequestShapeText} from '../src/domain/completionRequestShape';
import type {GenerateRequest,Profile} from '../src/domain/contracts';
afterEach(()=>vi.unstubAllGlobals());
const profile:Profile={id:'main',name:'主API',providerId:'approved-provider',apiBaseUrl:'https://synthetic.example/v1',model:'pg/gemini-compatible-high',temperature:.7,maxTokens:32000,topP:1,frequencyPenalty:0,presencePenalty:0};
it('omits only neutral penalties and never changes model, address, budget, temperature, top-p or saved configuration',()=>{
 const original=JSON.stringify(profile);expect(completionProfile(profile)).toEqual({id:'main',name:'主API',providerId:'approved-provider',apiBaseUrl:profile.apiBaseUrl,model:profile.model,temperature:.7,maxTokens:32000,topP:1});expect(JSON.stringify(profile)).toBe(original);
 expect(completionProfile({...profile,frequencyPenalty:-.4,presencePenalty:.3})).toMatchObject({frequencyPenalty:-.4,presencePenalty:.3});
});
it('uses the compatible profile on the real gateway request without automatic retries',async()=>{
 const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{const value=JSON.parse(init.body);calls.push(value);if(value.profile.frequencyPenalty!==undefined||value.profile.presencePenalty!==undefined)return Response.json({code:'UPSTREAM_REJECTED',upstreamStatus:400},{status:502});return new Response('data: '+JSON.stringify({type:'delta',text:'实际正文'})+'\n\ndata: '+JSON.stringify({type:'done',outcome:{event:'推进'}})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});}));
 const events=[];for await(const event of new HttpGateway().generate({profile} as GenerateRequest,'synthetic-key',new AbortController().signal))events.push(event);
 expect(calls).toHaveLength(1);expect(events.some(e=>e.type==='delta'&&e.text==='实际正文')).toBe(true);expect(calls[0].profile.maxTokens).toBe(32000);expect(calls[0].profile.model).toBe(profile.model);
});
it('logs effective numeric prose parameters without exposing the key or incorrectly labelling probe overrides',()=>{
 const text=modelRequestContext({profile:completionProfile(profile),key:'synthetic-secret'},'generate');expect(text).toContain('请求最大输出：32000 tokens');expect(text).toContain('top_p：1');expect(text).not.toContain('frequency_penalty');expect(text).not.toContain('synthetic-secret');expect(modelRequestContext({profile},'probe')).not.toContain('请求最大输出');
});
it('uses the same neutral-parameter compatibility for terminal and auxiliary calls, retaining nonzero penalties',async()=>{
 const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{calls.push(JSON.parse(init.body));return Response.json({items:['概括']});}));
 const gateway=new HttpGateway(),signal=new AbortController().signal;await gateway.terminal({task:'chat'},profile,'synthetic-key',signal);await gateway.utility('summary',['正文'],{...profile,frequencyPenalty:.2},'synthetic-key',signal);
 expect(calls[0].profile).not.toHaveProperty('frequencyPenalty');expect(calls[0].profile).not.toHaveProperty('presencePenalty');expect(calls[1].profile.frequencyPenalty).toBe(.2);expect(calls[1].profile).not.toHaveProperty('presencePenalty');expect(calls.every(c=>c.profile.maxTokens===32000&&c.profile.model===profile.model)).toBe(true);
});
it('keeps the exact failed variant error visible independently of transient notices',async()=>{
 const html=await renderToString(createSSRApp(StoryReplyFailure,{sessionId:'s',turnId:'t',variantId:'v',records:[{id:'other',at:'now',sessionId:'s',turnId:'t',variantId:'old',code:'HTTP_ERROR',raw:'不得显示其他稿件的错误'},{id:'failure',at:'now',sessionId:'s',turnId:'t',variantId:'v',code:'HTTP_ERROR',raw:'HTTP 400 · 剧情生成\n模型：指定模型\n请求最大输出：32000 tokens'}]}));
 expect(html).toContain('HTTP 400');expect(html).toContain('查看本轮日志');expect(html).toContain('重新生成');expect(html).not.toContain('不得显示其他稿件');expect(html).not.toContain('尚无回复');
});
it('shows only the safe upstream classification rather than echoing a provider error body',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({code:'UPSTREAM_REJECTED',upstreamStatus:400,reason:'UPSTREAM_TOOL_CALLS_UNSUPPORTED'},{status:502})));
 await expect(new HttpGateway().terminal({task:'chat'},profile,'synthetic-key',new AbortController().signal)).rejects.toThrow('上游拒绝工具或函数调用相关内容');
});
it('shows 500 as a server error with safe reason and actual request counts for HTTP and SSE failures',async()=>{
 const requestShape={messages:4,system:2,user:1,assistant:1,characters:123,empty:0,lastRole:'user',systemAfterConversation:true,stream:true,toolFields:0,secret:'PRIVATE_KEY'};
 const error={code:'UPSTREAM_SERVER_ERROR',upstreamStatus:500,reason:'UPSTREAM_MESSAGE_ROLES',requestShape};
 for(const streamed of [false,true]){
  vi.stubGlobal('fetch',vi.fn(async()=>streamed?new Response('data: '+JSON.stringify({type:'error',...error})+'\n\n',{headers:{'Content-Type':'text/event-stream'}}):Response.json(error,{status:502})));
  try{for await(const _ of new HttpGateway().generate({profile} as GenerateRequest,'synthetic-key',new AbortController().signal)){}expect.unreachable();}catch(e){const message=String(e);expect(message).toContain('上游返回服务端错误');expect(message).toContain('上游拒绝消息角色或顺序');expect(message).toContain('4 条消息');expect(message).toContain('工具字段 0 个');expect(message).not.toContain('PRIVATE_KEY');expect(message).not.toContain('请检查模型名和参数');}
 }
 expect(completionRequestShapeText({...requestShape,characters:'PRIVATE_TEXT'})).toBe('');expect(completionRequestShapeText({...requestShape,lastRole:'PRIVATE_TEXT'})).toBe('');expect(completionRequestShapeText({...requestShape,messages:3})).toBe('');
});
