import {expect,it} from 'vitest';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {cleanLayout,defaultLayout,fitColumns,resizeColumn,resizePanel} from '../src/domain/layout';
import {backup,defaults,parseBackup} from '../src/domain/story';
import ResizablePanel from '../src/components/ResizablePanel.vue';
it('侧栏宽度为正文保留空间，窄屏临时收缩不覆盖保存值',()=>{
  const layout={left:800,right:800,panels:{}};for(const width of [760,900,1100,1440,1920]){const fitted=fitColumns(layout,width);expect(fitted.available-fitted.left-fitted.right).toBeGreaterThanOrEqual(319);expect(fitted.left).toBeGreaterThanOrEqual(200);if(width>=1100)expect(fitted.right).toBeGreaterThanOrEqual(240);else expect(fitted.right).toBe(0);}
  expect(layout.left).toBe(800);expect(resizeColumn(defaultLayout(),1440,'left',99999)).toBeLessThanOrEqual(800);expect(resizeColumn(defaultLayout(),1440,'right',-99999)).toBe(240);expect(fitColumns(layout,1440,false).right).toBe(0);
});
it('卡片宽高独立，限制越界，缩小时内容通过卡片内滚动查看',()=>{
  expect(resizePanel({},30,40,{width:240,height:300},340)).toEqual({width:270,height:340});expect(resizePanel({height:250},9999,0,{width:240,height:250},340)).toEqual({width:340,height:250});expect(resizePanel({},-9999,-9999,{width:240,height:300},340)).toEqual({width:180,height:140});expect(resizePanel({},0,99999,{width:240,height:300},340).height).toBe(2000);
});
it('布局随本机备份恢复，旧存档默认布局，损坏尺寸安全回退',()=>{
  const preferences=defaults();preferences.layout={left:300,right:450,panels:{player:{height:250},'char-pro-02':{width:220,height:300},'theater-1':{height:430}}};const restored=parseBackup(backup({version:1,preferences,sessions:[]}));expect(restored.preferences.layout).toEqual(preferences.layout);delete preferences.layout;expect(parseBackup(backup({version:1,preferences,sessions:[]})).preferences.layout).toEqual(defaultLayout());expect(cleanLayout({left:NaN,right:9000,panels:{player:{height:-1},unknown:{width:500}}})).toEqual({right:800,panels:{player:{height:140}}});
});
it('卡片忽略旧宽度并恢复高度，只提供纵向调整手柄',async()=>{
  const preferences=defaults();preferences.layout={panels:{player:{width:260,height:280}}};const html=await renderToString(createSSRApp(ResizablePanel,{preferences,panelKey:'player',label:'玩家状态卡'}));expect(html).toContain('width:100%');expect(html).not.toContain('260px');expect(html).toContain('height:280px');expect(html).toContain('aria-label="调整玩家状态卡高度"');expect(html).not.toContain('resize-x');expect(html).not.toContain('resize-both');expect(html).toContain('resizable-panel-body');
});
