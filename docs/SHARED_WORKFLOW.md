# 双方交接与服务器更新约定

> 2026-10-30例外：用户另行授权原生迁移阶段版独立部署为8088，使用独立系统账号、目录和服务。该站不走下文的旧站main更新脚本；详见 [原生独立站维护](NATIVE_ISOLATED_DEPLOYMENT.md)。下文旧站流程仍适用于原8807/9000，不能套用到新站。

以后只使用仓库 `CYH1104/stellar-resonance` 的 `main` 分支。`main` 是双方认可的最新完整代码，也是服务器唯一更新来源；不再按版本创建交接分支，也不再查找“时间最新的分支”。旧 preview/archive 分支仅保留历史。

本次以伙伴提交 `3858b8d` 为基础，已包含 API 设置导入导出、逐条补记、记忆索引及运行日志；保留学院界面、单次主 API 生成、独立管理页和浏览器存档。补齐了记忆来源跳转与隐藏楼层的兼容。

## 给伙伴看的分工规则

1. 开始工作前先告诉对方，由一个人负责当前一轮修改。对方上传到 main 后，先备份自己尚未交付的文件，再覆盖更新；以对方最新完整代码为基础继续改。
2. 覆盖更新不用 `git pull`、merge 或 rebase。不把双方各自过时的文件拼在一起；没交付的改动只放备份，不自动重新套回。
3. 完成后测试、提交并正常推送 main。不要强制推送远程 main。若推送被拒绝，说明对方已经上传：先交接并备份，按下面命令覆盖最新代码，再重新做本轮需要的修改。
4. 上传代码前检查 diff，禁止提交 Key、管理口令、账号数据库、服务器私有角色/世界书或浏览器导出存档。所有隐藏楼层仍保存在存档中，限制渲染不等于删除。

双方本地 Git 工作区都可以使用以下命令（先备份未交付内容；会丢弃已跟踪文件的本地修改）：

```bash
git fetch --prune origin +refs/heads/main:refs/remotes/origin/main
git reset --hard origin/main
git checkout -B main origin/main
git remote set-branches --add origin main
git branch --set-upstream-to=origin/main main
pnpm install --frozen-lockfile
```

这组命令适用于 Windows Git Bash 和 Linux；不执行 `git clean`。本机没有 Git 时可下载 main 的 ZIP 覆盖代码，但仍应先备份；不要用旧文件夹整包上传覆盖新版本。

提交本轮改动（明确选择文件，检查后再推送）：

```bash
git add <本轮修改的文件>
git diff --cached
git commit -m "说明本轮改动"
git push origin HEAD:main
```

## 服务器首次切换到统一更新方式

在服务器终端执行，不在本机执行。先将最新更新脚本下载到临时文件，下载成功才执行；脚本会备份、覆盖 main、安装、构建、重启并检查服务。

```bash
export NVM_DIR="$HOME/.nvm" &&
. "$NVM_DIR/nvm.sh" &&
nvm use 24 &&
cd /home/ubuntu/stellar-resonance &&
git config --local http.version HTTP/1.1 &&
git config --local http.maxRequests 1 &&
update_script="$(mktemp /tmp/stellar-update-XXXXXX.sh)" &&
git fetch origin +refs/heads/main:refs/remotes/origin/main &&
git show origin/main:scripts/update-server.sh > "$update_script" &&
bash -n "$update_script" &&
cp "$update_script" scripts/update-server.sh &&
bash scripts/update-server.sh http://43.138.251.91:8807
```

私有仓库继续使用服务器已配置的 Git 凭据。下载失败时停止，不修改代码，不把访问令牌写进文档。

本服务器已通过 HTTP/1.1、单并发的 `git ls-remote` 检查。上述命令把这两个参数保存到本项目 Git 配置，后续脚本的 fetch 也会使用它们；不关闭证书验证。小请求成功不能保证完整 fetch 一定成功，遇到 TLS 或连接超时仍需检查网络。这里的 nvm 加载步骤适用于当前已用 nvm 安装 Node 24 的服务器；使用其他安装方式时，只需保证 `node -v` 为 24.12 或更新版本。

## 之后每次服务器更新

```bash
export NVM_DIR="$HOME/.nvm" &&
. "$NVM_DIR/nvm.sh" &&
nvm use 24 &&
cd /home/ubuntu/stellar-resonance &&
bash scripts/update-server.sh http://43.138.251.91:8807
```

当前终端已使用 Node 24 时，可以简写为 `cd /home/ubuntu/stellar-resonance && bash scripts/update-server.sh http://43.138.251.91:8807`。

脚本每次获取远程 main 最新提交，直接覆盖受 Git 跟踪的代码，不融合服务器本地代码。更新前自动把工作目录备份到 `/home/ubuntu/.stellar-resonance-backups/`，排除 .git、依赖、构建产物及本地集成缓存；备份包含私有数据，仅服务器用户可读取。请按磁盘容量自行保留必要备份。

终端会显示七步进度：环境、获取代码、备份、覆盖、安装依赖、构建、重启与启动检查。获取后用 `git diff --stat HEAD origin/main` 展示本次增删统计（`++++----`）；代码相同时明确提示已是最新。最后轮询本机健康接口，核对应用、项目、进程和账号系统，通过后显示“更新完成，服务已启动”、当前提交、游戏及管理页地址。失败会报告所在阶段并停止；本机检查通过不代表公网安全组一定放行。

旧 `--single-branch` 克隆可能只允许跟踪 preview 分支。更新脚本会自动补充 main 的拉取配置；如果正在运行旧版脚本而停在“origin/main is not a branch”，先执行 `git remote set-branches --add origin main`，再运行更新脚本即可。此时报错前代码可能已经切到 main，但尚未构建和重启。

`server/private/`、`server/.local/`、`server.config.json`、`.env` 保留，禁止将这些路径纳入 main；不删除未跟踪文件。旧版被 Git 跟踪的 `server.config.json` 会先备份，再仅解除跟踪，实际配置文件继续留在原处。安装或构建失败就停止，不重启服务。代码已覆盖时可从备份恢复或修正后再次运行。脚本不自动迁移或回滚数据库；运行中 tar 备份不能代替一致的数据库离线备份。

账号、管理页内容在服务器，剧情存档和 API 设置在当前浏览器。浏览器存储按协议、IP/域名及端口隔离：继续使用相同地址，不清理网站数据；更换地址前先导出备份。向量检索在伙伴最新版中固定开启，需要保存向量 API 配置。

## 部署检查

```bash
git branch --show-current
git log -1 --oneline
curl --noproxy '*' --fail http://127.0.0.1:8807/api/health
```

游戏地址：`http://43.138.251.91:8807/terminal`；管理页：`http://43.138.251.91:8807/editor/`。8808 为本机管理服务，无需对公网开放。
