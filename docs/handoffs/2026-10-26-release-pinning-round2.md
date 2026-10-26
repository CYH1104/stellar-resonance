# 交接：B1–B3 返工（发布版本固定 / 快照回收 / 耐受度签名）

回应 `.integration/CODEX_DUAL_PORT_REVIEW_ROUND2.md`（REQUEST_CHANGES）。本轮**只**动 B1–B3，保留已验收的 R2–R6 行为与全部存档/备份字段。**未提交、未推送、未部署，线上仍是 `15802db`。**

## B1 [P1] 普通重启不再改版本，后端代码与依赖一起固定

**改法：把“启动”和“发布”拆成两个动作。**

- `server/index.mjs` 现在只是引导器：解析通道/实例 → 选版本 → `import(<快照>/server/index-main.mjs)`。
  选版本顺序：`TERMINAL_RELEASE`（显式）→ `<stateDir>/pending-release.json`（更新脚本写的发布目标）→ `current.json`（已确认版本）→ **没有指针时才**从共享工作树生成并确认一次（首次启动）。
  普通重启走第三档，不再调用任何创建快照的函数。
- `server/index-main.mjs`（新）承载原来的启动逻辑。`projectRoot` 由**自己所在位置**推导，因此页面、静态资源、`server/*.mjs`、`src/**` 全部来自快照；`server/private`、`server/.local` 仍走真实目录（存档与账号不会被回滚）。
- 依赖同样固定：`ensureDepsSnapshot()` 以 lockfile 内容哈希命名（`server/.local/deps/<id>`），把 `node_modules` **复制**（不是软链）成不可变目录，快照里的 `node_modules` 指向它。软链会继续指向共享树，`pnpm install` 就地改内容，所以刻意不用。
- 身份仍按真实项目根：`createLocalServer({identityRoot})`，引导器传 `STELLAR_PROJECT_ROOT`。否则 `/api/health.projectId` 会变成快照路径的哈希，启动器与部署脚本都认不出实例。
- 发布流程（`scripts/update-server.sh`）：build → `release-snapshot.mjs --prepare`（只准备，**不动指针**，打印 buildId）→ 写 `pending-release.json` → 释放代码树锁 → 重启 → 健康检查要求 `release === 目标 buildId`（并校验 `channel`/`instanceName`/`projectId`）→ 通过后才 `--commit <id>` 并删除 pending；不通过则把 pending 改成上一个已确认版本、重启回滚、`exit 1`。
- `scripts/launch-local.mjs` 默认只重启已确认版本；要发新版必须 `--publish`（或 `TERMINAL_PUBLISH=1`），此时它自己写 pending、等健康、再 commit。运行中的实例是旧版本时会要求先 `stop-local`。

**证据（真实入口，本机）**

| 场景 | 结果 |
|---|---|
| 首次发布 | stable `release=fb85af1ed4fd6e6b`，页面 200（966 KB） |
| 改共享 `dist` 并只发布 test 实例后**普通重启** stable | `release` 仍 `fb85af1ed4fd6e6b`，`/assets/__p2.js` = **404** |
| 显式发布（pending = `b0a61f4baa62a400`） | 启动即为 `b0a61f4baa62a400`，`/assets/__probe.js` = **200** |
| 后端代码固定 | 回归测试改共享 `server/index-main.mjs` 后再重启，仍报快照里那一版（`code-A`），显式发布后才变 `code-B` |

## B2 [P1] 清理快照不再删掉运行中的版本

- `prepareRelease` 与 `commitRelease` 分离：准备阶段绝不推进指针；`current.json` 只在健康检查通过后写。
- 运行实例登记 `server/.local/releases/<instance>/active/<pid>-<build>.json`（`app.mjs` 建服务时写、`close` 时删）。
- `pruneReleases` 的保护集合 = 已确认版本 + 所有 **pid 仍存活** 的登记版本 + 本次刚准备的版本；其余只按时间保留最近 3 份。pid 已死的登记在下次清理时删除。
- 依赖目录按 lockfile 哈希复用，不随快照清理（同一份依赖可被两个实例共用）。**未做**“无引用依赖目录”的 GC，见文末已知成本。

**证据**：Codex 的 `node .integration/wb-return-release-audit.mjs` 现在在 `assert.equal(response.status,404)` 处失败，实得 **200**——旧进程仍在服务它自己的快照，缺陷不再复现。

## B3 [P2] 同档案改模型/接口后，旧耐受度结果不落库

- 签名改为**完整档案 + 密钥**：`JSON.stringify([profileObject, key])`（`id/model/apiBaseUrl/temperature/maxTokens/topP/...` 全在对象里），不再只比 `id + key`。
- 配置 watch 同时 `abort` 普通请求控制器 **和** 耐受度控制器。
- `commitTolerances` 在串行写队列**内部**再核验一次签名——替身或上游忽略 abort 时，迟到结果依然写不进去。
- 写成函数声明而非 `const` 箭头：配置 watch 在初始化阶段就可能读它，否则报 TDZ。

**证据**：`node node_modules/vitest/vitest.mjs run --config .integration/wb-return.vitest.config.mts` 现在失败在原断言上（`expected {player:2,a:3,b:4}`，`received undefined`），即旧值不再保存。

## 新增/改写的回归

| 测试 | 覆盖 |
|---|---|
| `tests/channel-instance.test.mjs` → “an ordinary restart keeps the confirmed release even after the shared tree was rebuilt”（新） | 真实 spawn `server/index.mjs`：首次发布 A → 测试实例发布 B → 稳定重启仍 A（资源与 `release` 都不变）→ 改共享后端入口重启仍 A → 显式发布后才 B |
| 同文件 → “preparing new builds never deletes the snapshot a running process is serving”（新） | 运行中固定 A，连续 prepare B/C/D/E 且都不提交：指针仍 A、A 的资源仍 200、目录仍在 |
| `tests/king-games-room.test.ts` → “changing the model or endpoint under the same profile drops late tolerance replies”（新） | 同档案改 `model`/`apiBaseUrl`，替身忽略 abort 的迟到响应不写入 |
| 既有 R2–R6 回归 | 全部保留并通过（含“挂起期间出令可用”与 SSR 按钮未禁用） |

## 自查结果（本地）

- `node_modules/vue-tsc --noEmit` 0 错误；`vite build` 成功。
- 后端 `node --test tests/*.test.mjs`：**414 项 → 410 通过 / 0 失败 / 4 跳过**。
- 前端 vitest：**125 文件 / 680 项全通过**。
- 两个 Codex 探针分别在其“证明缺陷存在”的断言处失败，见上。

## 已知成本与未做

- 首次发布要复制一次依赖：本机 27s；Linux 约 186 MB（保留 pnpm 软链），Windows 因无法创建软链降级为解引用复制，约 383 MB。同一 lockfile 之后复用，不再复制。
- 未实现“无引用的依赖目录”GC（只在 lockfile 变化时新增一份）。
- pending-release 若发布脚本中途被杀会残留：服务会一直尝试该目标；`update-server.sh` 的成功/失败两条路径都会清掉它。手工排查时删除 `server/.local/pending-release.json` 即回到已确认版本。
- 未提交/推送/部署；未建测试版 systemd 单元；未做公网双实例、真机手机双端口、点击级 UI、备份往返、真实计费模型。
