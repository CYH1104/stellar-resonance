# 第二步：原生酒馆独立环境与正文通路验证

状态：本地隔离验证版，不是生产后端替换。仅在 `rebuild/sillytavern-native` 分支维护。不要将此分支部署到现有8807/9000。

## 已证明什么

现有 Vue App → 真实学院服务端 → 真实 SillyTavern 原生 `/api/backends/chat-completions/generate` → 本地 OpenAI SSE 模拟端 → 原路径回到学院正文，并保存到隔离浏览器 IndexedDB，刷新恢复。

浏览器未 mock API；原生服务端也未 mock。模拟的是最后一跳模型，不是凭空把前端结果标成成功。此次一轮正文还触发了现有自动记忆，所以实际为1次正文、1次记忆调用，均经过原生服务端。模拟端分别返回合成正文和合法记忆JSON；没有真实付费模型。

## 尚未证明什么

- 本步骤仍使用学院现有后端编排消息，再交给原生模型传输；**不代表原生 PromptManager、世界书、宏已经迁移或兼容**，这是第三步。
- 酒馆助手已按锁定提交复制到原生扩展目录，保留原构建产物并关闭自动更新；尚未在浏览器加载执行代表性脚本，不声称脚本兼容或权限隔离已通过。
- 不使用真实用户、私有作者卡或旧存档；不验证生产登录、所有供应商、状态/小剧场/终端；截图为现有Vue组件界面，不是线上学院宿主皮肤验证。
- 不修改任何持久化schema。实验仍使用当前Snapshot/IndexedDB，由新端口和新浏览器上下文隔离。

## 固定版本

详见 versions.json：SillyTavern 1.19.0 / `06bde939fb1e9c4c8d8641d810f0a916b5bce127`；酒馆助手4.11.3 / `0af421068e7c03b6b0a71b68feb79d201164edeb`；学院基线03cdd39。

不把上游整仓和node_modules复制入学院Git仓库。使用锁文件和启动器核验提交，复现时克隆官方仓库后 checkout 对应提交。固定版本属于本地实验选择，不表示未来正式版已选定该版本。

## 复现（PowerShell，Node 24）

先在独立学院克隆中切到 `rebuild/sillytavern-native`，安装当前项目锁定依赖并 `npm run build`。此构建会运行原有sync-terminal脚本，产生学院HTML同步变化；不要把这类无关生成差异提交。

在学院克隆同级准备官方仓库：

```powershell
git clone https://github.com/SillyTavern/SillyTavern.git ../stellar-native-runtime-20261028
git -C ../stellar-native-runtime-20261028 checkout --detach 06bde939fb1e9c4c8d8641d810f0a916b5bce127
git clone https://github.com/N0VI028/JS-Slash-Runner.git ../stellar-native-helper-20261028
git -C ../stellar-native-helper-20261028 checkout --detach 0af421068e7c03b6b0a71b68feb79d201164edeb
```

在原生仓库执行 `npm ci --omit=dev --no-audit --no-fund`。然后回到学院克隆：

```powershell
node experiments/native/start.mjs
```

默认兄弟目录之外的位置可传 `--runtime <绝对路径> --helper <绝对路径>`。启动器先核对两个Git提交，再创建忽略目录 `.integration/native-step2/`。Node命令行禁用自动打开浏览器；仅绑定本机IPv4回环，不创建生产账号或读取现有私有卡。

另一个终端运行：

```powershell
node node_modules/vite/bin/vite.js --config experiments/native/vite.config.mjs
```

端口：原生8830、学院验证API8831、本地模型模拟8832、当前Vue前端8833。开发代理将固定的本机Host/Origin发给验证API，保留产品服务端的来源校验；不修改生产安全逻辑。

自动浏览器验证需已安装的playwright-core和Chromium/Edge，指定路径而非写入项目机器路径：

```powershell
$env:PLAYWRIGHT_MODULE='你的playwright-core/index.mjs绝对路径'
$env:CHROMIUM_PATH='你的浏览器可执行文件绝对路径'
node experiments/native/browser-smoke.mjs
node --test experiments/native/client.test.mjs
```

启动器和Vite分别Ctrl+C停止。实验日志/数据留在.integration，不随Git上传。原生UI仅供本机诊断，不对公网开放；本步骤没有生产级身份边界。

## 传输适配与测试

native-client只接受固定回环原生服务和回环模拟上游，不转发调用方任意URL、Key或自定义头。保留原生CSRF及Cookie请求链，AbortSignal贯通；请求锁定include_reasoning=false。这是实验保护，不代表任意正文中的隐式推理可完全识别。

实际发现原生转发SSE时缺少Content-Type。桥接先读取验证SSE前缀，再以ReadableStream保留全部字节并补齐类型；非SSE HTML/JSON拒绝，非2xx保留失败，不改成成功。该适配只在实验路径，不修改现有生产流解析器。

6项桥接测试通过：回环限制、CSRF/会话/采样/取消信号、非预期URL阻断、预取消不发请求、分块SSE类型修复且字节不变、HTML/JSON不冒充SSE。

原有定向回归3文件15项普通通过，另1项it.fails为原有已知缺陷（行动变更复用终端facts），仍未修。学院正式构建通过；不是全量功能验收。

最终浏览器报告见 docs/evidence/native-step2。首次暴露开发代理Host/Origin不匹配及原生Content-Type差异，均在实验代理/桥接修正。模拟记忆首次返回格式不合契约，已修正模拟端的charActions对象结构；未改产品校验去迁就错误结果。

## 后续

第三步固定同一版本进行原生预设、世界书、宏和代表性助手脚本验证；重点证明私有设定不进入浏览器。不能因为本步骤通路成功就宣称整个酒馆运行时已经迁移。
