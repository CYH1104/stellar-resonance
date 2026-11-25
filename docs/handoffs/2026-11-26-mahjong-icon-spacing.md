# 麻将动作图标留白调整（2026-11-26）

## 范围与完成内容

- 用户要求麻将图标周围留白。本轮只调整吃、碰、杠、胡操作图案的内部尺寸，保留手牌右上方位置与按钮点击面积。
- MahjongActions.vue：图片宽度100%改为80%，常规高度70px改56px，小屏高度52px改40px；按钮仍为104×100或84×78。无规则、接口或持久化字段变化。
- 开工已核对本地与远程main均为0622cd5。agent-hub入口仍缺失（MODULE_NOT_FOUND），通过本交接记录接力。

## 验证

- npm run build通过（含vue-tsc）；生成HTML仅换行变化，按HEAD标准化内容核对后恢复。
- 真实Chromium合成牌局检查1000×600、844×390、420×880、360×780；四种动作同时出现时图标有留白，按钮尺寸保持不变，目标无裁切且可点击。
- 组合选择取消、荣和点击均通过；已人工查看桌面与最窄手机截图。未读取真实用户存档、未调用付费模型。
- 截图与检查脚本：.integration/mahjong-spacing-20261126/（已忽略）。

## 发布与下一步

- 仅9000，8807保持。默认update-server.sh会更新双端，必须带STELLAR_SINGLE_INSTANCE_UPDATE=1及test/9000环境，并校验固定目标提交与8807更新前后指纹。
- 发布前服务器HEAD为c7ab924402f7930b6aceaa0e80cfe175405f3a57；9000 release 67b1cd9c60c49b18；8807 release 2714ea237e363c84、PID 2955979。
- 本次发布完成后追加收据。后续按实际release核验，不能把文档提交当作已运行版本。

## 发布收据（2026-11-26）

- 功能提交：ef1cdc5c1835a56f53c3fbe34da414ff001d763d，已正常推送main并仅部署9000。
- 9000 release：4eb2de924e1ae68c，PID 999710；源码与该提交一致，last-deployed-main匹配，无pending release。
- 公网样式：PersonalTerminal-DboGY0mN.css，SHA256 72719a199c2dd1d290d73994612af5e011e827f5e484a664e0354cc37f116f15；已确认图片宽度80%、常规高度56px、手机高度40px，公网字节与发布快照匹配。
- 8807完整health、PID2955979、release2714ea237e363c84及终端JS摘要与发布前一致；公网另行核对通过。
- 恢复副本：/home/ubuntu/.stellar-resonance-backups/update-20261126-005759-e6Id12。
- 本收据为文档补充，无需再次部署。后续可由用户刷新9000查看实际牌局效果；本轮视觉验收来自隔离合成牌局。
