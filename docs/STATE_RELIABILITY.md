# 状态可靠性改造（批次一、二）

日期：2026-10-20。本文件记录实际落地的协议与限制；成就系统尚未实现。

## 名单：沉默不等于离场

新状态块使用增量字段：

```json
{"event":"…","present":["id"],"enter":["id"],"exit":["id"],"characters":[{"id":"id","attitude":"neutral","strength":"small"}]}
```

- `present` 只声明在场，不是完整名单；上一轮在场、本轮未提的角色保持在场，并记为 `missing`
- 离场必须写 `exit`，或在该角色行写 `present:false`
- 同一 ID 同时出现在 `present/enter` 与 `exit` 会被拒绝（`MODEL_STATE_ROSTER_INVALID`）
- 旧的 `presentCharacterIds` 仍按“完整名单”解释（省略即离场），用于兼容旧预设；新提示词只示范新字段
- 必需角色 = 上一轮在场 ∪ 本轮进场 ∪ 本轮声明在场 − 离场；只依赖请求状态，不依赖模型自己的名单

## 判断记录

`outcome.stateUpdate.review`：

```json
{"guide":"changed","engineer":"missing"}
```

取值 `changed / unchanged / missing / rejected`。`missing` 不会被当作“未变化”，会出现在补全面板和变量变化卡片中。旧字段 `affinityReviewedIds` 保留一版兼容。

## 提交

- `commitGroups` 开启时，`src/domain/commit.ts` 按角色分组：组内原子、组间独立；`move/copy` 按路径闭包分组；手动覆盖的 `/player + /characters + /custom` 三件套合并为一个原子组
- 部分成功会记录 `STATE_MVU_PARTIAL`，`stateUpdate.status` 为 `partial`
- 关闭该开关时仍使用原来的整组 `applyMvu`，供直接调用 `/api/generate` 的旧客户端使用

## 存档

- 浏览器 IndexedDB 的 `snapshot` 值改为 `{revision,text}`，写入是单事务 compare-and-swap；旧字符串按 revision 0 读取
- 另一个标签页先保存时，后写者收到 `STALE_WRITE`，页面停止自动保存并提示重新载入；不会静默覆盖
- 备份版本升为 2，仍可读 version 1；初始状态与旧稿中越界的 `affinity` 在读取时收敛到 `[-100,200]`
- 新字段随快照保存；旧版本客户端读取新备份会被严格校验拒绝

## 提示词位置

动态状态 JSON 从 `context.state/context.mvu` 移到历史之后、玩家输入之前的 system 消息，固定世界与规则保持在前，便于前缀缓存。`stateEnabled:false` 时两者都不发送。

## 验证

- 服务端 `node --test tests/*.test.mjs`：275 项
- 客户端 `vitest run`：357 项
- 类型检查与生产构建通过
