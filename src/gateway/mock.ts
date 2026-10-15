import type { Gateway, GenerateEvent, GenerateRequest, Profile } from '../domain/contracts';
function delay(ms: number, signal: AbortSignal): Promise<void> {
  if(signal.aborted) return Promise.reject(new DOMException('已停止','AbortError'));
  return new Promise((resolve,reject) => { const stop = () => { clearTimeout(timer); reject(new DOMException('已停止','AbortError')); }; const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},ms);signal.addEventListener('abort',stop,{once:true}); });
}
/** Original synthetic fixtures. No private author lore is bundled. */
export class MockGateway implements Gateway {
  capabilities = { continue: true };
  async authorize(): Promise<void> {}
  async *generate(request: GenerateRequest, _key: string, signal: AbortSignal): AsyncIterable<GenerateEvent> {
    const fortune = request.dice ? `本轮骰点为 ${request.dice.value}，判定为「${request.dice.grade}」。` : '本轮没有启用骰子。';
    const recalls = request.memories.length ? `\n\n你想起此前的一件事：${request.memories[0].slice(0,65)}。` : '';
    const text = `接待站的指示灯亮起。样例引导员听完你的话，稍作思索，向你展示一张公开的站点说明。\n\n「${request.persona.name || '朋友'}，我们可以从这里开始。你刚才提到的『${request.input.slice(0,80)}』，值得继续聊聊。」\n\n${fortune}${recalls}\n\n他留出片刻，等你决定下一步。`;
    const chars = Array.from(text);
    const partial=request.continuation?.partial||'';
    if(partial&&!text.startsWith(partial))throw new Error('演示回复内容已变化，请使用重试');
    for(let i=Array.from(partial).length;i<chars.length;i+=8) { await delay(85,signal); yield {type:'delta',text:chars.slice(i,i+8).join('')}; }
    yield {type:'done',outcome:{player:{energy:Math.max(0,request.state.player.energy-2)},characters:[{id:'guide',affinity:Math.min(100,(request.state.characters.find(c=>c.id==='guide')?.affinity||0)+4)}],event:`${request.persona.name || '玩家'}与样例引导员交流：${request.input.slice(0,45)}`}};
  }
  async utility(task: 'summary'|'suggestions', texts: string[], _profile: Profile, _key: string, signal: AbortSignal): Promise<string[]> {
    await delay(100,signal);
    return task==='summary' ? [`章节摘要（演示）：${texts.join('；').slice(0,400)}`] : ['询问站点里有哪些公开设施。','请引导员介绍眼前的情况。','回顾刚才的约定。','观察接待站的环境。'];
  }
  async embed(texts: string[], _profile: Profile, _key: string, signal: AbortSignal): Promise<number[][]> {
    await delay(70,signal);
    // Demo-only character hashing, explicitly labeled in the UI. This is NOT semantic embedding.
    return texts.map(text=>{const vector=Array(32).fill(0) as number[];for(const c of text)vector[c.codePointAt(0)!%32]++;return vector;});
  }
}
