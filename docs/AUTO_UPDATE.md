# 服务器自动更新

由服务器的 systemd 用户定时器每分钟检查 GitHub `main`。检测到新提交后，复用 `scripts/update-server.sh`：备份、覆盖 main、安装依赖、构建、重启和健康检查。无需开放 webhook 端口或额外配置 GitHub 密钥，继续使用服务器现有 Git 凭据。

在项目所属用户（本服务器为 ubuntu）下安装，不要使用 `sudo bash`：

```bash
cd /home/ubuntu/stellar-resonance
bash scripts/install-auto-update.sh http://43.138.251.91:8807
```

安装器启用用户 lingering，让定时器和游戏在退出 SSH、服务器重启后继续运行；没有开启 lingering 时会调用 `sudo loginctl enable-linger`。首次安装将游戏交由独立的 `stellar-resonance.service` 管理；已有同名用户服务则保留现有配置。安装时会执行一次完整部署，健康检查通过后再启动自动检查。

## 查看状态和日志

```bash
systemctl --user list-timers stellar-resonance-auto-update.timer
systemctl --user status stellar-resonance-auto-update.service --no-pager
journalctl --user -u stellar-resonance-auto-update.service -n 80 --no-pager
journalctl --user -u stellar-resonance-auto-update.service -f
systemctl --user status stellar-resonance.service --no-pager
journalctl --user -u stellar-resonance.service -n 80 --no-pager
```

自动检查是一次性任务，因此空闲时服务显示 inactive 属于正常情况，应查看 timer 是否 active。没有新提交时不备份、不构建、不重启。网络错误写入日志，下一次检查会重试；同一提交部署失败后至少等待5分钟才重试，新提交可立即尝试。

只有构建、重启和健康检查全部成功，才更新 `server/.local/last-deployed-main`。即使失败时 HEAD 已经前移，下一次仍会继续部署，而不会误判为已更新。自动检查和手动部署使用文件锁，避免并行覆盖。

## 立即检查、暂停和恢复

```bash
# 立即检查远程 main；代码未变时不重启。
systemctl --user start stellar-resonance-auto-update.service

# 暂停后续自动检查，不影响独立运行的游戏服务，也不中断已经开始的部署。
systemctl --user disable --now stellar-resonance-auto-update.timer

# 恢复自动检查。
systemctl --user enable --now stellar-resonance-auto-update.timer
```

手动运行 `bash scripts/update-server.sh http://43.138.251.91:8807` 仍然有效，成功后也会更新部署标记。更改定时器配置后需重新运行安装器。
