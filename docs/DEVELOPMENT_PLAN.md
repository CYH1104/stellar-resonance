# 开发计划

共 45 项：P0 26 项、P1 16 项、P2 3 项。保留原聊天清单的任务范围；验收细节、阶段细分与依赖为本次整理建议。SR 编号是稳定计划编号，下表与详细任务已关联本仓库的 GitHub Issues。

## MVP 建议顺序

1. Monorepo、共享契约、客户端、开发 Worker 和环境模板。
2. 数据结构、变量 Schema、身份认证、作者库与玩家库。
3. 私有服务绑定、作者导入、可见性与变量持久化。
4. Key、上游白名单、服务端 Prompt 和 SSE。
5. 基础世界书触发、聊天 UI、设置、玩家人设与存档。
6. 限流与监控、关键测试、玩家隔离、Windows 打包内测。

Alpha 完善群像记忆、关系状态、剧情事件、正则与预设。Beta 扩展地图背包、负载和 Android。阶段包含功能迭代：如 MVP 的测试先覆盖已实现引擎，正则上线时补充正则回归。

## 协作流程

使用模块标签、P0/P1/P2 优先级及 phase:MVP/phase:Alpha/phase:Beta 标签。看板使用 Todo、In Progress、Testing、Done。依赖以任务正文中的稳定 ID 与 Issue 链接表达；不要用前序任务状态冒充依赖完成。

开始工作时认领并移到 In Progress；PR 关联任务；实现后进入 Testing；达到验收才 Done 并关闭。分支保护配置是否可用由套餐与实际仓库验证，本次建立清单不直接启用未完成的必需检查。

## 任务总表

| 计划 ID | 任务 | 模块 | 优先级 | 阶段 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| [SR-01 · #1](https://github.com/CYH1104/stellar-resonance/issues/1) | [项目基础] 初始化 Vue 3 + TypeScript + Tauri 2 客户端 | infra | P0 | MVP | 无 |
| [SR-02 · #2](https://github.com/CYH1104/stellar-resonance/issues/2) | [项目基础] 建立 Monorepo 目录与共享类型包 | infra | P0 | MVP | 无 |
| [SR-03 · #3](https://github.com/CYH1104/stellar-resonance/issues/3) | [项目基础] 配置 GitHub 分支保护与 PR 审核 | infra | P0 | MVP | 无 |
| [SR-04 · #4](https://github.com/CYH1104/stellar-resonance/issues/4) | [后端] 创建 Cloudflare Workers 与 D1 开发环境 | backend | P0 | MVP | SR-02 |
| [SR-05 · #5](https://github.com/CYH1104/stellar-resonance/issues/5) | [安全] 配置环境变量、密钥管理和本地开发脚本 | security | P0 | MVP | SR-02, SR-04 |
| [SR-06 · #6](https://github.com/CYH1104/stellar-resonance/issues/6) | [项目基础] 建立 CI 自动检查和构建流程 | infra | P1 | MVP | SR-01, SR-02, SR-05 |
| [SR-07 · #7](https://github.com/CYH1104/stellar-resonance/issues/7) | [前端] 设计游戏主界面和响应式布局 | frontend | P0 | MVP | SR-01 |
| [SR-08 · #12](https://github.com/CYH1104/stellar-resonance/issues/12) | [前端] 实现聊天消息、输入框和流式输出 | frontend | P0 | MVP | SR-07, SR-15, SR-38 |
| [SR-09 · #18](https://github.com/CYH1104/stellar-resonance/issues/18) | [前端] 实现角色立绘、头像与角色切换 | frontend | P1 | Alpha | SR-07, SR-27, SR-29 |
| [SR-10 · #21](https://github.com/CYH1104/stellar-resonance/issues/21) | [前端] 开发角色资料与关系状态面板 | frontend | P1 | Alpha | SR-07, SR-29, SR-34 |
| [SR-11 · #22](https://github.com/CYH1104/stellar-resonance/issues/22) | [前端] 开发玩家 User 人设编辑器 | frontend | P1 | MVP | SR-07, SR-17 |
| [SR-12 · #23](https://github.com/CYH1104/stellar-resonance/issues/23) | [前端] 开发 API 设置、模型选择与预设管理界面 | frontend | P0 | MVP | SR-07, SR-36, SR-37, SR-38 |
| [SR-13 · #25](https://github.com/CYH1104/stellar-resonance/issues/25) | [前端] 实现地图、背包与事件记录面板 | frontend | P2 | Beta | SR-10, SR-35 |
| [SR-14 · #27](https://github.com/CYH1104/stellar-resonance/issues/27) | [前端] 实现本地设置、主题与存档管理界面 | frontend | P1 | Alpha | SR-07, SR-19, SR-33 |
| [SR-15 · #8](https://github.com/CYH1104/stellar-resonance/issues/8) | [后端] 开发 Gateway 请求入口与玩家身份验证 | backend | P0 | MVP | SR-04, SR-05, SR-02 |
| [SR-16 · #14](https://github.com/CYH1104/stellar-resonance/issues/14) | [后端] 建立作者私有 D1 数据库及迁移脚本 | backend | P0 | MVP | SR-04, SR-27 |
| [SR-17 · #16](https://github.com/CYH1104/stellar-resonance/issues/16) | [后端] 建立玩家状态 D1 数据库及访问隔离 | backend | P0 | MVP | SR-04, SR-15, SR-32 |
| [SR-18 · #28](https://github.com/CYH1104/stellar-resonance/issues/28) | [后端] 实现私有 Worker 间 Service Bindings 通信 | backend | P0 | MVP | SR-04, SR-15, SR-16 |
| [SR-19 · #26](https://github.com/CYH1104/stellar-resonance/issues/26) | [后端] 开发游戏会话、聊天历史与存档接口 | backend | P1 | MVP | SR-17, SR-33 |
| [SR-20 · #29](https://github.com/CYH1104/stellar-resonance/issues/29) | [后端] 实现请求限流、异常处理与运行监控 | backend | P1 | MVP | SR-15, SR-38 |
| [SR-21 · #30](https://github.com/CYH1104/stellar-resonance/issues/30) | [酒馆兼容] 实现角色卡 V2/V3 常用字段解析与导入 | st-compat | P0 | MVP | SR-02, SR-27 |
| [SR-22 · #31](https://github.com/CYH1104/stellar-resonance/issues/31) | [酒馆兼容] 实现世界书条目格式解析和兼容适配 | st-compat | P0 | MVP | SR-21, SR-27 |
| [SR-23 · #33](https://github.com/CYH1104/stellar-resonance/issues/33) | [酒馆兼容] 实现常用预设字段、顺序与注入位置 | st-compat | P1 | Alpha | SR-22, SR-39 |
| [SR-24 · #34](https://github.com/CYH1104/stellar-resonance/issues/34) | [酒馆兼容] 实现关键词触发、扫描深度、优先级与预算规则 | st-compat | P1 | MVP | SR-22, SR-29, SR-39 |
| [SR-25 · #35](https://github.com/CYH1104/stellar-resonance/issues/35) | [酒馆兼容] 实现常用输入输出正则与安全执行机制 | st-compat | P1 | Alpha | SR-22, SR-20 |
| [SR-26 · #36](https://github.com/CYH1104/stellar-resonance/issues/36) | [酒馆兼容] 评估 MVU、酒馆助手脚本兼容范围 | st-compat | P2 | Beta | SR-23, SR-25, SR-33 |
| [SR-27 · #13](https://github.com/CYH1104/stellar-resonance/issues/13) | [世界书] 设计星际 ABO 世界观和角色数据结构 | worldbook | P0 | MVP | SR-02 |
| [SR-28 · #37](https://github.com/CYH1104/stellar-resonance/issues/37) | [世界书] 实现作者专用世界书导入与版本管理 | worldbook | P0 | MVP | SR-16, SR-22, SR-27 |
| [SR-29 · #17](https://github.com/CYH1104/stellar-resonance/issues/17) | [世界书] 实现公开、已解锁、隐藏设定分级 | worldbook | P0 | MVP | SR-16, SR-17, SR-27 |
| [SR-30 · #38](https://github.com/CYH1104/stellar-resonance/issues/38) | [世界书] 实现按剧情状态检索与动态注入世界书 | worldbook | P0 | MVP | SR-24, SR-29, SR-33, SR-39 |
| [SR-31 · #39](https://github.com/CYH1104/stellar-resonance/issues/39) | [世界书] 实现群像 NPC 独立记忆与剧情事件触发 | worldbook | P1 | Alpha | SR-19, SR-30, SR-35 |
| [SR-32 · #15](https://github.com/CYH1104/stellar-resonance/issues/15) | [变量] 设计变量 Schema、默认值与数据类型 | variables | P0 | MVP | SR-02, SR-27 |
| [SR-33 · #19](https://github.com/CYH1104/stellar-resonance/issues/19) | [变量] 实现变量读取、更新、校验和持久化 | variables | P0 | MVP | SR-17, SR-32 |
| [SR-34 · #20](https://github.com/CYH1104/stellar-resonance/issues/20) | [变量] 实现 ABO 专属状态及角色关系变量 | variables | P1 | Alpha | SR-27, SR-32, SR-33 |
| [SR-35 · #24](https://github.com/CYH1104/stellar-resonance/issues/24) | [变量] 实现服务端事件判定和剧情解锁规则 | variables | P1 | Alpha | SR-29, SR-33, SR-34 |
| [SR-36 · #9](https://github.com/CYH1104/stellar-resonance/issues/9) | [API] 实现玩家自填 API Key 的安全传递与存储 | api | P0 | MVP | SR-05, SR-15 |
| [SR-37 · #10](https://github.com/CYH1104/stellar-resonance/issues/10) | [API] 实现官方 API 与指定中转站白名单 | api | P0 | MVP | SR-15, SR-36 |
| [SR-38 · #11](https://github.com/CYH1104/stellar-resonance/issues/11) | [API] 实现 OpenAI 兼容请求、模型参数与 SSE 流式响应 | api | P0 | MVP | SR-15, SR-36, SR-37 |
| [SR-39 · #32](https://github.com/CYH1104/stellar-resonance/issues/32) | [API] 实现服务端 Prompt 拼装与 Token 预算管理 | api | P0 | MVP | SR-29, SR-32 |
| [SR-40 · #40](https://github.com/CYH1104/stellar-resonance/issues/40) | [安全] 实现提示词注入、越权读取与 SSRF 防护 | security | P0 | MVP | SR-15, SR-18, SR-29, SR-37, SR-39 |
| [SR-41 · #41](https://github.com/CYH1104/stellar-resonance/issues/41) | [测试] 编写世界书触发、变量、正则的单元测试 | testing | P1 | MVP | SR-24, SR-25, SR-33, SR-06 |
| [SR-42 · #42](https://github.com/CYH1104/stellar-resonance/issues/42) | [测试] 测试 10～50 人负载与 Cloudflare 免费额度 | testing | P1 | Beta | SR-20, SR-38, SR-41 |
| [SR-43 · #43](https://github.com/CYH1104/stellar-resonance/issues/43) | [测试] 测试不同玩家之间的存档和权限隔离 | testing | P0 | MVP | SR-17, SR-19, SR-29, SR-33, SR-40 |
| [SR-44 · #44](https://github.com/CYH1104/stellar-resonance/issues/44) | [测试] 构建 Windows EXE 并完成朋友内测 | testing | P1 | MVP | SR-01, SR-08, SR-12, SR-19, SR-43, SR-06 |
| [SR-45 · #45](https://github.com/CYH1104/stellar-resonance/issues/45) | [测试] 适配 Android APK 与移动端布局 | testing | P2 | Beta | SR-44, SR-14 |

## 详细验收

### SR-01 [#1 [项目基础] 初始化 Vue 3 + TypeScript + Tauri 2 客户端](https://github.com/CYH1104/stellar-resonance/issues/1)

建立 Windows 客户端，配置类型检查与开发命令。

- [ ] 干净环境按 README 可启动
- [ ] 窗口显示基础界面
- [ ] 客户端产物不含作者私有设定

依赖：无。

### SR-02 [#2 [项目基础] 建立 Monorepo 目录与共享类型包](https://github.com/CYH1104/stellar-resonance/issues/2)

划分 apps、workers、packages，建立请求响应及变量类型。

- [ ] 客户端与 Worker 复用契约
- [ ] 包依赖无循环
- [ ] 根目录有统一检查命令

依赖：无。

### SR-03 [#3 [项目基础] 配置 GitHub 分支保护与 PR 审核](https://github.com/CYH1104/stellar-resonance/issues/3)

确认私有仓库套餐支持后，设置 main 的 PR 合并与检查规则。

- [ ] 记录可用规则及限制
- [ ] 一次示例 PR 验证流程
- [ ] 小团队能正常合并而不被不存在的检查阻断

依赖：无。

### SR-04 [#4 [后端] 创建 Cloudflare Workers 与 D1 开发环境](https://github.com/CYH1104/stellar-resonance/issues/4)

创建独立开发配置，串通本地 Worker 和 D1。

- [ ] 本地能运行健康检查及示例查询
- [ ] 开发生产数据隔离
- [ ] 不提交真实账号凭据

依赖：SR-02。

### SR-05 [#5 [安全] 配置环境变量、密钥管理和本地开发脚本](https://github.com/CYH1104/stellar-resonance/issues/5)

提供空值环境模板、忽略规则及密钥注入说明。

- [ ] 示例无真实密钥
- [ ] 本地配置不进入 Git
- [ ] CI 和应用日志不输出凭据

依赖：SR-02, SR-04。

### SR-06 [#6 [项目基础] 建立 CI 自动检查和构建流程](https://github.com/CYH1104/stellar-resonance/issues/6)

配置类型、格式、关键测试和 Windows 构建检查。

- [ ] PR 触发检查
- [ ] 类型错误会阻止通过
- [ ] 产物不含私有设定与调试秘密

依赖：SR-01, SR-02, SR-05。

### SR-07 [#7 [前端] 设计游戏主界面和响应式布局](https://github.com/CYH1104/stellar-resonance/issues/7)

设计聊天区、角色区、状态入口和设置入口。

- [ ] Windows 常见窗口尺寸可用
- [ ] 长中文文本不溢出
- [ ] 基础键盘操作可达

依赖：SR-01。

### SR-08 [#12 [前端] 实现聊天消息、输入框和流式输出](https://github.com/CYH1104/stellar-resonance/issues/12)

实现发送、停止、重试与角色消息，接入 SSE。

- [ ] 分片回复逐步显示
- [ ] 取消和断线不产生重复消息
- [ ] 错误可重试
- [ ] 完整提示词不回传前端

依赖：SR-07, SR-15, SR-38。

### SR-09 [#18 [前端] 实现角色立绘、头像与角色切换](https://github.com/CYH1104/stellar-resonance/issues/18)

建立公开角色资产与发言人显示、切换行为。

- [ ] 资产加载失败有占位
- [ ] 切换后发言身份正确
- [ ] 仅展示已公开或已解锁资料

依赖：SR-07, SR-27, SR-29。

### SR-10 [#21 [前端] 开发角色资料与关系状态面板](https://github.com/CYH1104/stellar-resonance/issues/21)

展示玩家可见角色档案、关系和状态。

- [ ] 更新变量后面板同步
- [ ] 隐藏字段不下发
- [ ] 多角色关系不混用

依赖：SR-07, SR-29, SR-34。

### SR-11 [#22 [前端] 开发玩家 User 人设编辑器](https://github.com/CYH1104/stellar-resonance/issues/22)

编辑玩家名称、描述和可用字段，并保存到玩家存档。

- [ ] 长度与格式校验有效
- [ ] 重启后保留
- [ ] 人设不能覆盖系统权限与剧情规则

依赖：SR-07, SR-17。

### SR-12 [#23 [前端] 开发 API 设置、模型选择与预设管理界面](https://github.com/CYH1104/stellar-resonance/issues/23)

设置受支持供应商、模型、玩家 Key 与可用参数。

- [ ] Key 遮罩并可清除
- [ ] 无效参数有提示
- [ ] 供应商只可选择服务器认可的入口

依赖：SR-07, SR-36, SR-37, SR-38。

### SR-13 [#25 [前端] 实现地图、背包与事件记录面板](https://github.com/CYH1104/stellar-resonance/issues/25)

展示已解锁地图、物品和玩家剧情事件。

- [ ] 未解锁信息不返回
- [ ] 背包改动由服务端校验
- [ ] 事件记录可追溯

依赖：SR-10, SR-35。

### SR-14 [#27 [前端] 实现本地设置、主题与存档管理界面](https://github.com/CYH1104/stellar-resonance/issues/27)

管理主题、设置、存档切换和允许的导入导出。

- [ ] 设置重启后恢复
- [ ] 损坏存档有明确提示
- [ ] 导出无 Key 和作者隐藏资料

依赖：SR-07, SR-19, SR-33。

### SR-15 [#8 [后端] 开发 Gateway 请求入口与玩家身份验证](https://github.com/CYH1104/stellar-resonance/issues/8)

建立公开网关、身份检查与版本化 API 契约。

- [ ] 未认证请求被拒绝
- [ ] 身份从已验证会话派生
- [ ] 修改请求中的 playerId 不会越权

依赖：SR-04, SR-05, SR-02。

### SR-16 [#14 [后端] 建立作者私有 D1 数据库及迁移脚本](https://github.com/CYH1104/stellar-resonance/issues/14)

设计作者设定库、私有规则与版本记录。

- [ ] 可重复迁移开发库
- [ ] 只有私有服务绑定
- [ ] 公开 API 无全量导出入口
- [ ] 测试采用虚构数据

依赖：SR-04, SR-27。

### SR-17 [#16 [后端] 建立玩家状态 D1 数据库及访问隔离](https://github.com/CYH1104/stellar-resonance/issues/16)

保存玩家、会话、变量和存档，并对全部查询约束所有者。

- [ ] 读写删除都校验玩家归属
- [ ] 篡改资源 ID 无法串档
- [ ] 并发更新有版本冲突处理

依赖：SR-04, SR-15, SR-32。

### SR-18 [#28 [后端] 实现私有 Worker 间 Service Bindings 通信](https://github.com/CYH1104/stellar-resonance/issues/28)

让 Gateway 通过绑定调用私有剧情服务，取消私有服务公开路由。

- [ ] 私有服务未配置公共域名、routes 或 workers.dev 入口
- [ ] 本地绑定可调用
- [ ] 只返回必要可见数据

依赖：SR-04, SR-15, SR-16。

### SR-19 [#26 [后端] 开发游戏会话、聊天历史与存档接口](https://github.com/CYH1104/stellar-resonance/issues/26)

提供会话创建、消息分页、恢复与存档操作。

- [ ] 断线后能恢复已完成消息
- [ ] 重复提交不重复落库
- [ ] 每个接口验证所有者

依赖：SR-17, SR-33。

### SR-20 [#29 [后端] 实现请求限流、异常处理与运行监控](https://github.com/CYH1104/stellar-resonance/issues/29)

约束请求频率、并发、超时与结构化脱敏日志。

- [ ] 模拟过量请求可拒绝
- [ ] 上游失败返回稳定错误码
- [ ] 日志不含 Key、完整 Prompt 或隐藏设定

依赖：SR-15, SR-38。

### SR-21 [#30 [酒馆兼容] 实现角色卡 V2/V3 常用字段解析与导入](https://github.com/CYH1104/stellar-resonance/issues/30)

导入角色卡 JSON 与 PNG 元数据，区分作者导入和玩家导入。

- [ ] 固定虚构 V2/V3 样例可导入
- [ ] 损坏和不支持字段有报告
- [ ] 导入内容不会执行脚本或覆盖私有角色

依赖：SR-02, SR-27。

### SR-22 [#31 [酒馆兼容] 实现世界书条目格式解析和兼容适配](https://github.com/CYH1104/stellar-resonance/issues/31)

规范化世界书 ID、内容、关键词、启用状态和注入属性。

- [ ] 样例字段无静默丢失
- [ ] 未知字段有兼容报告
- [ ] 作者完整条目只存服务端

依赖：SR-21, SR-27。

### SR-23 [#33 [酒馆兼容] 实现常用预设字段、顺序与注入位置](https://github.com/CYH1104/stellar-resonance/issues/33)

适配预设提示条目、角色占位符和允许的模型参数。

- [ ] 固定案例拼装顺序稳定
- [ ] 未知字段报告
- [ ] 玩家预设不能更改服务端秘密边界

依赖：SR-22, SR-39。

### SR-24 [#34 [酒馆兼容] 实现关键词触发、扫描深度、优先级与预算规则](https://github.com/CYH1104/stellar-resonance/issues/34)

实现最小世界书触发引擎并明确兼容规则。

- [ ] 关键词、常驻、扫描深度和优先级案例通过
- [ ] 预算溢出有确定裁剪
- [ ] 隐藏条目先过权限筛选

依赖：SR-22, SR-29, SR-39。

### SR-25 [#35 [酒馆兼容] 实现常用输入输出正则与安全执行机制](https://github.com/CYH1104/stellar-resonance/issues/35)

实现文本变换顺序、大小与耗时约束，限制执行能力。

- [ ] 输入输出样例通过
- [ ] 恶意正则不会无限阻塞
- [ ] 不使用 eval 或动态脚本
- [ ] 规则版本可追踪

依赖：SR-22, SR-20。

### SR-26 [#36 [酒馆兼容] 评估 MVU、酒馆助手脚本兼容范围](https://github.com/CYH1104/stellar-resonance/issues/36)

列出可映射变量协议和无法直接运行的插件行为。

- [ ] 形成支持矩阵
- [ ] 用样例证明支持项
- [ ] 任意用户脚本不进入可信运行环境

依赖：SR-23, SR-25, SR-33。

### SR-27 [#13 [世界书] 设计星际 ABO 世界观和角色数据结构](https://github.com/CYH1104/stellar-resonance/issues/13)

定义世界、群像角色、关系、事件及可见性结构。

- [ ] Schema 有版本
- [ ] 公开与隐藏字段可区分
- [ ] 仓库只包含虚构示例，不录入未提供的人设

依赖：SR-02。

### SR-28 [#37 [世界书] 实现作者专用世界书导入与版本管理](https://github.com/CYH1104/stellar-resonance/issues/37)

实现授权作者导入、校验、版本发布及回滚。

- [ ] 玩家身份不能调用作者入口
- [ ] 失败导入不污染当前版本
- [ ] 回滚保留审计记录

依赖：SR-16, SR-22, SR-27。

### SR-29 [#17 [世界书] 实现公开、已解锁、隐藏设定分级](https://github.com/CYH1104/stellar-resonance/issues/17)

按条目可见性和玩家进度决定可返回与可注入内容。

- [ ] 猜测 ID 不能读取隐藏条目
- [ ] 未达到条件的内容不注入
- [ ] 解锁记录按玩家隔离

依赖：SR-16, SR-17, SR-27。

### SR-30 [#38 [世界书] 实现按剧情状态检索与动态注入世界书](https://github.com/CYH1104/stellar-resonance/issues/38)

用服务端状态筛选条目，再按触发和预算拼装。

- [ ] 同输入不同状态可选择不同条目
- [ ] 不向客户端返回完整 Prompt
- [ ] 选择结果可用脱敏 ID 调试

依赖：SR-24, SR-29, SR-33, SR-39。

### SR-31 [#39 [世界书] 实现群像 NPC 独立记忆与剧情事件触发](https://github.com/CYH1104/stellar-resonance/issues/39)

定义角色记忆归属、摘要和可见范围，驱动群像事件。

- [ ] NPC 和玩家记忆不串用
- [ ] 摘要限制预算
- [ ] 相同事件不会重复解锁或发奖励

依赖：SR-19, SR-30, SR-35。

### SR-32 [#15 [变量] 设计变量 Schema、默认值与数据类型](https://github.com/CYH1104/stellar-resonance/issues/15)

设计玩家和角色命名空间、类型、范围、默认值与版本。

- [ ] Schema 校验通过
- [ ] 缺失值可初始化
- [ ] 非法类型和越界值拒绝
- [ ] 迁移策略有记录

依赖：SR-02, SR-27。

### SR-33 [#19 [变量] 实现变量读取、更新、校验和持久化](https://github.com/CYH1104/stellar-resonance/issues/19)

实现服务端变量操作、版本控制和原子状态更新。

- [ ] 刷新后变量保留
- [ ] 非法或未授权更新失败
- [ ] 并发写不静默覆盖
- [ ] 模型输出先校验

依赖：SR-17, SR-32。

### SR-34 [#20 [变量] 实现 ABO 专属状态及角色关系变量](https://github.com/CYH1104/stellar-resonance/issues/20)

依据作者确认的规则定义 ABO 状态及每角色关系字段。

- [ ] 规则与默认值获确认
- [ ] 状态有边界校验
- [ ] 玩家不能直接写受保护状态
- [ ] 多角色独立

依赖：SR-27, SR-32, SR-33。

### SR-35 [#24 [变量] 实现服务端事件判定和剧情解锁规则](https://github.com/CYH1104/stellar-resonance/issues/24)

在服务端执行条件、效果、解锁与幂等判定。

- [ ] 客户端不能提交自称已解锁的结果
- [ ] 重复事件不重复生效
- [ ] 事件与状态变更一致

依赖：SR-29, SR-33, SR-34。

### SR-36 [#9 [API] 实现玩家自填 API Key 的安全传递与存储](https://github.com/CYH1104/stellar-resonance/issues/9)

Key 经 TLS 使用，默认只保留当前会话；设计可选安全凭据存储。

- [ ] 请求与错误日志无 Key
- [ ] 网页不默认明文持久化
- [ ] 客户端清除有效
- [ ] 服务器不落库玩家 Key

依赖：SR-05, SR-15。

### SR-37 [#10 [API] 实现官方 API 与指定中转站白名单](https://github.com/CYH1104/stellar-resonance/issues/10)

由服务端配置 providerId 对应固定 HTTPS 目标和路径。

- [ ] 客户端不能任填 baseURL
- [ ] 禁止内网和非 HTTPS
- [ ] 禁止跳转至非白名单
- [ ] 供应商列表待作者确认

依赖：SR-15, SR-36。

### SR-38 [#11 [API] 实现 OpenAI 兼容请求、模型参数与 SSE 流式响应](https://github.com/CYH1104/stellar-resonance/issues/11)

适配允许的模型请求、参数校验与分片流转发。

- [ ] 分片和 Unicode 边界正确
- [ ] 取消能停止上游
- [ ] 错误与 429 可识别
- [ ] 上游事件不透传敏感内部信息

依赖：SR-15, SR-36, SR-37。

### SR-39 [#32 [API] 实现服务端 Prompt 拼装与 Token 预算管理](https://github.com/CYH1104/stellar-resonance/issues/32)

固定系统规则、当前允许设定、玩家人设、预设和历史的拼装边界。

- [ ] 顺序有固定样例
- [ ] 预算为回复预留空间
- [ ] 超限可解释
- [ ] 客户端和日志无完整私有 Prompt

依赖：SR-29, SR-32。

### SR-40 [#40 [安全] 实现提示词注入、越权读取与 SSRF 防护](https://github.com/CYH1104/stellar-resonance/issues/40)

对提取秘密、跨玩家访问及恶意上游目标建立分层防护。

- [ ] 未解锁秘密从输入上下文排除
- [ ] 越权与重定向样例被拒绝
- [ ] 记录模型仍可能透露已注入内容的残余风险

依赖：SR-15, SR-18, SR-29, SR-37, SR-39。

### SR-41 [#41 [测试] 编写世界书触发、变量、正则的单元测试](https://github.com/CYH1104/stellar-resonance/issues/41)

为领域引擎边界建立虚构 fixtures 和回归案例。

- [ ] 覆盖无匹配、预算边界、非法变量、并发和恶意正则
- [ ] CI 自动运行
- [ ] 测试不包含真实作者秘密

依赖：SR-24, SR-25, SR-33, SR-06。

### SR-42 [#42 [测试] 测试 10～50 人负载与 Cloudflare 免费额度](https://github.com/CYH1104/stellar-resonance/issues/42)

用 mock 模型模拟 10、25、50 个玩家，测 CPU、请求、D1 与流式连接。

- [ ] 出具用量和延迟报告
- [ ] 区分 CPU 与等待时间
- [ ] 标出瓶颈及阈值
- [ ] 真实付费请求需单独预算授权

依赖：SR-20, SR-38, SR-41。

### SR-43 [#43 [测试] 测试不同玩家之间的存档和权限隔离](https://github.com/CYH1104/stellar-resonance/issues/43)

为两名测试玩家验证会话、变量、记忆、解锁和存档的读写删除隔离。

- [ ] 篡改 ID 与身份失败
- [ ] 访问作者导入接口失败
- [ ] 日志与导出无其他玩家或秘密内容

依赖：SR-17, SR-19, SR-29, SR-33, SR-40。

### SR-44 [#44 [测试] 构建 Windows EXE 并完成朋友内测](https://github.com/CYH1104/stellar-resonance/issues/44)

打包 Windows 安装程序，整理 Key 设置、更新及内测步骤。

- [ ] 干净 Windows 能运行
- [ ] 填写 Key 可聊天并恢复进度
- [ ] 产物不含作者秘密
- [ ] 有问题反馈模板

依赖：SR-01, SR-08, SR-12, SR-19, SR-43, SR-06。

### SR-45 [#45 [测试] 适配 Android APK 与移动端布局](https://github.com/CYH1104/stellar-resonance/issues/45)

评估 Tauri Android 配置、软键盘、触控和安全凭据存储。

- [ ] 可安装 APK
- [ ] 软键盘不遮挡输入
- [ ] 触控与流式回复可用
- [ ] 移动包不包含作者私有设定

依赖：SR-44, SR-14。
