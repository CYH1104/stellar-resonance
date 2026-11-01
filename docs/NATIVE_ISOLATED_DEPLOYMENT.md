# 原生版独立部署（8088）

## 2026-11-01 当前状态

用户明确要求先部署、再修正。完整原学院文档、加载动画、App 与原页面已发布到 8088，取代此前 292de66 简化入口。并非全部迁移验收完成。

- 公网入口：<http://43.138.251.91:8088/>，仍使用该独立站原有原生账号与服务器数据。
- 当前目录：`/opt/stellar-native-academy/releases/full-20261101-9efc913e/app`。
- `stellar-native-frontend.service` 对外监听 8088；`stellar-native-academy.service` 使用原版后端，只监听回环 18088。
- 私有原生运行环境 `stellar-native-compiler.service` 只监听回环 18089，独立 compiler/data；未向玩家下发作者文件。
- 独立账号和 `/var/lib/stellar-native-academy/data` 保留。切换前完整副本在其同级 backups/pre-full-20261101.tar.gz。
- **生成功能仍明确暂停**：公开服务环境 `ACADEMY_PUBLIC_PREVIEW=1`；计划/完成接口返回 503/NATIVE_PRIVATE_COMPILER_PENDING，作者文件接口始终 403。不能称聊天已可用。
- 完整前端存储使用原生接口，生成暂停不应抹掉已有输入、存档及配置。

已修正新账号中文欢迎页无法完成隐藏引擎初始化的问题，热更新无需再次重启。补齐世界书折叠标题前的启停开关，界面创建数量与资源保护一致。

实际验收：公网登录/原页面/公开目录/私有入口封闭 7 项；全新原生临时账号、完整 App、单次引擎初始化、390px 无横向溢出及无页面异常 6 项，资源失败 0。最后截图已人工查看。合成检查账号待最终清理，不向管理员写测试存档或模型配置。

私有编排已改为服务端原版运行环境；任务计划只给玩家一次性账号绑定 token，原生 SDK 保留参数和流解析；服务端消费票据后调用官方 completion handler。本机实际两轮、终端、辅助任务通过；服务器 Linux 临时关闭浏览器沙箱的合成检查通过，但不能作为正式发布配置。产品已移除关闭沙箱选项；保留沙箱时现有测试版 Chromium 被 Ubuntu 拒绝启动。

自动审批拒绝了持久关闭沙箱和未经明确授权的官方 Chrome 外部下载/系统安装，两项均未执行。已向用户发出明确安装请求，见 NATIVE_BROWSER_INSTALL_APPROVAL.md。**正式私有生成尚未启用，不能暗中绕过审批或把临时无沙箱检查当正式验收。**

最终核对：8807 PID 2817555、9000 PID 2871143，两者重启次数仍 0；新公开后端 PID318929、前端 PID319013，重启次数 0。未用旧站更新脚本。

以下为旧阶段部署记录，保留供回退核对；不再描述当前 UI。

---


2026-10-30，用户明确授权部署，并要求与此前站点完全分开。部署的应用代码固定为 `292de6628c1fb6e1ef42cb0f0d0261ec310dea77`，不是合并或替换 main。

公网入口：<http://43.138.251.91:8088/>。此地址是原生聊天第一阶段版本；完整学院功能、旧页面换绑、旧资料和完整备份迁移仍按 `NATIVE_RESKIN_ARCHITECTURE.md` 继续，不能因为部署成功就标成全面迁移完成。

## 独立边界

| 项目 | 原生独立站 |
|---|---|
| 公网端口 | 8088，原本空闲且已有放行规则，没有改动旧端口或现有反向代理 |
| 系统账号 | `stellar-native`，独立系统用户/组，无交互登录权限 |
| 原版代码及皮肤 | `/opt/stellar-native-academy/releases/292de6628c1f/app` |
| 独立 Node/npm | `/opt/stellar-native-academy/runtime`，Node 24.22.0，实际复制，非指向旧站的链接 |
| 独立依赖 | 上述 app 内单独 `npm ci --omit=dev` 安装，没有共享旧站 node_modules |
| 原生配置 | `/etc/stellar-native-academy/config.yaml` |
| 原生账号、密钥与业务数据 | `/var/lib/stellar-native-academy/data`，未复制任何旧站资料 |
| 临时文件 | `/var/lib/stellar-native-academy/tmp`，服务另有私有临时目录 |
| 服务 | 系统级 `stellar-native-academy.service`，不是原来两个用户级服务 |
| 运行限制 | CPU 50%，MemoryHigh 384M、MemoryMax 768M、TasksMax 128、Nice 10 |
| 文件访问限制 | `ProtectHome=true`、`ProtectSystem=strict`，只允许写新站 app 和新站数据目录 |

已实际核对运行进程的文件系统视图：旧 `/home/ubuntu/stellar-resonance` 路径不可见，非仅配置声明。

原生多用户和密码登录已启用，未登录不能读取 settings。初始管理员为原生 `default-user`，密码独立随机生成，不复用旧站账号/Key。登录信息保存在操作者本机 `.integration/原生独立站登录信息.txt`，以及服务器 root-only 初始化文件；不进仓库、频道或普通备份。首次登录按原版引导选择自己的显示名。

浏览器 Cookie：旧站使用自己的 `stellar_*`/`academy_account_*` 名称；原生版使用官方 session 名称及新数据目录单独生成的签名密钥，不复用旧会话。独立端口也隔开了浏览器本地存储。未把旧账户或 API 配置自动导入新站。

原生服务器私有地址过滤已开启，allowedRanges 为空，不将内网/旧站地址当成模型接口访问。原生扩展自动更新及服务器插件自动更新关闭，未添加任何自动拉 main、定时部署或修改旧站的脚本。

## 部署与验收记录

- 本机从固定 Git 对象归档原版，单独构建学院扩展；上传两个包后在服务器校验 SHA256，再解包到新目录。
- Linux 下独立安装 667 个依赖；新站启动、原版前端编译、登录页和学院扩展加载成功。
- 对部署后的 1010 个官方跟踪文件逐个比对内容哈希，并核对可执行位，全部与官方源码一致。源码树仍为 `9218207b1e3bfe78224afe10e71ece3b8e79f572`。
- 公网 API 验收 7 项通过；原版登录、权限和皮肤资源通过。浏览器使用独立临时账号完成首次引导，桌面与 390px 皮肤、原生 API 面板、返回学院及无异常/无模型调用共 8 项通过。
- 临时账号与它的资料已通过原版管理接口删除，清理后 8 项 API 检查通过。未向管理员账号写入测试聊天、测试模型 Key 或测试人设。
- 服务器隔离/旧站状态 11 项通过；新站启用开机启动，失败重启次数 0。
- 部署前后，8807 的 PID 始终 `2817555`、启动时间 `2026-10-27 20:00:27 CST`；9000 的 PID 始终 `2871143`、启动时间 `2026-10-27 23:32:33 CST`。两者 NRestarts 均 0，健康接口与原 PID 一致。
- 没有修改旧站代码、配置、账号、数据、端口、反向代理、服务定义或更新标记，也没有重启它们。

脱敏证据位于 `docs/evidence/native-isolated-deployment/`。应用构建与上一阶段本地原生生成回归见 `docs/handoffs/2026-10-30-native-academy-entry.md`。本次公网验收没有调用真实计费模型。

## 后续维护

只操作这一个系统服务：

```bash
sudo systemctl status stellar-native-academy.service
sudo journalctl -u stellar-native-academy.service -n 50 --no-pager
sudo systemctl restart stellar-native-academy.service
```

不要使用旧站 `update-server.sh`、`restart-server.sh` 或旧用户级服务来更新原生站。后续发布应构建独立新 release、保留 `/var/lib/stellar-native-academy/data` 及独立配置，检查原生文件/皮肤后仅切换此服务；不能将这个目录指向旧站，也不能把旧账号库复制过来。

上传暂存及本次可复跑验收脚本在服务器 `/home/ubuntu/stellar-native-academy/incoming`，未用于存储新站实际账号和业务数据。该目录中的包不包含任何旧站私有资料。
