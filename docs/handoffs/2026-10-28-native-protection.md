# 第三步保护修正交接

用户在解释三项问题后明确授权“如果有修改方案就执行，改完发频道”。开工前读频道线程并核对main=03cdd39、独立分支=12496b2、本地干净；D盘agent-hub仍缺失，继续只写独立克隆/分支，不操作朋友main目录。

新增服务端自有原生浏览器compiler、只开放有限API的本地网关、原始JSON保留式预设修改、思考运行策略与响应过滤验证。修改native-client实验出口，把include_reasoning=false实际带入模拟上游custom body。不修改现有server/src业务代码。

验证：11项策略/传输单测通过；15项真实浏览器链路检查通过。私有随机描述和世界书实际进入原生编排，但客户端已读取的响应/DOM/存储没有标记；原生内部接口与源文件路由不外露；思考覆盖与脚本/Key/messages注入被拒；模拟上游故意返回独立思考字段与跨块think标签，公开正文不含思考。预设trigger/depth/order/未知扩展在指定字段编辑后保留。

证据：docs/evidence/native-protection/protection-report.json、protected-preview.png。复现：experiments/native/PROTECTION.md、protected-demo.mjs、protected-browser-smoke.mjs。原始原生失败报告保留，新报告protectedPathGatePassed=true只适用于新受控实验路径。

范围：当前单固定世界、单串行compiler的本地验证，不是全站多用户上线。没有真实卡/Key/存档或付费模型，没有改存档schema，未迁移学院全部前端/旧API、客户端助手安全桥或账号系统；不宣称任意脚本无限兼容。私有worker不执行玩家脚本。正式部署必须关闭内部原生端口外访并做明确代理白名单，Linux依赖/资源/超时/恢复等仍待验证。未部署8807/9000，未修四项终端缺陷。

下一步：以该保护边界继续正式接入设计，逐项接学院身份/数据路由与受限助手API，避免把原生UI或全API直接开放给玩家。
