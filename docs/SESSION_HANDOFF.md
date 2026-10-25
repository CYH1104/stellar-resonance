# 跨会话工作交接

> **2026-10-25 终端复核兼容性修复：**`terminalFollowupPlan` 统一继承原请求中的角色状态，为后续检查保留自定义联系人及动态 NPC；国王游戏 `react` 的服务器复核改用该入口，避免角色回复已生成却因复核丢失角色资料而报 `INVALID_TERMINAL_REQUEST`。保留原有 ID 和结果校验，不新增联系人、不改抽签、不绕过复核。新测试覆盖多个自定义角色与内置角色混合参与、邀请/聊天/出令/回应/互动后的角色解析、实际 HTTP 回应到复核及复核拒绝路径。验证：完整后端 373 通过、4 跳过；相关前端 3 通过。后续新增终端二次校验应复用该入口，不手工重建并丢弃原角色状态；线上版本和健康状态以实际部署结果为准。

> **最新交接 2026-10-19：**本轮完成逐轮记忆（旧设置迁移、失败队列隔离、最近 12 轮原文独立保留）及八项界面/状态/小剧场修复。先读 [逐轮记忆交接](PER_ROUND_MEMORY_HANDOFF_20261019.md) 和 [八项修复说明](BUGFIX_HANDOFF_20261019.md)，再看下文历史记录。使用共享 main，公网部署另行执行。

> 2026-10-18 修复补充：NPC 好感度 -100～200、负好感淡红关系线、MVU 整块校验、主副 API 路由及状态结果提示已完成。208 项服务端测试、251 项前端/领域测试、生产构建与 18 项浏览器检查通过。详见 `docs/AFFINITY_RULES.md`、`docs/STATE_UPDATE_RELIABILITY.md`。下文旧提交号为修复前基准，交接时仍须核对远程 main。

更新时间：2026-10-17。先阅读本文，再检查实际文件与远程 main；本文的提交号是交接时的基准，不代表远程以后不会更新。

## 项目位置与版本

- 本机项目目录：`D:\QQ\QQ文件\星穹学院终端`
- 本文位置：`D:\QQ\QQ文件\星穹学院终端\docs\SESSION_HANDOFF.md`
- 仓库：`https://github.com/CYH1104/stellar-resonance`
- 双方共享分支：`main`
- 最近已推送的功能提交：`e23b0a3ba5b38d00bb02dbe17534c364c384ea2e`
- 提交链接：<https://github.com/CYH1104/stellar-resonance/commit/e23b0a3ba5b38d00bb02dbe17534c364c384ea2e>
- 本交接文档是在该功能提交之后新增的本地文件，尚未随该提交上传。
- 服务器目录：`/home/ubuntu/stellar-resonance`
- 公网应用：`http://43.138.251.91:8807/terminal`
- 受保护管理页：`http://43.138.251.91:8807/editor/`
- 8808 是本机私有编辑服务，监听回环地址，不能以公网访问是否成功判断其状态。

## 双方协作约定

以 `docs/SHARED_WORKFLOW.md` 为正式协作说明。用户明确要求双方以共享 main 的最新完整代码继续开发，今后不做反复的旧版本融合，不按特殊版本号或分支时间挑版本。

开始新工作前确认伙伴是否已经更新 main。若更新，先备份当前尚未交付的文件，再按既定流程覆盖到最新代码；不要把本目录旧快照直接上传盖掉伙伴的新改动。正常推送，不强制覆盖远程历史。覆盖更新文件不等于删除历史提交，旧 Git 提交仍可用于回退。

不要自动部署或登录服务器。本轮及此前的交付方式是：本机完成、检查并推送，用户在服务器终端运行更新命令。

## 最近完成的功能

### 随机事件与开场白

最近提交已实现：

- 随机事件由本地脚本按设置概率判定；未命中不发送事件生成指令。
- 命中后自动投骰并继续本轮，不再要求先接受候选。
- 跟随主 API 时随正文一次生成，不单独请求事件候选；明确指定独立事件接口时，先生成事件，再自动衔接正文。
- 上方事件卡片显示当前回复的实际 `diceEvent.description`，缺失有效元数据时退回本轮事件摘要，不显示通用候选占位说明。
- 重试、重演保留已确定的事件类别与骰点；续写和仅补状态不要求重复骰子事件。
- 旧存档的待确认事件可以继续生成；准备失败可以重试或跳过。
- 管理编辑页新增“初始开场白”，停止输入约 650 毫秒后自动保存，也可立即保存。
- 多行和空行保留，服务器无需重启；新建存档读取新开场，已有存档保留旧开场。
- 旧数据没有开场字段时沿用原值，旧客户端保存时也不会清空已有开场。

详见 `docs/EVENTS_AND_OPENING.md`。

### 需要保持的调用规则

用户对额外模型调用非常敏感，不能为补格式、快捷回复或小剧场擅自增加调用。

- 全部跟随主 API 时，一次主调用同时输出正文、启用的小剧场/论坛/群聊、快捷回复和 MVU 状态。
- 明确设置状态副 API 时，主 API 负责正文及侧内容，状态副 API 单独判断 MVU 变化；状态格式规则按实际路由发送。
- 正常前端请求使用 `singleStateCall:true`，不能失败后自动循环付费修复；保留正文与有效字段，支持用户手动补全。
- 向量记忆使用独立 embedding 调用。
- 整理记忆只在累计轮数达到阈值时批量调用，不是每轮都整理；原始轮次先持久化。
- 关闭状态栏、随机事件或某个小剧场时，省略对应功能提示词和专属内容，不额外拼一条“该功能关闭”的规则。
- 不改变正常剧情历史、记忆检索、记忆整理的既有机制。

### 界面与存档约束

- 保持学院当前米白/深色、衬线文字、细边框风格。
- 状态、在场角色等是可折叠卡片，内部滚动；栏宽调整挤压相邻区域，不让内容框任意拖动乱飞。
- 群聊小手机仅存在于剧情对话页，可以拖动；收起为透明背景 SVG 图标，展开/收起保持位置。
- 输入框空白默认一行，输入多行自适应高度。
- 消息三个点菜单点击外部或 Esc 关闭；多稿切换用箭头，不恢复“第一稿/第二稿”菜单。
- 快捷回复点击填入输入框，可叠加选择，不直接调用模型。
- 首页对话入口进入当前存档；刷新仍有开屏动画。
- 浏览器存档保留完整数据；只渲染最近十楼/论坛分页是隐藏与减少渲染，绝不是删除旧记录。
- 角色卡片、地图和地点仅展示，不充当 AI 世界书；隐藏世界书才提供相应设定。

## 提示词与推理内容的边界

- 内部默认提示词已改为精简英文，包含状态格式示例，要求沉浸式中文角色扮演；不翻译用户世界书或预设原文。
- 已支持一批 SillyTavern 宏、预设消息排序与注入位置；并非完整酒馆插件运行时。范围见 `docs/INTERNAL_MACROS.md`、`docs/PRESET_COMPATIBILITY.md`。
- 管理编辑页可以编辑内部规则并查看组装顺序、程序占位符。用户自己控制的预设/世界书不在该页代改。
- 作者曾经保存的自定义内部规则不会因代码默认值更新而自动覆盖；需要时在编辑页逐项恢复默认。
- 开发者诊断展示实际启用/过滤的预设、宏展开、消息顺序、采样参数、输出检查，帮助判断预设有没有发出，不代表模型一定遵守。
- 开发者邮箱白名单：`1683264627@qq.com`、`2889463835@qq.com`、`237474810@qq.com`；权限由服务端登录身份判定，不能只靠前端隐藏。
- 模型接口显式返回的推理字段、思考标签、隐藏注释由过滤器隐藏。不能保证或声称接口没有返回的内部思考必然存在，不额外请求模型生成私有思维链。
- 角色 `innerThought`、精神体 `spiritThought` 是剧情状态，不应被当作模型推理一起删除。
- 不把服务密钥、私有世界书、账号数据库或推理原文放入普通用户响应、开发者面板、公开文件或交接文档。

## 代码入口

| 文件 | 作用 |
| --- | --- |
| `src/app/useWorkspace.ts` | 会话生成、路由、随机事件、持久化与记忆调度 |
| `src/components/StoryView.vue` | 正文、事件卡片、输入框和消息操作 |
| `src/components/ApiSettings.vue` | 主副接口及功能配置 |
| `src/domain/randomEvents.ts`、`dice.ts` | 本地概率、事件状态和骰点校验 |
| `server/app.mjs` | HTTP/SSE、身份权限、实时编辑数据、生成与新存档接口 |
| `server/ai.mjs`、`story-stream.mjs` | 提示词组装、模型流、格式解析与兼容处理 |
| `server/state-protocol.mjs`、`internal-prompt-defaults.mjs` | 输出协议、状态示例与默认内部规则 |
| `server/editor-store.mjs` | 编辑数据验证、迁移、版本冲突和原子保存 |
| `server/editor-ui/editor.js`、`editor.html` | 编辑页与自动保存，包括开场白 |
| `server/tavern-macro-engine.mjs`、`presets.mjs` | 酒馆宏与预设组装 |
| `server/preset-diagnostics.mjs`、`developer-mode.mjs` | 服务端授权诊断 |
| `src/domain/reasoning.ts` | 显式推理标签过滤及模型数据清理 |
| `scripts/update-server.sh`、`restart-server.sh` | 服务器覆盖更新、备份、构建、重启与健康检查 |

服务器编辑数据在 `server/private/editor-data.json`，保留上一份 `editor-data.previous.json`。这些是私有运行数据，不提交仓库。管理页 `EDITOR_ACCESS_REQUIRED` 表示管理身份失效或缺失，不能通过取消鉴权来修复。

## 本机环境与验证

Shell 为 PowerShell。本会话可用 Node 路径：`C:\Users\cold paper\.node\node.exe`。项目要求 Node >= 24.12.0；服务器曾因 Node 22 更新失败，现已安装 Node 24。

本轮通过：TypeScript、245 项 Vitest、203 项 Node 测试、构建、15 项既有浏览器检查，以及包含事件卡片与开场自动保存的 19 项浏览器检查。测试只使用本地模拟接口，不依赖付费模型调用。

标准命令：

```powershell
pnpm check
pnpm test
pnpm test:server
pnpm build
```

如果 pnpm 不在 PATH，可使用上述 Node 执行 `node_modules/vue-tsc/bin/vue-tsc.js --noEmit`、`node_modules/vitest/vitest.mjs run`、`--test tests/*.test.mjs` 等。Windows 沙箱可能对 realpath、本地端口或浏览器测试报 EPERM；先确认环境权限，不直接认定为业务失败。

`.integration` 是本地临时验证目录，不上传。现有辅助文件：

- `validate-state-routing.mjs`：类型检查、完整测试、同步终端、构建、既有浏览器检查。
- `events-opening-browser.mjs`：实际事件卡片、编辑开场自动保存/刷新/实时读取检查。
- `events-final.log`、`events-browser.log`：最近验证记录。
- 浏览器脚本依赖本地 Edge CDP 9224 与隔离测试资料；新会话先检查是否仍存在，不直接假定可用。

## 当前本机的推送方式

本目录在此前会话中没有可用 `.git` 工作树或 Git 可执行程序，采用 `.integration/publish-current.mjs` 经 GitHub REST 正常推进 main。新会话先检查环境，不盲目运行旧发布脚本。

脚本的 `expected` 和 `expectedTarget` 是上次发布前的基准，发布成功后不会自动更新；重用前必须查询远程 main，并核对本地与最新远程的差异。发布流程先生成 `publish-reviewed.json` 审查清单，再使用 `--publish`；脚本拒绝远程移动和强制推送，不能绕过这些检查。最近上传结果在 `.integration/push-result.json`。

脚本通过项目目录外的本地凭据文件读取令牌；不要打印、复制或提交凭据，不把凭据写入命令、文档或聊天记录。不要把 `.integration`、`dist`、`node_modules`、`server/private`、`server/.local`、`server.config.json` 等运行文件批量上传。

## 用户在服务器运行的更新命令

当前终端已使用 Node 24 时：

```bash
cd /home/ubuntu/stellar-resonance &&
bash scripts/update-server.sh http://43.138.251.91:8807
```

新终端若需要加载现有 nvm：

```bash
export NVM_DIR="$HOME/.nvm" &&
. "$NVM_DIR/nvm.sh" &&
nvm use 24 &&
cd /home/ubuntu/stellar-resonance &&
bash scripts/update-server.sh http://43.138.251.91:8807
```

更新脚本会备份、取 main、覆盖、安装、构建、重启、检查服务。GitHub 曾出现 TLS 中断和连接超时；项目 Git 配置使用 HTTP/1.1、单并发，不关闭 TLS 证书校验。详细网络和恢复步骤见 `docs/SHARED_WORKFLOW.md`。

## 新会话接手顺序

1. 阅读本文和 `docs/SHARED_WORKFLOW.md`，核对本地改动、远程 main 与伙伴新提交。
2. 当前可靠性修复和测试已完成。以远程 main 的实际提交为准；先阅读新增的 STATE_UPDATE_RELIABILITY.md，不重新实施全部历史需求。
3. 如果遇到状态或小剧场缺失，先检查原始返回、功能开关、预设诊断和调用路由，保留正文与有效数据，不加无限修复调用。
4. 修改后运行与变更有关的检查，审查上传清单，正常推送 main，再给用户服务器更新命令。

可复制给新会话：

> 请接手 `D:\QQ\QQ文件\星穹学院终端`，先读取 `docs\SESSION_HANDOFF.md` 和 `docs\SHARED_WORKFLOW.md`。最近已推送功能提交为 `e23b0a3ba5b38d00bb02dbe17534c364c384ea2e`，后续先核对远程 main。沿用当前学院风格、单次主 API 调用规则、浏览器存档和服务器覆盖更新流程，不擅自融合旧版本或删除隐藏楼层。然后按照我的新需求继续工作。
