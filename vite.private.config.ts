import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({publicDir:false,build:{target:'esnext',outDir:'dist/private-engine',emptyOutDir:true,lib:{entry:fileURLToPath(new URL('./src/native/privateEngine.ts',import.meta.url)),formats:['es'],fileName:()=> 'engine.js'},rollupOptions:{external:id=>id.startsWith('/script')||id.startsWith('/lib.js')}}});
