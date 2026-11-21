# 终端 API 保存后旧错误与邀请重试修复

## 范围与基线

用户确认设置已保存且重新打开仍为新 API，但斗地主显示旧模型、旧接口及“重试邀请请求”。本轮以 main `88a892057a1b5da113211e411ffeb515ea12d275` 为基线继续修复。用户授权正常推送 main 并仅发布 9000 测试实例，8807 稳定实例不动。之前各游戏、安全与密钥检查见 [上一轮交接](2026-11-21-terminal-audit-fixes.md)。agent-hub 的指定路径不存在，无法通过该工具领取或发送交接；本文件记录接力信息。

## 复现与修复

1. 使用真实 useConfigurationDraft → useWorkspace → IndexedDbRepository → usePartyGames → HttpGateway 链路，fake IndexedDB 与合成 fetch 端点复现。保存 B 并重新打开后，新邀请请求确实使用 B 的 URL/model/key；没有将用户问题归因为未保存。
2. 已确认 A 邀请失败后保存 B，游戏控制器保留 A 的错误，原重试还绑定 A 的签名及旧 epoch。现在保存路由变更时标明旧错误已失效；仅邀请请求可使用当前 API 重试。随机发牌、罚酒和结算等操作不允许借此跨接口重放。
3. 邀请重试仍验证存档、房间状态、剧情分支锚点和终端生命周期。停止终端或关闭再打开后不能恢复旧重试。新增 terminalLifecycleEpoch 仅运行期使用，没有新增持久化字段或备份格式。
4. 旧请求的迟到失败不会覆盖房间内的新状态；HttpGateway 在 fetch 完成和 HTTP 错误正文读取后检查取消信号，阻止旧响应重新发布全局 HTTP 通知。
5. API 设置页显示“已保存的终端 API”，游戏房间显示“当前终端 API”，均取实际生效配置的名称、模型和 URL origin，不显示密钥。失效重试回调清除后，不再提示存在可用的邀请重试。

## 验证

- 新增 11 项集成用例：完整保存/重开/新邀请、失败后切 B 重试、同一配置 ID 更改 URL/model/key、保存失败保留 A 与 B 草稿、房间/停止/禁用重启/分支保护、迟到 fetch 失败及两种迟到 HTTP 错误正文结果。
- 复核发现的旧 HTTP 通知及无按钮重试提示均已先复现，再修复。
- 全量前端 1121/1121 通过，vue-tsc --noEmit 通过，Vite 生产构建通过；构建仅有既有 chunk 超过 500 kB 提示。两名只读复核者已确认各自发现的补丁闭环。
- 修正既有凭据脱敏测试中的无效字符串 signal，改为真实 AbortController.signal；保留原脱敏断言。
- 本轮无服务端代码改动；不重复声称已实测真实计费模型。用户浏览器现场请求未直接捕获，合成集成复现不能证明截图只有这一种成因。

## 发布与接续

发布必须钉住本轮已审查提交并显式传入 STELLAR_SINGLE_INSTANCE_UPDATE=1、TERMINAL_INSTANCE=test、TERMINAL_CHANNEL=test、SERVICE_NAME=stellar-resonance-test、PORT=9000、EDITOR_PORT=9001、PUBLIC_ORIGIN=http://43.138.251.91:9000。默认 update-server.sh 会更新双端，禁止无参数执行。

发布前 9000：release 32775441cc2655c7，PID 3619173。8807 保护基线：release 2714ea237e363c84，PID 2955979，instance 3523bfac9402aab5678d61a0b402ca69，PersonalTerminal-MEjwXoLc.js 的 SHA256 为 58bc6cc9976e1d8d4d375ce6b2d642862a434945e5fe136780d559bcd7f2518a。发布后必须核对 8807 四项不变，并核验 9000 服务源代码、静态资源与新提交一致。

用户刷新 9000 前端后，可直接查看已保存/当前终端 API 行，使用原房间的邀请重试。若仍出现旧接口，下一步应记录该次请求开始时实际生效的名称、模型、origin 和错误时间，继续定位；不要要求用户反复保存或收集真实 Key。
