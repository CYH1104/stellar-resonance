# 小剧场 HTML 空白显示排查与修复

本地基线：main 3dc7f9f。用户已要求提交并推送 GitHub；服务器尚未部署。

## 现场证据

用户 Chrome 153，HTTP /terminal 页面。内联 CSS 的 HTML 在“查看原文”完整存在。目标 iframe srcdoc 包含正文，外框 567×180，可见且不透明。iframe 内 document.readyState=complete，正文 innerText 长度1378，jQuery/lodash 已加载，但 html/body 及正文节点尺寸0×0，根节点 getClientRects().length=0。外层 details 为 open，::details-content 可见，各级外层尺寸正常。重设原 iframe srcdoc 不恢复。同一 srcdoc 复制到 document.body 下的固定预览 iframe 后，用户确认正文和美化恢复。

这将问题定位到原位置的 iframe 嵌套布局；具体 Chromium 内部机制尚未证明。修复绕开原生 details/::details-content 折叠路径，改为 section + button + Vue opened 状态，保留单窗口展开及 aria-expanded。收起样式改用 .expanded 状态。

## 已完成与验证

- 修改 src/components/TheaterRail.vue 与 src/styles/refinements.css。
- 更新已有 theater-presentation 折叠结构断言。
- 26 项 HTML 分块、小剧场展示测试通过。
- 不修改正文、存档、模型调用及 iframe 安全隔离。

## 下一步

- 本轮 build（含 vue-tsc 类型检查）成功，只有大包体积提示；补丁空白检查通过（按原有 CRLF 处理）。
- 在实际 Chrome 页面部署后验证展开、收起、切换窗口和美化 iframe 高度。
- 本机没有仓库约定 D 盘 agent-hub，无法通过该工具交接；记录保存在本文件。
- 部署仍待 SSH 私钥解锁：详细日志确认服务器接受部署公钥，但加密私钥尚未通过 ssh-agent 解锁，非交互认证失败。勿将本地构建通过描述为线上修复完成。
- 发布应遵循 docs/PAIRED_RELEASE.md 的现行双端约定，不沿用旧版仅更新9000的交接说明。
