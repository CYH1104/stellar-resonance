# 故障场景验收与未通过项

2026-11-04，用户要求将慢请求、超时、取消、保存失败、后台记忆期间的预设/存档操作和完整备份一致性作为持续验收项。已写入项目 AGENTS.md。本次仅做隔离验证和记录，未修改运行代码、未部署或重启线上服务。

## 已复现，尚未修复

以 10e2663 源码连接本地可丢弃的原生实例 `http://127.0.0.1:8998`。真实写入原生 JSONL 后，仅在客户端模拟最后一次 settings/save 返回 503，不向线上或模型发请求。

1. **部分写入**：repository.write 报告失败，但 JSONL 的开场文本和会话名称已更改，本次一并要求修改的 stateEnabled 设置没有保存。单文件都能解析不代表整个保存操作一致。
2. **失败队列缺少恢复**：关闭故障注入后再次保存，没有发送任何请求，继续拒绝。即使显式 settings.reload 和 repository.read，原 repository 队列仍拒绝写入。保守停止后续覆盖有其必要性，但当前缺少完整、明确的恢复操作。

证据：`.integration/author-audit-20261104/fault-storage-result.json`，字段 partialChatWrite、settingsUnchanged、retryMadeNoRequests、reloadDidNotRepairRepositoryQueue 均为 true。故障审计程序断言问题出现后返回成功，**这不是安全验收通过**；修复后需要改为断言未发生部分提交、且安全恢复可用。

重跑：在本工作树执行 `node .integration/author-audit-20261104/verify-fault-storage.mjs`。脚本限定可丢弃的本地 8998，拒绝占用已有进程，数据保存在既有临时目录，结束关闭自己创建的服务器。不要把 origin 改成生产地址。

## 本次通过的验证及限制

- 显式启用原先常规测试会跳过的 tests/native-storage-original.test.ts：三个真实原生用例通过，覆盖同一 settings 事务中原生文件失败回滚、JSONL/swipes、头像及人设原图/草稿、终端私聊、完整归档，以及固定世界引用迁移、原文件和覆盖前副本保留。
- 终端迟到回复、接口变更取消、任务隔离、配置并发、附加备份和终端联系人相关七个文件共 59 个现有用例通过。其使用的纯逻辑或模拟服务仍不能代替原生故障注入结果。
- 另有 configuration-commit 和 terminal-ui-recovery 共 15 项超时、取消及界面恢复相关用例通过。不能据此覆盖尚未修复的全局任务锁问题。
- 第一轮头像上传返回 400，原因是 Windows 本地 node_modules 是指向外部临时依赖目录的 junction，原生 fetch-patch 拒绝加载 root 外的 PNG WASM。隔离原生进程使用 Node 的 preserve-symlinks 路径解析选项后，三个用例通过；未修改原生 fetch-patch 或放宽它的读取检查。只读确认生产依赖位于其原生目录内，不能把本地环境失败写成生产头像故障。
- 本轮付费模型调用 0、生产写入 0，线上仍为 10e2663。

## 下一步验收门槛

- 修复预设、存档受前台/终端/后台记忆全局锁连带禁用的问题，并验证停止、超时及异常收尾，不能简单清 busy 后允许不安全覆盖。
- 为部分提交设计可回读验证的完整保存/恢复路径，继续使用原生 JSONL、索引及资源；不能失败后仅重试剩余设置，也不能直接忽略冲突。
- 追加在第二个聊天写入失败、恢复锁续租失败、附加档案回退成功但聊天已经写入等位置的故障注入；核对 restorePending、实际文件和完整恢复副本，不误清中断标记。
- 对下载、云端内容、导入、覆盖、撤销覆盖逐条比对所有资料及引用。真实 Git 平台上传或供应商模型调用须单独报告，不能用本地序列化通过冒充。

发布源仍为 `.integration/native-world-reference`。旧 `.integration/native-migration` 的 26 份世界书/助手 WIP 未修改，不从其旧基线覆盖部署。修复及发布需在上述失败场景转为安全通过后进行。
