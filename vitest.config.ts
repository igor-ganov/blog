import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/components/**', 'happy-dom']],
    include: ['src/**/*.test.ts'],
  },
});
