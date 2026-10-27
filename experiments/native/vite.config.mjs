import vue from '@vitejs/plugin-vue';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
// Development-only same-machine proxy: preserve the academy server's origin checks.
export default {root,plugins:[vue()],cacheDir:resolve(root,'.integration/native-vite'),server:{host:'127.0.0.1',port:8833,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:8831',changeOrigin:true,headers:{Origin:'http://127.0.0.1:8831'}}}}};
