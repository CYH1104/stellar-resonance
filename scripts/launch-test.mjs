// 测试版实例：9000（游戏）+ 9001（私有编辑器），手机／好友／群聊／国王游戏／每日占卜开启。
process.env.TERMINAL_CHANNEL ||= 'test';
process.env.TERMINAL_INSTANCE ||= 'test';
process.env.PORT ||= '9000';
process.env.EDITOR_PORT ||= '9001';
await import('./launch-local.mjs');
