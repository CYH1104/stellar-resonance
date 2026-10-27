# 第三步交接：原生兼容对照通过，保护关口未通过

基于独立分支rebuild/sillytavern-native的ff94d1f；用户明确授权读频道确认后开始第三步。本轮先读另一位Codex的第二步独立验收通过报告，fetch/ls-remote核对main=03cdd39、独立分支=ff94d1f，本地干净，未发现同分支新改动。

完成：在锁定版本下启动独立8840/data根；导入上游官方Default原始预设，实际执行原生Generate dry-run、世界书递归/预算/深度及宏；经真实助手脚本树/iframe runner执行变量及权限探针。16项代表性原生行为通过，未调用模型生成端点，最终页面异常和HTTP失败均0。Horde状态/列表请求明确mock，其他上述原生功能未mock；外部浏览器网络阻断是测试夹具措施。

发现：助手及其脚本可读取合成私有描述、父DOM、同源storage、同源API，能把show_thoughts改true；官方Default默认开启思考返回。隐私关口false，不能进入全面迁移。另实测助手类型化Preset往返丢injection_trigger，不能将它用作原始预设权威存储。

新增：experiments/native/start-compat.mjs、compatibility-smoke.mjs、COMPATIBILITY.md；合成证据在docs/evidence/native-step3。仅实验代码和文档，现有server/src、存档schema、main和线上8807/9000未改。

复现和设计收紧细节见experiments/native/COMPATIBILITY.md。下步应先解决服务端私有编排及玩家脚本环境/凭据隔离，再重复保护验收；服务端无头浏览器worker与模块服务端移植均为待评估方案，未实现，不把本次浏览器native dry-run称服务端私有编排已接通。

未修四项终端缺陷，未使用真实卡/Key/存档/付费API。D盘agent-hub仍缺失，继续仅独立目录/分支写入，以频道交接。不要将此验证原生页面开放到公网，不部署当前实验分支。
