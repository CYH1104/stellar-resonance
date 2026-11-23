# 2026-11-23 课表、退群通知与麻将图片

## 范围与基线

用户要求修复截图中的课表 RESULT_FORMAT_INVALID、退出群聊后首页预览仍指向旧群，并从网上选用麻将图片替代文字牌。仅部署 9000 测试版；8807 稳定版不动。开工远程 main 与本地 HEAD 都为 0eef6800da75ef338d7a1e1ad9f6724a1dcae218。agent-hub 的指定 hub.mjs 路径不存在，沿用仓库交接。

## 完成

- 课表：用户完整输出包含 teacherId=player，原手动与自动校验仅接受 NPC ID，错误拒绝本人授课。两条链路均允许 player，仍校验未知 NPC、日期与时间；提示词明确约定。本人课程详情不再出现添加自己好友的按钮。
- 首页：原未读计数排除退群，预览却按会话存储顺序选择，未检查 joined。现在预览从可见消息中排除 joined=false、按消息时间选取最新未读；退群原子保存时归零该群未读。保留聊天历史，保存失败恢复会员状态与通知。兼容旧存档残留的退群未读。
- 麻将：引入 FluffyStuff/riichi-mahjong-tiles 的 40 个原始 Regular SVG，来源提交 26e127ba2117f45cdce5ea0225748cc0cfad3169，逐文件验证 Git blob SHA1，许可证为 public domain / CC0。手牌、暗牌、牌河、副露、宝牌、里宝牌、结算手牌和操作预览使用本地图片。保留无障碍名称；赤五保留身份；白板使用原空白图叠牌底。无外站运行时图片请求。来源记录在 src/assets/mahjong/NOTICE.md。
- 没有新增持久化字段、数据库或备份格式；本人授课字段已验证现有备份往返。

## 验证

- 先使用用户原始 JSON 与真实首页渲染/退群操作复现红例，再修复并转绿。
- 前端完整 187 文件、1164 项通过：pnpm exec vitest run --maxWorkers=2 --testTimeout=15000。
- 首次前端命令多余的 -- 未传入超时配置，默认五秒下出现一项超时；正确参数重跑全套通过。
- 后端完整 540 项：535 通过、0 失败、5 项按既有条件跳过：node --test --test-concurrency=1 tests/*.test.mjs。初次发布快照测试因 Windows EPERM 重命名失败；关闭本任务 Vite 文件监视器后原失败所在三个文件 22/22 通过，无生产代码绕过。
- 生产构建和类型检查通过。构建同步 HTML 仅改变换行，按规范化字节比对后恢复。
- Chrome 1000x600 与 420x880 检查：所有牌图加载、无外站图片请求；横屏对局/单局结算、竖屏整场统计；实际提示/选牌/出牌，气泡与结算发言，页面无异常。实际退群后首页更新，继续新增私聊消息会响应式更新；本人课程详情正确。
- 浏览器使用隔离测试存档与模拟模型，未调用收费真实模型、未访问或修改用户存档。
- 证据位于忽略目录 .integration/terminal-polish-20261123/。

## 发布与下一步

发布前已实时确认：9000 为 b7e7ef8bffcafe14 / PID 156217；服务器 checkout e927fbe8cde8cb116bec1a5d2f3733c9d24fc63d 且干净。
受保护 8807：release 2714ea237e363c84；PID 2955979；instance 3523bfac9402aab5678d61a0b402ca69；PersonalTerminal-MEjwXoLc.js SHA256 58bc6cc9976e1d8d4d375ce6b2d642862a434945e5fe136780d559bcd7f2518a。

发布已完成，详情见下方收据。后续仍仅发布 9000，禁止直接运行默认双端 update-server.sh。

## 2026-11-23 发布收据

- 功能提交：0c2c2330f46754eae44b160f2041d0d58e27e9d8，已正常推送 GitHub main。
- 9000 运行 release 0b8aaa75f1d111f3；PID 168584；instance 523de6fb185f14de006372c6909711e5。
- 实际运行快照与提交的 392 个 src/server/package 文件逐项一致；无 pending-release，last-deployed-main 与功能提交一致，服务器工作树干净。
- 公网 9000 健康检查、终端脚本、40 张 SVG 均 HTTP 200，图片字节哈希全部一致。终端脚本 PersonalTerminal-xjDcj0xQ.js SHA256 315ab2683de30f0f585b29aba4f945d4b99aaae36d873d923b818e9e2bba5426。
- 8807 健康信息（包括 PID、release、instance）与终端资源 SHA256 发布前后完全一致。
- 更新前备份：/home/ubuntu/.stellar-resonance-backups/update-20261123-184044-ghd87z。部署使用 STELLAR_SINGLE_INSTANCE_UPDATE=1、TERMINAL_INSTANCE=test、PORT=9000；未运行默认双端发布。
- 服务器 authorized_keys 只保留用户指定的新密钥指纹；本次本地临时私钥已删除并确认不存在，5199 浏览器验证服务已停止。
- 真实付费模型未调用；用户原始 JSON 在真实校验入口通过，交互验证使用隔离存档与模拟模型。重新加载 9000 页面后点击更新安排可重新生成课表；旧失败返回没有自动写入用户存档。
- 下一步：用户在 9000 复查实际存档的课表与退群通知；若仍报错，按新错误与原始输出进一步定位。当前无待发布代码。
