# 2026-11-27 8807 仅同步手机性能修复

## 授权与发布范围

大小姐明确要求“这个更新同步到8807，只同步性能问题”。只回移上一轮的波浪绘制调度与历史状态计算；9000现有版本保持不变。无子代理，没有新增存储字段、数据库、API调用或外部素材。

开工本地与GitHub main均为da36a5ad3ded9e043b79229ebf46111eba052d1d。agent-hub指定路径不存在，status和三路read均MODULE_NOT_FOUND；不能声称已取得接力棒状态，以仓库交接记录替代。

## 稳定版来源与差异证明

- 8807 current.json的sourceCommit为17b667db8c653bacde65ffe585f2437baaadad30，release3186c22b4b14d340。下载并核对439个运行源码、package与模板文件，换行归一后与该提交完全一致。
- 从此稳定提交建立codex/stable-performance-20261127，仅应用性能提交bccde85cfe690c2e1ec57547fe839788622112f9的8个文件差异（4个运行文件、4个测试/测试说明文件）。
- 独立稳定源码提交ebdc01b3697dcb345caa0b0c1b6846a849023b0a已推送同名分支；父提交仍是17b667d，未合并main。
- 运行源码仅改变src/domain/story.ts、src/domain/roundHealth.ts、src/app/storyRenderState.ts及学院HTML中的mountWave3D控制器。模板其余部分和全部其他运行源码保持一致。
- 未带入main中的狼人杀、未读角标、邀请好友、观战等后续功能；story.ts中较新的狼人杀/游戏邀请备份校验扩展也未带入。

## 修复与验证

- 手机波浪保留静态图；页面隐藏或工作区遮挡时取消动画；桌面仅绘制外露画布并限制帧率。
- 可见历史窗口单次重放，复用本批独立状态快照；没有跨渲染缓存，分支、编辑、回退和导入保持原语义。
- 稳定版完整前端回归195文件1197项通过，涵盖存档、备份、分支、状态及游戏测试。
- 六组浏览器调度回归通过：手机、旋转、桌面限帧、工作区遮挡、减少动态效果、页面隐藏恢复；pageerror为空。
- 类型检查与生产构建通过。实际生产bundle的手机尺寸冒烟通过：挂载成功、设置页可打开、空闲波浪重绘0帧、无页面错误；已查看设置截图。
- 没有做真实手机温度或耗电测试，也没有使用真实付费模型调用。

## 发布收据

- 仅8807前端热更新，没有运行双实例更新器或重启服务。新入口和模板原子替换，保留全部原哈希资源，新增25个JS/CSS资源。
- 8807后端仍为release3186c22b4b14d340、PID1217979、instance761e2277c88b6f8454aa6e6717ca7b11；current.json、last-deployed-main及快照src/package保持原样。性能代码运行于新前端bundle。
- 新index.html SHA256：438fbd9ce567b7a36fac0598ba876864527c01ddc92d4a22b84f015c2cec989a。
- 新学院模板SHA256：3f603dbead1b7fb5f183ed16f01e644224cdd672a92795abb796e497c156f38d。
- 9000完整dist清单、学院模板、current指针、last-deployed标记、健康身份逐项一致；仍为release629c47d1e26f1928、PID1819700、instance11ecf184423fdfa614d0872a26bb74b3。
- 服务器校验37个新构建JS/CSS；公网按现存完整清单核验8807共64个、9000共58个JS/CSS。公网验证时间2026-11-27 23:33:19 Asia/Shanghai。
- 回退备份：/home/ubuntu/.stellar-resonance-backups/stable-performance-20261127-k6x_56js。包含原index.html、terminal.html、before/manifest/receipt、部署脚本及来源/差异证明。
- 热更新记录：server/.local/frontend-fixes/stable-performance-20261127.json。后续稳定版完整发布应以独立稳定性能提交为基础，避免默认更新器把测试功能整体升级到8807。
- 再次核对两端完整状态后，已删除远端此次暂存目录和本地临时SSH私钥；回退备份保留。原开发分支已恢复，本地dist仍为本次稳定构建，后续本地预览需先按当前源码重新构建。

## 接力与下一步

用户刷新8807即可加载新前端，不需要清理网站数据。待用户在原手机与原存档复测卡顿/发热，不把浏览器测量等同于真机温度验收。没有其他待发布功能。

证据在忽略目录.integration/stable-performance-20261127：source-verification.json、patch-scope.json、tests.log、browser-check.log、build.log、production-browser.json、receipt.json、public-verification.json。收工agent-hub handoff仍因MODULE_NOT_FOUND未能完成，以本文记录完成项、验证与下一步。
