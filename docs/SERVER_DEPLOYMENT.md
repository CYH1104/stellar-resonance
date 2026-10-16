# Linux 云服务器部署

发布分支：`preview/local-v0.11.2-20261016`。先安装 Git、Node.js **24.12.0 或更高版本**及 pnpm 10。以下按普通 Linux 用户、直接通过 IP 和 8807 端口访问部署。

角色介绍的邂逅入口：第一个选项为“建立新的会话与之相遇”。填写人设并建立新存档后，会将所选角色的邂逅提示放进剧情输入框，不自动发送。普通邂逅和随机邂逅需要已有会话，没有会话时保留角色页面并显示提示。

## 首次拉取

```sh
git clone --branch preview/local-v0.11.2-20261016 --single-branch https://github.com/CYH1104/stellar-resonance.git "$HOME/stellar-resonance"
cd "$HOME/stellar-resonance"
pnpm install --frozen-lockfile
pnpm build
```

私有仓库先配置 GitHub SSH 密钥或凭据管理器；不要把访问令牌写进仓库地址。不能只上传 `dist`，运行还需要 `server`、`src` 和原页面模板。

## 直接通过公网端口启动

把 `YOUR_SERVER_IP` 换为实际公网 IP：

```sh
HOST=0.0.0.0 PORT=8807 PUBLIC_ORIGIN=http://YOUR_SERVER_IP:8807 AUTH_REQUIRED=1 pnpm start
```

在云控制台安全组放行 TCP 8807；如果系统启用了 UFW，再执行 `sudo ufw allow 8807/tcp`。不要开放 8808。

浏览器打开 `http://YOUR_SERVER_IP:8807/terminal`。首次进入显示注册页，仅支持 `@qq.com` 邮箱（QQ 号码或邮箱别名），不支持 foxmail 等其他域名，不发验证码；已有账号切换登录。邮箱不区分大小写，密码至少 8 位。右下角可退出账号。登录有效期 7 天，重启服务器后仍有效。原有非 QQ 邮箱账号仍能登录，不会删除。

按当前要求使用 HTTP 端口，传输中的密码和 API Key 没有 HTTPS 加密，请使用独立密码；长期使用时再接入 HTTPS。`PUBLIC_ORIGIN` 必须与浏览器地址一致，含协议、IP 和端口，更换后需重启。

本机模式默认仍是 `127.0.0.1`，不强制注册，保留现有本地使用方式；公网绑定强制账号。本机若也要开启注册，设置 `AUTH_REQUIRED=1` 后启动即可（PowerShell：`$env:AUTH_REQUIRED='1'`）。

## 后台常驻

先停止前台进程。执行 `mkdir -p ~/.config/systemd/user`，创建 `~/.config/systemd/user/stellar-resonance.service`。替换下面的项目绝对路径、Node 路径和 IP；Node 路径用 `command -v node` 查看：

```ini
[Unit]
Description=Stellar Resonance
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/user/stellar-resonance
ExecStart=/usr/bin/node /home/user/stellar-resonance/server.mjs
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=8807
Environment=EDITOR_PORT=8808
Environment=PUBLIC_ORIGIN=http://YOUR_SERVER_IP:8807
Environment=AUTH_REQUIRED=1
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=default.target
```

```sh
systemctl --user daemon-reload
systemctl --user enable --now stellar-resonance
sudo loginctl enable-linger "$USER"
curl --fail http://127.0.0.1:8807/api/health
```

健康接口应返回 `accountsRequired: true`。查看日志：`journalctl --user -u stellar-resonance -n 60 --no-pager`。

## 私有角色资料与编辑器

`server/private/` 不进入 Git，仅拉代码会使用示例世界卡。首次部署且服务器尚无账号时，在本机 PowerShell 复制私有资料（替换登录信息与服务器路径）：

```powershell
scp -r 'D:\QQ\QQ文件\星穹学院终端\server\private' user@YOUR_SERVER_IP:/home/user/stellar-resonance/server/
```

然后重启服务。已有账号时仅同步 `extracted-pro.json`、`editor-data.json` 等角色内容文件，保留服务器的 `accounts/`，不要整目录覆盖账号库。

私有编辑器仍只监听服务器本机 `127.0.0.1:8808`。需要远程编辑时，先停止电脑上占用 8808 的本地编辑器，再建立转发：

```sh
ssh -N -o ExitOnForwardFailure=yes -L 8808:127.0.0.1:8808 user@YOUR_SERVER_IP
```

保持连接，在电脑浏览器打开 `http://127.0.0.1:8808/`。游戏注册账号不能访问私有编辑器。

## 数据与更新

在服务器命令行查看注册用户（不必安装 sqlite3 命令）：

```sh
cd "$HOME/stellar-resonance"
pnpm users
pnpm users --email 123456789@qq.com
pnpm users --limit 1000
node scripts/users.mjs --json
```

默认显示最近 100 名用户，包含邮箱、北京时间的注册时间和用户 ID，也显示总人数；`--email` 精确查找指定邮箱，`--limit` 最多 1000 条。JSON 中注册时间使用 UTC。命令以只读方式读取当前项目的账号库，可在服务运行时执行，不显示密码哈希或登录令牌，也不提供公开的用户列表接口。

账号数据库：`server/private/accounts/accounts.sqlite`，密码用独立随机盐和 scrypt 哈希保存，登录令牌仅存哈希；目录已被 Git 忽略。不包含邮箱验证、邮件发送或找回密码。

存档、人设和 API 设置仍在各账号对应的浏览器存储中，不会自动云同步。同一浏览器切换账号会分开读取。换电脑或从本地改为服务器 IP 前，先导出旧存档，在新地址登录后导入；API Key 需重新填写。原本地数据不会删除。

以后更新（确认没有正在生成的剧情，逐条执行；任一步失败即停止）：

如果按前面的 nohup 方式运行，使用以下完整命令，把 IP 换为实际地址：

```sh
cd "$HOME/stellar-resonance" &&
git pull --ff-only origin preview/local-v0.11.2-20261016 &&
pnpm install --frozen-lockfile &&
pnpm build &&
bash scripts/restart-server.sh http://YOUR_SERVER_IP:8807
```

重启脚本会核验健康信息、项目路径和运行命令后才停止旧进程，并重新启用公网账号入口；失败时不会强制杀进程。nohup 启动能在断开 SSH 后继续运行，但服务器重启后仍需手动启动，或配置前述 systemd 常驻。

已配置 systemd 用户服务时，也可以用下面的命令：

```sh
cd "$HOME/stellar-resonance"
git status --short
git pull --ff-only origin preview/local-v0.11.2-20261016
pnpm install --frozen-lockfile
pnpm build
systemctl --user restart stellar-resonance
curl --fail http://127.0.0.1:8807/api/health
```

本地源码有改动时先处理差异，不要强制重置；构建失败不要重启。Git 不会覆盖被忽略的账号数据库和角色资料。备份私有数据时先停服务，备份整个目录，再启动：

```sh
systemctl --user stop stellar-resonance
tar -czf "$HOME/stellar-private-$(date +%Y%m%d-%H%M%S).tgz" server/private
systemctl --user start stellar-resonance
```

参考：[Node.js 发布信息](https://nodejs.org/en/about/previous-releases)、[scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)、[SSH 转发](https://man.openbsd.org/ssh.1)。
