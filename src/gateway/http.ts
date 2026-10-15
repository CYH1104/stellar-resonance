import type { Gateway, GenerateEvent, GenerateRequest, Outcome, Profile } from '../domain/contracts';
export class HttpGateway implements Gateway {
  capabilities = { continue: false };
  private async post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    const response=await fetch(`/api/${path}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
    if(!response.ok) throw new Error(response.status===404?'服务器接口尚未接通，请切换演示模式。':response.status===401||response.status===403?'访问未获授权，请在首页验证邀请。':`接口请求失败（${response.status}），请重试。`);
    return response;
  }
  async authorize(invite: string, signal?: AbortSignal): Promise<void> { const response=await this.post('access',{invite},signal);if(response.status!==204){const data=await response.json() as {capabilities?:{continue?:boolean}};this.capabilities.continue=data.capabilities?.continue===true;} }
  async *generate(request: GenerateRequest, key: string, signal: AbortSignal): AsyncIterable<GenerateEvent> {
    const response=await this.post('generate',{...request,key},signal);
    if(!response.headers.get('Content-Type')?.includes('text/event-stream') || !response.body) throw new Error('服务器应返回 SSE 流式响应');
    const reader=response.body.getReader(); const decoder=new TextDecoder(); let buffer='', finished=false;
    try {
      while(true) {
        const next=await reader.read(); buffer += decoder.decode(next.value,{stream:!next.done}); buffer=buffer.replace(/\r\n/g,'\n');
        let end: number;
        while((end=buffer.indexOf('\n\n'))>=0) {
          const block=buffer.slice(0,end); buffer=buffer.slice(end+2);
          const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
          if(!data) continue;
          let event:Record<string,unknown>;
          try {event=JSON.parse(data) as Record<string,unknown>;}catch{throw new Error('流式数据格式不正确');}
          if(event.type==='delta' && typeof event.text==='string') yield {type:'delta',text:event.text};
          else if(event.type==='done') {finished=true;yield {type:'done',outcome:event.outcome as Outcome};return;}
          else if(event.type==='error') throw new Error('生成接口报告错误，请重试。');
        }
        if(next.done) break;
        if(buffer.length>1024*1024) throw new Error('流式分片超过允许大小');
      }
      if(!finished) throw new Error('回复流已中断，保留已收到的内容。');
    } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  }
  async utility(task: 'summary'|'suggestions', texts: string[], profile: Profile, key: string, signal: AbortSignal): Promise<string[]> {
    const response=await this.post('utility',{task,texts,profile,key},signal); const json=await response.json() as {items:unknown};
    if(!Array.isArray(json.items)||json.items.some(x=>typeof x!=='string')) throw new Error('辅助模型返回格式不正确');
    return json.items.slice(0,4);
  }
  async embed(texts: string[], profile: Profile, key: string, signal: AbortSignal): Promise<number[][]> {
    const response=await this.post('embeddings',{texts,profile,key},signal); const json=await response.json() as {vectors:unknown};
    if(!Array.isArray(json.vectors)||json.vectors.length!==texts.length||json.vectors.some(v=>!Array.isArray(v)||!v.length||v.length>8192||v.some(x=>typeof x!=='number'||!Number.isFinite(x)))) throw new Error('向量接口返回格式不正确');
    return json.vectors as number[][];
  }
}
