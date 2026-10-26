# 稳定版旧数据可用性修复（C1：世界卡/世界书的数据根）

日期：2026-10-27 00:1x　状态：本地已修、已自测，**未提交 / 未推送 / 未部署**（线上 `15802db`）

## 现象

双通道重构后，稳定版（以及测试版）从发布快照启动，`projectRoot` 指向快照目录。快照按设计**不包含** `server/private`（用户数据不能进发布物），于是在真实入口上：

| 数据 | 修复前 | 应有 |
|---|---|---|
| 角色 | 14（靠 `server/example/academy-characters.json` 兜回） | 14 |
| **地点** | **12（编辑器数据覆盖）→ 旧快照启动时只有 2** | 12 |
| **院系** | **2（示例卡的 world 数据）** | **5** |
| 世界书 `server/private/worldbooks/*.json` | 完全读不到（静默为空） | 全部生效 |

也就是说：角色名字看起来正常，最容易掩盖问题；但世界设定、院系、私有世界书都已经退化成示例卡。这就是「之前的数据在稳定版能不能用」的实际答案——**修复前不能用**。

## 根因

`server/app.mjs` 与 `server/index-main.mjs` 把 `projectRoot` 同时当成「代码根」和「数据根」：

- `const source = card || await loadCard(projectRoot)` —— 从快照找 `server/private/extracted-pro.json`，不存在 → 回落示例卡。
- `await loadPrivateWorldbooks(projectRoot)` —— 从快照找 `server/private/worldbooks`，不存在 → 返回空数组，且不报错。

快照改造前 `projectRoot` 恰好就是真实项目根，所以这两个调用一直是对的；改成快照启动后语义变了。

## 修复

| 文件 | 改动 |
|---|---|
| `server/load-card.mjs` | `loadCard(root, privateDirectory = resolve(root,'server/private'))`：卡从**实例私有目录**读，`root` 只用于找随代码发布的示例卡与角色目录 |
| `server/worldbooks.mjs` | `loadPrivateWorldbooks(root, privateDirectory = ...)`：世界书同样从私有目录读 |
| `server/app.mjs` | 传入 `dataDir`：`loadCard(projectRoot, dataDir)`、`loadPrivateWorldbooks(projectRoot, dataDir)` |
| `server/index-main.mjs` | 编辑器也按 `loadCard(releaseDir, privateDir)` 取卡 |
| `server/index.mjs` | `seedInstance` 除 `editor-data.json` 外，首次启动也复制 `extracted-pro.json`（只在缺失时，绝不覆盖），让测试通道与稳定版看到同一个世界 |

默认参数保持旧语义，所以 `scripts/launch-local.mjs`、`server/import-characters.mjs`、既有测试等调用点无需改动。

## 验证

### 1. 真实入口（本机快照启动）

```
8807 stable: counts {characters:14, departments:5, places:12}  release bf35bc8f297ff3a1
9000 test  : counts {characters:14, departments:5, places:12}  release bf35bc8f297ff3a1
地点：龙骨要塞 / 蜂巢 / 宁静迴廊 / 星辉之巅 / 幻星穹顶 / 静滞力场花园 / 天工锻造厂 / 棱镜角斗场 / 星穹杯 / 跨军校演习 / 化装舞会 / 学术峰会
```

修复前同一入口是 `departments:2`、`places:2`。

### 2. 新旧启动方式对照（`.integration/data-parity-check.mjs`）

同一份真实 `server/private`，分别以 `projectRoot=真实根`（旧）和 `projectRoot=快照`（新）启动：

- `/api/bootstrap` 逐字段相同（去掉 instance/pid/release/port）
- 地点清单 12 项完全相同，角色卡 revision `98f3eca4717284ca…` 相同
- 启动前后私有目录内容哈希**零变化**（启动不改写用户数据）

### 3. 生产数据副本（`.integration/prod-data-check.mjs`，副本用后即删）

从线上拉取副本（账号库 73KB + 4MB WAL、192KB `editor-data.json`、剧场分享、管理密钥），分别以两种方式启动：

| 检查 | 结果 |
|---|---|
| 账号库可打开（`/api/auth/policy`） | 200 / 200 |
| 未登录访问 bootstrap | 401（鉴权生效，不是 500） |
| 未知账号登录查询 | 401 `INVALID_CREDENTIALS`（说明库能正常查） |
| 编辑器数据 revision | 两侧同为 `afc35b3ca79b54c8` |
| 角色 / 地点 | 14 / 12，两侧一致 |
| 启动是否改写编辑器数据 | 否 |

生产目录里**没有** `extracted-pro.json`（线上世界完全来自 `editor-data.json`），这条也覆盖到了：卡回落示例、世界由编辑器数据覆盖，与改造前一致。

### 4. 新增回归

`tests/card-data-root.test.mjs`（4 项）：

1. `loadCard` 从数据目录取卡（3 地点 / 4 院系），不读代码根；
2. 不传数据目录时才回落示例卡（2 地点）——保证第 1 条的断言真有区分度；
3. 私有世界书来自数据目录，代码根里读不到；
4. 以快照为 `projectRoot` 起真实服务，`/api/bootstrap` 仍返回真实世界的 3 地点 / 4 院系。

### 5. 全量

- `vue-tsc --noEmit` 0 错误
- 后端 `node --test tests/*.test.mjs`：418 项 → 414 通过 / 0 失败 / 4 跳过
- 前端 vitest：125 文件 / 680 项全通过
- 真实模型（`假流式-pg-gemini-3.8-flash`）：占卜 200 / 15.9s，耐受度 200 / 21.9s，12 项断言全过（详见 `.integration/real-model-live-evidence.md`）

## 兼容性说明（未改动的部分）

- 稳定版 Cookie 名仍是 `stellar_<projectId>`、`academy_editor`，`projectId` 按真实项目根计算（`identityRoot`），与改造前一致 → 已有登录态不失效，账号库路径仍是 `server/private/accounts/accounts.sqlite`。
- 存档、终端记录、偏好都在浏览器侧（按 origin 隔离）。稳定版沿用 8807 与原端口，旧存档照旧可读；稳定版只是**不提供终端入口**（`/api/personal-terminal` 403），没有删除任何终端数据。
- 编辑器数据、剧场分享、云端备份仍写 `server/private`，证据见第 2、3 条「启动前后哈希零变化」。

## 待办 / 风险

- 未提交、未推送、未部署；线上仍是 `15802db`，`server/.local/releases` 只在本地。
- 备份导出/导入往返仍未实测（此前也一直未测）。
- 若某实例的 `server/private` 同时存在 `extracted-pro.json` 与更新的 `editor-data.json`，以编辑器数据为准（既有行为，未改动）。
- 部署到线上时，第一次启动会在 `server/private` 上做只读解析，不改写；但仍建议部署前手动备份 `server/private`（尤其 `accounts.sqlite` + WAL）。
