import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  // Vitest owns `test/*.test.ts`; Playwright owns `test/e2e/*.spec.ts`.
  // Without the exclude, vitest imports the Playwright spec and the two
  // runners collide on their shared `test.describe` API.
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/e2e/**'],
  },
});
