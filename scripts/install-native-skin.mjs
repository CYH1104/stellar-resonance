import {cpSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = new URL('../', import.meta.url);
const build = new URL('dist/native-skin/', root);
const manifest = new URL('native/academy-extension/manifest.json', root);
// Use the original global third-party extension directory; no original source patch.
const destination = new URL('native/SillyTavern/public/scripts/extensions/third-party/academy-native/', root);
if (!existsSync(new URL('index.js', build)) || !existsSync(new URL('skin.html', build))) throw new Error('请先运行 npm run native:skin:build。');
const previous = new URL('manifest.json', destination);
if (existsSync(destination) && (!existsSync(previous) || JSON.parse(readFileSync(previous, 'utf8')).display_name !== JSON.parse(readFileSync(manifest, 'utf8')).display_name)) throw new Error('目标目录已有其他扩展，停止覆盖。');
mkdirSync(destination, {recursive: true});
cpSync(build, destination, {recursive: true});
writeFileSync(previous, readFileSync(manifest));
console.log('学院皮肤已安装到原生扩展目录：'+fileURLToPath(destination));
