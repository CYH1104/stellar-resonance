# 原版引入后的执行权限与启动参数修正

基线2a6f1994a97c52ea6f908d3d642d3c5ab62a511c。用户要求修正独立检查发现的两项问题。仅在rebuild/sillytavern-native操作；main及线上8807/9000、停用9100未改。

## 修复

- 恢复原版server.js、src/server-global.js、start.sh、src/electron/start.sh的Git mode为100755，未改任何文件内容。现在native/SillyTavern整个Git子树与官方06bde939的根树完全一致，tree均为9218207b1e3bfe78224afe10e71ece3b8e79f572，覆盖路径、内容、权限全部一致。
- 根native:start改为`npm --prefix native/SillyTavern start --`，让外层`npm run native:start -- <原生参数>`正确转发到node server.js。没有新写启动器或修改原生入口。
- native/UPSTREAM.md补正常参数用法，并准确说明原始Git文件复制和执行权限。

## 验证

1. 原失败场景复跑：`npm run native:start -- --help`现在实际执行node server.js --help，输出原生port/dataRoot等帮助，不再输出npm start帮助。旧失败输出保留。
2. 在独立冻结副本.integration/native-launch-fix-2a6f199，用普通的一层npm分隔符启动原生，指定127.0.0.1:8998、独立configPath及带空格的dataRoot，禁止自动开浏览器。实际聊天JSONL和settings.json都写入指定目录。
3. 原生实际保存回读9项及停止进程重启后回读5项全部通过，含多稿/metadata、设置扩展、64000预设及未知字段、世界书扩展。只用合成数据，无模型调用或真实用户资料。
4. 根package.json实现与测试副本逐字节相同。Git树完全匹配官方；发布归档tar列出四个文件为-rwxrwxr-x。没有在本机运行Linux，Linux执行结论来自正确的Git/归档权限，不冒称Linux部署实测。
5. 原生逻辑和学院CSS/业务代码均未改；没有重复无关全量测试。使用已有同版本依赖链接，没有将本次说成全新网络安装验证。
6. 8998及本轮原生测试进程已停止。证据docs/evidence/native-launch-fix/；模拟数据和复现驱动仅保存在.integration，未提交。

## 后续边界

两项包装问题已关闭。原生代码引入不等于学院前端已经接通；继续按用户“原生酒馆换学院皮肤”要求连接现有原生API及学院特有扩展，不重新实现被撤下的存储引擎。服务器数据权威、旧浏览器资料迁移、账号/多设备/备份/助手全链路仍需要后续接线和验证。暂不部署、不要切换8807/9000。
