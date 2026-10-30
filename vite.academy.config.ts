import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import {fileURLToPath} from 'node:url';
const path=(value: string)=>fileURLToPath(new URL(value,import.meta.url));
export default defineConfig({
  plugins: [vue()], publicDir: false, base: '/academy-assets/',
  build: {
    outDir: path('./dist/academy-frontend/'), emptyOutDir: true,
    manifest: true,
    rollupOptions: {input: path('./src/native/fullFrontend.ts'), output: {entryFileNames: 'workspace.js', assetFileNames: '[name]-[hash][extname]', chunkFileNames: '[name]-[hash].js'}},
  },
});
