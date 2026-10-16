import {normalizeMemoryResult,type MemoryRequest} from '../domain/memories';
import {dicePlan} from '../domain/dice';
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
    const plan=request.dice?dicePlan(request.dice):undefined;
    const consequence=plan?{direction:plan.direction,description:plan.direction==='negative'?'报到资料缺了一页，你需要补办后才能继续。':plan.direction==='positive'?'值班引导员帮你找到空闲窗口，报到进度提前。':'接待窗口换班，你在等候时了解了公开流程。'}:undefined;
    const fortune = request.dice ? `本轮骰点为 ${request.dice.value}，判定为「${request.dice.grade}」。` : '本轮没有启用骰子。';
    const diceEventText=consequence?`\n\n${consequence.description}`:'';
    const recalls = request.memories.length ? `\n\n你想起此前的一件事：${request.memories[0].slice(0,65)}。` : '';
    const text = `接待站的指示灯亮起。样例引导员听完你的话，稍作思索，向你展示一张公开的站点说明。\n\n「${request.persona.name || '朋友'}，我们可以从这里开始。你刚才提到的『${request.input.slice(0,80)}』，值得继续聊聊。」\n\n${fortune}${diceEventText}${recalls}\n\n他留出片刻，等你决定下一步。`;
    const chars = Array.from(text);
    const partial=request.continuation?.partial||'';
    if(partial&&!text.startsWith(partial))throw new Error('演示回复内容已变化，请使用重试');
    for(let i=Array.from(partial).length;i<chars.length;i+=8) { await delay(85,signal); yield {type:'delta',text:chars.slice(i,i+8).join('')}; }
    const name=request.persona.name || '玩家';
    yield {type:'done',outcome:{
      ...(consequence?{diceEvent:consequence}:{}),
      player:{innerThought:`【演示】我刚才提出了「${request.input.slice(0,40)}」，想听听大家的看法。`},
      characters:request.state.characters.map(actor=>({id:actor.id,innerThought:actor.id==='guide'?`【演示】${name}愿意交流，先把公开资料说明白。`:'【演示】接待区多了一位新朋友，等会儿可以打个招呼。',present:actor.present,affinity:actor.affinity})),
      suggestions:['询问站点里有哪些公开设施。','请引导员介绍眼前的情况。','观察接待站的环境。'],
      event:`${name}与样例引导员交流：${request.input.slice(0,45)}${consequence?'；'+consequence.description:''}`,
      forum:[
        {id:`${request.turnId}-guide`,authorName:'样例引导员',topic:'接待站日常',content:`今天和${name}聊了聊。听到的问题是「${request.input.slice(0,65)}」。先把公开说明准备好，慢慢认识彼此。`,comments:[{id:'engineer',authorName:'样例巡检员',content:'接待区的灯刚检查过，有需要可以叫我。'}]},
        {id:`${request.turnId}-station`,authorName:'接待站小广播',topic:'站点小剧场',content:'值班记录：指示灯亮起，接待区传来新的交谈声。今天的故事才刚开始。'}
      ]
    }};
  }
  async memory(input:MemoryRequest,_profile:Profile,_key:string,signal:AbortSignal){await delay(100,signal);return normalizeMemoryResult({participants:[input.after.player.name,...input.after.characters.filter(c=>c.present).map(c=>c.name)],time:'未明确',location:'样例接待站',userActions:[input.input],charActions:[],gains:[],losses:[],commitments:[],affinityChanges:[]},input);}
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
