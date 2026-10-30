# 完整原学院前端接线准备（未完成，未部署）

用户反复明确：前端完完全全使用之前的，原有功能对应上，只改后端逻辑。`NativeAcademy.vue` 的简化外壳不符合要求，不能继续把它当最终前端，也不能用原版管理抽屉替代原来的学院各页。

基线 `4a1aa5c`。本次仅完成共用前端的后端边界与完整文档构建，**没有完成全部原生适配，没有替换8088，没有影响8807/9000**。

## 实际修改

- `src/app/workspacePorts.ts` 定义原学院 App 使用的存档、请求、人设、账号设置接口；整体登记、禁止页面运行中切换；标记原生入口后缺接口直接报错，不退回旧 IndexedDB/HttpGateway。
- 现有 `useWorkspace` 通过该边界获取 Repository/Gateway；独立人设库的全部调用点也统一取同一个服务；账号设置通过相同边界。旧入口仍默认使用原有后端，回归行为不变。
- `App.vue`、HomeView、PersonaLibrary、PersonaQuickList、StoryView 只改 script 内的人设库实例获取；TheaterSettings只改分享请求实例。6个文件的template与style均保留，已逐一比对。没有改任何src/styles文件或官方原版源码。
- 终端的兜底请求、国王游戏耐受请求、终端码查询与小剧场分享也接入统一边界，避免这些独立入口继续绕回旧接口。旧终端码请求只是移入原HttpGateway，字段及提示语不改；新后端必须实现terminalCode才能登记。
- 新 `native:frontend:build` 直接构建原 `src/main.ts → App.vue` 和全部现有页面，不导入简化 NativeAcademy。完整学院 HTML 使用原 `星穹游戏终端 (1).html`，开场、校园导航、地图、原内联样式/脚本及功能入口原样保留，加载使用既有 boot.css/boot.js/bootScreen。
- 经典学院脚本和原生产页面一样，通过 academyStorage 获取资料；新连接转向原版 AccountStorage，补充 length/key 接口，避免原导出控件枚举存储时变成空备份。没有自行实现另一份持久化或新增存储字段。
- 新入口先等待完整原生服务、再动态导入原 App，避免模块初始化时先开旧库。当前没有完整服务提供者，入口会显示明确未接通状态，不是可以上线的功能完成版。

## 验证

- `npm run check` 通过。
- 最终全套 `npx vitest run`：152文件、918项通过（包括“拒绝旧接口冒充原生”、终端和分享接线改动）。
- `tests/workspace-ports.test.ts` 定向最终6项通过；`tests/native-skin.test.ts` 10项也在前述全套中通过。
- `node --test tests/native-frontend-page.test.mjs` 最终3项通过：完整文档反向去除接入标记后等同原文（只允许原生产同样的 localStorage→academyStorage 改绑）、原加载动画、存储枚举/原生数据、无连接阻断与不安全资源路径。
- `npm run native:frontend:build` 通过。原 public/assets 另行复制，保持旧 /assets 图片路径。Vite仍提示原绝对图片路径将在运行时解析；路径文件已复制，不是新增图片缺失。
- 修改的6个Vue文件template/style与基线相同，完整原HTML及src/styles未改。`git diff --check`通过；部分原文件混用CRLF/LF，本次只调整改动行行尾，不整文件改行尾。

## 下一步，仍必须实现

1. 实际创建完整 WorkspacePorts：所有原生 Repository/Gateway/Persona 功能，不得用空方法或把旧HttpGateway标native来绕过检查。
2. 存档映射到原生chats/messages/swipes，设置到原生settings，预设/世界书到原生文件接口；学院独有状态、记忆、手机等用最少扩展元数据。不能整包workspace落服务器后仍跑旧引擎，也不手写替代酒馆的文件引擎。
3. 原 API、人设、预设、世界书、状态、小剧场、手机、存档、备份等页面全部真实对应；主/辅/终端API仍要分开，不能因原生只有一个活动配置就串接口或串Key。
4. 旧资料及五条完整备份往返、头像资源/URL/凭据政策、恢复/并发/失败保护照原要求验收。经典学院脚本还需要与 Vue 共享同一个账号设置视图与真实原生身份；现有生产账号UI也需对应原生登录，不能回到独立HTML的本地账号模式。
5. 测量真实浏览器加载时间和阻塞来源，在学院首次绘制阶段使用原加载动画，不让用户先等整个酒馆UI完成再出现学院。不能仅把按钮样式复制过去。
6. 完整功能与视觉比对通过后只更新独立8088。8088当前仍是用户指出不合要求的292de66简化入口；不要宣称已恢复原前端上线。

本轮不新增持久化字段或数据库，故未更改备份格式。后续原生数据映射一旦增加持久化扩展，必须同时接入完整采集、导入、云端及恢复，而不是事后再补。
