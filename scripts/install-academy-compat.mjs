import {mkdir,readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),directory=new URL('native/SillyTavern/plugins/',root),target=new URL('academy-compat.mjs',directory);
await readFile(new URL('native/SillyTavern/package.json',root),'utf8');
const content='// Installed academy compatibility plugin; original source remains unchanged.\nexport {info,init} from "../../academy-plugin/index.mjs";\n';
let previous;try{previous=await readFile(target,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
if(previous!==undefined&&previous!==content)throw Error('已有同名插件内容不同，已停止覆盖。');
await mkdir(directory,{recursive:true});await writeFile(target,content);
console.log('已安装学院兼容插件入口；启用和重启仅适用于独立原生实例。');
