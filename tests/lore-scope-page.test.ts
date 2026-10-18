import {it,expect} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import LoreScopeEditor from '../src/components/LoreScopeEditor.vue';
it('shows inherited/global/multi-character controls and unknown IDs without silently remapping',async()=>{
 const html=await renderToString(createSSRApp(LoreScopeEditor,{inherit:true,modelValue:{mode:'characters',characterIds:['a','missing']},actors:[{id:'a',name:'甲'},{id:'b',name:'乙'}]}));
 expect(html).toContain('沿用本书设置');expect(html).toContain('整张卡');expect(html).toContain('手动指定角色');expect(html).toContain('甲');expect(html).toContain('乙');expect(html).toContain('未登记角色：missing');expect(html).toContain('不会发送');
});
