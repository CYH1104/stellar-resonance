// 8807（游戏）+ 8808（私有编辑器），与 9000 使用相同功能，保留原账号目录。
process.env.TERMINAL_CHANNEL ||= 'stable';
process.env.TERMINAL_INSTANCE ||= 'stable';
process.env.PORT ||= '8807';
process.env.EDITOR_PORT ||= '8808';
await import('./launch-local.mjs');
