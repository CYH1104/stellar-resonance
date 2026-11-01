# 8088 私有原生编排：待批准的浏览器安装

2026-11-01。原学院完整页面已部署到独立 8088；8807、9000 未变。

目前公开生成功能仍明确暂停。私有编排在 Windows 合成联调及 Linux 临时无沙箱验证中通过，但无沙箱方式不能作为正式发布配置。产品代码现已移除关闭沙箱的选项。Linux 保持沙箱开启时，现有测试版 Chromium 被 Ubuntu 拒绝启动。

自动审批已经拒绝两项动作：持久关闭 Chromium 沙箱，以及未经明确授权下载并安装官方 Chrome。两者均未执行。未关闭 AppArmor 或修改全局 user namespace 策略。

建议批准的具体动作：

1. 从 Google 官方 HTTPS 地址 `https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb` 下载 Chrome 稳定版；核对包名为 google-chrome-stable。
2. 仅提取浏览器程序到此前不存在的 `/opt/google/chrome`，由 root 持有；不执行包安装脚本，不改系统默认浏览器，不安装 setuid 权限。
3. 使用服务器已有、明确针对该官方路径的 Ubuntu Chrome 策略，保留浏览器沙箱、NoNewPrivileges、ProtectHome 和独立系统账号；不新增 AppArmor 放宽规则，不改 sysctl。
4. 仅供独立 8088 的服务器内部原生编排使用；内部端口只监听回环地址，不复用旧站账号、数据或服务。
5. 先跑无模型调用的 Linux 编排验收，通过后才连接 8088；保留暂停生成的回退配置和完整数据副本。

这个动作会增加一个系统路径下的软件组件，并需要从外部下载程序，因此等待用户明确批准。
