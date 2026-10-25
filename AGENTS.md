# AGENTS.md

## 跨 agent 接力（agent-hub）

本机装了 agent-hub，把 WorkBuddy / Codex / DeepSeek Harness / ZCode 接到同一条接力棒上。

**开工前先跑这三条**（Windows Git Bash 或 PowerShell 都可以）：

```bash
node "D:/QQ/QQ文件/agent-hub/hub.mjs" status
node "D:/QQ/QQ文件/agent-hub/hub.mjs" read me 5          # WorkBuddy 最近在做什么
node "D:/QQ/QQ文件/agent-hub/hub.mjs" read deepseek 3    # DeepSeek 最近在做什么
node "D:/QQ/QQ文件/agent-hub/hub.mjs" read zcode 3       # ZCode 最近在做什么
```

**收工前写回接力棒**：

```bash
node "D:/QQ/QQ文件/agent-hub/hub.mjs" handoff --to <下一个 agent> \
  --task "下一步要做什么" --done "已完成 A|已完成 B" --next "接下来 C|接下来 D"
```

## 铁律

1. **单写者**：同一时刻只有持棒方可以改仓库；非持棒方只看不写。
2. **先对账**：动代码前核 `git` 远程 main 与本地的区别，不一致先问，不许硬推。
3. **收工写回**：完成了什么、下一步是什么、跑了哪些验证，三项缺一不可。
4. **不重复推送**：上一棒已经推过的提交不要重推。

## 本项目约定

### 新功能的数据与备份兼容（用户要求）

- 每次新增持久化字段、IndexedDB 数据库或 localStorage 配置，必须核对本地下载、云端上传、导入、拉取覆盖和覆盖前恢复副本是否包含它；不能仅备份 sessions 就声称“所有数据”。
- 用户要求备份人设档案、主人设、备注、备忘录、草稿和全部终端记录；运行日志及模型原始输出不备份。云端继续排除本地图片和 API/仓库密钥，图片 URL 保留。
- 统一使用完整备份采集入口，扩展资料接入 BackupArchive；新增字段未接入不得静默丢弃。文件格式升级需兼容导入旧文件；遇到无法识别的新版本或字段，应在写入前停止。
- 导入新存档更换 ID 时，同时重绑人设 sourceSessionIds、主人设引用和其他关联；旧文件缺少附加资料时保留本机资料，不按空集合清除。
- 发布前验证数据往返一致性、旧格式、云端图片/密钥排除、终端记录、覆盖前完整副本，以及写入失败和跨页面修改保护；见 docs/BACKUP_COMPATIBILITY.md。

- 项目路径：`D:\QQ\QQ文件\星穹学院终端`
- 仓库：`github.com/CYH1104/stellar-resonance`，远程 main 以实际 `git ls-remote` 为准
- 只改前端时可用热更新（不重启，不断用户生成）；碰 `server/` 必须走完整更新
- 详细交接见 `docs/SESSION_HANDOFF.md`、`docs/SHARED_WORKFLOW.md`
