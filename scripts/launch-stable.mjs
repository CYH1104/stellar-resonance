// 稳定版实例：8807（游戏）+ 8808（私有编辑器），手机终端功能关闭。
process.env.TERMINAL_CHANNEL ||= 'stable';
process.env.TERMINAL_INSTANCE ||= 'stable';
process.env.PORT ||= '8807';
process.env.EDITOR_PORT ||= '8808';
await import('./launch-local.mjs');
