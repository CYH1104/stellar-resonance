import {mkdir,readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),directory=new URL('native/SillyTavern/public/scripts/extensions/third-party/academy-compiler/',root);
const built=await readFile(new URL('dist/private-engine/engine.js',root),'utf8');
// No manifest or autoload entry: this module is explicitly loaded only by the
// server's dedicated native compiler, and contains no author assets or keys.
await mkdir(directory,{recursive:true});await writeFile(new URL('engine.js',directory),'// Academy private native compiler\n'+built);
