# 账号隔离与现有学院界面单轮接入

2026-10-28，独立分支rebuild/sillytavern-native。大小姐批准“账号隔离＋现有界面完成并保存一轮正文”。本轮为本地受控接入里程碑，不是完整迁移或上线许可。

后续进展：Codex已按用户接手指令完成原生预设的本机权威、设置页及完整备份接入。见`docs/handoffs/2026-10-28-native-config-authority.md`。下文原阶段的服务端configs改为只读迁移源；当前运行配置以账号范围IndexedDB内`archive.nativePreset`为准。

## 实际链路

现有登录页/账号SQLite → createLocalServer可选nativeRuntime → 账号有效配置快照 → 账号专用原生进程/私有编排浏览器 → 原生模型出口 → 本地模拟模型 → 服务端思考过滤/完成校验 → 现有StoryDecoder和Vue → 原有账号范围IndexedDB。

server/app.mjs默认不启用nativeRuntime，原线上启动方式不变；新增/api/native-config仍经过现有登录、本机业务会话和同源检查。调用方不能指定accountId、handle、文件路径或原生端口。账号ID与dataVersion经哈希生成内部目录名。

每账号一个独立原生进程、数据目录、浏览器上下文和编排序列；不是多个网页共享同一个原生default-user。演示最多2个worker，满额明确拒绝；不是生产伸缩池。预设按账号原始JSON原子写入，未知格式拒绝；非法保存不毒化后续读取。运行副本关闭思考、玩家脚本仍禁用。生成前捕获配置快照，正文与自动记忆使用所绑定账号。重说传递regenerate类型，原生触发条目按该类型执行。

现阶段学院协议仍由原有buildMessages产生，经保留system内容的“学院任务协议”原生注入条目接入；聊天历史投影到原生chat。原生PromptManager执行最终编排，不宣称学院全部历史预设、世界书UI已迁移。原生聊天数据仅是任务投影，原有IndexedDB继续是剧情权威库。

模型出口仅允许本地fake endpoint，经原生后端到本地fixture；不接受任意上游地址或真实Key。过滤后的SSE才送回学院解析器；只有stop完成，length/content_filter/无终止原因EOF明确失败，已有正文保留，没有自动重试收费。

## 启动与复现

与此前相同的锁定上游目录及PLAYWRIGHT_MODULE、CHROMIUM_PATH。先npm run build（会同步终端HTML；只在确认是自己的生成差异时恢复该文件，勿覆盖他人改动）。

```powershell
node experiments/native/academy-demo.mjs
node node_modules/vite/bin/vite.js --config experiments/native/academy-vite.config.mjs
```

8861/terminal是原学院页面；8862仅本地模型；8863仅测试种子模块服务器；账号原生进程使用8864起的回环端口。独立数据在.integration/native-step4，不能将该目录或启动器部署公网。

```powershell
node --test experiments/native/account-runtime.test.mjs experiments/native/protection.test.mjs experiments/native/client.test.mjs experiments/native/gateway-review.test.mjs
node experiments/native/academy-browser-smoke.mjs
```

浏览器测试只在独立合成账号里设置测试剧情和模拟凭据，不拦截/mock浏览器业务API；通过现有仓库类写入测试种子。实际点击发送/停止/重说/切稿/回溯，随后读取存档和刷新，模拟的只有最终上游模型输出。首次启动worker较慢，后续复用。

## 验证与证据

证据docs/evidence/native-step4。包括双账号桌面、390px移动截图及browser-report.json。正文、角色关系状态、自动记忆落盘及刷新恢复；私有标记/思考不显示；实际参数分属0.2/2048和0.8/3072；native setvar/getvar标记及worker身份分离；相同浏览器换账号读不到旧账号剧情；伪造owner拒绝400、匿名拒绝401；重说多稿、切稿、回溯、停止和length未完成稿保存/刷新、业务备份往返；指定regenerate原生触发器只在重说出现；5次正文（含停止/截断）＋3次记忆恰为8次上游请求，无额外重试。

14项新旧原生策略/传输/账号回归通过，相关服务端/状态定向72项通过，构建及类型检查通过。完整旧服务端回归429通过/8失败/4跳过（共441）。失败在channel-instance的5项快照/启动测试、instance-worldbook-seed的3项启动测试。改动前6cd444f导出的独立源码副本也复现：channel5项相同EPERM/启动失败；worldbook首次2项失败、再次3项均失败；扩大沙箱权限未消除。未修改release.mjs来掩盖失败，不声称全量通过。细项见regression-summary.json。

## 数据与未完成范围

- 无生产账号、真实作者设定、真实用户存档或真实计费模型操作。
- 剧情、状态、记忆、未完成稿仍走既有业务备份格式，浏览器往返验证未完成稿内容一致；未新增Snapshot/BackupArchive字段。
- configs/*.json现在只读兼容迁移，不再写入，也不是生成时的权威来源。当前原生预设进入BackupArchive，已经覆盖本地/云端备份、导入、覆盖和恢复副本；完整迁移仍不具备发布条件。
- /api/native-config仅提供当前账号的旧配置/公开默认预设读取。保存发生在现有预设页面，支持原始JSON导入导出、温度/长度、条目内容/启停和完整文件编辑。当前仍是单一活动原生预设；多预设/世界书管理与按任务绑定继续待做。
- 目前用户级原生预设用于所有演示文本任务；按任务绑定不同原生预设、真实供应商模型列表/参数、终端/小剧场等尚未迁移验收。
- 账号重置通过dataVersion切换目录范围；老目录删除/回收、删除账号取消在途任务、生产worker回收/超时/崩溃恢复、Linux负载仍待实现或验证。
- 继续缺玩家助手安全桥、脚本管理页、真实世界书管理、真实供应商验收及四项旧终端缺陷。本轮只完成已批准的单轮接入里程碑，不直接开启下一大阶段。
