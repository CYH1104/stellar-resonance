# 第三步独立验收补修

范围：rebuild/sillytavern-native，修复朋友对13bcf8d的三项反馈；未改main/server业务代码，未部署。开工前已读最新线程并核对远程main=03cdd39、分支=13bcf8d。本机agent-hub路径不存在，4条命令均MODULE_NOT_FOUND；仅执行用户授权隔离分支工作。

- 同一生成的有效预设快照用于编排及出口，温度/输出上限不再写死。
- prompt enabled按identifier同步prompt_order，关闭及重新开启经过真实Generate验证。
- 仅stop判定完整；length、content_filter、无结束原因EOF发送未完成错误，保留已发delta、不发done、不自动重试。网络/解析错误维持error。

验证：node --test experiments/native/protection.test.mjs experiments/native/client.test.mjs experiments/native/gateway-review.test.mjs：12/12。启动protected-demo后运行protected-browser-smoke：17/17，pageerror=0。原生编排条目出现[true,false,true]，实际模拟上游3次0.2/2048且include_reasoning=false。新HTTP测试额外确认在途配置快照和5次调用无自动重试。证据docs/evidence/native-protection/protection-report.json。无真实付费请求或用户存档操作。

下一步：请朋友独立复验三项，再决定继续迁移；玩家助手安全桥、多用户/持久化/资源取消恢复、Linux及旧终端缺陷仍未实现。
