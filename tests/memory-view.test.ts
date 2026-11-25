import {expect,it} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import MemoryView from '../src/components/MemoryView.vue';
import type {ViewModel} from '../src/app/useWorkspace';
import {defaults} from '../src/domain/story';
async function render(needsRepair:boolean){const m={id:'m',kind:'event',record:needsRepair?undefined:{},text:'已整理的记忆',sourceTurn:'t'};const w={preferences:defaults(),memoryEntries:[m],memories:[m],chatRoundCount:5,effectiveMemoryCount:needsRepair?4:5,missingVectorCount:0,busy:false,workingMemory:false,memoryNeedsRepair:()=>needsRepair,vectorStatus:()=>needsRepair?'待补记':'已建索引'} as unknown as ViewModel;return renderToString(createSSRApp(MemoryView,{w}));}
it('记忆页显示轮数与有效条数，没有手动检索、手记输入或顶部重复补记',async()=>{
 const html=await render(false);expect(html).toContain('聊天5轮/有效记忆5条');expect(html).not.toContain('检索记忆');expect(html).not.toContain('添加手记');expect(html).not.toContain('<textarea');expect(html).toContain('原始记忆与补记');expect(html).not.toContain('>补记</button>');expect(html).toMatch(/<button\b[^>]*\bdisabled\b[^>]*>补建记忆索引<\/button>/);
});
it('历史列表按需展开，统计不将待补记录计为有效',async()=>{const html=await render(true);expect(html).toContain('聊天5轮/有效记忆4条');expect(html).toContain('原始记忆与补记');expect(html).not.toContain('已整理的记忆');});
