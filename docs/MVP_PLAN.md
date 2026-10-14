# 第一阶段：响应式网页 MVP

## 交付目标

受邀朋友在手机或电脑打开同一个 HTTPS 链接，登录后设置自己的 Key 和允许的模型，与少量测试角色流式聊天；刷新或重新登录可以恢复自己的聊天、变量与进度，Key 需要重新输入。作者完整资料和隐藏规则保留在服务端。

第一阶段先验证 2～5 人的小范围体验。10～50 人模拟负载、复杂群像、地图背包、高级插件与安装包在之后推进。MVP 不要求完成角色美术和全部正式剧情。

## 依赖顺序

### 1. 先搭建能打开的网页与开发环境

完成标准：电脑与手机能打开基础页面，本地 Worker 和示例 D1 可用，检查命令进入 CI。

- [#1 [项目基础] 初始化 Vue 3 + TypeScript + Vite 网页客户端](https://github.com/CYH1104/stellar-resonance/issues/1)
- [#2 [项目基础] 建立 Monorepo 目录与共享类型包](https://github.com/CYH1104/stellar-resonance/issues/2)
- [#3 [项目基础] 配置 GitHub 分支保护与 PR 审核](https://github.com/CYH1104/stellar-resonance/issues/3)
- [#4 [后端] 创建 Cloudflare Workers 与 D1 开发环境](https://github.com/CYH1104/stellar-resonance/issues/4)
- [#5 [安全] 配置环境变量、密钥管理和本地开发脚本](https://github.com/CYH1104/stellar-resonance/issues/5)
- [#6 [项目基础] 建立网页与 Worker 的 CI 检查和构建流程](https://github.com/CYH1104/stellar-resonance/issues/6)
- [#7 [前端] 设计手机与电脑浏览器的响应式游戏布局](https://github.com/CYH1104/stellar-resonance/issues/7)

### 2. 建立身份、私有资料和存档边界

完成标准：两名测试玩家有独立身份与状态；只有可信服务能读取作者资料；服务端变量可恢复。

- [#8 [后端] 开发 Gateway 请求入口与玩家身份验证](https://github.com/CYH1104/stellar-resonance/issues/8)
- [#14 [后端] 建立作者私有 D1 数据库及迁移脚本](https://github.com/CYH1104/stellar-resonance/issues/14)
- [#16 [后端] 建立玩家状态 D1 数据库及访问隔离](https://github.com/CYH1104/stellar-resonance/issues/16)
- [#28 [后端] 实现私有 Worker 间 Service Bindings 通信](https://github.com/CYH1104/stellar-resonance/issues/28)
- [#13 [世界书] 设计星际 ABO 世界观和角色数据结构](https://github.com/CYH1104/stellar-resonance/issues/13)
- [#15 [变量] 设计变量 Schema、默认值与数据类型](https://github.com/CYH1104/stellar-resonance/issues/15)
- [#19 [变量] 实现变量读取、更新、校验和持久化](https://github.com/CYH1104/stellar-resonance/issues/19)
- [#17 [世界书] 实现公开、已解锁、隐藏设定分级](https://github.com/CYH1104/stellar-resonance/issues/17)

### 3. 接通最小世界书与模型链路

完成标准：虚构测试角色和世界书可导入，按权限和关键词选择片段，通过白名单网关获得流式模型回复。

- [#30 [酒馆兼容] 实现角色卡 V2/V3 常用字段解析与导入](https://github.com/CYH1104/stellar-resonance/issues/30)
- [#31 [酒馆兼容] 实现世界书条目格式解析和兼容适配](https://github.com/CYH1104/stellar-resonance/issues/31)
- [#37 [世界书] 实现作者专用世界书导入与版本管理](https://github.com/CYH1104/stellar-resonance/issues/37)
- [#32 [API] 实现服务端 Prompt 拼装与 Token 预算管理](https://github.com/CYH1104/stellar-resonance/issues/32)
- [#34 [酒馆兼容] 实现关键词触发、扫描深度、优先级与预算规则](https://github.com/CYH1104/stellar-resonance/issues/34)
- [#38 [世界书] 实现按剧情状态检索与动态注入世界书](https://github.com/CYH1104/stellar-resonance/issues/38)
- [#9 [API] 实现网页端玩家 API Key 的安全传递与会话管理](https://github.com/CYH1104/stellar-resonance/issues/9)
- [#10 [API] 实现官方 API 与指定中转站白名单](https://github.com/CYH1104/stellar-resonance/issues/10)
- [#11 [API] 实现 OpenAI 兼容请求、模型参数与 SSE 流式响应](https://github.com/CYH1104/stellar-resonance/issues/11)

### 4. 完成可玩的网页流程

完成标准：玩家设置人设与 Key，在手机和电脑发送/停止/重试，刷新后恢复自己的聊天和变量，重新输入 Key。

- [#12 [前端] 实现聊天消息、输入框和流式输出](https://github.com/CYH1104/stellar-resonance/issues/12)
- [#22 [前端] 开发玩家 User 人设编辑器](https://github.com/CYH1104/stellar-resonance/issues/22)
- [#23 [前端] 开发 API 设置、模型选择与预设管理界面](https://github.com/CYH1104/stellar-resonance/issues/23)
- [#26 [后端] 开发游戏会话、聊天历史与存档接口](https://github.com/CYH1104/stellar-resonance/issues/26)
- [#29 [后端] 实现请求限流、异常处理与运行监控](https://github.com/CYH1104/stellar-resonance/issues/29)

### 5. 验收并发布受控内测

完成标准：核心测试、越权检查、浏览器与缓存检查通过，2～5 名受邀朋友用 HTTPS 预览链接完成体验。

- [#40 [安全] 实现网页注入、越权读取、SSRF 与会话防护](https://github.com/CYH1104/stellar-resonance/issues/40)
- [#41 [测试] 编写 MVP 世界书触发、变量与 Prompt 引擎测试](https://github.com/CYH1104/stellar-resonance/issues/41)
- [#43 [测试] 测试不同玩家之间的存档和权限隔离](https://github.com/CYH1104/stellar-resonance/issues/43)
- [#47 [测试] 验证手机与电脑浏览器的聊天、存档和安全边界](https://github.com/CYH1104/stellar-resonance/issues/47)
- [#44 [发布] 部署网页预览环境并完成朋友内测](https://github.com/CYH1104/stellar-resonance/issues/44)

同一组内仍遵循各 Issue 的具体依赖。前端可先对 mock 接口开发，后端可同时完成契约与测试数据；接通接口后验证完整路径。

## 建议按能力分工

| 工作 | 责任 |
| --- | --- |
| 网页前端 | 布局、聊天、Key 与模型设置、玩家人设、手机操作和错误状态 |
| 服务端 | 身份与归属校验、D1、世界书筛选、变量与存档、Prompt 与模型网关 |
| 作者内容 | 提供最小测试角色/世界书，确认公开与隐藏边界、供应商名单和规则 |
| 联合验收 | 两名玩家隔离、目标浏览器、产物和日志检查、预览发布与反馈 |

这些是职责建议，具体 Issue 由两名成员根据能力认领。先共同确定请求响应契约，减少前后端重复猜测。

## 开工前最少需要确定的三件事

1. 认可的模型供应商和域名，先接通一个入口与模型。
2. 内测玩家身份/邀请方案与作者导入授权。
3. 一小组可用的测试角色和世界书，标出公开、已解锁、隐藏字段。

缺少正式配置时先使用虚构样例和 mock 请求。第一阶段以核心安全和恢复能力验收，不能用可聊天的页面代替完整内测门槛。
