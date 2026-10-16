import {resolve} from 'node:path';
import {importCharacters} from '../server/import-characters.mjs';
const args=process.argv.slice(2),file=args.find(a=>!a.startsWith('--'));
if(!file||args.some(a=>a.startsWith('--')&&a!=='--dry-run')){console.error('用法：node scripts/import-characters.mjs 角色文件.json [--dry-run]');process.exitCode=1;}
else try{const dryRun=args.includes('--dry-run'),result=await importCharacters(resolve(import.meta.dirname,'..'),resolve(file),{dryRun});console.log(`${dryRun?'预览':'已保存'}：更新 ${result.updated} 名，新增 ${result.added} 名，保留 ${result.retained} 名其他角色，共 ${result.total} 名。`);if(!dryRun)console.log('刷新管理页即可查看。游戏角色页会自动同步；新增角色用于新建存档。原编辑资料备份为 server/private/editor-data.previous.json。');}catch(e){console.error(e.status?'角色字段校验失败，未保存，请检查文件。':e instanceof SyntaxError?'JSON 格式不正确，未保存。':['ENOENT','EACCES'].includes(e.code)?'无法读取文件，请检查路径和权限。':e.message||'导入失败，未保存。');process.exitCode=1;}
