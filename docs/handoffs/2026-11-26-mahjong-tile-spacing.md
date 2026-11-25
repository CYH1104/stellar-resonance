# 麻将牌面图案留白（2026-11-26）

## 已完成

- 用户明确指万、筒、条等麻将牌面图案。MahjongTile.vue统一将正面图案居中缩到80%，四边各留10%的图片框空白，Front.svg白底及牌体、点击范围保持原尺寸。
- 暗牌Back.svg保持全尺寸，白板、字牌及赤五使用同一组件，手牌、河牌、副露、宝牌和结算展示同步生效。原始SVG不改，无外部资源请求，无持久化或规则变更。
- 恢复上轮误缩小的吃碰杠胡操作图案为70px（小屏52px），保留此前的大按钮与手牌右上布局。
- 开工本地和远程main均为2f01678892b183bbfbb60b29f5aa95396acf807b。agent-hub入口缺失，接力以本文为准。

## 验证

- 最终npm run build通过（含vue-tsc）。生成HTML仅换行变化，经标准化比对后恢复。
- Chromium验证37种正面及1种牌背全部加载；图片居中、正面80%而暗牌100%，四种屏幕1000×600、844×390、420×880、360×780通过。
- 手牌提示与出牌点击、吃碰组合取消及荣和通过；人工查看整套牌面、桌面和最窄手机截图。未读真实存档或调用付费模型。
- 本地隔离证据：.integration/mahjong-tile-spacing-20261126/（已忽略），包含tile-gallery.png和ui-results.json。

## 发布与后续

- 仅9000更新；8807不动。使用单实例test环境、固定目标提交和稳定端状态前后比较。禁止裸调用默认双端更新脚本。
- 发布前服务器HEAD ef1cdc5c1835a56f53c3fbe34da414ff001d763d，9000 release 4eb2de924e1ae68c；8807 release 2714ea237e363c84、PID 2955979。
- 完成后追加发布收据；后续反馈应以运行release及牌面截图定位。

## 发布收据（2026-11-26）

- 功能提交eb86aa494d6b733c32bd12cd84c56f1aaad63812，已推送main并部署9000；release f45cae381a049ad4，PID 1004627。
- 发布快照的MahjongTile.vue与该Git提交逐字节一致，last-deployed-main匹配，无pending release。
- 公网CSS PersonalTerminal-DrOThwma.css，SHA256 d2527efdd84f26705fdc0d123043d2e2d850d0dcb5066025fd3f109e7d2094af；已检查牌面scale(.8)、牌背不缩放、吃碰杠胡70/52px规则与快照一致。
- 8807完整health、PID2955979、release2714ea237e363c84及终端资源摘要前后一致，并通过公网独立检查。
- 恢复副本：/home/ubuntu/.stellar-resonance-backups/update-20261126-011522-F7Ygg7。
- 本收据为文档补充，无需重发；本地合成牌局与公网资源验收完成，用户可刷新9000查看实际牌局。
