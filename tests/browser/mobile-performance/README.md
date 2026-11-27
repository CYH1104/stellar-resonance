# 手机性能回归

这个脚本加载真实的学院 HTML，使用合成页面状态；不会访问用户存档或模型接口。

在仓库根目录运行，使用已安装的 Playwright（可通过 `PLAYWRIGHT_MODULE` 指定其绝对路径；`BROWSER_CHANNEL=msedge` 可选）：

```sh
node tests/browser/mobile-performance/check.cjs
npx vitest run tests/state-window.test.ts tests/story-render-state.test.ts tests/round-health.test.ts
```

浏览器检查：手机竖屏/横屏保留一帧波浪且空闲不重绘；桌面仅绘制可见画布且低于30fps；进入工作区停止两张画布；返回、切换减少动态效果、页面可见性改变时正确停止/恢复。`TERMINAL_TEMPLATE` 可指定旧版HTML用于红绿对照。

状态测试：60轮存档最后10轮渲染的事件字段读取次数由8840降至280；快照与逐轮重放一致；异常记录、未完成正文、分支切换、回退及手动变量继续生效。快照仅存在于一次同步计算，无持久化字段和跨调用缓存。

2026-11-27测量（Edge，390×844，4倍CPU降速，合成150轮/12角色）：
- 10轮状态窗口：原443–602ms，修改后16.5–52.6ms。
- 学院外壳工作区静置5秒：画布608帧→0帧；主线程忙碌时间1940ms→95ms。

浏览器CPU降速和任务耗时不能换算为真实手机温度、电量或所有操作的提速。
