# 终端卡顿修复：分支锚点哈希缓存

日期：2026-10-27
状态：**已改完并自测通过，未提交、未推送、未部署**，等 Codex 复审。

## 1. 问题

用户反馈终端用久了卡顿。实测确认是单点问题，不是普遍性能问题。

`terminalAnchorActive`（`src/domain/terminalLedger.ts`）判断"这条消息属于当前剧情分支吗"，实现方式是**每次调用都重建整条分支路径**：遍历全部轮次，对每轮「用户输入 + 模型正文」做 FNV 哈希，再把结果整串哈希一次。单次成本 O(轮数 × 单轮正文字数)。

而它在渲染期是**按每条消息一次**调用的：

- `PersonalTerminal.vue` 会话列表行 `c.messages.filter(...)` 同一个过滤写了两遍（正文一次、时间一次），每个会话都跑；
- `usePersonalTerminal.ts` 的 `messages`、`activeFriends`、`visibleConversations`、`gameHistory` 各自过滤一遍；
- 游戏室页 `endedRoomsWithHistory` / `endedRoomsEmpty` / `currentVisibleRounds` 各自对每个房间每轮判一次。

叠加起来是 O(消息数 × 轮数 × 正文长度)。`commit()` 每次整体替换 `session.terminal` 引用，会让所有 terminal computed 同时失效，于是**每次终端操作后都要重跑一遍全量**。

实测（改动前，Node 24 直接加载真实模块，200 轮 / 每轮 6000 字 / 600 条消息）：

| 场景 | 单次锚点计算 | 一次消息过滤 | 会话列表页一次渲染（8 会话 × 2） |
|---|---|---|---|
| 20 轮 × 2k 字 / 60 条 | 0.34 ms | 14.2 ms | 228 ms |
| 80 轮 × 4k 字 / 250 条 | 1.71 ms | 355 ms | 3331 ms |
| 200 轮 × 6k 字 / 600 条 | 3.31 ms | 1851 ms | 28922 ms |

长档一次渲染 29 秒，主线程完全冻结。

## 2. 改动

### `src/domain/terminalLedger.ts`（核心）

两层 WeakMap 记忆，均按**引用**校验，不改变哈希算法本身：

1. `segmentHashes`：单轮片段哈希按 variant 对象记忆，比较 `input` 与 `text` 的引用。
2. `branchMemos`：整条分支**每个前缀**的摘要，增量续算 FNV 状态（`digests[n]` 等价于 `hash(segments.slice(0,n).join('|'))`），校验每轮的选中 variant 对象、`input`、`text`。

流式增量或原地编辑会给出新的字符串引用，校验失败即重建，不会发出过期摘要。

`terminalAnchorActive` 里原来的 `JSON.stringify([digest]) === JSON.stringify(a.path)` 改为等价的 `a.path.length === 1 && a.path[0] === digest`（小数组 stringify 也在每条消息上跑了一遍）。

### `src/components/PersonalTerminal.vue`

- 新增 `roundsByRoom` computed，替代模板期反复调用的 `visibleRounds(r)` 函数；
- 新增 `lastMessageByConversation` computed，消除会话列表行里重复两遍的 `c.messages.filter(...)`；
- 模板改为查表，`endedRoomsWithHistory` / `endedRoomsEmpty` / `currentVisibleRounds` 走同一份 Map。

### `tests/terminal-anchor-cache.test.ts`（新增，8 项）

把**改动前的算法原样保留成基准**做逐项比对，而不只是断言"现在能跑"：

- 空存档 / 单轮 / 多轮存档，每一个 `before` 位置的 `key`、`path`、可见性判定都与改前一致；
- 流式追加、编辑早期轮次、切换选中变体、末轮转未完成、回退一轮 —— 旧锚点必须失效且与基准一致；
- 200 轮 / 600 条消息的批量判定，结果与基准一致，且耗时不回退到秒级。

## 3. 数据安全的理由

存档里的终端消息、记忆笔记、游戏轮次都靠 `anchor.path` 判定自己属于哪条分支。**哈希值只要漂移一位，旧存档的锚点就会全部失配**，表现为消息整片消失、记忆笔记全部不可见。

因此本次改动只缓存、不改算法：FNV 初值、`input + '\n' + text` 的拼接顺序、`join('|')` 的分隔符、`>>> 0` 的截断方式全部保持原样。等价性用 2050 项边界比对验证（含多轮前缀、变体切换、文本改回原值、双会话交叉），全部一致。

## 4. 实测（改动后）

| 场景 | 单次锚点 | 一次消息过滤 | 会话列表页一次渲染 |
|---|---|---|---|
| 20 轮 / 60 条 | 0.00 ms | 0.2 ms | 0.9 ms |
| 80 轮 / 250 条 | 0.02 ms | 1.1 ms | 5.6 ms |
| 200 轮 / 600 条 | 0.00 ms | 1.5 ms | 24.0 ms |

长档从 28.9 秒降到 24 ms（其中会话列表页的数字仍按"每会话算两遍"的旧口径测得，实际模板已改成查表，还会更低）。

## 5. 已运行的验证

```
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
  → 通过，0 错

node node_modules/vitest/vitest.mjs run
  → 132 files / 742 tests passed（含新增 8 项）

node --test tests/*.test.mjs
  → 434 tests，429 pass，4 skipped，1 fail
  → 失败项：tests/instance-worldbook-seed.test.mjs:88
     "a symlinked entry never pulls files from outside the private directory"
     Windows 上 symlink(file) 抛 EPERM 后仍留下了链接，catch 里的 junction 分支再建就 EEXIST。
     单独复跑可稳定复现；本轮未改 server/ 与 worldbooks/，属既有环境问题。
```

## 6. 未做

- **未提交、未推送、未部署**（按要求先交 Codex 复审）。
- 未动 `FloatingGroupChat` 的 `mounted` 常驻问题：终端首次打开后关闭也不卸载，仍在渲染树里。现在单次判定已降到 O(1)，收益变小，且改成 `v-if="open"` 会丢临时 UI 状态，留作后续讨论。
- 未动 `StoryInline` 的模板内联 `storyInline(text)`：实测 4400 字单次 0.261 ms，流式节流 48 ms 一拍，占比约 0.5%，不值得改。
- 未动 `commit()` 里的 `structuredClone(JSON.parse(JSON.stringify(...)))` 双重深拷贝：长档 15 ms，浪费但不致命。
- 未修 `instance-worldbook-seed` 的 Windows 链接测试（不属本轮范围）。

## 7. 建议复审关注

1. `branchMemo` 的引用校验是否覆盖了所有会改变哈希的路径 —— 除 `input` / `text` / 选中 variant 外，`t.id` 与 `v.id` 变化会不会漏判？
2. 增量续算的 `digests[n]` 与旧的 `hash(join('|'))` 是否真的逐位相同，尤其是 `n = 0` 和单元素前缀。
3. `terminalAnchorActive` 里 `JSON.stringify` 改为直接比较的等价性。
4. 模板改为查表后，`lastMessageByConversation` 依赖 `conversations`（含搜索词与筛选），输入搜索时会不会有额外的重算放大。
