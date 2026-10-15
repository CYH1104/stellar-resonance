import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  server: { strictPort: true, port: 5173 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
