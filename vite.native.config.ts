import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import {fileURLToPath} from 'node:url';
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default defineConfig({
  root: path('./native/academy-extension/'), base: './', publicDir: false,
  plugins: [vue()],
  build: {
    outDir: path('./dist/native-skin/'), emptyOutDir: true,
    rollupOptions: {
      input: {index: path('./src/native/extension.ts'), skin: path('./native/academy-extension/skin.html')},
      output: {entryFileNames: '[name].js'},
    },
  },
});
