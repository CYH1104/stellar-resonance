import {resolve} from 'node:path';
import {editorAccessKey} from '../server/editor-gateway.mjs';
console.log('学院编辑器管理口令：\n'+await editorAccessKey(resolve(import.meta.dirname,'..'))+'\n仅供管理者使用，不要发送给游戏用户。');
