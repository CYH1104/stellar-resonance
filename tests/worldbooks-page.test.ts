import {it,expect} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import WorldbookManager from '../src/components/WorldbookManager.vue';
import {newWorldbook,newWorldEntry} from '../src/domain/worldbooks';
it('世界书独立页呈现书库、存档绑定、折叠条目和兼容提示，按文本处理导入内容',async()=>{
 const book={...newWorldbook('b'),name:'用户世界书',entries:[{...newWorldEntry('e'),title:'学院规则',keys:['学院'],content:'<img src=x onerror=alert(1)>'},{...newWorldEntry('timed'),title:'定时条目',extra:'{"sticky":2}'}]};
 const w={worldbooks:[book],currentWorldbook:book,boundWorldbookIds:['b'],busy:false,workingMemory:false,active:{name:'我的旅程'},worldbookRuntimeWarnings:[]};
 const html=await renderToString(createSSRApp(WorldbookManager,{w:w as any}));
 expect(html).toContain('当前存档：我的旅程');expect(html).toContain('使用世界书 用户世界书');expect(html).toContain('兼容提示');expect(html).not.toContain('暂不触发');expect(html).toContain('条目仍按原开关');expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');expect(html).not.toContain('<img src=x');expect(html).toContain('worldbook-entry');
});
