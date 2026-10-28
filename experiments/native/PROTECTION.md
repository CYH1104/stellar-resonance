# 第三步修正：服务端私有编排、思考硬锁与原始预设保留

2026-10-28。用户已授权执行修正并发频道。基于rebuild/sillytavern-native的12496b2，仍为隔离验证路径，不是完整学院后端切换，不部署公网。

## 结论

新保护路径的15项浏览器检查通过，另有11项策略/传输单测通过。私有角色卡与世界书确实参与原生编排，客户端只取得公开资料与过滤后的正文。第三步原先的原生默认暴露证据仍然有效；这里关闭的是新受控路径的关口，不把原生默认接口改说成已经安全。

## 1. 私有资料如何不下发

`private-worker.mjs`由Node启动服务端自有的无头Chromium，通过内部回环原生实例执行原生Generate dry-run，保留原生PromptManager、世界书和宏实现。私有描述和世界书只注入此服务端浏览器，不注入玩家页面。最终messages只在服务端传给原生模型出口，公共接口没有“返回完整提示词”的功能。

私有worker使用全新的隔离browser context。原生实例独立数据目录，初始化玩家脚本执行开关为global=false、presets=[]、characters=[]，并清空全局脚本树。编排前后检查这些开关、脚本iframe和执行标记。验证预设故意包含一段enabled=true的玩家助手脚本，仍没有执行。

每次启动分配独立的内部角色身份，避免复用上次运行的角色描述缓存。第一次重启回归发现旧角色缓存不更新，测试直接以“新私有标记必须进入请求”拒绝通过；随后改为独立身份，再确认角色卡和世界书都实际进入原生请求。不是通过删除设定通过保护。

`protected-gateway.mjs`只开放session、public-card、用户preset、generate。角色卡、世界书原文、完整编排、密钥、导出与源文件路径均404，不是把原生所有接口转发到公网。请求体只允许input，拒绝调用方传入完整messages、私有卡、Key、脚本、预设或思考覆盖参数。另做同源、Host、回环、HttpOnly Cookie和CSRF校验；页面CSP禁止跨源连接/iframe/对象。

## 2. 思考锁定发生在真正出口

- `protectedRuntimePreset`对运行副本强制show_thoughts/include_reasoning/request_thoughts/should_return_reasoning=false，原始导入文件不被悄悄改写。
- worker加载预设后再次关闭原生show_thoughts，并在编排完成后核验；玩家任意脚本根本不在私有worker执行。
- native-client的受控custom出口固定include_reasoning=false；通过custom_include_body送到实际模拟上游。浏览器报告记录实际收到的上游参数false，而不只是看网页开关。
- 使用现有真实completionChunks/ReasoningFilter在服务器下发前分离思考。模拟上游故意返回独立reasoning_content以及跨块的`<thi`/`nk>...私有标记...</think>`，客户端只收到可见正文；没有先显示再隐藏。

这不表示所有提供商都能关闭模型内部思考或相关费用，也不保证识别任意无标记的正文复述。当前出口仍是本地custom模拟源，真实供应商的参数兼容需单独验证，不能直接向所有来源乱加同一个参数。

## 3. 预设修改不再经类型化对象整份覆盖

`patchRawPreset`以完整原始JSON为权威，递归合并明确编辑的字段；prompts按identifier定位并合并，不重建条目。修改文字/启停后，injection_trigger、injection_depth、未知extra、prompt_order及未知extensions原样保留。

测试明确以normal触发、深度2、未知extra/扩展数据为样本；修改温度和content后这些字段不丢失。拒绝重复/未知identifier及原型污染键。原始文件和实际运行策略分开，因此导入文件的思考偏好不能绕过服务器硬锁。

当前API只实现已有条目的受控编辑，不冒称原生预设所有新增/删除/排序编辑功能都已经接入学院前端。原始数据存储在本次验证进程内，原生worker会有内部运行副本；还没有接入正式用户预设持久化库或新增备份格式。

## 4. 验证结果

`protection.test.mjs + client.test.mjs`：11/11通过。

真实浏览器 → 保护网关 → 服务端私有原生编排 → 原生模型出口 → 本地SSE模拟上游：15/15检查通过。

覆盖：公开资料字段白名单；原始预设触发及未知字段保留；有效思考设置关闭；六类覆盖攻击400；错误CSRF403；六类私有路由404；页面无法跨源连接内部原生端口；可见正文及done返回；私有描述/世界书真实参与；玩家脚本在私有worker不运行；实际模型请求思考关闭；客户端已读取的接口结果/DOM/存储没有私有标记或思考字段；公共页面没有私有TavernHelper对象；无未捕获页面异常。

报告仅保存布尔值和拒绝路由，不保存随机私有标记、完整编排、凭据或CSRF令牌。浏览器访问拒绝路由是故意的负面测试，不是把这些403/404当运行故障。

## 5. 复现

沿用versions.json的锁定上游与助手、已安装的Playwright和Chromium。设置PLAYWRIGHT_MODULE/CHROMIUM_PATH后：

```powershell
node experiments/native/protected-demo.mjs
```

8850为仅供服务端worker的原生回环实例，8851为本地受控验证页，8852为本地模拟模型。独立数据在.integration/native-protected，不使用原有8830–8833预览或8807/9000数据。

另一个终端：

```powershell
node --test experiments/native/protection.test.mjs experiments/native/client.test.mjs
node experiments/native/protected-browser-smoke.mjs
```

Node启动服务端无头浏览器（通过本地进程/管道控制），用户网页不运行或访问该对象。复现只使用随机合成标记、模拟模型与合成凭据；没有付费请求。Windows环境本次验证，不代表Linux服务器依赖/资源负载已验收。

## 6. 必须保留的边界

- 这是真正接通的新保护路径，但未把学院所有页面/旧API切到它。原生默认路径仍保留历史失败报告，不把两条路径混为一谈。
- 私有worker禁止玩家任意脚本。玩家端的酒馆助手安全桥接能力还需逐项接入，依赖完整私有卡/父DOM/Key的脚本不可能无限兼容；当前保护页面不暴露助手对象。这一取舍是明确权限边界，不是已经实现完整客户端助手管理器。
- 公网部署时必须保证内部原生端口不对外开放，代理仅转发明确白名单；本次全是回环本地实验。拥有服务器本机文件/进程权限的管理员不是可由网页保护阻止的对象。
- 目前是单个固定世界的串行compiler实例，不是生产多用户worker池。正式接入前仍须完成账号隔离、资源/超时/取消、异常恢复、并发与配置/存档持久化验证。取消请求会在编排后复核并阻止继续模型调用，但不声称已即时终止任意正在执行的浏览器编排。
- 未改业务存档schema；正式账号、正文全流程、终端等迁移仍按后续步骤推进。四项已有终端缺陷不在本轮修复范围。

## 2026-10-28 独立验收补修

修复13bcf8d的三项遗漏：每次生成先捕获有效预设快照，编排与模型出口使用同一份温度/输出上限；按identifier同步所有prompt_order中的启停值并保留其他字段；仅finish_reason=stop发送done，length/content_filter/无结束原因EOF保留已发正文并发送GENERATION_INCOMPLETE，不自动重试。其他流解析/网络异常仍发送错误，不发送done。

新增gateway-review.test.mjs经过真实HTTP网关及真实completionChunks验证在途编排期间设置变更不影响原请求，下一请求使用新设置；四种结束情况共5次生成只调用上游5次。与原策略/传输测试共12项通过。保护浏览器检查扩至17项：真实原生编排条目出现记录[true,false,true]，实际模拟上游三次均temperature=0.2/max_tokens=2048；思考关闭及私有资料保护检查仍通过。模型仍为本地模拟源，不是计费模型或生产完整迁移。
