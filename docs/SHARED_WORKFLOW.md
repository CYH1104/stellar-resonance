# 双方交接与服务器更新约定

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
cd /home/ubuntu/stellar-resonance &&
update_script="$(mktemp /tmp/stellar-update-XXXXXX.sh)" &&
git fetch origin +refs/heads/main:refs/remotes/origin/main &&
git show origin/main:scripts/update-server.sh > "$update_script" &&
bash -n "$update_script" &&
cp "$update_script" scripts/update-server.sh &&
bash scripts/update-server.sh http://43.138.251.91:8807
```

私有仓库继续使用服务器已配置的 Git 凭据。下载失败时停止，不修改代码，不把访问令牌写进文档。

## 之后每次服务器更新

```bash
cd /home/ubuntu/stellar-resonance && bash scripts/update-server.sh http://43.138.251.91:8807
```

脚本每次获取远程 main 最新提交，直接覆盖受 Git 跟踪的代码，不融合服务器本地代码。更新前自动把工作目录备份到 `/home/ubuntu/.stellar-resonance-backups/`，排除 .git、依赖、构建产物及本地集成缓存；备份包含私有数据，仅服务器用户可读取。请按磁盘容量自行保留必要备份。

`server/private/`、`server/.local/`、`server.config.json`、`.env` 保留，禁止将这些路径纳入 main；不删除未跟踪文件。旧版被 Git 跟踪的 `server.config.json` 会先备份，再仅解除跟踪，实际配置文件继续留在原处。安装或构建失败就停止，不重启服务。代码已覆盖时可从备份恢复或修正后再次运行。脚本不自动迁移或回滚数据库；运行中 tar 备份不能代替一致的数据库离线备份。

账号、管理页内容在服务器，剧情存档和 API 设置在当前浏览器。浏览器存储按协议、IP/域名及端口隔离：继续使用相同地址，不清理网站数据；更换地址前先导出备份。向量检索在伙伴最新版中固定开启，需要保存向量 API 配置。

## 部署检查

```bash
git branch --show-current
git log -1 --oneline
curl --noproxy '*' --fail http://127.0.0.1:8807/api/health
```

游戏地址：`http://43.138.251.91:8807/terminal`；管理页：`http://43.138.251.91:8807/editor/`。8808 为本机管理服务，无需对公网开放。
