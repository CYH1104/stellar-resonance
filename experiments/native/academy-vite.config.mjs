import vue from '@vitejs/plugin-vue';
import {fileURLToPath} from 'node:url';
export default {root:fileURLToPath(new URL('../..',import.meta.url)),plugins:[vue()],cacheDir:'.integration/native-step4/vite',server:{host:'127.0.0.1',port:8863,strictPort:true,watch:{ignored:['**/.integration/**']},cors:{origin:'http://127.0.0.1:8861'}}};
